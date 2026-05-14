import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
} from '../constants/pms.enums';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { PmsLetterTemplate } from '../models/pms-letter-template.model';
import type { IPmsTemplate } from '../models/pms-template.model';
import type {
  IPmsTemplateVersion,
  ITemplateField,
  ITemplateSection,
} from '../models/pms-template-version.model';
import type { IPmsLetterTemplate } from '../models/pms-letter-template.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';

export type TemplateSection = IPmsTemplateVersion['sections'][number];
export type TemplateField = TemplateSection['fields'][number];
export type TemplatePermission = Record<string, unknown>;

export interface CreateTemplateInput {
  name: string;
  code: string;
  description?: string;
  effectiveDate?: Date;
}

export interface UpdateTemplateInput {
  name?: string;
  description?: string;
  effectiveDate?: Date;
  status?: string;
}

export interface CreateTemplateVersionInput {
  versionNo?: number;
  versionNumber?: number;
  sections?: unknown[];
  themeConfig?: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  placeholders?: string[];
  conditionalBlocks?: string[];
}

export interface CreateLetterTemplateInput {
  name: string;
  code: string;
  type: string;
  channel: string;
  versionNumber: number;
  subject?: string;
  body: string;
  placeholders?: string[];
  conditionalBlocks?: string[];
}

export class PmsTemplateService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async createTemplate(input: CreateTemplateInput): Promise<IPmsTemplate> {
    this.assertAdmin('template.create');
    const code = this.normalizeCode(input.code);

    const existing = await PmsTemplate.findOne({ code });
    if (existing) {
      throw new Error('Template code already exists');
    }

    const template = await PmsTemplate.create({
      ...input,
      code,
      createdBy: this.actorIdObject(),
    });

    await this.audit('PMS_TEMPLATE_CREATED', 'PMS_TEMPLATE', template._id.toString(), undefined, template.toObject());
    return template;
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<IPmsTemplate> {
    this.assertAdmin('template.update');

    const template = await PmsTemplate.findByIdAndUpdate(
      id,
      {
        $set: {
          ...input,
          updatedBy: this.actorIdObject(),
        },
      },
      { new: true, runValidators: true },
    );

    if (!template) {
      throw new Error('Template not found');
    }

    await this.audit('PMS_TEMPLATE_UPDATED', 'PMS_TEMPLATE', id, undefined, input);
    return template;
  }

  async cloneTemplate(id: string): Promise<IPmsTemplate> {
    this.assertAdmin('template.clone');

    const template = await PmsTemplate.findById(id).lean();
    if (!template) {
      throw new Error('Template not found');
    }

    const clonedCode = `${template.code}_COPY_${Date.now()}`;
    const cloned = await PmsTemplate.create({
      name: `${template.name} Copy`,
      code: clonedCode,
      description: template.description,
      status: PmsTemplateStatus.DRAFT,
      effectiveDate: template.effectiveDate,
      createdBy: this.actorIdObject(),
    });

    const versions = await PmsTemplateVersion.find({ templateId: id }).lean();
    for (const version of versions) {
      await PmsTemplateVersion.create({
        templateId: cloned._id,
        versionNo: version.versionNo,
        status: PmsTemplateStatus.DRAFT,
        sections: version.sections,
        themeConfig: version.themeConfig ?? {},
        scoringConfig: version.scoringConfig ?? {},
        effectiveFrom: version.effectiveFrom,
        effectiveTo: version.effectiveTo,
        isLocked: false,
        createdBy: this.actorIdObject(),
      });
    }

    await this.audit('PMS_TEMPLATE_CLONED', 'PMS_TEMPLATE', cloned._id.toString(), { sourceTemplateId: id }, cloned.toObject());
    return cloned;
  }

  async createTemplateVersion(
    templateId: string,
    input: CreateTemplateVersionInput,
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.create');
    await this.ensureTemplateExists(templateId);
    const versionNo = input.versionNo ?? input.versionNumber;
    if (!versionNo) {
      throw new Error('Template version number is required');
    }

    const sections = this.normalizeSections(input.sections ?? []);
    this.validateSections(sections);

    const version = await PmsTemplateVersion.create({
      templateId: new Types.ObjectId(templateId),
      versionNo,
      sections,
      themeConfig: input.themeConfig ?? {},
      scoringConfig: input.scoringConfig ?? {},
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      status: PmsTemplateStatus.DRAFT,
      createdBy: this.actorIdObject(),
    });

    await this.audit('PMS_TEMPLATE_VERSION_CREATED', 'PMS_TEMPLATE_VERSION', version._id.toString(), undefined, version.toObject());
    return version;
  }

