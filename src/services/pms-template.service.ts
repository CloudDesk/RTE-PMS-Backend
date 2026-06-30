import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  PmsTemplateFieldType,
  normalizePmsRole,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
  TermWorkflowState,
  FieldCategory,
  PmsRole,
  AssessmentTermCode,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  PmsTemplateSectionType as PmsTemplateSectionTypeType,
} from '../constants/pms.enums';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { TermAssignment } from '../models/pms-term-assignment.model';
import type { IPmsTemplate } from '../models/pms-template.model';
import type {
  IPmsTemplateVersion,
  ITemplateField,
  ITemplateSection,
} from '../models/pms-template-version.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import type { AuditHistoryEntry } from './audit.service';

export type TemplateSection = IPmsTemplateVersion['sections'][number];
export type TemplateField = TemplateSection['fields'][number];
export type TemplatePermission = Record<string, unknown>;

export interface ResolveTemplateVersionInput {
  role: string;
  workflowState: string;
  hierarchyScope?: string;
  quarter?: AssessmentTermCodeType;
  visibilityFlags?: string[];
  values?: Record<string, unknown>;
  annualAssignmentId?: string;
  termAssignmentId?: string;
}

export interface SimulateTemplateAccessInput extends ResolveTemplateVersionInput {
  versionId: string;
  annualAssignmentId?: string;
  termAssignmentId?: string;
}

export interface ResolvedTemplateField {
  id: string;
  key: string;
  label: string;
  type: string;
  required: boolean;
  visible: boolean;
  editable: boolean;
  placeholder?: string;
  helpText?: string;
  hideLabel?: boolean;
  colSpan?: number;
  options?: unknown[];
  matrixConfig?: unknown;
  gridConfig?: unknown;
  scoringIncluded?: boolean;
  fieldCategory?: string;
  semanticRole?: string;
  scoringConfig?: Record<string, unknown>;
  validationRules?: Record<string, unknown>;
  conditionalRendering?: TemplateField['conditionalRendering'];
}

export interface ResolvedTemplateSection {
  id: string;
  key: string;
  title: string;
  sectionType?: string;
  module: string;
  level: 'term' | 'annual';
  layout: 'vertical' | 'grid' | 'table' | 'bordered_grid';
  participatesInScoring?: boolean;
  weightage?: number;
  sectionScoringConfig?: ITemplateSection['sectionScoringConfig'];
  metadata?: Record<string, unknown>;
  fields: ResolvedTemplateField[];
}

export interface ResolvedTemplateVersion {
  versionId: string;
  role: string;
  workflowState: string;
  sections: ResolvedTemplateSection[];
  scoringParticipants: Array<{
    sectionKey: string;
    fieldKey: string;
    scoreType?: string;
    weight?: number;
  }>;
  simulationContext?: {
    annualAssignmentId?: string;
    termAssignmentId?: string;
    hierarchyScope?: string;
    quarter?: AssessmentTermCodeType;
    visibilityFlags: string[];
  };
}

export interface CreateTemplateInput {
  name: string;
  code: string;
  description?: string;
  effectiveDate?: string | Date;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface TemplateListQuery {
  status?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
  owner?: string;
  templateType?: string;
  sort?: string;
}

export interface UpdateTemplateInput {
  code?: string;
  name?: string;
  description?: string;
  effectiveDate?: string | Date;
  status?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateTemplateVersionInput {
  versionNo?: number;
  versionNumber?: number;
  sections?: unknown[];
  metadata?: Record<string, unknown>;
  templateOwnership?: Record<string, unknown>;
  launchPolicy?: Record<string, unknown>;
  flowPolicy?: Record<string, unknown>;
  themeConfig?: Record<string, unknown>;
  scoringConfig?: Record<string, unknown>;
  annualScoringConfig?: Record<string, unknown>;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  placeholders?: string[];
  conditionalBlocks?: string[];
}

export class PmsTemplateService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listTemplates(query: TemplateListQuery = {}): Promise<{
    items: IPmsTemplate[];
    total: number;
    page: number;
    limit: number;
  }> {
    await this.assertAdmin('template.list');
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 10), 100);
    const filter: Record<string, unknown> = { isDeleted: false };
    const owner = String(query.owner || 'admin').toLowerCase();

