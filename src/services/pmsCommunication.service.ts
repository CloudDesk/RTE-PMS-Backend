import crypto from 'crypto';
import handlebars from 'handlebars';
import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import {
  AnnualDecisionStatus,
  AnnualWorkflowState,
  AppraisalOutcomeType,
} from '../constants/pms.enums';
import { AnnualAssignment } from '../models/pms-annual-assignment.model';
import { AnnualCycle } from '../models/pms-annual-cycle.model';
import { AnnualDecision } from '../models/pms-annual-decision.model';
import { CommunicationDispatch } from '../models/pms-communication-dispatch.model';
import { User } from '../models/user.model';
import { VisibilityConfiguration } from '../models/pms-visibility-configuration.model';
import { accessService } from './access.service';
import { auditService } from './audit.service';
import { emailService } from './email.service';
import type { ICommunicationDispatch } from '../models/pms-communication-dispatch.model';
import type { IAnnualAssignment } from '../models/pms-annual-assignment.model';
import type { IAnnualDecision } from '../models/pms-annual-decision.model';

export interface PreviewPmsCommunicationInput {
  annualAssignmentId: string;
  contentKey?: string;
}

export interface SendPmsCommunicationInput extends PreviewPmsCommunicationInput {
  resendOf?: string;
  correctionReason?: string;
  skipEmail?: boolean;
  allowSubmittedDecisionDispatch?: boolean;
}

type RenderPmsCommunicationInput = PreviewPmsCommunicationInput & {
  allowSubmittedDecisionDispatch?: boolean;
};

interface RenderedCommunication {
  annualAssignment: IAnnualAssignment;
  annualDecision: IAnnualDecision;
  contentKey: string;
  contentVersion: string;
  channel: string;
  renderedSubject: string;
  renderedBodySnapshot: string;
  contentHash: string;
  renderedAt: Date;
}

interface StaticCommunicationTemplate {
  contentKey: string;
  contentVersion: string;
  channel: string;
  subjectTemplate: string;
  bodyTemplate: string;
}

