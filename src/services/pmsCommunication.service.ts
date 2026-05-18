import crypto from 'crypto';
import handlebars from 'handlebars';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  AppraisalOutcomeType,
  LetterTemplateChannel,
  PmsTemplateStatus,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { CommunicationDispatch } from '../models/pms-communication-dispatch.model';
import {
  PmsLetterTemplate,
  PmsLetterTemplateVersion,
} from '../models/pms-letter-template.model';
import { User } from '../models/user.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { emailService } from './email.service';
import type { ICommunicationDispatch } from '../models/pms-communication-dispatch.model';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IAnnualDecision } from '../models/pms-annual-decision.model';
import type {
  IPmsLetterTemplate,
  IPmsLetterTemplateVersion,
} from '../models/pms-letter-template.model';

export interface PreviewPmsCommunicationInput {
  annualAssignmentId: string;
  templateId?: string;
}

export interface SendPmsCommunicationInput extends PreviewPmsCommunicationInput {
  resendOf?: string;
  correctionReason?: string;
  skipEmail?: boolean;
}

interface RenderedCommunication {
  annualAssignment: IAnnualAssignment;
  annualDecision: IAnnualDecision;
  template: IPmsLetterTemplate;
  templateVersion: IPmsLetterTemplateVersion;
  renderedSubject: string;
  renderedBodySnapshot: string;
  contentHash: string;
  renderedAt: Date;
}

