import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualWorkflowState,
  AppraisalOutcomeType,
  PmsTemplateFieldType,
  PmsTemplateSectionLevel,
  PmsTemplateSectionType,
  PmsTemplateStatus,
  QuarterWorkflowState,
} from '../constants/pms.enums';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import {
  PmsLetterTemplate,
  PmsLetterTemplateVersion,
} from '../models/pms-letter-template.model';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import type { IPmsTemplate } from '../models/pms-template.model';
import type {
  IPmsTemplateVersion,
  ITemplateField,
  ITemplateSection,
} from '../models/pms-template-version.model';
import type {
  IPmsLetterTemplate,
  IPmsLetterTemplateVersion,
} from '../models/pms-letter-template.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';

export type TemplateSection = IPmsTemplateVersion['sections'][number];
export type TemplateField = TemplateSection['fields'][number];
export type TemplatePermission = Record<string, unknown>;

export interface ResolveTemplateVersionInput {
  role: string;
  workflowState: string;
  hierarchyScope?: string;
  quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  visibilityFlags?: string[];
  values?: Record<string, unknown>;
}

export interface ResolvedTemplateField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  visible: boolean;
  editable: boolean;
  placeholder?: string;
  helpText?: string;
  colSpan?: number;
  options?: unknown[];
  matrixConfig?: unknown;
  gridConfig?: unknown;
  scoringIncluded?: boolean;
  scoringConfig?: Record<string, unknown>;
  validationRules?: Record<string, unknown>;
}

export interface ResolvedTemplateSection {
  id: string;
  key: string;
  title: string;
  module: string;
  level: 'quarter' | 'annual';
  layout: 'vertical' | 'grid';
  fields: ResolvedTemplateField[];
}

export interface ResolvedTemplateVersion {
  versionId: string;
  role: string;
  workflowState: string;
  sections: ResolvedTemplateSection[];
}

export interface CreateTemplateInput {
  name: string;
  code: string;
  description?: string;
  effectiveDate?: Date;
}

export interface TemplateListQuery {
  status?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
}

export interface LetterTemplateListQuery {
  status?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
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
  annualScoringConfig?: Record<string, unknown>;
  outcomeMappings?: Array<{
    outcomeType: 'BOTH' | 'MERIT_ONLY' | 'GRADE_ONLY' | 'NIL';
    letterTemplateVersionId: string;
  }>;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  placeholders?: string[];
  conditionalBlocks?: string[];
}

export interface CreateLetterTemplateInput {
  name: string;
  code: string;
  type?: string;
  outcomeType?: string;
  channel: string;
  versionNo?: number;
  versionNumber?: number;
  subject?: string;
  subjectTemplate?: string;
  body?: string;
  bodyTemplate?: string;
  placeholders?: string[];
  placeholderRules?: {
    required?: string[];
    conditional?: string[];
  };
  conditionalBlocks?: Array<string | { blockKey: string; condition: string }>;
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
    this.assertAdmin('template.list');
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const filter: Record<string, unknown> = { isDeleted: false };