export class PmsCommunicationService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async previewCommunication(
    input: PreviewPmsCommunicationInput,
  ): Promise<RenderedCommunication> {
    await this.assertAdmin('pmsCommunication.preview');
    return this.renderCommunication(input);
  }

  async sendCommunication(
    input: SendPmsCommunicationInput,
  ): Promise<ICommunicationDispatch> {
    await this.assertAdmin('pmsCommunication.send');
    const actorId = this.actorIdObject();

    const existingSent = await CommunicationDispatch.findOne({
      annualAssignmentId: input.annualAssignmentId,
      dispatchStatus: { $in: ['SENT', 'SKIPPED'] },
      resendOf: input.resendOf ? new Types.ObjectId(input.resendOf) : null,
    });
    if (existingSent && !input.resendOf && !input.allowSubmittedDecisionDispatch) {
      throw new Error('Communication already processed for this annual assignment');
    }

    const annualAssignment = await AnnualAssignment.findById(input.annualAssignmentId);
    if (!annualAssignment) throw new Error('Annual assignment not found');

    const annualDecision = await AnnualDecision.findOne({ annualAssignmentId: annualAssignment._id });
    if (!annualDecision) throw new Error('Annual decision not found');

    if (annualDecision.appraisalOutcomeType === AppraisalOutcomeType.NIL) {
      const annualCycle = await AnnualCycle.findById(annualAssignment.cycleId).lean();
      if (annualCycle?.communicationRuleConfig?.skipNilOutcome === true) {
        const dispatch = await CommunicationDispatch.create({
          annualAssignmentId: annualAssignment._id,
          cycleId: annualAssignment.cycleId,
          employeeId: annualAssignment.employeeId,
          appraisalOutcomeType: 'NIL',
          contentKey: 'NIL',
          contentVersion: 'STATIC_PMS_V1',
          channel: 'EMAIL',
          dispatchStatus: 'SKIPPED',
          deliveryStatus: { reason: 'Skipped due to NIL outcome configuration' },
          resendOf: input.resendOf ? new Types.ObjectId(input.resendOf) : undefined,
          correctionReason: input.correctionReason,
          createdBy: actorId,
        });

        annualAssignment.communicationStatus = 'SKIPPED';
        if (!input.allowSubmittedDecisionDispatch) {
          annualAssignment.annualState = AnnualWorkflowState.COMMUNICATION_SENT;
        }
        annualAssignment.version += 1;
        await annualAssignment.save();

        await auditService.createAuditLog({
          actorId: this.requireActor().actorId,
          actorRole: this.requireActor().actorRole,
          action: 'PMS_COMMUNICATION_SKIPPED',
          entityType: 'COMMUNICATION_DISPATCH',
          entityId: dispatch._id.toString(),
          newValue: dispatch.toObject(),
          reason: 'NIL outcome skipped by config',
        });

        return dispatch;
      }
    }

    const rendered = await this.renderCommunication(input);

    const dispatch = await CommunicationDispatch.create({
      annualAssignmentId: rendered.annualAssignment._id,
      cycleId: rendered.annualAssignment.cycleId,
      employeeId: rendered.annualAssignment.employeeId,
      appraisalOutcomeType: rendered.annualDecision.appraisalOutcomeType,
      contentKey: rendered.contentKey,
      contentVersion: rendered.contentVersion,
      channel: rendered.channel,
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
    if (!input.allowSubmittedDecisionDispatch) {
      rendered.annualAssignment.annualState = AnnualWorkflowState.COMMUNICATION_SENT;
    }
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

    if (!correctionReason?.trim()) {
      throw new Error('Correction reason is required for resend');
    }

    const existingDispatch = await CommunicationDispatch.findById(dispatchId);
    if (!existingDispatch) {
      throw new Error('Communication dispatch not found');
    }

    return this.sendCommunication({
      annualAssignmentId: existingDispatch.annualAssignmentId.toString(),
      contentKey: existingDispatch.contentKey,
      resendOf: existingDispatch._id.toString(),
      correctionReason,
    });
  }

  async getHistory(annualAssignmentId: string): Promise<ICommunicationDispatch[]> {
    await this.assertAdmin('pmsCommunication.history');
    if (!Types.ObjectId.isValid(annualAssignmentId)) {
      throw new Error('Invalid annualAssignmentId');
    }

    return CommunicationDispatch.find({ annualAssignmentId }).sort({ createdAt: -1 });
  }

  private async renderCommunication(
    input: RenderPmsCommunicationInput,
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

    const canDispatchSubmittedDecision =
      input.allowSubmittedDecisionDispatch === true &&
      annualDecision.decisionStatus === AnnualDecisionStatus.SUBMITTED;

    if (
      annualDecision.decisionStatus !== AnnualDecisionStatus.VISIBILITY_ENABLED &&
      !canDispatchSubmittedDecision
    ) {
      throw new Error('Communication is allowed only after visibility is enabled');
    }

    const visibility = await VisibilityConfiguration.findOne({
      annualAssignmentId: annualAssignment._id,
    });
    if (!canDispatchSubmittedDecision && (!visibility || !this.hasAnyVisibility(visibility))) {
      throw new Error('Visibility must be enabled before communication dispatch');
    }

    const data = await this.buildTemplateData(annualAssignment, annualDecision);
    const renderedAt = new Date();
    const contentTemplate = this.resolveStaticContentTemplate(
      annualDecision.appraisalOutcomeType,
      input.contentKey,
    );
    const renderedSubject = this.renderTemplate(contentTemplate.subjectTemplate, data);
    const renderedBodySnapshot = this.renderTemplate(contentTemplate.bodyTemplate, data);
    const contentHash = this.hashRenderedContent({
      contentVersion: contentTemplate.contentVersion,
      renderedSubject,
      renderedBodySnapshot,
      renderedAt,
    });

    return {
      annualAssignment,
      annualDecision,
      contentKey: contentTemplate.contentKey,
      contentVersion: contentTemplate.contentVersion,
      channel: contentTemplate.channel,
      renderedSubject,
      renderedBodySnapshot,
      contentHash,
      renderedAt,
    };
  }

  private resolveStaticContentTemplate(
    outcomeType: string | undefined,
    overrideContentKey?: string,
  ): StaticCommunicationTemplate {
    const contentKey = overrideContentKey?.trim() || this.defaultContentKeyForOutcome(outcomeType);
    const base: Pick<StaticCommunicationTemplate, 'contentVersion' | 'channel'> = {
      contentVersion: 'STATIC_PMS_V1',
      channel: 'EMAIL',
    };

    switch (contentKey) {
      case 'BOTH':
        return {
          ...base,
          contentKey,
          subjectTemplate: 'Your Annual Appraisal Outcome',
          bodyTemplate:
            'Dear {{employeeName}},\n\nYour annual appraisal has been finalized.\n\nRegards,\nHR Team',
        };
      case 'MERIT_ONLY':
        return {
          ...base,
          contentKey,
          subjectTemplate: 'Your Annual Appraisal Outcome',
          bodyTemplate:
            'Dear {{employeeName}},\n\nYour annual appraisal has been finalized.\n\nRegards,\nHR Team',
        };
      case 'GRADE_ONLY':
        return {
          ...base,
          contentKey,
          subjectTemplate: 'Your Annual Appraisal Outcome',
          bodyTemplate:
            'Dear {{employeeName}},\n\nYour annual appraisal has been finalized.\n\nRegards,\nHR Team',
        };
      case 'NIL':
      default:
        return {
          ...base,
          contentKey: contentKey || 'NIL',
          subjectTemplate: 'Your Annual Appraisal Outcome',
          bodyTemplate:
            'Dear {{employeeName}},\n\nYour annual appraisal has been finalized.\nOutcome: {{appraisalOutcomeType}}\n{{#if nilReason}}Reason: {{nilReason}}\n{{/if}}\nRegards,\nHR Team',
        };
    }
  }

  private defaultContentKeyForOutcome(outcomeType: string | undefined): string {
    switch (outcomeType) {
      case AppraisalOutcomeType.BOTH:
      case AppraisalOutcomeType.MERIT_ONLY:
      case AppraisalOutcomeType.GRADE_ONLY:
      case AppraisalOutcomeType.NIL:
        return outcomeType;
      default:
        return 'NIL';
    }
  }

  private async buildTemplateData(
    annualAssignment: IAnnualAssignment,
    annualDecision: IAnnualDecision,
  ): Promise<Record<string, unknown>> {
    const employee = await User.findById(annualAssignment.employeeId).lean();
    const gradeDetails = annualDecision.gradeDetails ?? {};
    const meritDetails = annualDecision.meritDetails ?? {};
    const meritPercentage = this.formatPercentageValue(
      meritDetails.meritPercentage ??
        meritDetails.percentage ??
        meritDetails.meritAmount ??
        meritDetails.amount ??
        '',
    );

    return {
      employeeName: annualAssignment.employeeSnapshot?.name ?? employee?.name ?? '',
      employeeCode: annualAssignment.employeeSnapshot?.employeeCode ?? employee?.employeeCode ?? '',
      appraisalYear: new Date().getFullYear(),
      appraisalOutcomeType: this.formatEnumDisplayValue(annualDecision.appraisalOutcomeType),
      isGradeApplied: annualDecision.isGradeApplied,
      isMeritApplied: annualDecision.isMeritApplied,
      finalGrade: this.formatEnumDisplayValue(
        gradeDetails.gradeValue ?? gradeDetails.finalGrade ?? gradeDetails.grade ?? '',
      ),
      meritAmount: meritPercentage,
      meritPercentage,
      finalScore: annualDecision.finalScore ?? '',
      finalRating: this.formatEnumDisplayValue(annualDecision.finalRating ?? ''),
      nilReason: this.capitalizeFirstLetter(annualDecision.nilReason ?? ''),
      managementRemarks: this.capitalizeFirstLetter(annualDecision.managementRemarks ?? ''),
    };
  }

  private formatPercentageValue(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) return '';
    return `${text.replace(/%+$/g, '')}%`;
  }

  private formatEnumDisplayValue(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) return '';

    return text
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase()
      .split(' ')
      .map((word) => word ? `${word[0].toUpperCase()}${word.slice(1)}` : word)
      .join(' ');
  }

  private capitalizeFirstLetter(value: unknown): string {
    const text = String(value ?? '').trim();
    if (!text) return '';

    return `${text[0].toUpperCase()}${text.slice(1)}`;
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
    contentVersion: string;
    renderedSubject: string;
    renderedBodySnapshot: string;
    renderedAt: Date;
  }): string {
    return crypto
      .createHash('sha256')
      .update(JSON.stringify({
        contentVersion: input.contentVersion,
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

  private async assertAdmin(action: string): Promise<void> {
    const access = await accessService.canPerform({
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
