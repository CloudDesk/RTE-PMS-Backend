import { Types } from 'mongoose';
import { BaseService } from './base.service';
import { RequestContext } from '../types/context';
import { PmsTemplate } from '../models/pms-template.model';
import { PmsTemplateVersion } from '../models/pms-template-version.model';
import { User } from '../models/user.model';
import { PmsProbationReviewDraft } from '../models/pms-probation-review-draft.model';
import { emailService } from './email.service';
import {
  IProbationReviewFieldPermission,
  IProbationReviewReviewerConfiguration,
  IProbationReviewValue,
  PmsProbationReviewAssignment,
  ProbationReviewerRole,
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
  joiningDate?: string | Date;
  probationStartDate?: string | Date;
  probationEndDate: string | Date;
  reviewOpenDate?: string | Date;
  reviewOpenOffsetDays?: string | number;
  manager1Id: string;
  manager2Id: string;
  templateId: string;
  templateVersionId: string;
  reviewerConfiguration?: IProbationReviewReviewerConfiguration;
  skipDuplicateCheck?: boolean;
  sourceDraftId?: string;
  allowExistingAssignment?: boolean;
}

export interface BulkCreateProbationReviewInput {
  templateId: string;
  templateVersionId: string;
  sourceDraftId?: string;
  allowExistingAssignment?: boolean;
  assignments: Array<Omit<CreateProbationReviewInput, 'templateId' | 'templateVersionId'> & {
    templateId?: string;
    templateVersionId?: string;
    rowId?: string;
  }>;
}

export interface BulkCreateProbationReviewResult {
  created: unknown[];
  failed: Array<{ rowId?: string; employeeId?: string; message: string }>;
  createdCount: number;
  failedCount: number;
}

export type SaveProbationReviewDraftInput = BulkCreateProbationReviewInput & {
  draftId?: string;
};

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
  assignmentIds?: string[];
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
const MAX_REVIEW_OPEN_OFFSET_DAYS = 365;

const MUTABLE_MANAGER_1_STATUSES: ProbationReviewStatus[] = [
  ProbationReviewStatus.REVIEW_OPEN,
  ProbationReviewStatus.RETURNED_TO_MANAGER_1,
];

const REVIEWER_ROLES: ProbationReviewerRole[] = ['MANAGER_1', 'MANAGER_2'];

export class ProbationReviewService extends BaseService {
  constructor(context: RequestContext) {
    super(context);
  }

