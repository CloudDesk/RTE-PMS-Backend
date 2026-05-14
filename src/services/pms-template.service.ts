import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  PmsTemplateSectionLevel,
  PmsTemplateStatus,
} from '../constants/pms.enums';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { PmsLetterTemplate } from '../models/pms-letter-template.model';
import type { IPmsTemplate } from '../models/pms-template.model';
import type { IPmsTemplateVersion } from '../models/pms-template-version.model';
import type { IPmsLetterTemplate } from '../models/pms-letter-template.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';

export type TemplateSection = IPmsTemplateVersion['sections'][number];
export type TemplateField = TemplateSection['fields'][number];
export type TemplatePermission = NonNullable<TemplateSection['permissions']>[number];

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
  versionNumber: number;
  sections?: TemplateSection[];
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
        versionNumber: version.versionNumber,
        status: PmsTemplateStatus.DRAFT,
        sections: version.sections,
        placeholders: version.placeholders,
        conditionalBlocks: version.conditionalBlocks,
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
    this.validateSections(input.sections ?? []);

    const version = await PmsTemplateVersion.create({
      templateId: new Types.ObjectId(templateId),
      versionNumber: input.versionNumber,
      sections: input.sections ?? [],
      placeholders: input.placeholders ?? [],
      conditionalBlocks: input.conditionalBlocks ?? [],
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

    version.status = PmsTemplateStatus.ACTIVE;
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
    sections: TemplateSection[],
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.configureSections');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    this.validateSections(sections);

    version.sections = sections;
    version.updatedBy = this.actorIdObject();
    await version.save();

    await this.audit('PMS_TEMPLATE_SECTIONS_CONFIGURED', 'PMS_TEMPLATE_VERSION', versionId, undefined, { sectionCount: sections.length });
    return version;
  }

  async configureFields(
    versionId: string,
    sectionKey: string,
    fields: TemplateField[],
  ): Promise<IPmsTemplateVersion> {
    this.assertAdmin('templateVersion.configureFields');
    const version = await this.getEditableOrExistingVersion(versionId, true);
    const section = version.sections.find((item) => item.key === sectionKey);
    if (!section) {
      throw new Error('Template section not found');
    }

    section.fields = fields;
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
    const section = version.sections.find((item) => item.key === sectionKey);
    if (!section) {
      throw new Error('Template section not found');
    }

    section.permissions = permissions;
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
    const section = version.sections.find((item) => item.key === sectionKey);
    const field = section?.fields.find((item) => item.key === fieldKey);
    if (!section || !field) {
      throw new Error('Template section or field not found');
    }

    field.permissions = permissions;
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

  private validateSections(sections: TemplateSection[]): void {
    const allowedQuarters = new Set(['Q1', 'Q2', 'Q3', 'Q4']);

    for (const section of sections) {
      if (section.level === PmsTemplateSectionLevel.QUARTER) {
        const quarters = section.applicableQuarters ?? [];
        if (quarters.length === 0) {
          throw new Error(`Quarter-level section ${section.key} must define applicable quarters`);
        }

        for (const quarter of quarters) {
          if (!allowedQuarters.has(quarter)) {
            throw new Error(`Invalid quarter ${quarter} in section ${section.key}`);
          }
        }
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
