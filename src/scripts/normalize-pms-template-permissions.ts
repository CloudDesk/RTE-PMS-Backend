import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../config/database';
import { PmsTemplateStatus } from '../constants/pms.enums';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import type { ITemplateSection } from '../models/pms-template-version.model';
import {
  getSectionPermissionPurpose,
  normalizeTemplateSectionPermissionPolicy,
  permissionPolicyValidationErrors,
} from '../services/pms-template-permission-policy';

type ScriptOptions = {
  apply: boolean;
  includeLegacy: boolean;
  includeActive: boolean;
  forceActive: boolean;
  versionId?: string;
};

type SectionReport = {
  sectionKey: string;
  purpose: string;
  action: 'normalized' | 'unchanged' | 'skipped';
  reason?: string;
};

const POLICY_VERSION = 'PERMISSION_POLICY_V1';

function parseOptions(argv: string[]): ScriptOptions {
  const options: ScriptOptions = {
    apply: false,
    includeLegacy: false,
    includeActive: false,
    forceActive: false,
  };

  for (const arg of argv) {
    if (arg === '--apply') options.apply = true;
    if (arg === '--include-legacy') options.includeLegacy = true;
    if (arg === '--include-active') options.includeActive = true;
    if (arg === '--force-active') options.forceActive = true;
    if (arg.startsWith('--version-id=')) {
      options.versionId = arg.slice('--version-id='.length);
    }
  }

  if (options.apply && options.includeActive && !options.forceActive) {
    throw new Error(
      'Refusing to update active/locked templates without --force-active. Run dry-run first, then pass --include-active --force-active only for approved rollout.',
    );
  }

  return options;
}

function cloneSections(sections: unknown): ITemplateSection[] {
  return JSON.parse(JSON.stringify(sections ?? [])) as ITemplateSection[];
}

function isPolicyManaged(section: ITemplateSection): boolean {
  return section.metadata?.permissionPolicyVersion === POLICY_VERSION;
}

function isLegacyStarter(section: ITemplateSection): boolean {
  return section.metadata?.starterGenerated === true;
}

function hasManualOverrideField(section: ITemplateSection): boolean {
  return (section.fields ?? []).some(
    (field) => field.metadata?.workflowBehaviorMode === 'MANUAL_OVERRIDE',
  );
}

function shouldNormalizeSection(
  section: ITemplateSection,
  options: ScriptOptions,
): { allowed: boolean; reason?: string } {
  if (hasManualOverrideField(section)) {
    return {
      allowed: false,
      reason: 'manual workflow override field present',
    };
  }
  if (isPolicyManaged(section)) return { allowed: true };
  if (isLegacyStarter(section)) return { allowed: true };
  if (options.includeLegacy) return { allowed: true };
  return {
    allowed: false,
    reason: 'legacy section; pass --include-legacy after manual approval',
  };
}

function normalizeSectionsForRollout(
  sections: ITemplateSection[],
  options: ScriptOptions,
): { sections: ITemplateSection[]; reports: SectionReport[] } {
  const reports: SectionReport[] = [];
  const nextSections = sections.map((section) => {
    const purpose = getSectionPermissionPurpose(section);
    const decision = shouldNormalizeSection(section, options);
    if (!decision.allowed) {
      reports.push({
        sectionKey: section.sectionKey,
        purpose,
        action: 'skipped',
        reason: decision.reason,
      });
      return section;
    }

    const normalized = normalizeTemplateSectionPermissionPolicy(section);
    const changed = JSON.stringify(normalized) !== JSON.stringify(section);
    reports.push({
      sectionKey: section.sectionKey,
      purpose,
      action: changed ? 'normalized' : 'unchanged',
    });
    return normalized;
  });

  return { sections: nextSections, reports };
}

async function run(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const mode = options.apply ? 'APPLY' : 'DRY_RUN';

  await connectDB();

  const query: Record<string, unknown> = { isDeleted: false };
  if (options.versionId) {
    query._id = options.versionId;
  }

  const versions = await PmsTemplateVersion.find(query).sort({
    updatedAt: -1,
    createdAt: -1,
  });

  const summary = {
    mode,
    scannedVersions: versions.length,
    changedVersions: 0,
    updatedVersions: 0,
    skippedLockedOrActiveVersions: 0,
    normalizedSections: 0,
    skippedSections: 0,
    validationErrors: [] as Array<{ versionId: string; errors: string[] }>,
    versions: [] as Array<{
      versionId: string;
      status: string;
      isLocked: boolean;
      changed: boolean;
      updated: boolean;
      sections: SectionReport[];
    }>,
  };

  for (const version of versions) {
    const originalSections = cloneSections(version.sections);
    const { sections, reports } = normalizeSectionsForRollout(originalSections, options);
    const changed = JSON.stringify(sections) !== JSON.stringify(originalSections);
    const isLockedOrActive =
      version.isLocked === true || version.status === PmsTemplateStatus.ACTIVE;
    const canUpdate =
      options.apply && changed && (!isLockedOrActive || options.includeActive);
    const validationErrors = permissionPolicyValidationErrors(sections);

    if (changed) summary.changedVersions += 1;
    summary.normalizedSections += reports.filter(
      (report) => report.action === 'normalized',
    ).length;
    summary.skippedSections += reports.filter(
      (report) => report.action === 'skipped',
    ).length;

    let updated = false;
    if (validationErrors.length > 0) {
      summary.validationErrors.push({
        versionId: version._id.toString(),
        errors: validationErrors,
      });
    } else if (canUpdate) {
      version.sections = sections;
      version.metadata = {
        ...(version.metadata ?? {}),
        permissionPolicyRollout: {
          normalizedAt: new Date(),
          policyVersion: POLICY_VERSION,
          includeLegacy: options.includeLegacy,
          includeActive: options.includeActive,
        },
      };
      await version.save();
      updated = true;
      summary.updatedVersions += 1;
    } else if (options.apply && changed && isLockedOrActive) {
      summary.skippedLockedOrActiveVersions += 1;
    }

    summary.versions.push({
      versionId: version._id.toString(),
      status: String(version.status),
      isLocked: version.isLocked === true,
      changed,
      updated,
      sections: reports,
    });
  }

  console.log(JSON.stringify(summary, null, 2));
}

run()
  .catch((error: unknown) => {
    console.error('PMS template permission normalization failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
