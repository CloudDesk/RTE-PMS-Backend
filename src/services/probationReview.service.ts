import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { User } from '../models/user.model';
import {
  IProbationReviewValue,
  PmsProbationReviewAssignment,
  ProbationReviewStatus,
} from '../models/pms-probation-review-assignment.model';

export interface ProbationReviewListQuery {
  employeeId?: string;
  managerId?: string;
  status?: string;
  search?: string;
  dateFrom?: string | Date;
  dateTo?: string | Date;
  page?: string | number;
  limit?: string | number;
}

export interface CreateProbationReviewInput {
  employeeId: string;
  probationEndDate: string | Date;
  reviewOpenDate?: string | Date;
  manager1Id: string;
  manager2Id: string;
  templateId: string;
  templateVersionId: string;
}

export interface SaveProbationReviewValuesInput {
  values?: IProbationReviewValue[];
  reviewValues?: IProbationReviewValue[];
}

export interface OpenProbationReviewInput {
  force?: boolean;
  asOfDate?: string | Date;
}

export interface SyncDueProbationReviewsInput {
  asOfDate?: string | Date;
}

export interface ReturnProbationReviewInput {
  reason: string;
}

export interface ApproveProbationReviewInput {
  comments?: string;
}

export interface CancelProbationReviewInput {
  reason?: string;
}

const REVIEW_OPEN_OFFSET_DAYS = 30;

const MUTABLE_MANAGER_1_STATUSES: ProbationReviewStatus[] = [
  ProbationReviewStatus.REVIEW_OPEN,
  ProbationReviewStatus.RETURNED_TO_MANAGER_1,
];

export class ProbationReviewService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listAssignments(query: ProbationReviewListQuery = {}) {
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const filter: Record<string, unknown> = { isDeleted: false };

    if (query.employeeId) {
      filter.employeeId = this.toObjectId(query.employeeId, 'Employee');
    }

    if (query.managerId) {
      const managerId = this.toObjectId(query.managerId, 'Manager');
      filter.$or = [{ manager1Id: managerId }, { manager2Id: managerId }];
    }

    if (!this.isPrivilegedActor()) {
      const actorId = this.requireActorObjectId();
      filter.$or = [{ manager1Id: actorId }, { manager2Id: actorId }];
    }

    if (query.status?.trim()) {
      filter.status = query.status.trim().toUpperCase();
    }

    if (query.dateFrom || query.dateTo) {
      filter.reviewOpenDate = {};
      if (query.dateFrom) {
        (filter.reviewOpenDate as Record<string, Date>).$gte = this.parseDate(
          query.dateFrom,
          'From date',
        );
      }
      if (query.dateTo) {
        const dateTo = this.parseDate(query.dateTo, 'To date');
        dateTo.setHours(23, 59, 59, 999);
        (filter.reviewOpenDate as Record<string, Date>).$lte = dateTo;
      }
    }

    if (query.search?.trim()) {
      const users = await User.find({
        $or: [
          { name: { $regex: query.search.trim(), $options: 'i' } },
          { email: { $regex: query.search.trim(), $options: 'i' } },
          { employeeCode: { $regex: query.search.trim(), $options: 'i' } },
        ],
      })
        .select('_id')
        .lean();
      filter.employeeId = { $in: users.map((user) => user._id) };
    }