    if (owner !== 'all') {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        { createdByRole: { $ne: 'MANAGER' } },
        { visibilityScope: { $ne: 'MANAGER_TEAM' } },
      ];
    }

    const templateType = String(query.templateType || 'all').toLowerCase();
    if (templateType === 'manager') {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        { 'metadata.isFullPmsTemplate': false },
      ];
    } else if (templateType === 'full') {
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { 'metadata.isFullPmsTemplate': true },
            { 'metadata.isFullPmsTemplate': { $exists: false } },
          ],
        },
      ];
    }

    if (query.status?.trim()) {
      filter.status = query.status.trim().toUpperCase();
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const sort: Record<string, 1 | -1> =
      query.sort === 'updatedAt_asc'
        ? { updatedAt: 1 }
        : query.sort === 'name_asc'
          ? { name: 1 }
          : query.sort === 'name_desc'
            ? { name: -1 }
            : { updatedAt: -1 };

    const [items, total] = await Promise.all([
      PmsTemplate.find(filter)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit),
      PmsTemplate.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async createTemplate(input: CreateTemplateInput): Promise<IPmsTemplate> {
    await this.assertAdmin('template.create');
    const name = input.name.trim();
    const code = this.normalizeCode(input.code);
    const existingByName = await PmsTemplate.findOne({
      name: this.buildExactCaseInsensitivePattern(name),
      isDeleted: false,
    });
    if (existingByName) {
      throw new Error('Template name already exists');
    }

    const existing = await PmsTemplate.findOne({ code });
    if (existing) {
      throw new Error('Template code already exists');
    }

    const status = this.normalizeTemplateStatus(input.status);
    if (status === PmsTemplateStatus.ACTIVE) {
      throw new Error('A new template cannot be created with an Active status. You must first create and activate a template version.');
    }

    const template = await PmsTemplate.create({
      name,
      description: input.description?.trim() || undefined,
      code,
      effectiveDate: this.normalizeOptionalDate(input.effectiveDate),
      status,
      metadata: input.metadata ?? {},
      createdBy: this.actorIdObject(),
    });

    await this.audit('PMS_TEMPLATE_CREATED', 'PMS_TEMPLATE', template._id.toString(), undefined, template.toObject());
    return template;
  }

  async updateTemplate(id: string, input: UpdateTemplateInput): Promise<IPmsTemplate> {
    await this.assertAdmin('template.update');
    const existingTemplate = await PmsTemplate.findById(id);
    if (!existingTemplate) {
      throw new Error('Template not found');
    }

    const updatePayload: Record<string, unknown> = {
      updatedBy: this.actorIdObject(),
    };

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new Error('Template name is required');
      }

      const existingByName = await PmsTemplate.findOne({
        _id: { $ne: id },
        name: this.buildExactCaseInsensitivePattern(name),
        isDeleted: false,
      }).lean();
      if (existingByName) {
        throw new Error('Template name already exists');
      }

      updatePayload.name = name;
    }

    if (input.code !== undefined) {
      const code = this.normalizeCode(input.code);
      const existingByCode = await PmsTemplate.findOne({
        _id: { $ne: id },
        code,
      }).lean();
      if (existingByCode) {
        throw new Error('Template code already exists');
      }

      updatePayload.code = code;
    }

    if (input.description !== undefined) {
      updatePayload.description = input.description.trim() || undefined;
    }

    if (input.effectiveDate !== undefined) {
      updatePayload.effectiveDate = this.normalizeOptionalDate(input.effectiveDate);
    }

    if (input.status !== undefined) {
      const targetStatus = this.normalizeTemplateStatus(input.status);
      if (targetStatus === PmsTemplateStatus.ACTIVE && !existingTemplate.currentVersionId) {
        throw new Error('Template cannot be marked as Active without an activated template version.');
      }
      updatePayload.status = targetStatus;
    }

    if (input.metadata !== undefined) {
      updatePayload.metadata = input.metadata;
    }

    const template = await PmsTemplate.findByIdAndUpdate(
      id,
      {
        $set: updatePayload,
      },
      { new: true, runValidators: true },
    );

    if (!template) {
      throw new Error('Template not found');
    }

    await this.audit('PMS_TEMPLATE_UPDATED', 'PMS_TEMPLATE', id, undefined, input);
    return template;
  }

  async deleteTemplate(id: string): Promise<void> {
    await this.assertAdmin('template.delete');
    const template = await PmsTemplate.findOne({ _id: id, isDeleted: false });
    if (!template) {
      throw new Error('Template not found');
    }

    const versionIds = (
      await PmsTemplateVersion.find({
        templateId: template._id,
        isDeleted: false,
      })
        .select('_id')
        .lean()
    ).map((item) => item._id);

    if (versionIds.length > 0) {
      const [activeCycleUsage, assignmentUsage] = await Promise.all([
        AnnualCycle.exists({
          templateVersionId: { $in: versionIds },
          isDeleted: false,
        }),
        AnnualAssignment.exists({
          templateVersionId: { $in: versionIds },
          isDeleted: false,
        }),
      ]);

      if (activeCycleUsage || assignmentUsage) {
        throw new Error('Template is assigned to active cycles or assignments and cannot be deleted');
      }
    }

    template.isDeleted = true;
    template.updatedBy = this.actorIdObject();
    await template.save();
    await this.audit('PMS_TEMPLATE_DELETED', 'PMS_TEMPLATE', template._id.toString(), undefined, {
      isDeleted: true,
    });
  }

  async cloneTemplate(id: string): Promise<IPmsTemplate> {
    await this.assertAdmin('template.clone');

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
      metadata: template.metadata ?? {},
      createdBy: this.actorIdObject(),
    });

    const versions = await PmsTemplateVersion.find({ templateId: id }).lean();
    for (const version of versions) {
      await PmsTemplateVersion.create({
        templateId: cloned._id,
        versionNo: version.versionNo,
        status: PmsTemplateStatus.DRAFT,
        sections: version.sections,
        metadata: version.metadata ?? {},
        templateOwnership: version.templateOwnership ?? {},
        launchPolicy: version.launchPolicy ?? {},
        flowPolicy: version.flowPolicy ?? {},
        themeConfig: version.themeConfig ?? {},
        scoringConfig: version.scoringConfig ?? {},
        annualScoringConfig: version.annualScoringConfig ?? {},
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
    await this.assertAdmin('templateVersion.create');
    await this.ensureTemplateExists(templateId);
    const templateObjectId = new Types.ObjectId(templateId);
    const versionNo = input.versionNo ?? input.versionNumber;
    if (!versionNo) {
      throw new Error('Template version number is required');
    }
    const existingVersion = await PmsTemplateVersion.findOne({
      templateId: templateObjectId,
      versionNo,
      isDeleted: false,
    }).lean();
    if (existingVersion) {
      throw new Error(`Version ${versionNo} already exists for this template`);
    }

    const latestVersion = await PmsTemplateVersion.findOne({
      templateId: templateObjectId,
      isDeleted: false,
    })
      .sort({ versionNo: -1, createdAt: -1 })
      .lean();

    const versionSections =
      Array.isArray(input.sections) && input.sections.length > 0
        ? input.sections
        : latestVersion?.sections ?? [];
    const sections = this.normalizeSections(versionSections);
    this.validateSections(sections);

    const version = await PmsTemplateVersion.create({
      templateId: templateObjectId,
      versionNo,
      sections,
      metadata: input.metadata ?? latestVersion?.metadata ?? {},
      templateOwnership: input.templateOwnership ?? latestVersion?.templateOwnership ?? {},
      launchPolicy: input.launchPolicy ?? latestVersion?.launchPolicy ?? {},
      flowPolicy: input.flowPolicy ?? latestVersion?.flowPolicy ?? {},
      themeConfig: input.themeConfig ?? latestVersion?.themeConfig ?? {},
      scoringConfig: input.scoringConfig ?? latestVersion?.scoringConfig ?? {},
      annualScoringConfig: input.annualScoringConfig ?? latestVersion?.annualScoringConfig ?? {},
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
      status: PmsTemplateStatus.DRAFT,
      createdBy: this.actorIdObject(),
    });

    await this.audit('PMS_TEMPLATE_VERSION_CREATED', 'PMS_TEMPLATE_VERSION', version._id.toString(), undefined, version.toObject());
    return version;
  }

  async activateTemplateVersion(versionId: string): Promise<IPmsTemplateVersion> {
    await this.assertAdmin('templateVersion.activate');
    const version = await this.getEditableOrExistingVersion(versionId, false);
    version.sections = this.normalizeSections(version.sections as unknown[]);
    this.validateSections(version.sections);
    await this.validateTemplateVersionForActivation(version);

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
    await this.assertAdmin('templateVersion.deactivate');
    const version = await this.getEditableOrExistingVersion(versionId, false);

    version.status = PmsTemplateStatus.INACTIVE;
    version.deactivatedAt = new Date();
    version.updatedBy = this.actorIdObject();
    await version.save();

    const parentTemplate = await PmsTemplate.findById(version.templateId);
    if (parentTemplate && parentTemplate.currentVersionId?.toString() === version._id.toString()) {
      parentTemplate.status = PmsTemplateStatus.INACTIVE;
      parentTemplate.currentVersionId = undefined;
      parentTemplate.updatedBy = this.actorIdObject();
      parentTemplate.version += 1;
      await parentTemplate.save();
    }

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

  async getTemplateAuditHistory(id: string): Promise<AuditHistoryEntry[]> {
    await this.assertAdmin('template.audit');
    const template = await PmsTemplate.findOne({ _id: id, isDeleted: false }).lean();
    if (!template) {
      throw new Error('Template not found');
    }

    const versions = await PmsTemplateVersion.find({
      templateId: template._id,
      isDeleted: false,
    })
      .select('_id')
      .lean();

    const versionHistories = await Promise.all(
      versions.map((version) =>
        auditService.getEntityHistory('PMS_TEMPLATE_VERSION', version._id.toString()),
      ),
    );

    const templateHistory = await auditService.getEntityHistory(
      'PMS_TEMPLATE',
      template._id.toString(),
    );

    return [...templateHistory, ...versionHistories.flat()].sort(
      (left, right) =>
        new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
    );
  }

  async listTemplateVersions(templateId: string): Promise<IPmsTemplateVersion[]> {
    await this.assertAdmin('templateVersion.list');
    await this.ensureTemplateExists(templateId);
    return PmsTemplateVersion.find({
      templateId: new Types.ObjectId(templateId),
      isDeleted: false,
    }).sort({ versionNo: -1, createdAt: -1 });
  }

  async deleteTemplateVersion(versionId: string): Promise<void> {
    await this.assertAdmin('templateVersion.delete');
    const version = await PmsTemplateVersion.findOne({ _id: versionId, isDeleted: false });
    if (!version) {
      throw new Error('Template version not found');
    }
    if (version.status === PmsTemplateStatus.ACTIVE || version.isLocked) {
      throw new Error('Active or locked template version cannot be deleted');
    }

    const [cycleUsage, assignmentUsage] = await Promise.all([
      AnnualCycle.exists({
        templateVersionId: version._id,
        isDeleted: false,
      }),
      AnnualAssignment.exists({
        templateVersionId: version._id,
        isDeleted: false,
      }),
    ]);

    if (cycleUsage || assignmentUsage) {
      throw new Error('Template version is assigned and cannot be deleted');
    }

    version.isDeleted = true;
    version.updatedBy = this.actorIdObject();
    await version.save();
    await this.audit(
      'PMS_TEMPLATE_VERSION_DELETED',
      'PMS_TEMPLATE_VERSION',
      version._id.toString(),
      undefined,
      { isDeleted: true },
    );
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
    metadata: {
      metadata?: Record<string, unknown>;
      templateOwnership?: Record<string, unknown>;
      launchPolicy?: Record<string, unknown>;
      flowPolicy?: Record<string, unknown>;
      annualScoringConfig?: Record<string, unknown>;
      scoringConfig?: Record<string, unknown>;
    } = {},
  ): Promise<IPmsTemplateVersion> {
    await this.assertAdmin('templateVersion.configureSections');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    const normalizedSections = this.normalizeSections(sections);
    this.validateSections(normalizedSections);

    version.sections = normalizedSections;
    if (metadata.metadata !== undefined) {
      version.metadata = metadata.metadata;
    }
    if (metadata.templateOwnership !== undefined) {
      version.templateOwnership = metadata.templateOwnership;
    }
    if (metadata.launchPolicy !== undefined) {
      version.launchPolicy = metadata.launchPolicy;
    }
    if (metadata.flowPolicy !== undefined) {
      version.flowPolicy = metadata.flowPolicy;
    }
    if (metadata.annualScoringConfig !== undefined) {
      version.annualScoringConfig = metadata.annualScoringConfig;
    }
    if (metadata.scoringConfig !== undefined) {
      version.scoringConfig = metadata.scoringConfig;
    }
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
    await this.assertAdmin('templateVersion.configureFields');
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
    await this.assertAdmin('templateVersion.configureSectionPermissions');
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
    await this.assertAdmin('templateVersion.configureFieldPermissions');
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

  async resolveTemplateVersion(
    versionId: string,
    input: ResolveTemplateVersionInput,
  ): Promise<ResolvedTemplateVersion> {
    const version = await PmsTemplateVersion.findOne({
      _id: versionId,
      isDeleted: false,
    });
    if (!version) {
      throw new Error('Template version not found');
    }

    const role = this.normalizeRoleCode(input.role);
    const workflowState = input.workflowState;
    if (!this.isApprovedWorkflowState(workflowState)) {
      throw new Error(`Invalid PMS workflow state: ${workflowState}`);
    }

    const derivedContext = await this.resolveRuntimeContextForTemplate(version, input);
    const visibilityFlags = new Set(derivedContext.visibilityFlags);
    const hierarchyScope = derivedContext.hierarchyScope ?? input.hierarchyScope;
    const quarter = derivedContext.quarter ?? input.quarter;
    const values = input.values ?? {};

    const sections = version.sections
      .filter((section) => this.isSectionInScope(section, quarter))
      .filter((section) =>
        this.isVisibleByRules(section.visibilityRules, {
          role,
          workflowState,
          hierarchyScope,
          visibilityFlags,
        }),
      )
      .map((section) => {
        const visibleFieldKeys = this.resolveVisibleFieldKeys(section.fields ?? [], {
          role,
          workflowState,
          hierarchyScope,
          visibilityFlags,
          values,
        });
        const fields = (section.fields ?? [])
          .filter((field) => visibleFieldKeys.has(field.fieldKey))
          .map((field) =>
            this.toResolvedField(field, {
              role,
              workflowState,
              hierarchyScope,
              visibilityFlags,
            }),
          );

        return {
          id: section.sectionKey,
          key: section.sectionKey,
          title: section.sectionLabel,
          sectionType: section.sectionType,
          module: this.mapSectionModule(section.sectionType),
          level: this.isTermLevel(section.level) ? 'term' : 'annual',
          layout: section.layout ?? 'vertical',
          participatesInScoring: section.sectionScoringConfig?.participatesInScoring === true,
          weightage: Number(section.sectionScoringConfig?.weightage ?? 0),
          sectionScoringConfig: section.sectionScoringConfig,
          metadata: section.metadata ?? {},
          fields,
        } as ResolvedTemplateSection;
      })
      .filter((section) => section.fields.length > 0);

    const scoringParticipants = sections.flatMap((section) =>
      section.fields
        .filter((field) => field.scoringIncluded)
        .map((field) => ({
          sectionKey: section.key,
          fieldKey: field.key,
          scoreType: String(field.scoringConfig?.scoreType ?? ''),
          weight: Number(
            field.scoringConfig?.weight ??
            field.scoringConfig?.weightage ??
            0,
          ),
        })),
    );

    return {
      versionId,
      role: input.role,
      workflowState,
      sections,
      scoringParticipants,
      simulationContext: {
        annualAssignmentId: derivedContext.annualAssignmentId,
        termAssignmentId: derivedContext.termAssignmentId,
        hierarchyScope,
        quarter,
        visibilityFlags: [...visibilityFlags],
      },
    };
  }

  async simulateTemplateAccess(
    input: SimulateTemplateAccessInput,
  ): Promise<ResolvedTemplateVersion> {
    await this.assertAdmin('template.access.simulate');

    const derivedContext = await this.resolveSimulationContext(input);
    const resolved = await this.resolveTemplateVersion(input.versionId, {
      role: input.role,
      workflowState: input.workflowState,
      hierarchyScope: derivedContext.hierarchyScope,
      quarter: derivedContext.quarter,
      visibilityFlags: derivedContext.visibilityFlags,
      values: input.values,
      annualAssignmentId: derivedContext.annualAssignmentId,
      termAssignmentId: derivedContext.termAssignmentId,
    });

    return {
      ...resolved,
      simulationContext: {
        annualAssignmentId: derivedContext.annualAssignmentId,
        termAssignmentId: derivedContext.termAssignmentId,
        hierarchyScope: derivedContext.hierarchyScope,
        quarter: derivedContext.quarter,
        visibilityFlags: derivedContext.visibilityFlags,
      },
    };
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

  private normalizeSections(
    sections: unknown[],
  ): ITemplateSection[] {
    return sections.map((rawSection, index) => {
      const section = rawSection as Partial<ITemplateSection> & Record<string, unknown>;
      const legacyKey = section.key as string | undefined;
      const legacyLabel = section.label as string | undefined;
      const legacyType = section.type as ITemplateSection['sectionType'] | undefined;
      const legacyApplicableQuarters = section.applicableTerms as ITemplateSection['repeatFor'] | undefined;
      const legacyOrder = section.order as number | undefined;
      const legacyPermissions = section.permissions as TemplatePermission[] | undefined;
      const sectionScoringConfig = section.sectionScoringConfig as ITemplateSection['sectionScoringConfig'] | undefined;
      const objectiveConfig = this.normalizeObjectiveConfig(
        section.objectiveConfig ?? (section.metadata as any)?.objectiveConfig,
      );
      const repeatFor = section.repeatFor ?? legacyApplicableQuarters ?? [];
      const termScope = section.termScope as ITemplateSection['termScope'] | undefined;
      const rulePatch = this.rulesFromPermissions(legacyPermissions ?? []);
      const sectionType = section.sectionType ?? legacyType ?? PmsTemplateSectionType.OBJECTIVES;

      return {
        sectionKey: section.sectionKey ?? legacyKey ?? '',
        sectionLabel: section.sectionLabel ?? legacyLabel ?? '',
        sectionType,
        level: this.normalizeSectionLevel(section.level),
        repeatFor,
        repeatable: section.repeatable ?? false,
        displayOrder: section.displayOrder ?? legacyOrder ?? index + 1,
        layout: ['grid', 'table', 'bordered_grid'].includes(section.layout as string) ? (section.layout as 'grid' | 'table' | 'bordered_grid') : 'vertical',
        renderingScope: this.normalizeRenderingScope(
          section.renderingScope as string | undefined,
          this.normalizeSectionLevel(section.level),
        ),
        termScope: termScope ?? repeatFor,
        sectionScoringConfig: sectionScoringConfig
          ? {
            participatesInScoring: !!sectionScoringConfig.participatesInScoring,
            weightage: Number(sectionScoringConfig.weightage ?? 0),
            aggregationMethod: sectionScoringConfig.aggregationMethod ?? 'WEIGHTED_AVERAGE',
            maxSectionScore: Number(sectionScoringConfig.maxSectionScore ?? 100),
          }
          : undefined,
        visibilityRules: section.visibilityRules ?? rulePatch.visibilityRules ?? {},
        editabilityRules: section.editabilityRules ?? rulePatch.editabilityRules ?? {},
        metadata: section.metadata ?? {},
        objectiveConfig,
        objectiveBuckets: this.normalizeObjectiveBuckets(
          section.objectiveBuckets,
          objectiveConfig,
          sectionType,
        ),
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
    } as Record<string, any>;

    const isScoring = !!scoringConfig.participatesInScoring;
    const fieldCategory = field.fieldCategory ?? (isScoring ? FieldCategory.SCORING : FieldCategory.NORMAL);
    const semanticRole = field.semanticRole;

    const legacyOptionScores = Array.isArray(scoringConfig.optionScores)
      ? scoringConfig.optionScores
      : [];

    const normalizedOptions = (field.options ?? []).map((option: any) => {
      let score = option.score !== undefined ? Number(option.score) : undefined;
      if (score === undefined && option.weight !== undefined) {
        score = Number(option.weight);
      }
      if (score === undefined) {
        const legacyMatch = legacyOptionScores.find((item: any) => item.optionValue === option.value);
        if (legacyMatch && legacyMatch.score !== undefined) {
          score = Number(legacyMatch.score);
        }
      }
      return {
        label: option.label,
        value: option.value,
        ...(option.weight !== undefined ? { weight: Number(option.weight) } : {}),
        ...(score !== undefined ? { score } : {}),
      };
    });

    // Bidirectional sync: update scoringConfig.optionScores
    const syncedOptionScores = normalizedOptions
      .filter((opt) => opt.score !== undefined)
      .map((opt) => ({
        optionValue: opt.value,
        score: opt.score!,
      }));
    if (syncedOptionScores.length > 0) {
      scoringConfig.optionScores = syncedOptionScores;
    }

    return {
      fieldKey: field.fieldKey ?? legacyKey ?? '',
      fieldLabel: field.fieldLabel ?? legacyLabel ?? '',
      fieldType: field.fieldType ?? legacyType ?? 'SHORT_TEXT',
      fieldCategory,
      semanticRole,
      isRequired: field.isRequired ?? legacyRequired ?? false,
      displayOrder: field.displayOrder ?? legacyOrder ?? index + 1,
      placeholder: field.placeholder as string | undefined,
      helpText: field.helpText as string | undefined,
      hideLabel: !!field.hideLabel,
      validationRules: {
        ...(field.validationRules ?? {}),
        ...(rulePatch.validationRules ?? {}),
      },
      visibilityRules: field.visibilityRules ?? rulePatch.visibilityRules ?? {},
      editabilityRules: field.editabilityRules ?? rulePatch.editabilityRules ?? {},
      optionConfig: field.optionConfig ?? {},
      scoringConfig,
      defaultValue: field.defaultValue,
      colSpan: [1, 2, 3, 4].includes(Number(field.colSpan))
        ? (Number(field.colSpan) as 1 | 2 | 3 | 4)
        : 4,
      options: normalizedOptions,
      behaviors: Array.isArray(field.behaviors)
        ? field.behaviors.map((behavior: any) => ({
          workflowState: behavior.workflowState,
          role: this.normalizeRoleCode(behavior.role),
          visibility: behavior.visibility === 'HIDDEN' ? 'HIDDEN' : 'VISIBLE',
          editability: behavior.editability === 'EDITABLE' ? 'EDITABLE' : 'READ_ONLY',
          mandatory: !!behavior.mandatory,
        }))
        : [],
      conditionalRendering: field.conditionalRendering
        ? {
          dependsOn: String((field.conditionalRendering as any).dependsOn ?? ''),
          operator: (field.conditionalRendering as any).operator,
          value: (field.conditionalRendering as any).value,
          action: (field.conditionalRendering as any).action === 'HIDE' ? 'HIDE' : 'SHOW',
        }
        : undefined,
      matrixConfig: field.matrixConfig
        ? {
          rows: (field.matrixConfig.rows ?? []).map((row: any) => {
            return {
              key: row.key ?? row.id,
              label: row.label,
              weightage: row.weightage,
              options: (row.options ?? []).map((option: any) => {
                let score = option.score !== undefined ? Number(option.score) : undefined;
                if (score === undefined && option.weight !== undefined) {
                  score = Number(option.weight);
                }
                if (score === undefined) {
                  const rowKey = row.key ?? row.id;
                  const legacyMatch = legacyOptionScores.find(
                    (item: any) => item.optionValue === option.value || item.optionValue === `${rowKey}:${option.value}`,
                  );
                  if (legacyMatch && legacyMatch.score !== undefined) {
                    score = Number(legacyMatch.score);
                  }
                }
                return {
                  label: option.label,
                  value: option.value,
                  ...(option.weight !== undefined ? { weight: Number(option.weight) } : {}),
                  ...(score !== undefined ? { score } : {}),
                };
              }),
            };
          }),
          columns: (field.matrixConfig.columns ?? []).map((col: any) => ({
            key: col.key ?? col.id,
            label: col.label,
            weightage: col.weightage,
          })),
          allowComments: !!field.matrixConfig.allowComments,
          selectionControl: field.matrixConfig.selectionControl === 'checkbox' ? 'checkbox' : 'radio',
          multiSelectScoring: ['AVERAGE', 'SUM_CAPPED'].includes(String(field.matrixConfig.multiSelectScoring))
            ? field.matrixConfig.multiSelectScoring
            : 'MAX',
          borderStyle: field.matrixConfig.borderStyle === 'paper' ? 'paper' : 'standard',
        }
        : undefined,
      gridConfig: field.gridConfig
        ? {
          columns: (field.gridConfig.columns ?? []).map((col: any) => ({
            key: col.key ?? col.id,
            label: col.label,
            type: col.type,
            required: !!col.required,
          })),
          minRows: field.gridConfig.minRows,
          maxRows: field.gridConfig.maxRows,
        }
        : undefined,
    };
  }

  private normalizeObjectiveConfig(
    rawConfig: unknown,
  ): ITemplateSection['objectiveConfig'] | undefined {
    if (!rawConfig || typeof rawConfig !== 'object') {
      return undefined;
    }

    const config = rawConfig as Record<string, any>;
    let mode = ['PREDEFINED', 'DYNAMIC', 'HYBRID'].includes(config.mode)
      ? config.mode
      : 'DYNAMIC';
    const allowEmployeeCreated = config.allowEmployeeCreated !== false;
    const allowManagerCreated = config.allowManagerCreated !== false;
    const predefinedObjectives = Array.isArray(config.predefinedObjectives)
      ? config.predefinedObjectives.map((objective: Record<string, any>) => ({
        objectiveKey: String(objective.objectiveKey ?? objective.key ?? '').trim(),
        title: String(objective.title ?? '').trim(),
        description: objective.description ? String(objective.description) : undefined,
        kpi: objective.kpi ? String(objective.kpi) : undefined,
        targetValue: objective.targetValue ? String(objective.targetValue) : undefined,
        dueDate: objective.dueDate ? String(objective.dueDate) : undefined,
        weightage:
          objective.weightage === undefined || objective.weightage === ''
            ? undefined
            : Number(objective.weightage),
        successCriteria: objective.successCriteria ? String(objective.successCriteria) : undefined,
        attachmentAllowed: objective.attachmentAllowed === true,
        applyToAllQuarters: objective.applyToAllQuarters !== false,
        editable: objective.editable !== false,
        isActive: objective.isActive !== false,
        termScope: Array.isArray(objective.termScope)
          ? objective.termScope.filter((quarter: unknown) =>
            Object.values(AssessmentTermCode).includes(quarter as AssessmentTermCode),
          )
          : undefined,
        applicableTerms: Array.isArray(objective.applicableTerms)
          ? objective.applicableTerms.filter((quarter: unknown) =>
            Object.values(AssessmentTermCode).includes(quarter as AssessmentTermCode),
          )
          : undefined,
        repeatFor: Array.isArray(objective.repeatFor)
          ? objective.repeatFor.filter((quarter: unknown) =>
            Object.values(AssessmentTermCode).includes(quarter as AssessmentTermCode),
          )
          : undefined,
      }))
      : [];
    const hasActivePredefinedObjectives = predefinedObjectives.some(
      (objective) => objective.isActive !== false,
    );

    if (hasActivePredefinedObjectives && mode === 'DYNAMIC') {
      mode = allowEmployeeCreated || allowManagerCreated ? 'HYBRID' : 'PREDEFINED';
    }

    return {
      mode,
      allowEmployeeCreated,
      allowManagerCreated,
      managerCreatedAutoApprove: config.managerCreatedAutoApprove !== false,
      objectiveScoringPolicy: {
        predefinedObjectivesScoreable:
          config.objectiveScoringPolicy?.predefinedObjectivesScoreable !== false,
        managerCreatedScoreable:
          config.objectiveScoringPolicy?.managerCreatedScoreable === true,
        employeeCreatedScoreable:
          config.objectiveScoringPolicy?.employeeCreatedScoreable === true,
        requireManagerApprovalForEmployeeScore:
          config.objectiveScoringPolicy?.requireManagerApprovalForEmployeeScore !== false,
        requireWeightageBeforeAchievement:
          config.objectiveScoringPolicy?.requireWeightageBeforeAchievement !== false,
        allowManagerOverallForRemainingWeightage:
          config.objectiveScoringPolicy?.allowManagerOverallForRemainingWeightage !== false,
      },
      predefinedObjectives,
    };
  }

  private normalizeObjectiveBuckets(
    rawBuckets: unknown,
    objectiveConfig: ITemplateSection['objectiveConfig'] | undefined,
    sectionType: PmsTemplateSectionTypeType,
  ): ITemplateSection['objectiveBuckets'] | undefined {
    if (sectionType !== PmsTemplateSectionType.OBJECTIVES || !objectiveConfig) {
      return Array.isArray(rawBuckets)
        ? rawBuckets.map((bucket: any) => this.normalizeObjectiveBucket(bucket))
        : undefined;
    }

    const existingBuckets = Array.isArray(rawBuckets)
      ? rawBuckets.map((bucket: any) => this.normalizeObjectiveBucket(bucket))
      : [];
    const existingWeightSum = existingBuckets.reduce(
      (sum, bucket) => sum + Number(bucket.bucketWeightage ?? 0),
      0,
    );
    const existingValidSources = existingBuckets.every((bucket) =>
      ['TEMPLATE_PREDEFINED', 'EMPLOYEE_DYNAMIC', 'MANAGER_DYNAMIC'].includes(bucket.source),
    );
    const hasActivePredefinedObjectives = (objectiveConfig.predefinedObjectives ?? []).some(
      (objective) => objective.isActive !== false,
    );
    const needsPredefinedBucket =
      hasActivePredefinedObjectives &&
      objectiveConfig.objectiveScoringPolicy?.predefinedObjectivesScoreable !== false;
    const hasPredefinedBucket = existingBuckets.some(
      (bucket) => bucket.source === 'TEMPLATE_PREDEFINED',
    );

    if (
      existingBuckets.length > 0 &&
      existingValidSources &&
      existingWeightSum === 100 &&
      (!needsPredefinedBucket || hasPredefinedBucket)
    ) {
      return existingBuckets;
    }

    return this.deriveObjectiveBuckets(objectiveConfig);
  }

  private normalizeObjectiveBucket(
    bucket: any,
  ): NonNullable<ITemplateSection['objectiveBuckets']>[number] {
    const bucketKey = String(bucket.bucketKey ?? '').trim();
    const source = this.inferObjectiveBucketSource(bucket.source, bucketKey);
    const owner = this.inferObjectiveBucketOwner(bucket.owner, source);

    return {
      bucketKey,
      label: String(bucket.label ?? bucket.bucketLabel ?? '').trim(),
      source,
      owner,
      bucketWeightage: Number(bucket.bucketWeightage ?? bucket.weightage ?? 0),
      rowWeightMode:
        bucket.rowWeightMode ??
        (source === 'TEMPLATE_PREDEFINED' ? 'FIXED_BY_TEMPLATE' : 'OWNER_ENTERED'),
      editableBy: Array.isArray(bucket.editableBy)
        ? bucket.editableBy.map(String)
        : source === 'TEMPLATE_PREDEFINED'
          ? ['ADMIN']
          : [owner],
      requiresManagerApproval:
        bucket.requiresManagerApproval !== undefined
          ? !!bucket.requiresManagerApproval
          : source === 'EMPLOYEE_DYNAMIC',
      autoApprove:
        bucket.autoApprove !== undefined
          ? !!bucket.autoApprove
          : source !== 'EMPLOYEE_DYNAMIC',
    };
  }

  private inferObjectiveBucketSource(
    source: unknown,
    bucketKey: string,
  ): 'TEMPLATE_PREDEFINED' | 'EMPLOYEE_DYNAMIC' | 'MANAGER_DYNAMIC' {
    if (
      source === 'TEMPLATE_PREDEFINED' ||
      source === 'EMPLOYEE_DYNAMIC' ||
      source === 'MANAGER_DYNAMIC'
    ) {
      return source;
    }
    if (bucketKey === 'template_predefined') return 'TEMPLATE_PREDEFINED';
    if (bucketKey === 'manager_dynamic') return 'MANAGER_DYNAMIC';
    return 'EMPLOYEE_DYNAMIC';
  }

  private inferObjectiveBucketOwner(
    owner: unknown,
    source: 'TEMPLATE_PREDEFINED' | 'EMPLOYEE_DYNAMIC' | 'MANAGER_DYNAMIC',
  ): 'SYSTEM' | 'EMPLOYEE' | 'MANAGER' {
    if (owner === 'SYSTEM' || owner === 'EMPLOYEE' || owner === 'MANAGER') {
      return owner;
    }
    if (source === 'TEMPLATE_PREDEFINED') return 'SYSTEM';
    if (source === 'MANAGER_DYNAMIC') return 'MANAGER';
    return 'EMPLOYEE';
  }

  private deriveObjectiveBuckets(
    objectiveConfig: ITemplateSection['objectiveConfig'],
  ): NonNullable<ITemplateSection['objectiveBuckets']> {
    const policy = objectiveConfig?.objectiveScoringPolicy ?? {};
    const hasActivePredefinedObjectives = (objectiveConfig?.predefinedObjectives ?? []).some(
      (objective) => objective.isActive !== false,
    );
    const scoreableSources: Array<'TEMPLATE_PREDEFINED' | 'EMPLOYEE_DYNAMIC' | 'MANAGER_DYNAMIC'> = [];

    if (hasActivePredefinedObjectives && policy.predefinedObjectivesScoreable !== false) {
      scoreableSources.push('TEMPLATE_PREDEFINED');
    }
    if (objectiveConfig?.allowEmployeeCreated !== false && policy.employeeCreatedScoreable === true) {
      scoreableSources.push('EMPLOYEE_DYNAMIC');
    }
    if (objectiveConfig?.allowManagerCreated !== false && policy.managerCreatedScoreable === true) {
      scoreableSources.push('MANAGER_DYNAMIC');
    }

    if (scoreableSources.length === 0) {
      if (hasActivePredefinedObjectives) {
        scoreableSources.push('TEMPLATE_PREDEFINED');
      } else {
        if (objectiveConfig?.allowEmployeeCreated !== false) {
          scoreableSources.push('EMPLOYEE_DYNAMIC');
        }
        if (objectiveConfig?.allowManagerCreated !== false) {
          scoreableSources.push('MANAGER_DYNAMIC');
        }
      }
    }

    const weights = this.distributeObjectiveBucketWeightage(scoreableSources.length);
    const weightForSource = new Map(
      scoreableSources.map((source, index) => [source, weights[index] ?? 0]),
    );

    return [
      this.createObjectiveBucket(
        'TEMPLATE_PREDEFINED',
        weightForSource.get('TEMPLATE_PREDEFINED') ?? 0,
      ),
      this.createObjectiveBucket(
        'EMPLOYEE_DYNAMIC',
        weightForSource.get('EMPLOYEE_DYNAMIC') ?? 0,
      ),
      this.createObjectiveBucket(
        'MANAGER_DYNAMIC',
        weightForSource.get('MANAGER_DYNAMIC') ?? 0,
      ),
    ].filter((bucket) => {
      if (bucket.source === 'TEMPLATE_PREDEFINED') {
        return hasActivePredefinedObjectives;
      }
      if (bucket.source === 'EMPLOYEE_DYNAMIC') {
        return objectiveConfig?.allowEmployeeCreated !== false;
      }
      return objectiveConfig?.allowManagerCreated !== false;
    });
  }

  private distributeObjectiveBucketWeightage(count: number): number[] {
    if (count <= 0) return [];
    const base = Math.floor(100 / count);
    let remainder = 100 - base * count;
    return Array.from({ length: count }, () => {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      return base + extra;
    });
  }

  private createObjectiveBucket(
    source: 'TEMPLATE_PREDEFINED' | 'EMPLOYEE_DYNAMIC' | 'MANAGER_DYNAMIC',
    bucketWeightage: number,
  ): NonNullable<ITemplateSection['objectiveBuckets']>[number] {
    if (source === 'TEMPLATE_PREDEFINED') {
      return {
        bucketKey: 'template_predefined',
        label: 'Admin Objectives',
        source,
        owner: 'SYSTEM',
        bucketWeightage,
        rowWeightMode: 'FIXED_BY_TEMPLATE',
        editableBy: ['ADMIN'],
        requiresManagerApproval: false,
        autoApprove: true,
      };
    }

    if (source === 'MANAGER_DYNAMIC') {
      return {
        bucketKey: 'manager_dynamic',
        label: 'Manager Objectives',
        source,
        owner: 'MANAGER',
        bucketWeightage,
        rowWeightMode: 'OWNER_ENTERED',
        editableBy: ['MANAGER'],
        requiresManagerApproval: false,
        autoApprove: true,
      };
    }

    return {
      bucketKey: 'employee_dynamic',
      label: 'Employee Objectives',
      source,
      owner: 'EMPLOYEE',
      bucketWeightage,
      rowWeightMode: 'OWNER_ENTERED',
      editableBy: ['EMPLOYEE'],
      requiresManagerApproval: true,
      autoApprove: false,
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
      const roleCode = typeof permission.roleCode === 'string'
        ? this.normalizeRoleCode(permission.roleCode)
        : undefined;
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

  private isSectionInScope(
    section: ITemplateSection,
    quarter?: AssessmentTermCodeType,
  ): boolean {
    if (!quarter) return true;
    const scopedQuarters = section.termScope?.length
      ? section.termScope
      : section.repeatFor ?? [];
    if (scopedQuarters.length === 0) return true;
    return this.assessmentTermScopeMatches(scopedQuarters, quarter);
  }

  private assessmentTermScopeMatches(
    scopedTerms: AssessmentTermCodeType[],
    termCode: AssessmentTermCodeType,
  ): boolean {
    if (scopedTerms.includes(termCode)) {
      return true;
    }

    const quarterlyTerms = [
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ] as AssessmentTermCodeType[];
    const allQuarterlyTermsSelected = quarterlyTerms.every((quarter) =>
      scopedTerms.includes(quarter),
    );

    return allQuarterlyTermsSelected && (
      termCode === AssessmentTermCode.H1 ||
      termCode === AssessmentTermCode.H2 ||
      termCode === AssessmentTermCode.Y1
    );
  }

  private isFieldVisible(
    field: ITemplateField,
    context: {
      role: string;
      workflowState: string;
      hierarchyScope?: string;
      visibilityFlags: Set<string>;
      values: Record<string, unknown>;
    },
  ): boolean {
    const behavior = this.findBehavior(field, context.role, context.workflowState);
    if (behavior?.visibility === 'HIDDEN') return false;

    const visibleByRules = this.isVisibleByRules(field.visibilityRules, context);
    if (!visibleByRules) return false;

    if (behavior && behavior.visibility !== 'VISIBLE') return false;

    if (field.conditionalRendering) {
      const conditionMet = this.evaluateCondition(
        context.values[field.conditionalRendering.dependsOn],
        field.conditionalRendering.operator,
        field.conditionalRendering.value,
      );
      return field.conditionalRendering.action === 'SHOW' ? conditionMet : !conditionMet;
    }

    return true;
  }

  private toResolvedField(
    field: ITemplateField,
    context: {
      role: string;
      workflowState: string;
      hierarchyScope?: string;
      visibilityFlags: Set<string>;
    },
  ): ResolvedTemplateField {
    const behavior = this.findBehavior(field, context.role, context.workflowState);
    const requiredFor = this.stringArrayFromRule(field.validationRules, 'requiredFor');
    return {
      id: field.fieldKey,
      key: field.fieldKey,
      label: field.fieldLabel,
      type: this.mapFieldTypeForClient(field.fieldType),
      required: behavior?.mandatory ?? field.isRequired ?? requiredFor.includes(context.role),
      visible: true,
      editable: this.isFieldEditable(field, context.role, context.workflowState, behavior),
      placeholder: field.placeholder,
      helpText: field.helpText,
      hideLabel: field.hideLabel,
      colSpan: field.colSpan,
      options: field.options ?? [],
      matrixConfig: field.matrixConfig,
      gridConfig: field.gridConfig,
      scoringIncluded: field.scoringConfig?.participatesInScoring === true || field.fieldCategory === FieldCategory.SCORING,
      fieldCategory: field.fieldCategory,
      semanticRole: field.semanticRole,
      scoringConfig: field.scoringConfig,
      validationRules: field.validationRules,
      conditionalRendering: field.conditionalRendering,
    };
  }

  private resolveVisibleFieldKeys(
    fields: ITemplateField[],
    context: {
      role: string;
      workflowState: string;
      hierarchyScope?: string;
      visibilityFlags: Set<string>;
      values: Record<string, unknown>;
    },
  ): Set<string> {
    const fieldByKey = new Map(fields.map((field) => [field.fieldKey, field]));
    const visibilityMemo = new Map<string, boolean>();

    const isVisible = (field: ITemplateField, trail: Set<string> = new Set()): boolean => {
      const cached = visibilityMemo.get(field.fieldKey);
      if (cached !== undefined) return cached;

      if (trail.has(field.fieldKey)) {
        visibilityMemo.set(field.fieldKey, false);
        return false;
      }

      trail.add(field.fieldKey);
      let visible = this.isFieldVisible(field, context);

      if (visible && field.conditionalRendering?.dependsOn) {
        const parent = fieldByKey.get(field.conditionalRendering.dependsOn);
        if (!parent || !isVisible(parent, trail)) {
          visible = false;
        }
      }

      trail.delete(field.fieldKey);
      visibilityMemo.set(field.fieldKey, visible);
      return visible;
    };

    return new Set(fields.filter((field) => isVisible(field)).map((field) => field.fieldKey));
  }

  private isVisibleByRules(
    rules: Record<string, unknown> | undefined,
    context: {
      role: string;
      workflowState: string;
      hierarchyScope?: string;
      visibilityFlags: Set<string>;
    },
  ): boolean {
    const hiddenFrom = this.stringArrayFromRule(rules, 'hiddenFrom').map((role) =>
      this.normalizeRoleCode(role),
    );
    if (hiddenFrom.includes(context.role)) return false;

    const visibleTo = this.stringArrayFromRule(rules, 'visibleTo').map((role) =>
      this.normalizeRoleCode(role),
    );
    if (visibleTo.length > 0 && !visibleTo.includes(context.role)) return false;

    const visibleStates = this.stringArrayFromRule(rules, 'visibleStates');
    if (visibleStates.length > 0) {
      let isMatched = visibleStates.includes(context.workflowState);
      if (!isMatched && visibleStates.includes('OBJECTIVE_SETTING_OPEN')) {
        const allowedStates = [
          'NOT_STARTED',
          'OBJECTIVE_SETTING_OPEN',
          'OBJECTIVE_DRAFT',
          'OBJECTIVE_REVISION_REQUIRED',
          'OBJECTIVE_SUBMITTED',
          'OBJECTIVE_APPROVED',
          'EMPLOYEE_ACHIEVEMENT_OPEN',
          'MANAGER_REVIEW_OPEN',
          'MANAGER_REVIEW_SUBMITTED',
          'TERM_FINALIZED',
        ];
        if (allowedStates.includes(context.workflowState)) {
          isMatched = true;
        }
      }
      if (!isMatched) return false;
    }

    const hierarchyScopes = this.stringArrayFromRule(rules, 'hierarchyScopes');
    if (
      hierarchyScopes.length > 0 &&
      context.hierarchyScope !== 'self' &&
      (!context.hierarchyScope || !hierarchyScopes.includes(context.hierarchyScope))
    ) {
      return false;
    }

    const publishFlags = this.stringArrayFromRule(rules, 'publishFlags');
    if (publishFlags.length > 0) {
      return publishFlags.every((flag) => context.visibilityFlags.has(flag));
    }

    if (rules?.publishFlagRequired === true && context.visibilityFlags.size === 0) {
      return false;
    }

    return true;
  }

  private isFieldEditable(
    field: ITemplateField,
    role: string,
    workflowState: string,
    behavior?: NonNullable<ITemplateField['behaviors']>[number],
  ): boolean {
    if (behavior) return behavior.editability === 'EDITABLE';

    const editableBy = this.stringArrayFromRule(field.editabilityRules, 'editableBy').map((item) =>
      this.normalizeRoleCode(item),
    );
    if (editableBy.length > 0 && !editableBy.includes(role)) return false;

    const editableStates = this.stringArrayFromRule(field.editabilityRules, 'editableStates');
    if (editableStates.length > 0) {
      let isMatched = editableStates.includes(workflowState);
      if (!isMatched && editableStates.includes('OBJECTIVE_SETTING_OPEN')) {
        const allowedEditStates = [
          'NOT_STARTED',
          'OBJECTIVE_SETTING_OPEN',
          'OBJECTIVE_DRAFT',
          'OBJECTIVE_REVISION_REQUIRED',
        ];
        if (allowedEditStates.includes(workflowState)) {
          isMatched = true;
        }
      }
      if (!isMatched) return false;
    }

    return editableBy.includes(role);
  }

  private findBehavior(
    field: ITemplateField,
    role: string,
    workflowState: string,
  ): NonNullable<ITemplateField['behaviors']>[number] | undefined {
    return (field.behaviors ?? []).find(
      (behavior) =>
        this.normalizeRoleCode(behavior.role) === role &&
        behavior.workflowState === workflowState,
    );
  }

  private evaluateCondition(
    actualValue: unknown,
    operator: string,
    expectedValue: unknown,
  ): boolean {
    switch (operator) {
      case 'EQUALS':
        return actualValue === expectedValue;
      case 'NOT_EQUALS':
        return actualValue !== expectedValue;
      case 'IN':
        return Array.isArray(expectedValue) && expectedValue.includes(actualValue as never);
      case 'NOT_IN':
        return Array.isArray(expectedValue) && !expectedValue.includes(actualValue as never);
      case 'GREATER_THAN':
        return Number(actualValue) > Number(expectedValue);
      case 'LESS_THAN':
        return Number(actualValue) < Number(expectedValue);
      case 'IS_EMPTY':
        return actualValue === undefined || actualValue === null || actualValue === '';
      case 'IS_NOT_EMPTY':
        return actualValue !== undefined && actualValue !== null && actualValue !== '';
      default:
        return false;
    }
  }

  private stringArrayFromRule(
    rules: Record<string, unknown> | undefined,
    key: string,
  ): string[] {
    const value = rules?.[key];
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private isApprovedWorkflowState(workflowState: string): boolean {
    return (
      (Object.values(TermWorkflowState) as string[]).includes(workflowState) ||
      (Object.values(AnnualWorkflowState) as string[]).includes(workflowState)
    );
  }

  private normalizeRoleCode(role: string): string {
    return normalizePmsRole(role) ?? role.replace(/[ /-]/g, '_').toUpperCase();
  }

  private normalizeRenderingScope(
    renderingScope: string | undefined,
    level: string,
  ): 'TERM_ONLY' | 'ANNUAL_ONLY' | 'BOTH' {
    if (renderingScope === 'TERM_ONLY' || renderingScope === 'ANNUAL_ONLY' || renderingScope === 'BOTH') {
      return renderingScope;
    }
    return this.isTermLevel(level) ? 'TERM_ONLY' : 'ANNUAL_ONLY';
  }

  private normalizeSectionLevel(level?: unknown): PmsTemplateSectionLevel {
    const normalized = String(level ?? '').trim().toUpperCase();
    if (normalized === PmsTemplateSectionLevel.TERM) {
      return PmsTemplateSectionLevel.TERM;
    }
    return PmsTemplateSectionLevel.ANNUAL;
  }

  private isTermLevel(level?: unknown): boolean {
    const normalized = String(level ?? '').trim().toUpperCase();
    return normalized === PmsTemplateSectionLevel.TERM;
  }

  private mapSectionModule(sectionType: string): string {
    if (
      sectionType === PmsTemplateSectionType.QUARTER_REVIEW ||
      sectionType === PmsTemplateSectionType.COMPETENCIES
    ) {
      return 'Manager Quarterly Review Management';
    }
    if (
      [
        PmsTemplateSectionType.ANNUAL_SUMMARY,
        PmsTemplateSectionType.FINAL_GRADE,
        PmsTemplateSectionType.MERIT,
        PmsTemplateSectionType.APPRAISAL_COMMUNICATION,
        PmsTemplateSectionType.OVERALL_FEEDBACK,
      ].includes(sectionType as never)
    ) {
      return 'Annual Appraisal Decision Management';
    }
    if (sectionType === PmsTemplateSectionType.VISIBILITY_GOVERNANCE) {
      return 'Visibility Governance';
    }
    return 'Objective Management';
  }

  private mapFieldTypeForClient(fieldType: string): string {
    const map: Record<string, string> = {
      SHORT_TEXT: 'text',
      LONG_TEXT: 'textarea',
      NUMERIC_INPUT: 'number',
      DROPDOWN: 'select',
      RADIO: 'radio',
      CHECKBOX: 'checkbox',
      CHECKBOX_GROUP: 'checkbox_group',
      MULTISELECT: 'multiselect',
      DATE: 'date',
      DATE_RANGE: 'date_range',
      RATING_SCALE: 'rating_scale',
      WEIGHTED_SCORE: 'number',
      CURRENCY: 'currency',
      PERCENTAGE: 'percentage',
      ATTACHMENT: 'attachment',
      RICH_TEXT: 'rich_text',
      FORMULA: 'formula',
      COMMENT_BOX: 'textarea',
      BOOLEAN: 'checkbox',
      MATRIX: 'matrix',
      DATA_GRID: 'data_grid',
      STATIC_TEXT: 'static_text',
      SECTION_DIVIDER: 'section_divider',
      SIGNATURE: 'signature',
    };
    return map[fieldType] ?? 'text';
  }

  private validateSections(sections: TemplateSection[]): void {
    const allowedQuarters = new Set(Object.values(AssessmentTermCode));
    const sectionKeys = new Set<string>();
    const allFieldKeys = new Set<string>();
    const conditionalDependencies = new Map<string, string[]>();

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

      if (this.isTermLevel(section.level)) {
        const terms = section.repeatFor ?? [];
        if (terms.length === 0) {
          throw new Error(`Assessment-term-level section ${section.sectionKey} must define repeatFor terms`);
        }

        for (const term of terms) {
          if (!allowedQuarters.has(term)) {
            throw new Error(`Invalid assessment term ${term} in section ${section.sectionKey}`);
          }
        }
      }

      if (section.layout && !['vertical', 'grid', 'table', 'bordered_grid'].includes(section.layout)) {
        throw new Error(`Invalid section layout in section ${section.sectionKey}`);
      }

      if (
        section.renderingScope &&
        !['TERM_ONLY', 'ANNUAL_ONLY', 'BOTH'].includes(section.renderingScope)
      ) {
        throw new Error(`Invalid renderingScope in section ${section.sectionKey}`);
      }

      if (section.sectionType === PmsTemplateSectionType.OBJECTIVES) {
        this.validateObjectiveConfig(section);
      }

      if (section.sectionScoringConfig?.participatesInScoring === true) {
        const maxSectionScore = Number(section.sectionScoringConfig.maxSectionScore ?? 100);
        if (!Number.isFinite(maxSectionScore) || maxSectionScore <= 0 || maxSectionScore > 100) {
          throw new Error(`Scoring section ${section.sectionKey} maxSectionScore must be between 1 and 100`);
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
        allFieldKeys.add(field.fieldKey);

        if (!Object.values(PmsTemplateFieldType).includes(field.fieldType)) {
          throw new Error(
            `Invalid field type ${field.fieldType} in section ${section.sectionKey}`,
          );
        }

        if (
          ([
            PmsTemplateFieldType.DROPDOWN,
            PmsTemplateFieldType.RADIO,
            PmsTemplateFieldType.CHECKBOX_GROUP,
            PmsTemplateFieldType.MULTISELECT,
          ] as string[]).includes(field.fieldType as string)
        ) {
          if (!Array.isArray(field.options) || field.options.length === 0) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires options`,
            );
          }
        }

        if (field.colSpan !== undefined && ![1, 2, 3, 4].includes(field.colSpan)) {
          throw new Error(`Invalid colSpan for field ${field.fieldKey} in section ${section.sectionKey}`);
        }

        for (const behavior of field.behaviors ?? []) {
          if (!this.isApprovedWorkflowState(behavior.workflowState)) {
            throw new Error(
              `Invalid behavior workflowState ${behavior.workflowState} for field ${field.fieldKey}`,
            );
          }
          if (!behavior.role?.trim()) {
            throw new Error(`Behavior role is required for field ${field.fieldKey}`);
          }
          if (!normalizePmsRole(behavior.role)) {
            throw new Error(`Invalid behavior role ${behavior.role} for field ${field.fieldKey}`);
          }
        }

        if (field.fieldType === PmsTemplateFieldType.STATIC_TEXT && !field.helpText?.trim()) {
          throw new Error(
            `Field ${field.fieldKey} in section ${section.sectionKey} requires helpText for STATIC_TEXT`,
          );
        }

        if (field.fieldType === PmsTemplateFieldType.SIGNATURE) {
          const signatureFields =
            (field.optionConfig?.signatureFields as string[] | undefined) ?? [];
          if (!Array.isArray(signatureFields) || signatureFields.length === 0) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires optionConfig.signatureFields`,
            );
          }
        }

        if (field.fieldType === PmsTemplateFieldType.FORMULA) {
          const formula = field.scoringConfig?.formula;
          if (typeof formula !== 'string' || !formula.trim()) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires scoringConfig.formula`,
            );
          }
        }

        if (field.scoringConfig?.participatesInScoring === true) {
          const fieldWeight = Number(field.scoringConfig?.weight ?? (field.scoringConfig as Record<string, unknown> | undefined)?.weightage ?? 0);
          if (!Number.isFinite(fieldWeight) || fieldWeight < 0 || fieldWeight > 100) {
            throw new Error(`Scoring field ${field.fieldKey} in section ${section.sectionKey} must have weightage between 0 and 100`);
          }

          const maxScore = Number(field.scoringConfig?.maxScore ?? 0);
          if (!Number.isFinite(maxScore) || maxScore <= 0) {
            throw new Error(`Scoring field ${field.fieldKey} in section ${section.sectionKey} requires a maxScore greater than 0`);
          }

          if (field.scoringConfig?.scoreType === 'OPTION_BASED') {
            this.validateOptionScoreConfig(field, section.sectionKey, maxScore);
          }
        }

        if (field.fieldType === PmsTemplateFieldType.RATING_SCALE) {
          const min = Number(field.optionConfig?.min);
          const max = Number(field.optionConfig?.max);
          if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires valid optionConfig min/max`,
            );
          }
        }

        if (field.fieldType === PmsTemplateFieldType.MATRIX) {
          const matrixConfig = field.matrixConfig;
          if (!matrixConfig) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires matrixConfig`,
            );
          }

          if (!Array.isArray(matrixConfig.rows) || matrixConfig.rows.length === 0) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires matrixConfig.rows`,
            );
          }

          if (!Array.isArray(matrixConfig.columns) || matrixConfig.columns.length === 0) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires matrixConfig.columns`,
            );
          }

          this.assertUniqueKeys(
            matrixConfig.rows.map((row) => row.key),
            `Duplicate matrix row key in ${field.fieldKey}`,
          );
          this.assertUniqueKeys(
            matrixConfig.columns.map((column) => column.key),
            `Duplicate matrix column key in ${field.fieldKey}`,
          );

          for (const row of matrixConfig.rows) {
            if (!row.label?.trim()) {
              throw new Error(`Matrix row label is required in ${field.fieldKey}`);
            }
            if (row.options && row.options.length > 0) {
              const optionValues = row.options.map((option) => option.value);
              this.assertUniqueKeys(
                optionValues,
                `Duplicate matrix row option value in ${field.fieldKey}:${row.key}`,
              );
            }
          }
        }

        if (field.fieldType === PmsTemplateFieldType.DATA_GRID) {
          const gridConfig = field.gridConfig;
          if (!gridConfig) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires gridConfig`,
            );
          }

          if (!Array.isArray(gridConfig.columns) || gridConfig.columns.length === 0) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} requires gridConfig.columns`,
            );
          }

          this.assertUniqueKeys(
            gridConfig.columns.map((column) => column.key),
            `Duplicate grid column key in ${field.fieldKey}`,
          );

          if (
            gridConfig.minRows !== undefined &&
            gridConfig.maxRows !== undefined &&
            gridConfig.minRows > gridConfig.maxRows
          ) {
            throw new Error(
              `Field ${field.fieldKey} in section ${section.sectionKey} has invalid gridConfig row limits`,
            );
          }
        }

        if (field.conditionalRendering?.dependsOn) {
          conditionalDependencies.set(field.fieldKey, [field.conditionalRendering.dependsOn]);
        }
      }
    }

    for (const section of sections) {
      for (const field of section.fields ?? []) {
        if (field.conditionalRendering && !allFieldKeys.has(field.conditionalRendering.dependsOn)) {
          throw new Error(
            `Field ${field.fieldKey} depends on missing field ${field.conditionalRendering.dependsOn}`,
          );
        }
      }
    }

    this.assertNoConditionalCycles(conditionalDependencies);
  }

  private async validateTemplateVersionForActivation(version: IPmsTemplateVersion): Promise<void> {
    const errors: string[] = [];

    // Check 1: Section existence
    if (!version.sections || version.sections.length === 0) {
      errors.push('Template version must contain at least one section before activation');
    }

    const allFieldKeys = new Set<string>();
    const scoringSections = (version.sections ?? []).filter(
      (section) => section.sectionScoringConfig?.participatesInScoring === true,
    );

    // Check 2: Field existence (every section has at least one field)
    for (const section of version.sections ?? []) {
      if ((section.fields ?? []).length === 0) {
        errors.push(`Section "${section.sectionLabel || section.sectionKey}" must contain at least one field before activation`);
      }
      for (const field of section.fields ?? []) {
        allFieldKeys.add(field.fieldKey);
      }
    }

    // Check 3: Section weights sum to 100%
    if (scoringSections.length > 0) {
      const totalSectionWeight = scoringSections.reduce(
        (total, section) => total + Number(section.sectionScoringConfig?.weightage ?? 0),
        0,
      );
      if (totalSectionWeight !== 100) {
        errors.push(`Scoring section weightage total must be exactly 100% before activation (currently ${totalSectionWeight}%)`);
      }
    }

    // Check 4: Field weights sum to 100% inside scoring sections
    for (const section of scoringSections) {
      const isObjectiveScoringSection = section.sectionType === PmsTemplateSectionType.OBJECTIVES;
      const scoringFields = (section.fields ?? []).filter(
        (field) => field.scoringConfig?.participatesInScoring === true || field.fieldCategory === 'SCORING',
      );
      if (scoringFields.length === 0 && !isObjectiveScoringSection) {
        errors.push(`Scoring section "${section.sectionLabel || section.sectionKey}" must contain at least one scoring field`);
      } else if (scoringFields.length > 0) {
        const fieldWeightTotal = scoringFields.reduce(
          (total, field) => total + Number(field.scoringConfig?.weight ?? field.scoringConfig?.weightage ?? 0),
          0,
        );
        if (fieldWeightTotal !== 100) {
          errors.push(`Scoring field weightage total in section "${section.sectionLabel || section.sectionKey}" must be exactly 100% (currently ${fieldWeightTotal}%)`);
        }
      }
    }

    // Check 5: Scoring config validity
    // Check 6: Option score validation
    // Check 7: Formula parsing validation
    // Check 8: Behavior rules validation
    // Check 9: Workflow role validation
    // Check 12: Quarter scope validity
    // Check 13: Objective bucket validations
    // Check 14: Employee Skill Rating Table validations
    const allowedQuarters = new Set(Object.values(AssessmentTermCode));

    for (const section of version.sections ?? []) {
      // Check 12: Quarter scope validity for sections
      if (this.isTermLevel(section.level)) {
        const repeatFor = section.repeatFor ?? [];
        if (repeatFor.length === 0) {
          errors.push(`Assessment-term-level section "${section.sectionLabel || section.sectionKey}" must define repeatFor terms`);
        }
        for (const q of repeatFor) {
          if (!allowedQuarters.has(q)) {
            errors.push(`Invalid assessment term "${q}" in repeatFor of section "${section.sectionLabel || section.sectionKey}"`);
          }
        }
      }
      if (section.termScope && section.termScope.length > 0) {
        for (const q of section.termScope) {
          if (!allowedQuarters.has(q)) {
            errors.push(`Invalid assessment term "${q}" in termScope of section "${section.sectionLabel || section.sectionKey}"`);
          }
        }
      }

      // Check 13: Objective bucket validations
      if (section.sectionType === PmsTemplateSectionType.OBJECTIVES) {
        const mode = section.objectiveConfig?.mode ?? 'DYNAMIC';
        if (mode === 'DYNAMIC' || mode === 'HYBRID') {
          const buckets = section.objectiveBuckets ?? [];
          if (buckets.length === 0) {
            errors.push(`Objectives section "${section.sectionLabel || section.sectionKey}" requires objectiveBuckets configuration when dynamic/hybrid mode is enabled`);
          } else {
            const bucketWeightSum = buckets.reduce((sum, b) => sum + Number(b.bucketWeightage ?? 0), 0);
            if (bucketWeightSum !== 100) {
              errors.push(`Objective buckets weightage total in section "${section.sectionLabel || section.sectionKey}" must sum to exactly 100% (currently ${bucketWeightSum}%)`);
            }
            for (const bucket of buckets) {
              if (!bucket.bucketKey?.trim()) {
                errors.push(`Objective bucket in section "${section.sectionLabel || section.sectionKey}" is missing bucketKey`);
              }
              if (!bucket.label?.trim()) {
                errors.push(`Objective bucket "${bucket.bucketKey}" in section "${section.sectionLabel || section.sectionKey}" is missing label`);
              }
              if (!['TEMPLATE_PREDEFINED', 'EMPLOYEE_DYNAMIC', 'MANAGER_DYNAMIC'].includes(bucket.source)) {
                errors.push(`Objective bucket "${bucket.bucketKey}" in section "${section.sectionLabel || section.sectionKey}" has invalid source: ${bucket.source}`);
              }
              if (!['SYSTEM', 'EMPLOYEE', 'MANAGER'].includes(bucket.owner)) {
                errors.push(`Objective bucket "${bucket.bucketKey}" in section "${section.sectionLabel || section.sectionKey}" has invalid owner: ${bucket.owner}`);
              }
              if (!['FIXED_BY_TEMPLATE', 'OWNER_ENTERED', 'EQUAL_DISTRIBUTION'].includes(bucket.rowWeightMode)) {
                errors.push(`Objective bucket "${bucket.bucketKey}" in section "${section.sectionLabel || section.sectionKey}" has invalid rowWeightMode: ${bucket.rowWeightMode}`);
              }
            }
          }
        }
      }

      for (const field of section.fields ?? []) {
        const isScoring = field.fieldCategory === 'SCORING' || field.scoringConfig?.participatesInScoring === true;

        const nonScorableTypes = new Set<string>([
          PmsTemplateFieldType.SHORT_TEXT,
          PmsTemplateFieldType.LONG_TEXT,
          PmsTemplateFieldType.DATE,
          PmsTemplateFieldType.ATTACHMENT,
          PmsTemplateFieldType.STATIC_TEXT,
          PmsTemplateFieldType.SECTION_DIVIDER,
          PmsTemplateFieldType.COMMENT_BOX,
          PmsTemplateFieldType.SIGNATURE,
        ]);

        if (isScoring && nonScorableTypes.has(field.fieldType)) {
          errors.push(
            `Field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" has a non-scorable type (${field.fieldType}) but participates in scoring`,
          );
        }

        // Check 5: Scoring config validity
        if (isScoring) {
          const scoreType = field.scoringConfig?.scoreType;
          const maxScore = Number(field.scoringConfig?.maxScore ?? 0);
          if (!scoreType) {
            errors.push(`Scoring field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" is missing scoreType`);
          }
          if (!Number.isFinite(maxScore) || maxScore <= 0) {
            errors.push(`Scoring field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" requires maxScore > 0 (currently ${maxScore})`);
          }
        }

        // Check: Confidential decision fields must have visibility rules
        if (field.fieldCategory === 'CONFIDENTIAL') {
          const rules = field.visibilityRules;
          const hasRules = rules && (
            (Array.isArray(rules.visibleTo) && rules.visibleTo.length > 0) ||
            (Array.isArray(rules.hiddenFrom) && rules.hiddenFrom.length > 0) ||
            (Array.isArray(rules.visibleStates) && rules.visibleStates.length > 0) ||
            (Array.isArray(rules.publishFlags) && rules.publishFlags.length > 0) ||
            (rules.publishFlagRequired !== undefined) ||
            (Object.keys(rules).length > 0)
          );
          if (!hasRules) {
            errors.push(`Confidential field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" must have visibility rules configured`);
          }
        }

        // Check 6: Option score validation
        const isOptionBased = ['DROPDOWN', 'RADIO', 'CHECKBOX_GROUP', 'MULTISELECT'].includes(field.fieldType);
        const isOptionScoreType = field.scoringConfig?.scoreType === 'OPTION_BASED';
        if (isScoring && (isOptionBased || isOptionScoreType)) {
          const maxScore = Number(field.scoringConfig?.maxScore ?? 0);
          const matrixOptions = field.fieldType === 'MATRIX'
            ? (field.matrixConfig?.rows ?? []).flatMap((row) => row.options ?? [])
            : [];
          const options = matrixOptions.length > 0 ? matrixOptions : field.options ?? [];
          if (options.length === 0) {
            errors.push(`Option-based scoring field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" requires options`);
          } else {
            for (const opt of options) {
              const score = opt.score ?? opt.weight;
              if (score === undefined || score === null || !Number.isFinite(Number(score))) {
                errors.push(`Option "${opt.label || opt.value}" in field "${field.fieldLabel || field.fieldKey}" (section "${section.sectionLabel || section.sectionKey}") is missing a numeric score`);
              } else if (Number(score) < 0 || Number(score) > maxScore) {
                errors.push(`Option "${opt.label || opt.value}" score (${score}) in field "${field.fieldLabel || field.fieldKey}" (section "${section.sectionLabel || section.sectionKey}") must be between 0 and ${maxScore}`);
              }
            }
          }
        }

        // Check 7: Formula parsing validation
        if (field.fieldType === 'FORMULA') {
          const formula = field.scoringConfig?.formula;
          if (typeof formula !== 'string' || !formula.trim()) {
            errors.push(`Formula field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" requires a non-empty formula expression`);
          }
        }

        // Check 8: Behavior rules validation
        if (!field.behaviors || field.behaviors.length === 0) {
          errors.push(`Field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" must have at least one workflow behavior rule defined`);
        }

        // Check 9: Workflow role validation
        for (const behavior of field.behaviors ?? []) {
          if (!behavior.role?.trim() || !normalizePmsRole(behavior.role)) {
            errors.push(`Field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" has invalid behavior role: "${behavior.role}"`);
          }
          if (!this.isApprovedWorkflowState(behavior.workflowState)) {
            errors.push(`Field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" has invalid workflowState: "${behavior.workflowState}"`);
          }
        }

        // Check 14: Employee Skill Rating Table validations
        if (field.fieldType === 'MATRIX') {
          const matrixConfig = field.matrixConfig;
          if (!matrixConfig) {
            errors.push(`Matrix field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" requires matrixConfig`);
          } else {
            const rowsWithWeight = (matrixConfig.rows ?? []).filter(r => r.weightage !== undefined && r.weightage !== null);
            if (rowsWithWeight.length > 0) {
              const totalRowWeight = rowsWithWeight.reduce((sum, r) => sum + Number(r.weightage ?? 0), 0);
              if (totalRowWeight !== 100) {
                errors.push(`Matrix field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" row weightage total must sum to 100% (currently ${totalRowWeight}%)`);
              }
            }
            const colsWithWeight = (matrixConfig.columns ?? []).filter(c => c.weightage !== undefined && c.weightage !== null);
            if (colsWithWeight.length > 0) {
              const totalColWeight = colsWithWeight.reduce((sum, c) => sum + Number(c.weightage ?? 0), 0);
              if (totalColWeight !== 100) {
                errors.push(`Matrix field "${field.fieldLabel || field.fieldKey}" in section "${section.sectionLabel || section.sectionKey}" column weightage total must sum to 100% (currently ${totalColWeight}%)`);
              }
            }
          }
        }
      }
    }

    // Check 10: Conditional dependsOn validation
    // Check 11: Circular dependency detection
    const conditionalDependencies = new Map<string, string>();
    for (const section of version.sections ?? []) {
      for (const field of section.fields ?? []) {
        if (field.conditionalRendering?.dependsOn) {
          const dependsOnKey = field.conditionalRendering.dependsOn;
          if (!allFieldKeys.has(dependsOnKey)) {
            errors.push(`Field "${field.fieldLabel || field.fieldKey}" conditional dependency dependsOn field "${dependsOnKey}" which does not exist in the template`);
          } else {
            conditionalDependencies.set(field.fieldKey, dependsOnKey);
          }
        }
      }
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();
    const hasCycle = (key: string): boolean => {
      if (recStack.has(key)) return true;
      if (visited.has(key)) return false;
      visited.add(key);
      recStack.add(key);
      const parent = conditionalDependencies.get(key);
      if (parent) {
        if (hasCycle(parent)) return true;
      }
      recStack.delete(key);
      return false;
    };

    for (const key of conditionalDependencies.keys()) {
      if (!visited.has(key)) {
        if (hasCycle(key)) {
          errors.push(`Circular conditional rendering dependency detected involving field "${key}"`);
          break;
        }
      }
    }

    // Check 15: Workflow rendering validation: MANAGER must have at least one visible section in MANAGER_REVIEW_OPEN
    let managerHasVisibleSection = false;
    for (const section of version.sections ?? []) {
      const isVisible = this.isVisibleByRules(section.visibilityRules, {
        role: 'MANAGER',
        workflowState: 'MANAGER_REVIEW_OPEN',
        visibilityFlags: new Set(),
        hierarchyScope: 'self',
      });
      if (isVisible) {
        managerHasVisibleSection = true;
        break;
      }
    }
    if (!managerHasVisibleSection) {
      errors.push('MANAGER role must have at least one visible section in MANAGER_REVIEW_OPEN state');
    }

    // Other validation checks already present in code:
    // Annual scoring weights check
    const annualScoringConfig = version.annualScoringConfig as
      | {
        termWeights?: Record<string, number>;
        excludedQuarters?: string[];
      }
      | undefined;
    const termWeights = annualScoringConfig?.termWeights;
    if (termWeights && Object.keys(termWeights).length > 0) {
      for (const quarter of Object.keys(termWeights)) {
        if (!allowedQuarters.has(quarter as AssessmentTermCodeType)) {
          errors.push(`Annual scoring quarter ${quarter} is not a supported assessment term`);
          continue;
        }
        const weight = Number(termWeights[quarter] ?? 0);
        if (!Number.isFinite(weight) || weight < 0 || weight > 100) {
          errors.push(`Annual scoring quarter ${quarter} weightage must be between 0 and 100`);
        }
      }

      const excluded = new Set(annualScoringConfig?.excludedQuarters ?? []);
      const totalQuarterWeight = Object.keys(termWeights)
        .filter((quarter) => !excluded.has(quarter))
        .reduce((total, quarter) => total + Number(termWeights[quarter] ?? 0), 0);

      if (totalQuarterWeight !== 100) {
        errors.push(`Annual scoring quarter weightage total must be exactly 100% before activation (currently ${totalQuarterWeight}%)`);
      }
    }

    // Check errors count
    if (errors.length > 0) {
      throw new Error(`Activation failed with validation errors:\n${errors.map((e, idx) => `${idx + 1}. ${e}`).join('\n')}`);
    }
  }

  private validateObjectiveConfig(section: TemplateSection): void {
    const config = section.objectiveConfig;
    if (!config) return;

    if (!['PREDEFINED', 'DYNAMIC', 'HYBRID'].includes(config.mode)) {
      throw new Error(`Invalid objective mode in section ${section.sectionKey}`);
    }

    const predefinedObjectives = config.predefinedObjectives ?? [];
    if (
      ['PREDEFINED', 'HYBRID'].includes(config.mode) &&
      predefinedObjectives.length === 0
    ) {
      throw new Error(`Objective section ${section.sectionKey} requires predefined objectives`);
    }

    if (
      ['DYNAMIC', 'HYBRID'].includes(config.mode) &&
      config.allowEmployeeCreated === false &&
      config.allowManagerCreated === false
    ) {
      throw new Error(`Objective section ${section.sectionKey} requires at least one dynamic creator role`);
    }

    const objectiveKeys = new Set<string>();
    for (const objective of predefinedObjectives) {
      if (!objective.objectiveKey?.trim()) {
        throw new Error(`Predefined objective key is required in section ${section.sectionKey}`);
      }
      if (!objective.title?.trim()) {
        throw new Error(`Predefined objective title is required in section ${section.sectionKey}`);
      }
      if (objectiveKeys.has(objective.objectiveKey)) {
        throw new Error(`Duplicate predefined objective key ${objective.objectiveKey} in section ${section.sectionKey}`);
      }
      objectiveKeys.add(objective.objectiveKey);
      if (
        objective.weightage !== undefined &&
        (!Number.isFinite(objective.weightage) || objective.weightage < 0 || objective.weightage > 100)
      ) {
        throw new Error(`Predefined objective ${objective.objectiveKey} weightage must be between 0 and 100`);
      }
    }
  }

  private validateOptionScoreConfig(
    field: TemplateField,
    sectionKey: string,
    maxScore: number,
  ): void {
    const optionScores = Array.isArray(field.scoringConfig?.optionScores)
      ? field.scoringConfig?.optionScores
      : [];
    const matrixRows = Array.isArray(field.matrixConfig?.rows) ? field.matrixConfig.rows : [];
    const matrixOptions = matrixRows.flatMap((row) =>
      (row.options ?? []).map((option) => ({
        label: option.label,
        value: `${row.key}:${option.value}`,
        score: option.score ?? option.weight,
      })),
    );
    const scoreItems = optionScores.length > 0 ? optionScores : matrixOptions;

    if (scoreItems.length === 0) {
      throw new Error(`Option-based scoring field ${field.fieldKey} in section ${sectionKey} requires optionScores`);
    }

    for (const item of scoreItems) {
      const score = Number(item.score);
      if (!Number.isFinite(score) || score < 0 || score > maxScore) {
        throw new Error(`Option score for field ${field.fieldKey} in section ${sectionKey} must be between 0 and ${maxScore}`);
      }
    }

    const options = Array.isArray(field.options) ? field.options : [];
    const scoreByMatcher = (matcher: (label: string) => boolean) => {
      const option = options.find((item) => matcher(String(item.label ?? '').toLowerCase()));
      if (!option) return null;
      const score = optionScores.find((item) => item.optionValue === option.value)?.score;
      return typeof score === 'number' ? score : Number(score ?? option.weight ?? 0);
    };

    const goodScore = scoreByMatcher((label) => label.includes('good'));
    const averageScore = scoreByMatcher((label) => label.includes('average'));
    const needsImprovementScore = scoreByMatcher(
      (label) =>
        label.includes('need to be better') ||
        label.includes('needs improvement') ||
        label.includes('below average') ||
        label.includes('poor'),
    );

    if (
      goodScore !== null &&
      averageScore !== null &&
      needsImprovementScore !== null &&
      !(goodScore >= averageScore && averageScore >= needsImprovementScore)
    ) {
      throw new Error(
        `Option scores for field ${field.fieldKey} in section ${sectionKey} must follow Good >= Average >= Need to be Better`,
      );
    }
  }

  private assertNoConditionalCycles(dependencies: Map<string, string[]>): void {
    for (const fieldKey of dependencies.keys()) {
      const visiting = new Set<string>();
      let current: string | undefined = fieldKey;

      while (current && dependencies.has(current)) {
        if (visiting.has(current)) {
          throw new Error(`Conditional rendering has a circular dependency at field ${current}`);
        }
        visiting.add(current);
        current = dependencies.get(current)?.[0];
      }
    }
  }

  private assertUniqueKeys(keys: string[], errorMessage: string): void {
    const seen = new Set<string>();
    for (const key of keys) {
      if (!key?.trim()) {
        throw new Error(`${errorMessage}: empty key`);
      }
      if (seen.has(key)) {
        throw new Error(errorMessage);
      }
      seen.add(key);
    }
  }

  private async resolveSimulationContext(input: SimulateTemplateAccessInput): Promise<{
    hierarchyScope?: string;
    quarter?: AssessmentTermCodeType;
    visibilityFlags: string[];
    annualAssignmentId?: string;
    termAssignmentId?: string;
  }> {
    const visibilityFlags = new Set(input.visibilityFlags ?? []);
    let hierarchyScope = input.hierarchyScope;
    let quarter = input.quarter;
    let annualAssignmentId = input.annualAssignmentId?.trim() || undefined;
    let termAssignmentId = input.termAssignmentId?.trim() || undefined;

    if (termAssignmentId) {
      const termAssignment = await TermAssignment.findOne({
        _id: termAssignmentId,
        isDeleted: false,
      }).lean();
      if (!termAssignment) {
        throw new Error('Quarter assignment not found');
      }

      annualAssignmentId = annualAssignmentId ?? termAssignment.annualAssignmentId.toString();
      quarter = quarter ?? termAssignment.assessmentTermCode;
    }

    if (annualAssignmentId) {
      const annualAssignment = await AnnualAssignment.findOne({
        _id: annualAssignmentId,
        isDeleted: false,
      }).lean();
      if (!annualAssignment) {
        throw new Error('Annual assignment not found');
      }

      const assignmentVisibility = annualAssignment.visibility ?? {};
      if (assignmentVisibility.employeeReviewVisible) visibilityFlags.add('employee_review');
      if (assignmentVisibility.employeeGradeVisible) visibilityFlags.add('employee_grade');
      if (assignmentVisibility.employeeMeritVisible) visibilityFlags.add('employee_merit');
      if (assignmentVisibility.managerGradeVisible) visibilityFlags.add('manager_grade');
      if (assignmentVisibility.managerMeritVisible) visibilityFlags.add('manager_merit');

      if (!hierarchyScope) {
        hierarchyScope = 'direct-report';
      }
    }

    return {
      hierarchyScope,
      quarter,
      visibilityFlags: [...visibilityFlags],
      annualAssignmentId,
      termAssignmentId,
    };
  }

  private async resolveRuntimeContextForTemplate(
    version: IPmsTemplateVersion,
    input: ResolveTemplateVersionInput,
  ): Promise<{
    hierarchyScope?: string;
    quarter?: AssessmentTermCodeType;
    visibilityFlags: string[];
    annualAssignmentId?: string;
    termAssignmentId?: string;
  }> {
    const visibilityFlags = new Set(input.visibilityFlags ?? []);
    let hierarchyScope = input.hierarchyScope;
    let quarter = input.quarter;
    let annualAssignmentId = input.annualAssignmentId?.trim() || undefined;
    let termAssignmentId = input.termAssignmentId?.trim() || undefined;
    let termAssignment: any = null;

    if (!annualAssignmentId && !termAssignmentId) {
      return {
        hierarchyScope,
        quarter,
        visibilityFlags: [...visibilityFlags],
      };
    }

    if (termAssignmentId) {
      termAssignment = await TermAssignment.findOne({
        _id: termAssignmentId,
        isDeleted: false,
      }).lean();
      if (!termAssignment) {
        throw new Error('Quarter assignment not found');
      }
      annualAssignmentId = annualAssignmentId ?? termAssignment.annualAssignmentId.toString();
      quarter = quarter ?? termAssignment.assessmentTermCode;
    }

    const annualAssignment = annualAssignmentId
      ? await AnnualAssignment.findOne({
        _id: annualAssignmentId,
        isDeleted: false,
      }).lean()
      : null;

    if (!annualAssignment) {
      throw new Error('Annual assignment not found');
    }

    if (annualAssignment.templateVersionId?.toString() !== version._id.toString()) {
      throw new Error('Template version does not belong to the requested assignment');
    }

    await this.assertRuntimeTemplateAccess(annualAssignment, termAssignment);

    const assignmentVisibility = annualAssignment.visibility ?? {};
    if (assignmentVisibility.employeeReviewVisible) visibilityFlags.add('employee_review');
    if (assignmentVisibility.employeeGradeVisible) visibilityFlags.add('employee_grade');
    if (assignmentVisibility.employeeMeritVisible) visibilityFlags.add('employee_merit');
    if (assignmentVisibility.managerGradeVisible) visibilityFlags.add('manager_grade');
    if (assignmentVisibility.managerMeritVisible) visibilityFlags.add('manager_merit');

    if (!hierarchyScope) {
      const actorId = this.context.user?._id.toString();
      if (actorId && actorId === annualAssignment.employeeId?.toString()) {
        hierarchyScope = 'self';
      } else if (actorId && actorId === annualAssignment.assignedManagerId?.toString()) {
        hierarchyScope = 'direct-report';
      } else {
        hierarchyScope = 'global';
      }
    }

    return {
      hierarchyScope,
      quarter,
      visibilityFlags: [...visibilityFlags],
      annualAssignmentId,
      termAssignmentId,
    };
  }

  private async assertRuntimeTemplateAccess(
    annualAssignment: Record<string, any>,
    termAssignment?: Record<string, any> | null,
  ): Promise<void> {
    const actor = this.context.user;
    if (!actor) {
      throw new Error('Authentication required');
    }

    const mappedRole = accessService.mapRole(actor.role);
    if (
      mappedRole === PmsRole.ADMIN ||
      mappedRole === PmsRole.MANAGEMENT ||
      mappedRole === PmsRole.DIRECTOR
    ) {
      return;
    }

    const access = await accessService.canPerform({
      actor: {
        actorId: actor._id.toString(),
        actorRole: actor.role,
      },
      action: 'template.resolve',
      resource: {
        employeeId: annualAssignment.employeeId?.toString(),
        assignedManagerId:
          termAssignment?.assignedManagerId?.toString() ??
          annualAssignment.assignedManagerId?.toString(),
        managerId:
          termAssignment?.assignedManagerId?.toString() ??
          annualAssignment.assignedManagerId?.toString(),
      },
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private async assertAdmin(action: string): Promise<void> {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    const access = await accessService.canPerform({
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

  private normalizePositiveInteger(value: string | number | undefined, fallback: number): number {
    const normalized = Number(value ?? fallback);
    return Number.isInteger(normalized) && normalized > 0 ? normalized : fallback;
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

  private normalizeTemplateStatus(status?: string) {
    const normalized = (status || PmsTemplateStatus.DRAFT).trim().toUpperCase();
    switch (normalized) {
      case PmsTemplateStatus.ACTIVE:
      case 'ACTIVE':
        return PmsTemplateStatus.ACTIVE;
      case PmsTemplateStatus.INACTIVE:
      case 'INACTIVE':
        return PmsTemplateStatus.INACTIVE;
      case PmsTemplateStatus.ARCHIVED:
      case 'ARCHIVED':
        return PmsTemplateStatus.ARCHIVED;
      case PmsTemplateStatus.DRAFT:
      case 'DRAFT':
      case 'DRAFT_TEMPLATE':
      default:
        return PmsTemplateStatus.DRAFT;
    }
  }

  private normalizeOptionalDate(value?: string | Date) {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }

    const parsedDate = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error('Effective date is invalid');
    }

    return parsedDate;
  }

  private buildExactCaseInsensitivePattern(value: string) {
    return new RegExp(`^${this.escapeRegex(value)}$`, 'i');
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