  async activateTemplateVersion(versionId: string): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.activate');
    const version = await this.getEditableOrExistingVersion(versionId, false);
    this.validateSections(version.sections);

    await PmsTemplateVersion.updateMany(
      {
        templateId: version.templateId,
        _id: { $ne: version._id },
        status: PmsTemplateStatus.ACTIVE,
      },
      {
        $set: {
          status: PmsTemplateStatus.INACTIVE,
          deactivatedAt: new Date(),
          updatedBy: this.actorIdObject(),
        },
      },
    );

    version.status = PmsTemplateStatus.ACTIVE;
    version.isLocked = true;
    version.lockedAt = version.lockedAt ?? new Date();
    version.activatedAt = new Date();
    version.updatedBy = this.actorIdObject();
    await version.save();

    await PmsTemplate.findByIdAndUpdate(version.templateId, {
      $set: {
        status: PmsTemplateStatus.ACTIVE,
        currentVersionId: version._id,
        updatedBy: this.actorIdObject(),
      },
    });

    await this.audit('PMS_TEMPLATE_VERSION_ACTIVATED', 'PMS_TEMPLATE_VERSION', version._id.toString(), undefined, { status: version.status });
    return version;
  }

  async deactivateTemplateVersion(versionId: string): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.deactivate');
    const version = await this.getEditableOrExistingVersion(versionId, false);

    version.status = PmsTemplateStatus.INACTIVE;
    version.deactivatedAt = new Date();
    version.updatedBy = this.actorIdObject();
    await version.save();

    await this.audit('PMS_TEMPLATE_VERSION_DEACTIVATED', 'PMS_TEMPLATE_VERSION', version._id.toString(), undefined, { status: version.status });
    return version;
  }

  async getTemplate(id: string): Promise<IPmsTemplate> {
    const template = await PmsTemplate.findById(id);
    if (!template) {
      throw new Error('Template not found');
    }
    return template;
  }

  async getTemplateVersion(versionId: string): Promise<IPmsTemplateVersion> {
    const version = await PmsTemplateVersion.findById(versionId);
    if (!version) {
      throw new Error('Template version not found');
    }
    return version;
  }

  async configureSections(
    versionId: string,
    sections: unknown[],
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.configureSections');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    const normalizedSections = this.normalizeSections(sections);
    this.validateSections(normalizedSections);

    version.sections = normalizedSections;
    version.updatedBy = this.actorIdObject();
    await version.save();

    await this.audit('PMS_TEMPLATE_SECTIONS_CONFIGURED', 'PMS_TEMPLATE_VERSION', versionId, undefined, { sectionCount: normalizedSections.length });
    return version;
  }

  async configureFields(
    versionId: string,
    sectionKey: string,
    fields: unknown[],
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.configureFields');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    const section = version.sections.find((item) => item.sectionKey === sectionKey);
    if (!section) {
      throw new Error('Template section not found');
    }

    section.fields = fields.map((field) => this.normalizeField(field));
    this.validateSections(version.sections);
    version.updatedBy = this.actorIdObject();
    await version.save();

    await this.audit('PMS_TEMPLATE_FIELDS_CONFIGURED', 'PMS_TEMPLATE_VERSION', versionId, undefined, { sectionKey, fieldCount: fields.length });
    return version;
  }

  async configureSectionPermissions(
    versionId: string,
    sectionKey: string,
    permissions: TemplatePermission[],
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.configureSectionPermissions');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    const section = version.sections.find((item) => item.sectionKey === sectionKey);
    if (!section) {
      throw new Error('Template section not found');
    }

    const rulePatch = this.rulesFromPermissions(permissions);
    section.visibilityRules = rulePatch.visibilityRules;
    section.editabilityRules = rulePatch.editabilityRules;
    version.updatedBy = this.actorIdObject();
    await version.save();

    await this.audit('PMS_TEMPLATE_SECTION_PERMISSIONS_CONFIGURED', 'PMS_TEMPLATE_VERSION', versionId, undefined, { sectionKey });
    return version;
  }

  async configureFieldPermissions(
    versionId: string,
    sectionKey: string,
    fieldKey: string,
    permissions: TemplatePermission[],
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.configureFieldPermissions');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    const section = version.sections.find((item) => item.sectionKey === sectionKey);
    const field = section?.fields.find((item) => item.fieldKey === fieldKey);
    if (!section || !field) {
      throw new Error('Template section or field not found');
    }

    const rulePatch = this.rulesFromPermissions(permissions);
    field.visibilityRules = rulePatch.visibilityRules;
    field.editabilityRules = rulePatch.editabilityRules;
    field.validationRules = {
      ...(field.validationRules ?? {}),
      ...(rulePatch.validationRules ?? {}),
    };
    version.updatedBy = this.actorIdObject();
    await version.save();

    await this.audit('PMS_TEMPLATE_FIELD_PERMISSIONS_CONFIGURED', 'PMS_TEMPLATE_VERSION', versionId, undefined, { sectionKey, fieldKey });
    return version;
  }

  async previewTemplate(versionId: string): Promise<IPmsTemplateVersion> {
    return this.getTemplateVersion(versionId);
  }

  async createLetterTemplate(input: CreateLetterTemplateInput): Promise<IPmsLetterTemplate> {
    this.assertAdmin('letterTemplate.create');
    this.validateLetterTemplate(input.body, input.placeholders ?? [], input.conditionalBlocks ?? []);

    const letterTemplate = await PmsLetterTemplate.create({
      ...input,
      code: this.normalizeCode(input.code),
      status: PmsTemplateStatus.DRAFT,
      placeholders: input.placeholders ?? [],
      conditionalBlocks: input.conditionalBlocks ?? [],
      createdBy: this.actorIdObject(),
    });

    await this.audit('PMS_LETTER_TEMPLATE_CREATED', 'PMS_LETTER_TEMPLATE', letterTemplate._id.toString(), undefined, letterTemplate.toObject());
    return letterTemplate;
  }

  async previewLetterTemplate(
    letterTemplateId: string,
    data: Record<string, unknown>,
  ): Promise<{ subject?: string; body: string }> {
    const letterTemplate = await this.getLetterTemplate(letterTemplateId);
    return {
      subject: letterTemplate.subject ? this.renderTemplate(letterTemplate.subject, data) : undefined,
      body: this.renderTemplate(letterTemplate.body, data),
    };
  }

  async activateLetterTemplate(letterTemplateId: string): Promise<IPmsLetterTemplate> {
    this.assertAdmin('letterTemplate.activate');
    const letterTemplate = await this.getLetterTemplate(letterTemplateId);
    this.validateLetterTemplate(
      letterTemplate.body,
      letterTemplate.placeholders,
      letterTemplate.conditionalBlocks,
    );

    letterTemplate.status = PmsTemplateStatus.ACTIVE;
    letterTemplate.activatedAt = new Date();
    letterTemplate.updatedBy = this.actorIdObject();
    await letterTemplate.save();

    await this.audit('PMS_LETTER_TEMPLATE_ACTIVATED', 'PMS_LETTER_TEMPLATE', letterTemplateId, undefined, { status: letterTemplate.status });
    return letterTemplate;
  }

  private async ensureTemplateExists(templateId: string): Promise<void> {
    const exists = await PmsTemplate.exists({ _id: templateId });
    if (!exists) {
      throw new Error('Template not found');
    }
  }

  private async getEditableOrExistingVersion(
    versionId: string,
    requireEditable: boolean,
  ): Promise<IPmsTemplateVersion> {
    const version = await PmsTemplateVersion.findById(versionId);
    if (!version) {
      throw new Error('Template version not found');
    }

    if (requireEditable && version.isLocked) {
      throw new Error('Template version is locked and cannot be modified');
    }

    return version;
  }

  private async getLetterTemplate(letterTemplateId: string): Promise<IPmsLetterTemplate> {
    const letterTemplate = await PmsLetterTemplate.findById(letterTemplateId);
    if (!letterTemplate) {
      throw new Error('Letter template not found');
    }
    return letterTemplate;
  }

  private normalizeSections(
    sections: unknown[],
  ): ITemplateSection[] {
    return sections.map((rawSection, index) => {
      const section = rawSection as Partial<ITemplateSection> & Record<string, unknown>;
      const legacyKey = section.key as string | undefined;
      const legacyLabel = section.label as string | undefined;
      const legacyType = section.type as ITemplateSection['sectionType'] | undefined;
      const legacyApplicableQuarters = section.applicableQuarters as ITemplateSection['repeatFor'] | undefined;
      const legacyOrder = section.order as number | undefined;
      const legacyPermissions = section.permissions as TemplatePermission[] | undefined;
      const rulePatch = this.rulesFromPermissions(legacyPermissions ?? []);

      return {
        sectionKey: section.sectionKey ?? legacyKey ?? '',
        sectionLabel: section.sectionLabel ?? legacyLabel ?? '',
        sectionType: section.sectionType ?? legacyType ?? PmsTemplateSectionType.OBJECTIVES,
        level: section.level ?? PmsTemplateSectionLevel.ANNUAL,
        repeatFor: section.repeatFor ?? legacyApplicableQuarters ?? [],
        repeatable: section.repeatable ?? false,
        displayOrder: section.displayOrder ?? legacyOrder ?? index + 1,
        visibilityRules: section.visibilityRules ?? rulePatch.visibilityRules ?? {},
        editabilityRules: section.editabilityRules ?? rulePatch.editabilityRules ?? {},
        metadata: section.metadata ?? {},
        fields: (section.fields ?? []).map((field, fieldIndex) =>
          this.normalizeField(field, fieldIndex),
        ),
      };
    });
  }

  private normalizeField(
    rawField: unknown,
    index = 0,
  ): ITemplateField {
    const field = rawField as Partial<ITemplateField> & Record<string, unknown>;
    const legacyKey = field.key as string | undefined;
    const legacyLabel = field.label as string | undefined;
    const legacyType = field.type as ITemplateField['fieldType'] | undefined;
    const legacyRequired = field.required as boolean | undefined;
    const legacyOrder = field.order as number | undefined;
    const legacyPermissions = field.permissions as TemplatePermission[] | undefined;
    const legacyScoringParticipation = field.scoringParticipation as boolean | undefined;
    const legacyWeightage = field.weightage as number | undefined;
    const legacyFormula = field.formula as string | undefined;
    const rulePatch = this.rulesFromPermissions(legacyPermissions ?? []);

    const scoringConfig = {
      ...(field.scoringConfig ?? {}),
      ...(legacyScoringParticipation !== undefined
        ? { participatesInScoring: legacyScoringParticipation }
        : {}),
      ...(legacyWeightage !== undefined ? { weightage: legacyWeightage } : {}),
      ...(legacyFormula ? { formula: legacyFormula } : {}),
    };

    return {
      fieldKey: field.fieldKey ?? legacyKey ?? '',
      fieldLabel: field.fieldLabel ?? legacyLabel ?? '',
      fieldType: field.fieldType ?? legacyType ?? 'SHORT_TEXT',
      isRequired: field.isRequired ?? legacyRequired ?? false,
      displayOrder: field.displayOrder ?? legacyOrder ?? index + 1,
      placeholder: field.placeholder as string | undefined,
      helpText: field.helpText as string | undefined,
      validationRules: {
        ...(field.validationRules ?? {}),
        ...(rulePatch.validationRules ?? {}),
      },
      visibilityRules: field.visibilityRules ?? rulePatch.visibilityRules ?? {},
      editabilityRules: field.editabilityRules ?? rulePatch.editabilityRules ?? {},
      optionConfig: field.optionConfig ?? {},
      scoringConfig,
      defaultValue: field.defaultValue,
      options: field.options ?? [],
    };
  }

  private rulesFromPermissions(
    permissions: TemplatePermission[],
  ): {
    visibilityRules?: Record<string, unknown>;
    editabilityRules?: Record<string, unknown>;
    validationRules?: Record<string, unknown>;
  } {
    if (permissions.length === 0) {
      return {};
    }

    const visibleTo: string[] = [];
    const hiddenFrom: string[] = [];
    const editableBy: string[] = [];
    const requiredFor: string[] = [];
    const editableStates = new Set<string>();
    const visibleStates = new Set<string>();
    const hierarchyScopes = new Set<string>();

    for (const permission of permissions) {
      const roleCode = typeof permission.roleCode === 'string' ? permission.roleCode : undefined;
      if (!roleCode) continue;

      if (permission.visible === false) hiddenFrom.push(roleCode);
      if (permission.visible === true) visibleTo.push(roleCode);
      if (permission.editable === true) editableBy.push(roleCode);
      if (permission.required === true) requiredFor.push(roleCode);
      if (typeof permission.hierarchyScope === 'string') {
        hierarchyScopes.add(permission.hierarchyScope);
      }

      if (Array.isArray(permission.workflowStates)) {
        for (const state of permission.workflowStates) {
          if (typeof state !== 'string') continue;
          if (permission.editable === true) editableStates.add(state);
          if (permission.visible === true) visibleStates.add(state);
        }
      }
    }

    return {
      visibilityRules: {
        ...(visibleTo.length > 0 ? { visibleTo } : {}),
        ...(hiddenFrom.length > 0 ? { hiddenFrom } : {}),
        ...(visibleStates.size > 0 ? { visibleStates: [...visibleStates] } : {}),
        ...(hierarchyScopes.size > 0 ? { hierarchyScopes: [...hierarchyScopes] } : {}),
      },
      editabilityRules: {
        ...(editableBy.length > 0 ? { editableBy } : {}),
        ...(editableStates.size > 0 ? { editableStates: [...editableStates] } : {}),
      },
      validationRules: {
        ...(requiredFor.length > 0 ? { requiredFor } : {}),
      },
    };
  }

  private validateSections(sections: TemplateSection[]): void {
    const allowedQuarters = new Set(['Q1', 'Q2', 'Q3', 'Q4']);
    const sectionKeys = new Set<string>();

    for (const section of sections) {
      if (!section.sectionKey?.trim()) {
        throw new Error('Template section key is required');
      }

      if (!section.sectionLabel?.trim()) {
        throw new Error(`Template section ${section.sectionKey} label is required`);
      }

      if (sectionKeys.has(section.sectionKey)) {
        throw new Error(`Duplicate template section key: ${section.sectionKey}`);
      }
      sectionKeys.add(section.sectionKey);

      if (section.level === PmsTemplateSectionLevel.QUARTER) {
        const quarters = section.repeatFor ?? [];
        if (quarters.length === 0) {
          throw new Error(`Quarter-level section ${section.sectionKey} must define repeatFor quarters`);
        }

        for (const quarter of quarters) {
          if (!allowedQuarters.has(quarter)) {
            throw new Error(`Invalid quarter ${quarter} in section ${section.sectionKey}`);
          }
        }
      }

      const fieldKeys = new Set<string>();
      for (const field of section.fields ?? []) {
        if (!field.fieldKey?.trim()) {
          throw new Error(`Field key is required in section ${section.sectionKey}`);
        }

        if (!field.fieldLabel?.trim()) {
          throw new Error(`Field ${field.fieldKey} label is required in section ${section.sectionKey}`);
        }

        if (fieldKeys.has(field.fieldKey)) {
          throw new Error(`Duplicate field key ${field.fieldKey} in section ${section.sectionKey}`);
        }
        fieldKeys.add(field.fieldKey);
      }
    }
  }

  private validateLetterTemplate(
    body: string,
    placeholders: string[],
    conditionalBlocks: string[],
  ): void {
    const declaredPlaceholders = new Set(placeholders);
    const bodyPlaceholders = [...body.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map(
      (match) => match[1],
    );

    for (const placeholder of bodyPlaceholders) {
      if (!declaredPlaceholders.has(placeholder)) {
        throw new Error(`Missing required placeholder declaration: ${placeholder}`);
      }
    }

    for (const block of conditionalBlocks) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(block)) {
        throw new Error(`Invalid conditional block name: ${block}`);
      }
    }
  }

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key: string) => {
      const value = data[key];
      return value === undefined || value === null ? '' : String(value);
    });
  }

  private assertAdmin(action: string): void {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const access = accessService.canPerform({
      actor: {
        actorId: user._id.toString(),
        actorRole: user.role,
      },
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private async audit(
    action: string,
    entityType: string,
    entityId: string,
    previousValue?: unknown,
    newValue?: unknown,
  ): Promise<void> {
    const user = this.context.user;
    if (!user) return;

    await auditService.createAuditLog({
      actorId: user._id.toString(),
      actorRole: user.role,
      action,
      entityType,
      entityId,
      previousValue,
      newValue,
    });
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }

  private normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }
}