    const [items, total] = await Promise.all([
      PmsProbationReviewAssignment.find(filter)
        .populate('employeeId', 'name email employeeCode departmentId designation role specificRole probationDate joiningDate')
        .populate('manager1Id', 'name email employeeCode role specificRole')
        .populate('manager2Id', 'name email employeeCode role specificRole')
        .populate('templateId', 'name code status metadata')
        .populate('templateVersionId', 'versionNo status isLocked')
        .sort({ reviewOpenDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PmsProbationReviewAssignment.countDocuments(filter),
    ]);

    return { items, total, page, limit };
  }

  async getAssignment(id: string) {
    const assignment = await PmsProbationReviewAssignment.findOne({
      _id: this.toObjectId(id, 'Probation review assignment'),
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode departmentId designation role specificRole probationDate joiningDate')
      .populate('manager1Id', 'name email employeeCode role specificRole')
      .populate('manager2Id', 'name email employeeCode role specificRole')
      .populate('templateId', 'name code status metadata')
      .populate('templateVersionId')
      .lean();

    if (!assignment) {
      throw new Error('Probation review assignment not found.');
    }

    this.assertCanViewAssignment(assignment);

    return assignment;
  }

  async createAssignment(input: CreateProbationReviewInput) {
    const actorId = this.getActorObjectId();
    const employeeId = this.toObjectId(input.employeeId, 'Employee');
    const manager1Id = this.toObjectId(input.manager1Id, 'Manager 1');
    const manager2Id = this.toObjectId(input.manager2Id, 'Manager 2');
    const templateId = this.toObjectId(input.templateId, 'Template');
    const templateVersionId = this.toObjectId(input.templateVersionId, 'Template version');
    const probationEndDate = this.parseDate(input.probationEndDate, 'Probation end date');
    const reviewOpenDate = input.reviewOpenDate
      ? this.parseDate(input.reviewOpenDate, 'Review open date')
      : this.subtractDays(probationEndDate, REVIEW_OPEN_OFFSET_DAYS);

    if (manager1Id.equals(manager2Id)) {
      throw new Error('Manager 1 and Manager 2 must be different users.');
    }

    const [employee, manager1, manager2, template, templateVersion] =
      await Promise.all([
        User.findOne({ _id: employeeId, active: true }).select('_id').lean(),
        User.findOne({ _id: manager1Id, active: true }).select('_id').lean(),
        User.findOne({ _id: manager2Id, active: true }).select('_id').lean(),
        PmsTemplate.findOne({ _id: templateId, isDeleted: false }).lean(),
        PmsTemplateVersion.findOne({
          _id: templateVersionId,
          templateId,
          isDeleted: false,
        }).lean(),
      ]);

    if (!employee) throw new Error('Employee is not active or does not exist.');
    if (!manager1) throw new Error('Manager 1 is not active or does not exist.');
    if (!manager2) throw new Error('Manager 2 is not active or does not exist.');
    if (!template) throw new Error('Template does not exist.');
    if (!templateVersion) {
      throw new Error('Template version does not exist for the selected template.');
    }

    const status =
      this.getCurrentDate().getTime() >= reviewOpenDate.getTime()
        ? ProbationReviewStatus.REVIEW_OPEN
        : ProbationReviewStatus.SCHEDULED;

    const assignment = await PmsProbationReviewAssignment.create({
      employeeId,
      probationEndDate,
      reviewOpenDate,
      manager1Id,
      manager2Id,
      templateId,
      templateVersionId,
      status,
      createdBy: actorId,
      updatedBy: actorId,
      auditTrail: [
        {
          action: 'CREATED',
          actorId,
          comment: `Probation review created with ${status} status.`,
          createdAt: this.getCurrentDate(),
        },
      ],
    });

    await PmsTemplateVersion.updateOne(
      { _id: templateVersionId, isLocked: { $ne: true } },
      { $set: { isLocked: true, lockedAt: this.getCurrentDate(), updatedBy: actorId } },
    );

    return this.getAssignment(assignment._id.toString());
  }

  async syncDueProbationReviews(input: SyncDueProbationReviewsInput = {}) {
    this.assertPrivilegedActor('Only admin users can sync probation review windows.');
    const actorId = this.getActorObjectId();
    const asOfDate = input.asOfDate
      ? this.parseDate(input.asOfDate, 'Sync date')
      : this.getCurrentDate();

    const dueAssignments = await PmsProbationReviewAssignment.find({
      status: ProbationReviewStatus.SCHEDULED,
      reviewOpenDate: { $lte: asOfDate },
      isDeleted: false,
    }).select('_id');

    if (dueAssignments.length === 0) {
      return {
        asOfDate,
        openedCount: 0,
        assignmentIds: [],
      };
    }

    const assignmentIds = dueAssignments.map((assignment) => assignment._id);
    await PmsProbationReviewAssignment.updateMany(
      { _id: { $in: assignmentIds } },
      {
        $set: {
          status: ProbationReviewStatus.REVIEW_OPEN,
          updatedBy: actorId,
        },
        $inc: { version: 1 },
        $push: {
          auditTrail: {
            action: 'SYNC_OPENED',
            actorId,
            comment: `Opened by manual sync as of ${asOfDate.toISOString()}.`,
            createdAt: this.getCurrentDate(),
          },
        },
      },
    );

    return {
      asOfDate,
      openedCount: assignmentIds.length,
      assignmentIds: assignmentIds.map((assignmentId) => assignmentId.toString()),
    };
  }

  async openAssignment(id: string, input: OpenProbationReviewInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertPrivilegedActor('Only admin users can manually open probation reviews.');
    if (assignment.status !== ProbationReviewStatus.SCHEDULED) {
      throw new Error('Only scheduled probation reviews can be opened.');
    }

    const asOfDate = input.asOfDate
      ? this.parseDate(input.asOfDate, 'Open date')
      : this.getCurrentDate();

    if (!input.force && asOfDate.getTime() < assignment.reviewOpenDate.getTime()) {
      throw new Error(
        `This probation review opens on ${assignment.reviewOpenDate.toISOString().slice(0, 10)}. Use sync on or after that date.`,
      );
    }

    assignment.status = ProbationReviewStatus.REVIEW_OPEN;
    this.touch(assignment, input.force ? 'FORCE_OPENED' : 'OPENED');
    await assignment.save();
    return this.getAssignment(id);
  }

  async saveManager1Draft(id: string, input: SaveProbationReviewValuesInput) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertManager1Actor(assignment);
    this.ensureManager1CanEdit(assignment.status);
    assignment.reviewValues = this.normalizeValues(input);
    this.touch(assignment, 'MANAGER_1_DRAFT_SAVED');
    await assignment.save();
    return this.getAssignment(id);
  }

  async submitManager1(id: string, input: SaveProbationReviewValuesInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertManager1Actor(assignment);
    this.ensureManager1CanEdit(assignment.status);

    const values = this.normalizeValues(input);
    if (values.length > 0) {
      assignment.reviewValues = values;
    }

    assignment.status = ProbationReviewStatus.MANAGER_1_SUBMITTED;
    assignment.manager1SubmittedAt = this.getCurrentDate();
    assignment.manager1SubmittedBy = this.getActorObjectId();
    assignment.returnReason = undefined;
    assignment.returnedAt = undefined;
    this.touch(assignment, 'MANAGER_1_SUBMITTED');
    await assignment.save();
    return this.getAssignment(id);
  }

  async approveByManager2(id: string, input: ApproveProbationReviewInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertManager2Actor(assignment);
    if (assignment.status !== ProbationReviewStatus.MANAGER_1_SUBMITTED) {
      throw new Error('Manager 2 can approve only after Manager 1 submits the review.');
    }

    assignment.status = ProbationReviewStatus.FINALIZED;
    assignment.manager2ReviewedAt = this.getCurrentDate();
    assignment.manager2ReviewedBy = this.getActorObjectId();
    assignment.finalizedAt = this.getCurrentDate();
    assignment.approvalComments = input.comments?.trim() || undefined;
    this.touch(assignment, 'MANAGER_2_APPROVED');
    await assignment.save();
    return this.getAssignment(id);
  }

  async returnToManager1(id: string, input: ReturnProbationReviewInput) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertManager2Actor(assignment);
    if (assignment.status !== ProbationReviewStatus.MANAGER_1_SUBMITTED) {
      throw new Error('Manager 2 can return only after Manager 1 submits the review.');
    }

    const reason = input.reason?.trim();
    if (!reason) {
      throw new Error('Return reason is required.');
    }

    assignment.status = ProbationReviewStatus.RETURNED_TO_MANAGER_1;
    assignment.returnReason = reason;
    assignment.returnedAt = this.getCurrentDate();
    assignment.manager2ReviewedAt = this.getCurrentDate();
    assignment.manager2ReviewedBy = this.getActorObjectId();
    this.touch(assignment, 'RETURNED_TO_MANAGER_1', reason);
    await assignment.save();
    return this.getAssignment(id);
  }

  async cancelAssignment(id: string, input: CancelProbationReviewInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertPrivilegedActor('Only admin users can cancel probation reviews.');
    if (assignment.status === ProbationReviewStatus.FINALIZED) {
      throw new Error('Finalized probation reviews cannot be cancelled.');
    }

    assignment.status = ProbationReviewStatus.CANCELLED;
    assignment.cancelReason = input.reason?.trim() || undefined;
    assignment.cancelledAt = this.getCurrentDate();
    assignment.cancelledBy = this.getActorObjectId();
    this.touch(assignment, 'CANCELLED', assignment.cancelReason);
    await assignment.save();
    return this.getAssignment(id);
  }

  private async loadMutableAssignment(id: string) {
    const assignment = await PmsProbationReviewAssignment.findOne({
      _id: this.toObjectId(id, 'Probation review assignment'),
      isDeleted: false,
    });

    if (!assignment) {
      throw new Error('Probation review assignment not found.');
    }

    if (assignment.status === ProbationReviewStatus.CANCELLED) {
      throw new Error('Cancelled probation reviews cannot be updated.');
    }

    if (assignment.status === ProbationReviewStatus.FINALIZED) {
      throw new Error('Finalized probation reviews cannot be updated.');
    }

    return assignment;
  }

  private ensureManager1CanEdit(status: ProbationReviewStatus) {
    if (!MUTABLE_MANAGER_1_STATUSES.includes(status)) {
      throw new Error(
        'Manager 1 can edit the review only when the probation review is open or returned.',
      );
    }
  }

  private assertCanViewAssignment(assignment: any) {
    if (this.isPrivilegedActor()) return;
    const actorId = this.requireActorObjectId();
    if (
      this.sameObjectId(actorId, assignment.manager1Id) ||
      this.sameObjectId(actorId, assignment.manager2Id)
    ) {
      return;
    }
    throw new Error('You do not have access to this probation review.');
  }

  private assertManager1Actor(assignment: any) {
    if (this.isPrivilegedActor()) return;
    const actorId = this.requireActorObjectId();
    if (!this.sameObjectId(actorId, assignment.manager1Id)) {
      throw new Error('Only Manager 1 can edit or submit this probation review.');
    }
  }

  private assertManager2Actor(assignment: any) {
    if (this.isPrivilegedActor()) return;
    const actorId = this.requireActorObjectId();
    if (!this.sameObjectId(actorId, assignment.manager2Id)) {
      throw new Error('Only Manager 2 can approve or return this probation review.');
    }
  }

  private assertPrivilegedActor(message: string) {
    if (!this.isPrivilegedActor()) {
      throw new Error(message);
    }
  }

  private normalizeValues(input: SaveProbationReviewValuesInput) {
    const values = input.values ?? input.reviewValues ?? [];
    if (!Array.isArray(values)) {
      throw new Error('Review values must be an array.');
    }

    const actorId = this.getActorObjectId();
    const updatedAt = this.getCurrentDate();

    return values.map((value, index) => {
      if (!value.sectionKey?.trim()) {
        throw new Error(`Review value ${index + 1} is missing section key.`);
      }
      if (!value.fieldKey?.trim()) {
        throw new Error(`Review value ${index + 1} is missing field key.`);
      }

      return {
        sectionKey: value.sectionKey.trim(),
        fieldKey: value.fieldKey.trim(),
        fieldType: value.fieldType?.trim(),
        value: value.value,
        updatedBy: actorId,
        updatedAt,
      };
    });
  }

  private touch(assignment: any, action: string, comment?: string) {
    const actorId = this.getActorObjectId();
    assignment.updatedBy = actorId;
    assignment.version = (assignment.version || 1) + 1;
    assignment.auditTrail.push({
      action,
      actorId,
      comment,
      createdAt: this.getCurrentDate(),
    });
  }

  private getActorObjectId() {
    const actorId = this.context.user?._id;
    if (actorId && Types.ObjectId.isValid(actorId.toString())) {
      return new Types.ObjectId(actorId.toString());
    }
    return undefined;
  }

  private requireActorObjectId() {
    const actorId = this.getActorObjectId();
    if (!actorId) {
      throw new Error('Authenticated user is required.');
    }
    return actorId;
  }

  private isPrivilegedActor() {
    const role = String(this.context.user?.role || this.context.reqRole || '').toLowerCase();
    return role === 'admin' || role === 'management' || role === 'director';
  }

  private sameObjectId(left: Types.ObjectId, right: unknown) {
    const value =
      right && typeof right === 'object' && '_id' in (right as any)
        ? (right as any)._id
        : right;
    return Boolean(value) && left.toString() === value.toString();
  }

  private getCurrentDate() {
    return this.context.pmsCurrentDate ?? new Date();
  }

  private parseDate(value: string | Date, label: string) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new Error(`${label} is invalid.`);
    }
    return date;
  }

  private subtractDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() - days);
    return next;
  }

  private normalizePositiveInteger(value: string | number | undefined, fallback: number) {
    const parsed = Number(value ?? fallback);
    if (!Number.isFinite(parsed) || parsed < 1) return fallback;
    return Math.floor(parsed);
  }

  private toObjectId(value: string, label: string) {
    if (!Types.ObjectId.isValid(value)) {
      throw new Error(`${label} id is invalid.`);
    }
    return new Types.ObjectId(value);
  }
}