  async listAssignments(query: ProbationReviewListQuery = {}) {
    await this.openDueScheduledReviews();
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

    const [rawItems, total] = await Promise.all([
      PmsProbationReviewAssignment.find(filter)
        .populate('employeeId', 'name email employeeCode departmentId designation role specificRole joiningDate probationStartDate probationEndDate probationDate')
        .populate('manager1Id', 'name email employeeCode role specificRole')
        .populate('manager2Id', 'name email employeeCode role specificRole')
        .populate('templateId', 'name code status metadata')
        .populate('templateVersionId')
        .sort({ reviewOpenDate: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      PmsProbationReviewAssignment.countDocuments(filter),
    ]);

    return {
      items: rawItems.map((assignment) => this.applyActorPermissionsToAssignment(assignment)),
      total,
      page,
      limit,
    };
  }

  async getAssignment(id: string) {
    await this.openDueScheduledReviews();
    const assignment = await PmsProbationReviewAssignment.findOne({
      _id: this.toObjectId(id, 'Probation review assignment'),
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode departmentId designation role specificRole joiningDate probationStartDate probationEndDate probationDate')
      .populate('manager1Id', 'name email employeeCode role specificRole')
      .populate('manager2Id', 'name email employeeCode role specificRole')
      .populate('templateId', 'name code status metadata')
      .populate('templateVersionId')
      .lean();

    if (!assignment) {
      throw new Error('Probation review assignment not found.');
    }

    this.assertCanViewAssignment(assignment);

    return this.applyActorPermissionsToAssignment(assignment);
  }

  async createAssignment(input: CreateProbationReviewInput) {
    const actorId = this.getActorObjectId();
    const employeeId = this.toObjectId(input.employeeId, 'Employee');
    const manager1Id = this.toObjectId(input.manager1Id, 'Approver Level One');
    const manager2Id = this.toObjectId(input.manager2Id, 'Approver Level Two');
    const templateId = this.toObjectId(input.templateId, 'Template');
    const templateVersionId = this.toObjectId(input.templateVersionId, 'Template version');
    const probationEndDate = this.parseDate(input.probationEndDate, 'Probation end date');
    const reviewOpenOffsetDays = this.normalizeReviewOpenOffsetDays(input.reviewOpenOffsetDays);
    const reviewOpenDate = input.reviewOpenDate
      ? this.parseDate(input.reviewOpenDate, 'Review open date')
      : this.subtractDays(probationEndDate, reviewOpenOffsetDays);
    if (!input.skipDuplicateCheck) {
      await this.assertEmployeeNotAlreadyInProbationEntry(
        employeeId,
        input.sourceDraftId,
        input.allowExistingAssignment,
      );
    }

    const [employee, manager1, manager2, template, templateVersion] =
      await Promise.all([
        User.findOne({ _id: employeeId, active: true })
          .select('_id name email employeeCode joiningDate probationStartDate probationEndDate probationDate')
          .lean(),
        User.findOne({ _id: manager1Id, active: true }).select('_id name email employeeCode').lean(),
        User.findOne({ _id: manager2Id, active: true }).select('_id name email employeeCode').lean(),
        PmsTemplate.findOne({ _id: templateId, isDeleted: false }).lean(),
        PmsTemplateVersion.findOne({
          _id: templateVersionId,
          templateId,
          isDeleted: false,
        }).lean(),
      ]);

    if (!employee) throw new Error('Employee is not active or does not exist.');
    if (!manager1) throw new Error('Approver Level One is not active or does not exist.');
    if (!manager2) throw new Error('Approver Level Two is not active or does not exist.');
    if (!template) throw new Error('Template does not exist.');
    if (!templateVersion) {
      throw new Error('Template version does not exist for the selected template.');
    }

    const reviewerConfiguration = this.normalizeReviewerConfiguration(
      input.reviewerConfiguration,
      templateVersion,
    );

    const employeeDates = employee as {
      joiningDate?: Date | string;
      probationStartDate?: Date | string;
    };
    const joiningDate = input.joiningDate
      ? this.parseDate(input.joiningDate, 'Joining date')
      : employeeDates.joiningDate
        ? this.parseDate(employeeDates.joiningDate, 'Joining date')
        : undefined;
    const probationStartDate = input.probationStartDate
      ? this.parseDate(input.probationStartDate, 'Probation start date')
      : employeeDates.probationStartDate
        ? this.parseDate(employeeDates.probationStartDate, 'Probation start date')
        : joiningDate;

    if (probationStartDate && probationEndDate.getTime() < probationStartDate.getTime()) {
      throw new Error('Probation end date cannot be before probation start date.');
    }

    const status =
      this.getCurrentDate().getTime() >= reviewOpenDate.getTime()
        ? ProbationReviewStatus.REVIEW_OPEN
        : ProbationReviewStatus.SCHEDULED;

    const assignment = await PmsProbationReviewAssignment.create({
      employeeId,
      joiningDate,
      probationStartDate,
      probationEndDate,
      reviewOpenDate,
      reviewOpenOffsetDays,
      manager1Id,
      manager2Id,
      templateId,
      templateVersionId,
      reviewerConfiguration,
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

    void this.sendAssignmentCreatedEmails({
      employee,
      manager1,
      manager2,
      probationEndDate,
      reviewOpenDate,
      reviewOpenOffsetDays,
      status,
    });

    return this.getAssignment(assignment._id.toString());
  }

  async createAssignmentsBulk(input: BulkCreateProbationReviewInput): Promise<BulkCreateProbationReviewResult> {
    this.assertPrivilegedActor('Only admin users can create probation review assignments.');
    if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
      throw new Error('Add at least one probation review assignment row.');
    }
    if (input.assignments.length > 25) {
      throw new Error('Bulk probation review creation is limited to 25 rows at a time.');
    }
    const seenEmployeeIds = new Set<string>();
    for (const row of input.assignments) {
      const employeeKey = String(row.employeeId || '').trim();
      if (!employeeKey) continue;
      if (seenEmployeeIds.has(employeeKey)) {
        throw new Error('Duplicate employees are not allowed in the same bulk probation review request.');
      }
      seenEmployeeIds.add(employeeKey);
    }
    await this.assertEmployeesNotAlreadyInProbationEntries(
      [...seenEmployeeIds].map((employeeId) => this.toObjectId(employeeId, 'Employee')),
      input.sourceDraftId,
      input.allowExistingAssignment,
    );

    const created: unknown[] = [];
    const failed: BulkCreateProbationReviewResult['failed'] = [];

    for (const row of input.assignments) {
      try {
        const assignment = await this.createAssignment({
          ...row,
          templateId: row.templateId || input.templateId,
          templateVersionId: row.templateVersionId || input.templateVersionId,
          skipDuplicateCheck: true,
          sourceDraftId: input.sourceDraftId,
          allowExistingAssignment: input.allowExistingAssignment,
        });
        created.push(assignment);
      } catch (error) {
        failed.push({
          rowId: row.rowId,
          employeeId: row.employeeId,
          message: error instanceof Error ? error.message : 'Unable to create probation review assignment.',
        });
      }
    }

    return {
      created,
      failed,
      createdCount: created.length,
      failedCount: failed.length,
    };
  }

  async listDrafts() {
    this.assertPrivilegedActor('Only admin users can view probation review drafts.');
    const actorId = this.getActorObjectId();
    return PmsProbationReviewDraft.find({
      isDeleted: false,
      ...(actorId ? { createdBy: actorId } : {}),
    })
      .populate('templateId', 'name code status metadata')
      .populate('templateVersionId', 'versionNo status isLocked')
      .populate('assignments.employeeId', 'name email employeeCode')
      .populate('assignments.manager1Id', 'name email employeeCode')
      .populate('assignments.manager2Id', 'name email employeeCode')
      .sort({ updatedAt: -1 })
      .lean();
  }

  async getDraft(id: string) {
    this.assertPrivilegedActor('Only admin users can view probation review drafts.');
    const draft = await PmsProbationReviewDraft.findOne({
      _id: this.toObjectId(id, 'Probation review draft'),
      isDeleted: false,
    })
      .populate('templateId', 'name code status metadata')
      .populate('templateVersionId')
      .populate('assignments.employeeId', 'name email employeeCode')
      .populate('assignments.manager1Id', 'name email employeeCode')
      .populate('assignments.manager2Id', 'name email employeeCode')
      .lean();

    if (!draft) throw new Error('Probation review draft not found.');
    return draft;
  }

  async saveDraft(input: SaveProbationReviewDraftInput) {
    this.assertPrivilegedActor('Only admin users can save probation review drafts.');
    const actorId = this.getActorObjectId();
    const templateId = this.toObjectId(input.templateId, 'Template');
    const templateVersionId = this.toObjectId(input.templateVersionId, 'Template version');
    if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
      throw new Error('Add at least one row before saving draft.');
    }

    const rows = input.assignments.map((row, index) => ({
      rowId: row.rowId || `row_${index + 1}`,
      employeeId: this.toObjectId(row.employeeId, 'Employee'),
      joiningDate: row.joiningDate ? this.parseDate(row.joiningDate, 'Joining date') : undefined,
      probationStartDate: row.probationStartDate
        ? this.parseDate(row.probationStartDate, 'Probation start date')
        : undefined,
      probationEndDate: this.parseDate(row.probationEndDate, 'Probation end date'),
      reviewOpenOffsetDays: this.normalizeReviewOpenOffsetDays(row.reviewOpenOffsetDays),
      manager1Id: this.toObjectId(row.manager1Id, 'Approver Level One'),
      manager2Id: this.toObjectId(row.manager2Id, 'Approver Level Two'),
      reviewerConfiguration: row.reviewerConfiguration,
    }));

    const duplicateEmployeeIds = new Set<string>();
    for (const row of rows) {
      const employeeKey = row.employeeId.toString();
      if (duplicateEmployeeIds.has(employeeKey)) {
        throw new Error('Duplicate employees are not allowed in the same probation review draft.');
      }
      duplicateEmployeeIds.add(employeeKey);
    }
    await this.assertEmployeesNotAlreadyInProbationEntries(
      rows.map((row) => row.employeeId),
      input.draftId,
      true,
    );

    const draftPayload = {
      templateId,
      templateVersionId,
      assignments: rows,
      updatedBy: actorId,
    };

    const draft = input.draftId
      ? await PmsProbationReviewDraft.findOneAndUpdate(
          {
            _id: this.toObjectId(input.draftId, 'Probation review draft'),
            isDeleted: false,
          },
          { $set: draftPayload },
          { new: true },
        )
      : await PmsProbationReviewDraft.create({
          ...draftPayload,
          createdBy: actorId,
        });

    if (!draft) throw new Error('Probation review draft not found.');

    return this.getDraft(draft._id.toString());
  }

  async deleteDraft(id: string) {
    this.assertPrivilegedActor('Only admin users can discard probation review drafts.');
    const actorId = this.getActorObjectId();
    await PmsProbationReviewDraft.updateOne(
      { _id: this.toObjectId(id, 'Probation review draft'), isDeleted: false },
      { $set: { isDeleted: true, updatedBy: actorId } },
    );
    return { draftId: id };
  }

  async assignDraft(id: string) {
    this.assertPrivilegedActor('Only admin users can assign probation review drafts.');
    const draft = await PmsProbationReviewDraft.findOne({
      _id: this.toObjectId(id, 'Probation review draft'),
      isDeleted: false,
    }).lean();
    if (!draft) throw new Error('Probation review draft not found.');
    const draftRecord = draft as any;

    const result = await this.createAssignmentsBulk({
      templateId: draftRecord.templateId.toString(),
      templateVersionId: draftRecord.templateVersionId.toString(),
      sourceDraftId: id,
      assignments: draftRecord.assignments.map((row: any) => ({
        rowId: row.rowId,
        employeeId: row.employeeId.toString(),
        joiningDate: row.joiningDate,
        probationStartDate: row.probationStartDate,
        probationEndDate: row.probationEndDate,
        reviewOpenOffsetDays: row.reviewOpenOffsetDays,
        manager1Id: row.manager1Id.toString(),
        manager2Id: row.manager2Id.toString(),
        reviewerConfiguration: row.reviewerConfiguration,
      })),
    });

    if (result.failedCount === 0) {
      await this.deleteDraft(id);
    }
    return result;
  }

  async syncDueProbationReviews(input: SyncDueProbationReviewsInput = {}) {
    this.assertPrivilegedActor('Only admin users can sync probation review windows.');
    const asOfDate = input.asOfDate
      ? this.parseDate(input.asOfDate, 'Sync date')
      : this.getCurrentDate();
    return this.openDueScheduledReviews(asOfDate, 'SYNC_OPENED', input.assignmentIds, Boolean(input.assignmentIds?.length));
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
    assignment.openedAt = asOfDate;
    this.touch(assignment, input.force ? 'FORCE_OPENED' : 'OPENED');
    await assignment.save();
    void this.sendReviewOpenedEmailsByAssignmentIds([assignment._id]);
    return this.getAssignment(id);
  }

  async saveManager1Draft(id: string, input: SaveProbationReviewValuesInput) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertFillingManagerActor(assignment);
    this.ensureManager1CanEdit(assignment.status);
    assignment.reviewValues = this.mergePermittedValues(
      assignment.reviewValues,
      this.normalizeValues(input),
      assignment,
      this.fillingManagerRole(assignment),
    );
    this.touch(assignment, 'MANAGER_1_DRAFT_SAVED');
    await assignment.save();
    return this.getAssignment(id);
  }

  async submitManager1(id: string, input: SaveProbationReviewValuesInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertFillingManagerActor(assignment);
    this.ensureManager1CanEdit(assignment.status);

    const values = this.normalizeValues(input);
    if (values.length > 0) {
      assignment.reviewValues = this.mergePermittedValues(
        assignment.reviewValues,
        values,
        assignment,
        this.fillingManagerRole(assignment),
      );
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
    this.assertApprovingManagerActor(assignment);
    if (assignment.status !== ProbationReviewStatus.MANAGER_1_SUBMITTED) {
      throw new Error('Approver Level Two can approve only after Approver Level One submits the review.');
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
    this.assertApprovingManagerActor(assignment);
    if (assignment.status !== ProbationReviewStatus.MANAGER_1_SUBMITTED) {
      throw new Error('Approver Level Two can return only after Approver Level One submits the review.');
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
    if (assignment.status !== ProbationReviewStatus.SCHEDULED) {
      throw new Error('Only scheduled probation reviews can be cancelled before they are opened.');
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
        'Approver Level One can edit the review only when the probation review is open or returned.',
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

  private assertFillingManagerActor(assignment: any) {
    if (this.isPrivilegedActor()) return;
    const actorId = this.requireActorObjectId();
    const expectedManagerId =
      this.fillingManagerRole(assignment) === 'MANAGER_2'
        ? assignment.manager2Id
        : assignment.manager1Id;
    if (!this.sameObjectId(actorId, expectedManagerId)) {
      throw new Error('Only the configured filling manager can edit or submit this probation review.');
    }
  }

  private assertApprovingManagerActor(assignment: any) {
    if (this.isPrivilegedActor()) return;
    const actorId = this.requireActorObjectId();
    const expectedManagerId =
      this.approvingManagerRole(assignment) === 'MANAGER_1'
        ? assignment.manager1Id
        : assignment.manager2Id;
    if (!this.sameObjectId(actorId, expectedManagerId)) {
      throw new Error('Only the configured approving manager can approve or return this probation review.');
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

  private normalizeReviewerConfiguration(
    input: IProbationReviewReviewerConfiguration | undefined,
    templateVersion: Record<string, any>,
  ): IProbationReviewReviewerConfiguration {
    const fillingManagerRole = this.normalizeReviewerRole(
      input?.fillingManagerRole,
      'MANAGER_1',
    );
    const approvingManagerRole = this.normalizeReviewerRole(
      input?.approvingManagerRole,
      'MANAGER_2',
    );
    const requestedPermissions = new Map<string, IProbationReviewFieldPermission>();
    for (const permission of input?.permissions ?? []) {
      if (!permission?.sectionKey || !permission?.fieldKey) continue;
      requestedPermissions.set(
        this.permissionKey(permission.sectionKey, permission.fieldKey),
        permission,
      );
    }

    const permissions: IProbationReviewFieldPermission[] = [];
    for (const section of templateVersion.sections ?? []) {
      const sectionKey = String(section.sectionKey || section.key || section.id || '').trim();
      if (!sectionKey) continue;
      const sectionLabel = String(
        section.sectionLabel || section.label || section.title || sectionKey,
      );
      if (!this.isPerformanceAssessmentSection(sectionKey, sectionLabel)) continue;

      for (const field of section.fields ?? []) {
        const fieldKey = String(field.fieldKey || field.key || field.id || '').trim();
        if (!fieldKey) continue;

        const fieldType = String(field.fieldType || field.type || '');
        const fieldLabel = String(field.fieldLabel || field.label || fieldKey);
        const manager1Default: any = {
          visible: true,
          editable: fillingManagerRole === 'MANAGER_1',
          mandatory: Boolean(field.isRequired ?? field.required),
        };
        const manager2Default: any = {
          visible: true,
          editable: fillingManagerRole === 'MANAGER_2',
          mandatory: false,
        };

        const templateVisible = this.templateFieldVisibleToManager(field);
        const templateEditable = templateVisible && this.templateFieldEditableByManager(field);

        if (fieldType === 'data_grid' && Array.isArray(field.gridConfig?.defaultRows)) {
          for (const [rowIndex, row] of field.gridConfig.defaultRows.entries()) {
            const rowKey = this.gridRowKey(row, rowIndex);
            const rowPermissionKey = this.gridRowPermissionKey(fieldKey, rowKey);
            const requested = requestedPermissions.get(this.permissionKey(sectionKey, rowPermissionKey));
            permissions.push({
              sectionKey,
              sectionLabel,
              fieldKey: rowPermissionKey,
              parentFieldKey: fieldKey,
              isGridRow: true,
              gridRowKey: rowKey,
              fieldLabel: `${fieldLabel} / ${this.gridRowLabel(row, rowIndex)}`,
              fieldType: 'data_grid_row',
              manager1: this.clampAccessRule(
                requested?.manager1,
                manager1Default,
                templateVisible,
                templateEditable,
              ),
              manager2: this.clampAccessRule(
                requested?.manager2,
                manager2Default,
                templateVisible,
                templateEditable,
              ),
            });
          }
          continue;
        }

        const requested = requestedPermissions.get(this.permissionKey(sectionKey, fieldKey));
        permissions.push({
          sectionKey,
          sectionLabel,
          fieldKey,
          fieldLabel,
          fieldType,
          manager1: this.clampAccessRule(
            requested?.manager1,
            manager1Default,
            templateVisible,
            templateEditable,
          ),
          manager2: this.clampAccessRule(
            requested?.manager2,
            manager2Default,
            templateVisible,
            templateEditable,
          ),
        });
      }
    }

    return { fillingManagerRole, approvingManagerRole, permissions };
  }

  private normalizeReviewerRole(
    value: unknown,
    fallback: ProbationReviewerRole,
  ): ProbationReviewerRole {
    return REVIEWER_ROLES.includes(value as ProbationReviewerRole)
      ? (value as ProbationReviewerRole)
      : fallback;
  }

  private normalizeReviewOpenOffsetDays(value: unknown) {
    if (value === undefined || value === null || value === '') return REVIEW_OPEN_OFFSET_DAYS;
    const days = Number(value);
    if (!Number.isInteger(days) || days < 0 || days > MAX_REVIEW_OPEN_OFFSET_DAYS) {
      throw new Error(
        `Review open days must be a whole number between 0 and ${MAX_REVIEW_OPEN_OFFSET_DAYS}.`,
      );
    }
    return days;
  }

  private async openDueScheduledReviews(
    asOfDate: Date = this.getCurrentDate(),
    action: 'AUTO_OPENED_ON_READ' | 'SYNC_OPENED' = 'AUTO_OPENED_ON_READ',
    assignmentIds?: string[],
    overrideSelectedOpenDate = false,
  ) {
    const actorId = this.getActorObjectId();
    const filter: Record<string, unknown> = {
      status: ProbationReviewStatus.SCHEDULED,
      isDeleted: false,
    };
    if (!overrideSelectedOpenDate) {
      filter.reviewOpenDate = { $lte: asOfDate };
    }
    if (assignmentIds?.length) {
      filter._id = {
        $in: assignmentIds.map((id) => this.toObjectId(id, 'Probation review assignment')),
      };
    }
    const dueAssignments = await PmsProbationReviewAssignment.find(filter).select('_id');

    const openedAssignmentIds: Types.ObjectId[] = [];
    const createdAt = this.getCurrentDate();
    const comment =
      action === 'SYNC_OPENED'
        ? overrideSelectedOpenDate
          ? `Opened by manual sync using selected sync date ${asOfDate.toISOString()}.`
          : `Opened by manual sync as of ${asOfDate.toISOString()}.`
        : `Opened automatically during assignment fetch as of ${asOfDate.toISOString()}.`;

    for (const assignment of dueAssignments) {
      const result = await PmsProbationReviewAssignment.updateOne(
        {
          _id: assignment._id,
          status: ProbationReviewStatus.SCHEDULED,
          isDeleted: false,
        },
        {
          $set: {
            status: ProbationReviewStatus.REVIEW_OPEN,
            openedAt: asOfDate,
            updatedBy: actorId,
          },
          $inc: { version: 1 },
          $push: {
            auditTrail: {
              action,
              actorId,
              comment,
              createdAt,
            },
          },
        },
      );
      if (result.modifiedCount > 0) {
        openedAssignmentIds.push(assignment._id);
      }
    }

    if (openedAssignmentIds.length > 0) {
      void this.sendReviewOpenedEmailsByAssignmentIds(openedAssignmentIds);
    }

    return {
      asOfDate,
      openedCount: openedAssignmentIds.length,
      assignmentIds: openedAssignmentIds.map((assignmentId) => assignmentId.toString()),
    };
  }

  private async assertEmployeeNotAlreadyInProbationEntry(
    employeeId: Types.ObjectId,
    excludeDraftId?: string,
    allowExistingAssignment = false,
  ) {
    await this.assertEmployeesNotAlreadyInProbationEntries(
      [employeeId],
      excludeDraftId,
      allowExistingAssignment,
    );
  }

  private async assertEmployeesNotAlreadyInProbationEntries(
    employeeIds: Types.ObjectId[],
    excludeDraftId?: string,
    allowExistingAssignment = false,
  ) {
    if (employeeIds.length === 0) return;
    const uniqueEmployeeIds = [...new Map(employeeIds.map((id) => [id.toString(), id])).values()];
    if (!allowExistingAssignment) {
      const activeAssignment = await PmsProbationReviewAssignment.findOne({
        employeeId: { $in: uniqueEmployeeIds },
        isDeleted: false,
        status: { $ne: ProbationReviewStatus.CANCELLED },
      })
        .populate('employeeId', 'name employeeCode')
        .select('employeeId')
        .lean();
      if (activeAssignment) {
        throw new Error(
          `${this.userName((activeAssignment as any).employeeId, 'This employee')} already has a probation review assignment.`,
        );
      }
    }

    const draftFilter: Record<string, unknown> = {
      'assignments.employeeId': { $in: uniqueEmployeeIds },
      isDeleted: false,
    };
    if (excludeDraftId) {
      draftFilter._id = { $ne: this.toObjectId(excludeDraftId, 'Probation review draft') };
    }
    const activeDraft = await PmsProbationReviewDraft.findOne(draftFilter)
      .populate('assignments.employeeId', 'name employeeCode')
      .select('assignments.employeeId')
      .lean();
    if (activeDraft) {
      const duplicateRow = (activeDraft as any).assignments?.find((row: any) =>
        uniqueEmployeeIds.some((id) => this.sameObjectId(id, row.employeeId)),
      );
      throw new Error(
        `${this.userName(duplicateRow?.employeeId, 'This employee')} already exists in another probation review draft.`,
      );
    }
  }

  private clampAccessRule(
    requested: any,
    fallback: IProbationReviewFieldPermission['manager1'],
    templateVisible: boolean,
    templateEditable: boolean,
  ) {
    const visible = templateVisible && Boolean(requested?.visible ?? fallback.visible);
    return {
      visible,
      editable: visible && templateEditable && Boolean(requested?.editable ?? fallback.editable),
      mandatory: visible && Boolean(requested?.mandatory ?? fallback.mandatory),
    };
  }

  private templateFieldVisibleToManager(field: any) {
    if (field.visible === false || field.metadata?.hidden === true) return false;
    const hiddenFrom = this.stringArray(field.visibilityRules?.hiddenFrom).map((role) =>
      this.normalizeRoleCode(role),
    );
    if (hiddenFrom.includes('MANAGER')) return false;

    const visibleTo = this.stringArray(field.visibilityRules?.visibleTo).map((role) =>
      this.normalizeRoleCode(role),
    );
    return visibleTo.length === 0 || visibleTo.includes('MANAGER');
  }

  private templateFieldEditableByManager(field: any) {
    if (field.editable === false || field.metadata?.readOnly === true) return false;
    const editableBy = this.stringArray(field.editabilityRules?.editableBy).map((role) =>
      this.normalizeRoleCode(role),
    );
    return editableBy.length === 0 || editableBy.includes('MANAGER');
  }

  private mergePermittedValues(
    currentValues: IProbationReviewValue[] = [],
    requestedValues: IProbationReviewValue[],
    assignment: any,
    role: ProbationReviewerRole,
  ) {
    if (!assignment.reviewerConfiguration) return requestedValues;
    const permissionMap = this.editablePermissionMap(assignment.reviewerConfiguration, role);

    const merged = new Map<string, IProbationReviewValue>();
    for (const value of currentValues) {
      merged.set(this.permissionKey(value.sectionKey, value.fieldKey), value);
    }
    for (const value of requestedValues) {
      const key = this.permissionKey(value.sectionKey, value.fieldKey);
      const editableGridRowKeys = this.editableGridRowKeys(
        assignment.reviewerConfiguration,
        role,
        value.sectionKey,
        value.fieldKey,
      );
      if (editableGridRowKeys.size > 0) {
        const currentValue = merged.get(key);
        merged.set(key, {
          ...value,
          value: this.mergeGridRowsByAllowedRows(
            currentValue?.value,
            value.value,
            editableGridRowKeys,
          ),
        });
        continue;
      }
      if (!permissionMap.has(key)) {
        throw new Error(`You cannot edit ${value.fieldKey} in this probation review.`);
      }
      merged.set(key, value);
    }
    return [...merged.values()];
  }

  private applyActorPermissionsToAssignment(assignment: any) {
    if (this.isPrivilegedActor()) return assignment;
    const reviewerRole = this.actorReviewerRole(assignment);
    if (!reviewerRole || !assignment?.reviewerConfiguration?.permissions) return assignment;

    const permissionMap = new Map<string, IProbationReviewFieldPermission>();
    for (const permission of assignment.reviewerConfiguration.permissions) {
      permissionMap.set(this.permissionKey(permission.sectionKey, permission.fieldKey), permission);
    }

    const templateVersion = assignment.templateVersionId;
    if (!templateVersion || typeof templateVersion === 'string') return assignment;

    const sections = (templateVersion.sections ?? [])
      .map((section: any) => {
        const sectionKey = String(section.sectionKey || section.key || section.id || '');
        const fields = (section.fields ?? [])
          .map((field: any) => {
            const fieldKey = String(field.fieldKey || field.key || field.id || '');
            if (String(field.fieldType || field.type || '') === 'data_grid' && Array.isArray(field.gridConfig?.defaultRows)) {
              const visibleRows = field.gridConfig.defaultRows
                .map((row: any, rowIndex: number) => {
                  const rowKey = this.gridRowKey(row, rowIndex);
                  const permission = permissionMap.get(
                    this.permissionKey(sectionKey, this.gridRowPermissionKey(fieldKey, rowKey)),
                  );
                  const access = reviewerRole === 'MANAGER_1' ? permission?.manager1 : permission?.manager2;
                  return access?.visible ? { row, access } : null;
                })
                .filter(Boolean) as Array<{ row: any; access: IProbationReviewFieldPermission['manager1'] }>;
              if (visibleRows.length === 0) return null;
              return {
                ...field,
                visible: true,
                editable: visibleRows.some((item) => item.access.editable === true),
                required: visibleRows.some((item) => item.access.mandatory === true),
                gridConfig: {
                  ...field.gridConfig,
                  defaultRows: visibleRows.map((item) => item.row),
                  minRows: visibleRows.length,
                  maxRows: visibleRows.length,
                  allowAddRows: false,
                  allowDeleteRows: false,
                },
              };
            }

            const permission = permissionMap.get(this.permissionKey(sectionKey, fieldKey));
            const access = reviewerRole === 'MANAGER_1' ? permission?.manager1 : permission?.manager2;
            if (!access?.visible) return null;
            return {
              ...field,
              visible: true,
              editable: access.editable === true,
              required: access.mandatory ?? field.isRequired ?? field.required,
            };
          })
          .filter(Boolean);
        return fields.length > 0 ? { ...section, fields } : null;
      })
      .filter(Boolean);

    return {
      ...assignment,
      templateVersionId: {
        ...templateVersion,
        sections,
      },
    };
  }

  private actorReviewerRole(assignment: any): ProbationReviewerRole | null {
    const actorId = this.getActorObjectId();
    if (!actorId) return null;
    if (this.sameObjectId(actorId, assignment.manager1Id)) return 'MANAGER_1';
    if (this.sameObjectId(actorId, assignment.manager2Id)) return 'MANAGER_2';
    return null;
  }

  private fillingManagerRole(assignment: any): ProbationReviewerRole {
    return this.normalizeReviewerRole(
      assignment.reviewerConfiguration?.fillingManagerRole,
      'MANAGER_1',
    );
  }

  private approvingManagerRole(assignment: any): ProbationReviewerRole {
    return this.normalizeReviewerRole(
      assignment.reviewerConfiguration?.approvingManagerRole,
      'MANAGER_2',
    );
  }

  private editablePermissionMap(
    reviewerConfiguration: IProbationReviewReviewerConfiguration | undefined,
    role: ProbationReviewerRole,
  ) {
    const editable = new Map<string, true>();
    for (const permission of reviewerConfiguration?.permissions ?? []) {
      const access = role === 'MANAGER_1' ? permission.manager1 : permission.manager2;
      if (access?.visible && access?.editable) {
        editable.set(this.permissionKey(permission.sectionKey, permission.fieldKey), true);
      }
    }
    return editable;
  }

  private editableGridRowKeys(
    reviewerConfiguration: IProbationReviewReviewerConfiguration | undefined,
    role: ProbationReviewerRole,
    sectionKey: string,
    parentFieldKey: string,
  ) {
    const editable = new Set<string>();
    for (const permission of reviewerConfiguration?.permissions ?? []) {
      if (!permission.isGridRow || permission.sectionKey !== sectionKey) continue;
      if (permission.parentFieldKey !== parentFieldKey) continue;
      const access = role === 'MANAGER_1' ? permission.manager1 : permission.manager2;
      if (access?.visible && access?.editable) {
        editable.add(permission.gridRowKey || this.gridRowKeyFromPermission(permission.fieldKey, parentFieldKey));
      }
    }
    return editable;
  }

  private mergeGridRowsByAllowedRows(
    currentValue: unknown,
    requestedValue: unknown,
    allowedRowKeys: Set<string>,
  ) {
    const currentRows = Array.isArray(currentValue) ? currentValue : [];
    const requestedRows = Array.isArray(requestedValue) ? requestedValue : [];
    const currentByRowKey = new Map<string, Record<string, unknown>>();
    currentRows.forEach((row, index) => {
      if (row && typeof row === 'object') {
        currentByRowKey.set(this.gridRowKey(row, index), row as Record<string, unknown>);
      }
    });

    requestedRows.forEach((requestedRow, index) => {
      const incomingRow =
        requestedRow && typeof requestedRow === 'object'
          ? (requestedRow as Record<string, unknown>)
          : {};
      const rowKey = this.gridRowKey(incomingRow, index);
      if (!allowedRowKeys.has(rowKey)) {
        throw new Error('You cannot edit one or more performance assessment rows in this probation review.');
      }
      currentByRowKey.set(rowKey, {
        ...(currentByRowKey.get(rowKey) || {}),
        ...incomingRow,
      });
    });

    return [...currentByRowKey.values()];
  }

  private permissionKey(sectionKey: string, fieldKey: string) {
    return `${sectionKey}::${fieldKey}`;
  }

  private gridRowPermissionKey(fieldKey: string, rowKey: string) {
    return `${fieldKey}.__row.${rowKey}`;
  }

  private gridRowKeyFromPermission(permissionFieldKey: string, parentFieldKey: string) {
    const prefix = `${parentFieldKey}.__row.`;
    return permissionFieldKey.startsWith(prefix)
      ? permissionFieldKey.slice(prefix.length)
      : permissionFieldKey;
  }

  private gridRowKey(row: unknown, index: number) {
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const explicitKey =
      record.rowKey ??
      record.key ??
      record.id ??
      record.sNo ??
      record.s_no ??
      record.serialNo ??
      record['S.NO'] ??
      record['S.No'];
    if (explicitKey !== undefined && explicitKey !== null && String(explicitKey).trim()) {
      return String(explicitKey).trim();
    }
    return `row_${index + 1}`;
  }

  private gridRowLabel(row: unknown, index: number) {
    const record = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const preferred =
      record.rating_performance ??
      record.ratingPerformance ??
      record.performance ??
      record.reviewPoint ??
      record.label ??
      record.name ??
      record.title;
    if (preferred !== undefined && preferred !== null && String(preferred).trim()) {
      return String(preferred).trim();
    }
    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = key.replace(/[\s._-]/g, '').toLowerCase();
      if (['sno', 'serialno', 'feedback', 'comments'].includes(normalizedKey)) continue;
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim();
      }
    }
    return `Row ${index + 1}`;
  }

  private isPerformanceAssessmentSection(sectionKey: string, sectionLabel: string) {
    const normalized = `${sectionKey} ${sectionLabel}`.replace(/[_-]/g, ' ').toLowerCase();
    return normalized.includes('performance assessment');
  }

  private stringArray(value: unknown) {
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
  }

  private normalizeRoleCode(role: string) {
    return role.replace(/[ /-]/g, '_').toUpperCase();
  }

  private async sendAssignmentCreatedEmails(input: {
    employee: any;
    manager1: any;
    manager2: any;
    probationEndDate: Date;
    reviewOpenDate: Date;
    reviewOpenOffsetDays: number;
    status: ProbationReviewStatus;
  }) {
    const employeeName = this.userName(input.employee, 'Employee');
    const reviewOpenDate = this.formatNotificationDate(input.reviewOpenDate);
    const probationEndDate = this.formatNotificationDate(input.probationEndDate);
    const statusText =
      input.status === ProbationReviewStatus.REVIEW_OPEN
        ? 'The review is open now.'
        : `The form will be opened from ${reviewOpenDate}.`;
    const formAvailabilityText =
      input.status === ProbationReviewStatus.REVIEW_OPEN
        ? `The form is available from ${reviewOpenDate}.`
        : `The form will be opened from ${reviewOpenDate}.`;

    const sendToManager = async (manager: any, roleLabel: string) => {
      const managerName = this.userName(manager, roleLabel);
      await this.sendBestEffortEmail(
        manager?.email,
        'Probation Review Assignment Created',
        `Hello ${managerName},

A probation review assignment has been created for ${employeeName}.

Your role: ${roleLabel}
Review opens: ${reviewOpenDate}
Probation end date: ${probationEndDate}
Form availability: ${formAvailabilityText}

${statusText}`,
        `<p>Hello ${this.escapeHtml(managerName)},</p>
<p>A probation review assignment has been created for <strong>${this.escapeHtml(employeeName)}</strong>.</p>
<p><strong>Your role:</strong> ${this.escapeHtml(roleLabel)}<br/>
<strong>Review opens:</strong> ${this.escapeHtml(reviewOpenDate)}<br/>
<strong>Probation end date:</strong> ${this.escapeHtml(probationEndDate)}<br/>
<strong>Form availability:</strong> ${this.escapeHtml(formAvailabilityText)}</p>
<p>${this.escapeHtml(statusText)}</p>`,
      );
    };

    await Promise.all([
      sendToManager(input.manager1, 'Approver Level One'),
      sendToManager(input.manager2, 'Approver Level Two'),
    ]);
  }

  private async sendReviewOpenedEmailsByAssignmentIds(assignmentIds: unknown[]) {
    const assignments = await PmsProbationReviewAssignment.find({
      _id: { $in: assignmentIds },
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode')
      .populate('manager1Id', 'name email employeeCode')
      .populate('manager2Id', 'name email employeeCode')
      .lean();

    await Promise.all(
      assignments.flatMap((assignment: any) => {
        const employeeName = this.userName(assignment.employeeId, 'Employee');
        const reviewOpenDate = this.formatNotificationDate(assignment.reviewOpenDate);
        const probationEndDate = this.formatNotificationDate(assignment.probationEndDate);
        const sendToManager = (manager: any, roleLabel: string) => {
          const managerName = this.userName(manager, roleLabel);
          return this.sendBestEffortEmail(
            manager?.email,
            'Probation Review Opened',
            `Hello ${managerName},

The probation review for ${employeeName} is now open.

Your role: ${roleLabel}
Review open date: ${reviewOpenDate}
Probation end date: ${probationEndDate}`,
            `<p>Hello ${this.escapeHtml(managerName)},</p>
<p>The probation review for <strong>${this.escapeHtml(employeeName)}</strong> is now open.</p>
<p><strong>Your role:</strong> ${this.escapeHtml(roleLabel)}<br/>
<strong>Review open date:</strong> ${this.escapeHtml(reviewOpenDate)}<br/>
<strong>Probation end date:</strong> ${this.escapeHtml(probationEndDate)}</p>`,
          );
        };

        return [
          sendToManager(assignment.manager1Id, 'Approver Level One'),
          sendToManager(assignment.manager2Id, 'Approver Level Two'),
        ];
      }),
    );
  }

  private async sendBestEffortEmail(
    to: string | undefined,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    if (!to) return;
    try {
      await emailService.sendEmail({ body: { to, subject, text, html } });
    } catch (error) {
      console.warn('Probation review email notification failed:', error);
    }
  }

  private userName(user: any, fallback: string): string {
    return user?.name || user?.employeeCode || user?.email || fallback;
  }

  private formatNotificationDate(value: Date): string {
    return value.toLocaleDateString('en-GB');
  }

  private escapeHtml(value: string): string {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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