    if (query.status?.trim()) {
      filter.status = query.status.trim();
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      PmsTemplate.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PmsTemplate.countDocuments(filter),
    ]);

    return { items, total, page, limit };
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

  async deleteTemplate(id: string): Promise<void> {
    this.assertAdmin('template.delete');
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
        annualScoringConfig: version.annualScoringConfig ?? {},
        outcomeMappings: version.outcomeMappings ?? [],
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
    const existingVersion = await PmsTemplateVersion.findOne({
      templateId: new Types.ObjectId(templateId),
      versionNo,
      isDeleted: false,
    }).lean();
    if (existingVersion) {
      throw new Error(`Version ${versionNo} already exists for this template`);
    }

    const sections = this.normalizeSections(input.sections ?? []);
    this.validateSections(sections);

    const version = await PmsTemplateVersion.create({
      templateId: new Types.ObjectId(templateId),
      versionNo,
      sections,
      themeConfig: input.themeConfig ?? {},
      scoringConfig: input.scoringConfig ?? {},
      annualScoringConfig: input.annualScoringConfig ?? {},
      outcomeMappings: input.outcomeMappings ?? [],
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
    this.validateTemplateVersionForActivation(version);

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

  async listTemplateVersions(templateId: string): Promise<IPmsTemplateVersion[]> {
    this.assertAdmin('templateVersion.list');
    await this.ensureTemplateExists(templateId);
    return PmsTemplateVersion.find({
      templateId: new Types.ObjectId(templateId),
      isDeleted: false,
    }).sort({ versionNo: -1, createdAt: -1 });
  }

  async deleteTemplateVersion(versionId: string): Promise<void> {
    this.assertAdmin('templateVersion.delete');
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
      annualScoringConfig?: Record<string, unknown>;
      outcomeMappings?: IPmsTemplateVersion['outcomeMappings'];
    } = {},
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.configureSections');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    const normalizedSections = this.normalizeSections(sections);
    this.validateSections(normalizedSections);

    version.sections = normalizedSections;
    if (metadata.annualScoringConfig !== undefined) {
      version.annualScoringConfig = metadata.annualScoringConfig;
    }
    if (metadata.outcomeMappings !== undefined) {
      version.outcomeMappings = metadata.outcomeMappings;
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

    const visibilityFlags = new Set(input.visibilityFlags ?? []);
    const values = input.values ?? {};

    const sections = version.sections
      .filter((section) => this.isSectionInScope(section, input.quarter))
      .filter((section) =>
        this.isVisibleByRules(section.visibilityRules, {
          role,
          workflowState,
          hierarchyScope: input.hierarchyScope,
          visibilityFlags,
        }),
      )
      .map((section) => {
        const fields = (section.fields ?? [])
          .filter((field) =>
            this.isFieldVisible(field, {
              role,
              workflowState,
              hierarchyScope: input.hierarchyScope,
              visibilityFlags,
              values,
            }),
          )
          .map((field) =>
            this.toResolvedField(field, {
              role,
              workflowState,
              hierarchyScope: input.hierarchyScope,
              visibilityFlags,
            }),
          );

        return {
          id: section.sectionKey,
          key: section.sectionKey,
          title: section.sectionLabel,
          module: this.mapSectionModule(section.sectionType),
          level: section.level === PmsTemplateSectionLevel.QUARTER ? 'quarter' : 'annual',
          layout: section.layout ?? 'vertical',
          fields,
        } as ResolvedTemplateSection;
      })
      .filter((section) => section.fields.length > 0);

    return {
      versionId,
      role: input.role,
      workflowState,
      sections,
    };
  }

  async createLetterTemplate(input: CreateLetterTemplateInput): Promise<{
    letterTemplate: IPmsLetterTemplate;
    letterTemplateVersion: IPmsLetterTemplateVersion;
  }> {
    this.assertAdmin('letterTemplate.create');
    const subjectTemplate = input.subjectTemplate ?? input.subject ?? '';
    const bodyTemplate = input.bodyTemplate ?? input.body;
    const versionNo = input.versionNo ?? input.versionNumber ?? 1;
    const outcomeType = input.outcomeType ?? input.type;
    const placeholderRules = input.placeholderRules ?? {
      required: input.placeholders ?? [],
      conditional: [],
    };
    const conditionalBlocks = this.normalizeConditionalBlocks(input.conditionalBlocks ?? []);

    if (!bodyTemplate) {
      throw new Error('Letter template body is required');
    }

    if (!outcomeType) {
      throw new Error('Letter template outcomeType is required');
    }

    this.validateLetterTemplate(
      bodyTemplate,
      placeholderRules.required ?? [],
      conditionalBlocks.map((block) => block.blockKey),
    );

    const letterTemplate = await PmsLetterTemplate.create({
      code: this.normalizeCode(input.code),
      name: input.name,
      outcomeType,
      channel: input.channel,
      status: PmsTemplateStatus.DRAFT,
      createdBy: this.actorIdObject(),
    });

    const letterTemplateVersion = await PmsLetterTemplateVersion.create({
      letterTemplateId: letterTemplate._id,
      versionNo,
      status: PmsTemplateStatus.DRAFT,
      subjectTemplate,
      bodyTemplate,
      placeholderRules,
      conditionalBlocks,
      createdBy: this.actorIdObject(),
    });

    await this.audit('PMS_LETTER_TEMPLATE_CREATED', 'PMS_LETTER_TEMPLATE', letterTemplate._id.toString(), undefined, {
      letterTemplate: letterTemplate.toObject(),
      letterTemplateVersion: letterTemplateVersion.toObject(),
    });
    return { letterTemplate, letterTemplateVersion };
  }

  async previewLetterTemplate(
    letterTemplateVersionId: string,
    data: Record<string, unknown>,
  ): Promise<{ subject?: string; body: string }> {
    const letterTemplate = await this.getLetterTemplateVersion(letterTemplateVersionId);
    return {
      subject: letterTemplate.subjectTemplate
        ? this.renderTemplate(letterTemplate.subjectTemplate, data)
        : undefined,
      body: this.renderTemplate(letterTemplate.bodyTemplate, data),
    };
  }

  async activateLetterTemplate(letterTemplateVersionId: string): Promise<IPmsLetterTemplateVersion> {
    this.assertAdmin('letterTemplate.activate');
    const letterTemplate = await this.getLetterTemplateVersion(letterTemplateVersionId);
    this.validateLetterTemplate(
      letterTemplate.bodyTemplate,
      letterTemplate.placeholderRules.required ?? [],
      letterTemplate.conditionalBlocks.map((block) => block.blockKey),
    );

    await PmsLetterTemplateVersion.updateMany(
      {
        letterTemplateId: letterTemplate.letterTemplateId,
        _id: { $ne: letterTemplate._id },
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

    letterTemplate.status = PmsTemplateStatus.ACTIVE;
    letterTemplate.isLocked = true;
    letterTemplate.lockedAt = letterTemplate.lockedAt ?? new Date();
    letterTemplate.activatedAt = new Date();
    letterTemplate.updatedBy = this.actorIdObject();
    await letterTemplate.save();

    await PmsLetterTemplate.findByIdAndUpdate(letterTemplate.letterTemplateId, {
      $set: {
        status: PmsTemplateStatus.ACTIVE,
        currentVersionId: letterTemplate._id,
        updatedBy: this.actorIdObject(),
      },
    });

    await this.audit('PMS_LETTER_TEMPLATE_ACTIVATED', 'PMS_LETTER_TEMPLATE_VERSION', letterTemplateVersionId, undefined, { status: letterTemplate.status });
    return letterTemplate;
  }

  async listLetterTemplates(query: LetterTemplateListQuery = {}): Promise<{
    items: IPmsLetterTemplate[];
    total: number;
    page: number;
    limit: number;
  }> {
    this.assertAdmin('letterTemplate.list');
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const filter: Record<string, unknown> = { isDeleted: false };

    if (query.status?.trim()) {
      filter.status = query.status.trim();
    }
    if (query.search?.trim()) {
      const search = query.search.trim();
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } },
      ];
    }

    const [items, total] = await Promise.all([
      PmsLetterTemplate.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      PmsLetterTemplate.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async getLetterTemplate(letterTemplateId: string): Promise<IPmsLetterTemplate> {
    this.assertAdmin('letterTemplate.get');
    const template = await PmsLetterTemplate.findOne({
      _id: letterTemplateId,
      isDeleted: false,
    });
    if (!template) {
      throw new Error('Letter template not found');
    }
    return template;
  }

  async listLetterTemplateVersions(letterTemplateId: string): Promise<IPmsLetterTemplateVersion[]> {
    this.assertAdmin('letterTemplateVersion.list');
    const exists = await PmsLetterTemplate.exists({ _id: letterTemplateId, isDeleted: false });
    if (!exists) {
      throw new Error('Letter template not found');
    }
    return PmsLetterTemplateVersion.find({
      letterTemplateId: new Types.ObjectId(letterTemplateId),
      isDeleted: false,
    }).sort({ versionNo: -1, createdAt: -1 });
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

  async getLetterTemplateVersion(letterTemplateVersionId: string): Promise<IPmsLetterTemplateVersion> {
    const letterTemplate = await PmsLetterTemplateVersion.findById(letterTemplateVersionId);
    if (!letterTemplate) {
      throw new Error('Letter template version not found');
    }
    return letterTemplate;
  }

  private normalizeConditionalBlocks(
    blocks: Array<string | { blockKey: string; condition: string }>,
  ): Array<{ blockKey: string; condition: string }> {
    return blocks.map((block) => {
      if (typeof block === 'string') {
        return { blockKey: block, condition: block };
      }

      return block;
    });
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
      const sectionScoringConfig = section.sectionScoringConfig as ITemplateSection['sectionScoringConfig'] | undefined;
      const repeatFor = section.repeatFor ?? legacyApplicableQuarters ?? [];
      const quarterScope = section.quarterScope as ITemplateSection['quarterScope'] | undefined;
      const rulePatch = this.rulesFromPermissions(legacyPermissions ?? []);

      return {
        sectionKey: section.sectionKey ?? legacyKey ?? '',
        sectionLabel: section.sectionLabel ?? legacyLabel ?? '',
        sectionType: section.sectionType ?? legacyType ?? PmsTemplateSectionType.OBJECTIVES,
        level: section.level ?? PmsTemplateSectionLevel.ANNUAL,
        repeatFor,
        repeatable: section.repeatable ?? false,
        displayOrder: section.displayOrder ?? legacyOrder ?? index + 1,
        layout: section.layout === 'grid' ? 'grid' : 'vertical',
        renderingScope: this.normalizeRenderingScope(
          section.renderingScope as string | undefined,
          section.level ?? PmsTemplateSectionLevel.ANNUAL,
        ),
        quarterScope: quarterScope ?? repeatFor,
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
      colSpan: [1, 2, 3, 4].includes(Number(field.colSpan))
        ? (Number(field.colSpan) as 1 | 2 | 3 | 4)
        : 4,
      options: (field.options ?? []).map((option: any) => ({
        label: option.label,
        value: option.value,
        ...(option.weight !== undefined ? { weight: Number(option.weight) } : {}),
      })),
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
          rows: (field.matrixConfig.rows ?? []).map((row: any) => ({
            key: row.key ?? row.id,
            label: row.label,
            options: (row.options ?? []).map((option: any) => ({
              label: option.label,
              value: option.value,
              ...(option.weight !== undefined ? { weight: Number(option.weight) } : {}),
            })),
          })),
          columns: (field.matrixConfig.columns ?? []).map((col: any) => ({
            key: col.key ?? col.id,
            label: col.label,
            weightage: col.weightage,
          })),
          allowComments: !!field.matrixConfig.allowComments,
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
    quarter?: 'Q1' | 'Q2' | 'Q3' | 'Q4',
  ): boolean {
    if (!quarter) return true;
    const scopedQuarters = section.quarterScope?.length
      ? section.quarterScope
      : section.repeatFor ?? [];
    if (scopedQuarters.length === 0) return true;
    return scopedQuarters.includes(quarter);
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
      key: field.fieldKey,
      label: field.fieldLabel,
      type: this.mapFieldTypeForClient(field.fieldType),
      required: behavior?.mandatory ?? field.isRequired ?? requiredFor.includes(context.role),
      visible: true,
      editable: this.isFieldEditable(field, context.role, context.workflowState, behavior),
      placeholder: field.placeholder,
      helpText: field.helpText,
      colSpan: field.colSpan,
      options: field.options ?? [],
      matrixConfig: field.matrixConfig,
      gridConfig: field.gridConfig,
      scoringIncluded: field.scoringConfig?.participatesInScoring === true,
      scoringConfig: field.scoringConfig,
      validationRules: field.validationRules,
    };
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
    if (visibleStates.length > 0 && !visibleStates.includes(context.workflowState)) return false;

    const hierarchyScopes = this.stringArrayFromRule(rules, 'hierarchyScopes');
    if (
      hierarchyScopes.length > 0 &&
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
    if (editableStates.length > 0 && !editableStates.includes(workflowState)) return false;

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
      (Object.values(QuarterWorkflowState) as string[]).includes(workflowState) ||
      (Object.values(AnnualWorkflowState) as string[]).includes(workflowState)
    );
  }

  private normalizeRoleCode(role: string): string {
    const normalized = role.replace(/[ /-]/g, '_').toUpperCase();
    if (normalized === 'HRADMIN') return 'HR_ADMIN';
    return normalized;
  }

  private normalizeRenderingScope(
    renderingScope: string | undefined,
    level: string,
  ): 'QUARTER_ONLY' | 'ANNUAL_ONLY' | 'BOTH' {
    if (renderingScope === 'QUARTER_ONLY' || renderingScope === 'ANNUAL_ONLY' || renderingScope === 'BOTH') {
      return renderingScope;
    }
    return level === PmsTemplateSectionLevel.QUARTER ? 'QUARTER_ONLY' : 'ANNUAL_ONLY';
  }

  private mapSectionModule(sectionType: string): string {
    if (sectionType === PmsTemplateSectionType.QUARTER_REVIEW) {
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
    const allowedQuarters = new Set(['Q1', 'Q2', 'Q3', 'Q4']);
    const sectionKeys = new Set<string>();
    const allFieldKeys = new Set<string>();

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

      if (section.layout && !['vertical', 'grid'].includes(section.layout)) {
        throw new Error(`Invalid section layout in section ${section.sectionKey}`);
      }

      if (
        section.renderingScope &&
        !['QUARTER_ONLY', 'ANNUAL_ONLY', 'BOTH'].includes(section.renderingScope)
      ) {
        throw new Error(`Invalid renderingScope in section ${section.sectionKey}`);
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
  }

  private validateTemplateVersionForActivation(version: IPmsTemplateVersion): void {
    const scoringSections = version.sections.filter(
      (section) => section.sectionScoringConfig?.participatesInScoring === true,
    );

    if (scoringSections.length > 0) {
      const totalSectionWeight = scoringSections.reduce(
        (total, section) => total + Number(section.sectionScoringConfig?.weightage ?? 0),
        0,
      );
      if (totalSectionWeight !== 100) {
        throw new Error('Scoring section weightage total must be exactly 100 before activation');
      }

      for (const section of scoringSections) {
        const scoringFields = (section.fields ?? []).filter(
          (field) => field.scoringConfig?.participatesInScoring === true,
        );
        if (scoringFields.length === 0) {
          throw new Error(`Scoring section ${section.sectionKey} must contain at least one scoring field`);
        }

        const fieldWeightTotal = scoringFields.reduce(
          (total, field) => total + Number(field.scoringConfig?.weight ?? field.scoringConfig?.weightage ?? 0),
          0,
        );
        if (fieldWeightTotal !== 100) {
          throw new Error(`Scoring field weightage total in section ${section.sectionKey} must be exactly 100`);
        }
      }
    }

    const annualScoringConfig = version.annualScoringConfig as
      | {
          quarterWeights?: Record<string, number>;
          excludedQuarters?: string[];
        }
      | undefined;
    const quarterWeights = annualScoringConfig?.quarterWeights;
    if (quarterWeights && Object.keys(quarterWeights).length > 0) {
      const excluded = new Set(annualScoringConfig?.excludedQuarters ?? []);
      const totalQuarterWeight = ['Q1', 'Q2', 'Q3', 'Q4']
        .filter((quarter) => !excluded.has(quarter))
        .reduce((total, quarter) => total + Number(quarterWeights[quarter] ?? 0), 0);

      if (totalQuarterWeight !== 100) {
        throw new Error('Annual scoring quarter weightage total must be exactly 100 before activation');
      }
    }

    const outcomeTypes = new Set(Object.values(AppraisalOutcomeType));
    for (const mapping of version.outcomeMappings ?? []) {
      if (!outcomeTypes.has(mapping.outcomeType)) {
        throw new Error(`Invalid outcome mapping type: ${mapping.outcomeType}`);
      }
      if (!mapping.letterTemplateVersionId?.trim()) {
        throw new Error(`Outcome mapping ${mapping.outcomeType} requires a letterTemplateVersionId`);
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
}