export class PmsCommunicationService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async previewCommunication(
    input: PreviewPmsCommunicationInput,
  ): Promise<RenderedCommunication> {
    this.assertAdmin('pmsCommunication.preview');
    return this.renderCommunication(input);
  }

  async sendCommunication(
    input: SendPmsCommunicationInput,
  ): Promise<ICommunicationDispatch> {
    this.assertAdmin('pmsCommunication.send');
    const rendered = await this.renderCommunication(input);
    const actorId = this.actorIdObject();

    const existingSent = await CommunicationDispatch.findOne({
      annualAssignmentId: rendered.annualAssignment._id,
      dispatchStatus: 'SENT',
      resendOf: input.resendOf ? new Types.ObjectId(input.resendOf) : null,
    });
    if (existingSent && !input.resendOf) {
      throw new Error('Communication already sent for this annual assignment');
    }

    const dispatch = await CommunicationDispatch.create({
      annualAssignmentId: rendered.annualAssignment._id,
      cycleId: rendered.annualAssignment.cycleId,
      employeeId: rendered.annualAssignment.employeeId,
      appraisalOutcomeType: rendered.annualDecision.appraisalOutcomeType,
      templateId: rendered.template._id,
      templateVersionId: rendered.templateVersion._id,
      channel: rendered.template.channel,
      dispatchStatus: 'RENDERED',
      renderedSubject: rendered.renderedSubject,
      renderedBodySnapshot: rendered.renderedBodySnapshot,
      contentHash: rendered.contentHash,
      renderedAt: rendered.renderedAt,
      deliveryStatus: {},
      resendOf: input.resendOf ? new Types.ObjectId(input.resendOf) : undefined,
      correctionReason: input.correctionReason,
      createdBy: actorId,
    });

    const employee = await User.findById(rendered.annualAssignment.employeeId).lean();
    if (!employee?.email) {
      dispatch.dispatchStatus = 'FAILED';
      dispatch.deliveryStatus = { email: 'FAILED', reason: 'Employee email not found' };
      dispatch.updatedBy = actorId;
      dispatch.version += 1;
      await dispatch.save();
      throw new Error('Employee email not found');
    }

    if (!input.skipEmail) {
      try {
        await emailService.sendEmail({
          body: {
            to: employee.email,
            subject: rendered.renderedSubject,
            text: rendered.renderedBodySnapshot,
          },
        });
        dispatch.deliveryStatus = { email: 'SENT' };
      } catch (error) {
        dispatch.dispatchStatus = 'FAILED';
        dispatch.deliveryStatus = {
          email: 'FAILED',
          reason: error instanceof Error ? error.message : 'Unknown email error',
        };
        dispatch.updatedBy = actorId;
        dispatch.version += 1;
        await dispatch.save();
        throw error;
      }
    } else {
      dispatch.deliveryStatus = { email: 'SKIPPED' };
    }

    dispatch.dispatchStatus = 'SENT';
    dispatch.sentBy = actorId;
    dispatch.sentAt = new Date();
    dispatch.updatedBy = actorId;
    dispatch.version += 1;
    await dispatch.save();

    rendered.annualAssignment.communicationStatus = 'SENT';
    rendered.annualAssignment.annualState = AnnualWorkflowState.COMMUNICATION_SENT;
    rendered.annualAssignment.version += 1;
    await rendered.annualAssignment.save();

    await auditService.createAuditLog({
      actorId: this.requireActor().actorId,
      actorRole: this.requireActor().actorRole,
      action: input.resendOf ? 'PMS_COMMUNICATION_RESENT' : 'PMS_COMMUNICATION_SENT',
      entityType: 'COMMUNICATION_DISPATCH',
      entityId: dispatch._id.toString(),
      newValue: dispatch.toObject(),
      reason: input.correctionReason,
    });

    return dispatch;
  }

  async resendCommunication(
    dispatchId: string,
    correctionReason?: string,
  ): Promise<ICommunicationDispatch> {
    if (!Types.ObjectId.isValid(dispatchId)) {
      throw new Error('Invalid dispatchId');
    }

    const existingDispatch = await CommunicationDispatch.findById(dispatchId);
    if (!existingDispatch) {
      throw new Error('Communication dispatch not found');
    }

    return this.sendCommunication({
      annualAssignmentId: existingDispatch.annualAssignmentId.toString(),
      templateId: existingDispatch.templateVersionId.toString(),
      resendOf: existingDispatch._id.toString(),
      correctionReason,
    });
  }

  async getHistory(annualAssignmentId: string): Promise<ICommunicationDispatch[]> {
    this.assertAdmin('pmsCommunication.history');
    if (!Types.ObjectId.isValid(annualAssignmentId)) {
      throw new Error('Invalid annualAssignmentId');
    }

    return CommunicationDispatch.find({ annualAssignmentId }).sort({ createdAt: -1 });
  }

  private async renderCommunication(
    input: PreviewPmsCommunicationInput,
  ): Promise<RenderedCommunication> {
    const annualAssignment = await AnnualAssignment.findById(input.annualAssignmentId);
    if (!annualAssignment) {
      throw new Error('Annual assignment not found');
    }

    const annualDecision = await AnnualDecision.findOne({
      annualAssignmentId: annualAssignment._id,
    });
    if (!annualDecision) {
      throw new Error('Annual decision not found');
    }

    if (annualDecision.decisionStatus !== AnnualDecisionStatus.VISIBILITY_ENABLED) {
      throw new Error('Communication is allowed only after visibility is enabled');
    }

    const visibility = await VisibilityConfiguration.findOne({
      annualAssignmentId: annualAssignment._id,
    });
    if (!visibility || !this.hasAnyVisibility(visibility)) {
      throw new Error('Visibility must be enabled before communication dispatch');
    }

    const resolved = input.templateId
      ? await this.getTemplateAndVersionById(input.templateId)
      : await this.resolveTemplate(annualAssignment, annualDecision);
    if (!resolved) {
      throw new Error('Letter template not found');
    }

    const { template, templateVersion } = resolved;
    if (template.status !== PmsTemplateStatus.ACTIVE || templateVersion.status !== PmsTemplateStatus.ACTIVE) {
      throw new Error('Only active letter templates can be used for dispatch');
    }

    const data = await this.buildTemplateData(annualAssignment, annualDecision);
    const renderedAt = new Date();
    const renderedSubject = this.renderTemplate(
      templateVersion.subjectTemplate ?? 'Your Appraisal Outcome',
      data,
    );
    const renderedBodySnapshot = this.renderTemplate(templateVersion.bodyTemplate, data);
    const contentHash = this.hashRenderedContent({
      templateVersionId: templateVersion._id.toString(),
      renderedSubject,
      renderedBodySnapshot,
      renderedAt,
    });

    return {
      annualAssignment,
      annualDecision,
      template,
      templateVersion,
      renderedSubject,
      renderedBodySnapshot,
      contentHash,
      renderedAt,
    };
  }

  private async resolveTemplate(
    annualAssignment: IAnnualAssignment,
    annualDecision: IAnnualDecision,
  ): Promise<{ template: IPmsLetterTemplate; templateVersion: IPmsLetterTemplateVersion } | null> {
    const cycle = await AnnualCycle.findById(annualAssignment.cycleId).lean();
    const communicationRuleConfig = cycle?.communicationRuleConfig ?? {};
    const configuredTemplateId = this.resolveConfiguredTemplateId(
      annualDecision.appraisalOutcomeType,
      communicationRuleConfig,
    );

    if (configuredTemplateId && Types.ObjectId.isValid(configuredTemplateId)) {
      return this.getTemplateAndVersionById(configuredTemplateId);
    }

    const template = await PmsLetterTemplate.findOne({
      outcomeType: this.mapOutcomeToTemplateType(annualDecision.appraisalOutcomeType),
      channel: LetterTemplateChannel.EMAIL,
      status: PmsTemplateStatus.ACTIVE,
    });

    if (!template) return null;

    const templateVersion = await PmsLetterTemplateVersion.findById(template.currentVersionId);
    if (!templateVersion) return null;

    return { template, templateVersion };
  }

  private async getTemplateAndVersionById(
    id: string,
  ): Promise<{ template: IPmsLetterTemplate; templateVersion: IPmsLetterTemplateVersion } | null> {
    const version = await PmsLetterTemplateVersion.findById(id);
    if (version) {
      const template = await PmsLetterTemplate.findById(version.letterTemplateId);
      return template ? { template, templateVersion: version } : null;
    }

    const template = await PmsLetterTemplate.findById(id);
    if (!template?.currentVersionId) return null;

    const templateVersion = await PmsLetterTemplateVersion.findById(template.currentVersionId);
    return templateVersion ? { template, templateVersion } : null;
  }

  private resolveConfiguredTemplateId(
    outcomeType: string | undefined,
    config: Record<string, unknown>,
  ): string | undefined {
    switch (outcomeType) {
      case AppraisalOutcomeType.BOTH:
        return config.combinedTemplateId as string | undefined;
      case AppraisalOutcomeType.MERIT_ONLY:
        return config.meritOnlyTemplateId as string | undefined;
      case AppraisalOutcomeType.GRADE_ONLY:
        return config.gradeOnlyTemplateId as string | undefined;
      case AppraisalOutcomeType.NIL:
        return config.genericTemplateId as string | undefined;
      default:
        return undefined;
    }
  }

  private mapOutcomeToTemplateType(outcomeType: string | undefined): string {
    switch (outcomeType) {
      case AppraisalOutcomeType.BOTH:
        return AppraisalOutcomeType.BOTH;
      case AppraisalOutcomeType.MERIT_ONLY:
        return AppraisalOutcomeType.MERIT_ONLY;
      case AppraisalOutcomeType.GRADE_ONLY:
        return AppraisalOutcomeType.GRADE_ONLY;
      case AppraisalOutcomeType.NIL:
        return AppraisalOutcomeType.NIL;
      default:
        return AppraisalOutcomeType.NIL;
    }
  }

  private async buildTemplateData(
    annualAssignment: IAnnualAssignment,
    annualDecision: IAnnualDecision,
  ): Promise<Record<string, unknown>> {
    const employee = await User.findById(annualAssignment.employeeId).lean();
    const gradeDetails = annualDecision.gradeDetails ?? {};
    const meritDetails = annualDecision.meritDetails ?? {};

    return {
      employeeName: annualAssignment.employeeSnapshot?.name ?? employee?.name ?? '',
      employeeCode: annualAssignment.employeeSnapshot?.employeeCode ?? employee?.employeeCode ?? '',
      appraisalYear: new Date().getFullYear(),
      appraisalOutcomeType: annualDecision.appraisalOutcomeType,
      isGradeApplied: annualDecision.isGradeApplied,
      isMeritApplied: annualDecision.isMeritApplied,
      finalGrade: gradeDetails.gradeValue ?? gradeDetails.finalGrade ?? '',
      meritAmount: meritDetails.meritAmount ?? '',
      meritPercentage: meritDetails.meritPercentage ?? '',
      finalScore: annualDecision.finalScore ?? '',
      finalRating: annualDecision.finalRating ?? '',
      nilReason: annualDecision.nilReason ?? '',
      managementRemarks: annualDecision.managementRemarks ?? '',
    };
  }

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    try {
      const compiledTemplate = handlebars.compile(template);
      return compiledTemplate(data);
    } catch (err) {
      console.error('Error rendering template with handlebars:', err);
      return template;
    }
  }

  private hashRenderedContent(input: {
    templateVersionId: string;
    renderedSubject: string;
    renderedBodySnapshot: string;
    renderedAt: Date;
  }): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({
        templateVersionId: input.templateVersionId,
        renderedSubject: input.renderedSubject,
        renderedBodySnapshot: input.renderedBodySnapshot,
        renderedAt: input.renderedAt.toISOString(),
      }))
      .digest('hex');
  }

  private hasAnyVisibility(visibility: {
    employeeReviewVisible: boolean;
    employeeGradeVisible: boolean;
    employeeMeritVisible: boolean;
    managerGradeVisible: boolean;
    managerMeritVisible: boolean;
  }): boolean {
    return [
      visibility.employeeReviewVisible,
      visibility.employeeGradeVisible,
      visibility.employeeMeritVisible,
      visibility.managerGradeVisible,
      visibility.managerMeritVisible,
    ].some(Boolean);
  }

  private assertAdmin(action: string): void {
    const access = accessService.canPerform({
      actor: this.requireActor(),
      action,
      requiresAdmin: true,
    });

    if (!access.allowed) {
      throw new Error(access.message ?? 'Access denied');
    }
  }

  private requireActor() {
    const user = this.context.user;
    if (!user) {
      throw new Error('Authentication required');
    }

    return {
      actorId: user._id.toString(),
      actorRole: user.role,
    };
  }

  private actorIdObject(): Types.ObjectId | undefined {
    const actorId = this.context.user?._id.toString();
    return actorId && Types.ObjectId.isValid(actorId)
      ? new Types.ObjectId(actorId)
      : undefined;
  }
}
