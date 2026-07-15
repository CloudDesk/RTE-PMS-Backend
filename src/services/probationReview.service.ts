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

export interface ProbationReviewHistoryQuery {
  page?: string | number;
  limit?: string | number;
  action?: string;
  status?: string;
  search?: string;
  dateFrom?: string | Date;
  dateTo?: string | Date;
}

export interface ProbationReviewHistoryEntry {
  id: string;
  assignmentId: string;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
  department?: string;
  action: string;
  actorId?: string;
  actorName: string;
  actorRole?: string;
  filledByName: string;
  approvedByName: string;
  finalizedByName: string;
  status: string;
  comment?: string;
  createdAt: Date;
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
  reason?: string;
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
  values?: IProbationReviewValue[];
  reviewValues?: IProbationReviewValue[];
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

const APPROVER_ACTION_STATUSES: ProbationReviewStatus[] = [
  ProbationReviewStatus.MANAGER_1_SUBMITTED,
  ProbationReviewStatus.DELEGATED_TO_APPROVER,
  ProbationReviewStatus.APPROVAL_REASSIGNED,
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
        .populate('manager2ReviewedBy', 'name email employeeCode role specificRole')
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

  async listHistory(query: ProbationReviewHistoryQuery = {}) {
    const page = this.normalizePositiveInteger(query.page, 1);
    const limit = Math.min(this.normalizePositiveInteger(query.limit, 20), 100);
    const assignmentFilter: Record<string, unknown> = { isDeleted: false };

    if (!this.isPrivilegedActor()) {
      const actorId = this.requireActorObjectId();
      assignmentFilter.$or = [{ manager1Id: actorId }, { manager2Id: actorId }];
    }

    const assignments = await PmsProbationReviewAssignment.find(assignmentFilter)
      .select('_id employeeId manager1Id manager2Id manager1SubmittedBy manager1SubmittedAt manager2ReviewedBy finalizedAt reviewerConfiguration auditTrail')
      .populate('employeeId', 'name email employeeCode departmentId department')
      .populate('manager1Id', 'name email employeeCode')
      .populate('manager2Id', 'name email employeeCode')
      .populate('manager1SubmittedBy', 'name email employeeCode role specificRole')
      .populate('manager2ReviewedBy', 'name email employeeCode role specificRole')
      .lean();

    const actorIds = Array.from(new Set(
      assignments.flatMap((assignment: any) =>
        (assignment.auditTrail || [])
          .map((entry: any) => entry.actorId?.toString?.() || '')
          .filter((value: string) => value && Types.ObjectId.isValid(value)),
      ),
    ));
    const actors = actorIds.length > 0
      ? await User.find({ _id: { $in: actorIds } })
        .select('name email employeeCode role specificRole')
        .lean()
      : [];
    const actorMap = new Map(actors.map((actor: any) => [actor._id.toString(), actor]));
    const normalizedAction = query.action?.trim().toUpperCase();
    const normalizedStatus = query.status?.trim().toUpperCase();
    const normalizedSearch = query.search?.trim().toLowerCase();
    const dateFrom = query.dateFrom ? this.parseDate(query.dateFrom, 'From date') : undefined;
    const dateTo = query.dateTo ? this.parseDate(query.dateTo, 'To date') : undefined;
    if (dateTo) dateTo.setHours(23, 59, 59, 999);

    const entries: ProbationReviewHistoryEntry[] = assignments.flatMap((assignment: any) => {
      const employee = assignment.employeeId || {};
      const employeeId = employee._id?.toString?.() || employee.toString?.() || '';
      const employeeName = employee.name || employee.employeeCode || employee.email || 'Unknown employee';
      const personName = (person: any) =>
        person?.name || person?.employeeCode || person?.email || person?.toString?.() || '-';
      const submissionEntry = [...(assignment.auditTrail || [])]
        .reverse()
        .find((entry: any) => String(entry.action || '').toUpperCase() === 'MANAGER_1_SUBMITTED');
      const submissionActorId = submissionEntry?.actorId?.toString?.() || '';
      const submissionActor = submissionActorId ? actorMap.get(submissionActorId) : undefined;
      const recordedFiller = submissionActor || assignment.manager1SubmittedBy;
      const recordedFillerId = recordedFiller?._id?.toString?.() || recordedFiller?.toString?.() || '';
      const matchingFillingManager = [assignment.manager1Id, assignment.manager2Id].find((manager: any) =>
        (manager?._id?.toString?.() || manager?.toString?.() || '') === recordedFillerId,
      );
      const filledByName = personName(matchingFillingManager || recordedFiller);
      const finalizationEntry = [...(assignment.auditTrail || [])]
        .reverse()
        .find((entry: any) => String(entry.action || '').toUpperCase() === 'MANAGER_2_APPROVED');
      const finalizationActorId = finalizationEntry?.actorId?.toString?.() || '';
      const finalizationActor = finalizationActorId ? actorMap.get(finalizationActorId) : undefined;
      const recordedFinalizer = finalizationActor || (assignment.finalizedAt ? assignment.manager2ReviewedBy : undefined);
      const recordedFinalizerId = recordedFinalizer?._id?.toString?.() || recordedFinalizer?.toString?.() || '';
      const matchingManager = [assignment.manager1Id, assignment.manager2Id].find((manager: any) =>
        (manager?._id?.toString?.() || manager?.toString?.() || '') === recordedFinalizerId,
      );
      const finalizedByName = personName(matchingManager || recordedFinalizer);
      return (assignment.auditTrail || []).map((entry: any, index: number) => {
        const actorId = entry.actorId?.toString?.() || '';
        const actor = actorMap.get(actorId) as any;
        return {
          id: `${assignment._id.toString()}:${index}:${new Date(entry.createdAt).getTime()}`,
          assignmentId: assignment._id.toString(),
          employeeId,
          employeeName,
          employeeCode: employee.employeeCode,
          department: employee.departmentId || employee.department,
          action: String(entry.action || 'UNKNOWN'),
          actorId: actorId || undefined,
          actorName: actor?.name || actor?.employeeCode || actor?.email || actorId || 'System',
          actorRole: actor?.role || actor?.specificRole,
          filledByName,
          approvedByName: finalizedByName,
          finalizedByName,
          status: this.historyStatusForAction(String(entry.action || 'UNKNOWN')),
          comment: entry.comment,
          createdAt: new Date(entry.createdAt),
        };
      });
    }).filter((entry) => {
      if (normalizedAction && entry.action.toUpperCase() !== normalizedAction) return false;
      if (normalizedStatus && entry.status !== normalizedStatus) return false;
      if (dateFrom && entry.createdAt < dateFrom) return false;
      if (dateTo && entry.createdAt > dateTo) return false;
      if (normalizedSearch) {
        const searchable = [
          entry.employeeName,
          entry.employeeCode,
          entry.action,
          entry.status,
          entry.actorName,
          entry.filledByName,
          entry.approvedByName,
          entry.finalizedByName,
          entry.comment,
        ].filter(Boolean).join(' ').toLowerCase();
        if (!searchable.includes(normalizedSearch)) return false;
      }
      return true;
    }).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());

    const start = (page - 1) * limit;
    return {
      items: entries.slice(start, start + limit),
      total: entries.length,
      page,
      limit,
    };
  }

  private historyStatusForAction(action: string): string {
    const normalized = action.toUpperCase();
    if (normalized === 'CREATED') return 'SCHEDULED';
    if (['OPENED', 'FORCE_OPENED', 'AUTO_OPENED_ON_READ', 'SYNC_OPENED'].includes(normalized)) return 'OPENED';
    if (normalized === 'MANAGER_1_DRAFT_SAVED') return 'DRAFTED';
    if (normalized === 'MANAGER_1_SUBMITTED') return 'SUBMITTED';
    if (normalized === 'DELEGATED_TO_MANAGER_2') return 'FORWARDED';
    if (normalized === 'RETURNED_TO_MANAGER_1') return 'RETURNED';
    if (normalized === 'APPROVAL_REASSIGNED_TO_MANAGER_1') return 'REASSIGNED';
    if (normalized === 'MANAGER_2_APPROVED') return 'FINALIZED';
    if (normalized === 'CANCELLED') return 'CANCELLED';
    return normalized;
  }

  async getAssignment(id: string) {
    await this.openDueScheduledReviews();
    const assignment = await PmsProbationReviewAssignment.findOne({
      _id: this.toObjectId(id, 'Trainee review assignment'),
      isDeleted: false,
    })
      .populate('employeeId', 'name email employeeCode departmentId designation role specificRole joiningDate probationStartDate probationEndDate probationDate')
      .populate('manager1Id', 'name email employeeCode role specificRole')
      .populate('manager2Id', 'name email employeeCode role specificRole')
      .populate('manager2ReviewedBy', 'name email employeeCode role specificRole')
      .populate('templateId', 'name code status metadata')
      .populate('templateVersionId')
      .lean();

    if (!assignment) {
      throw new Error('Trainee review assignment not found.');
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
          comment: `Trainee review created with ${status} status.`,
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
    this.assertPrivilegedActor('Only admin users can create trainee review assignments.');
    if (!Array.isArray(input.assignments) || input.assignments.length === 0) {
      throw new Error('Add at least one trainee review assignment row.');
    }
    if (input.assignments.length > 25) {
      throw new Error('Bulk trainee review creation is limited to 25 rows at a time.');
    }
    const seenEmployeeIds = new Set<string>();
    for (const row of input.assignments) {
      const employeeKey = String(row.employeeId || '').trim();
      if (!employeeKey) continue;
      if (seenEmployeeIds.has(employeeKey)) {
        throw new Error('Duplicate employees are not allowed in the same bulk trainee review request.');
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
          message: error instanceof Error ? error.message : 'Unable to create trainee review assignment.',
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
    this.assertPrivilegedActor('Only admin users can view trainee review drafts.');
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
    this.assertPrivilegedActor('Only admin users can view trainee review drafts.');
    const draft = await PmsProbationReviewDraft.findOne({
      _id: this.toObjectId(id, 'Trainee review draft'),
      isDeleted: false,
    })
      .populate('templateId', 'name code status metadata')
      .populate('templateVersionId')
      .populate('assignments.employeeId', 'name email employeeCode')
      .populate('assignments.manager1Id', 'name email employeeCode')
      .populate('assignments.manager2Id', 'name email employeeCode')
      .lean();

    if (!draft) throw new Error('Trainee review draft not found.');
    return draft;
  }

  async saveDraft(input: SaveProbationReviewDraftInput) {
    this.assertPrivilegedActor('Only admin users can save trainee review drafts.');
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
        throw new Error('Duplicate employees are not allowed in the same trainee review draft.');
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
            _id: this.toObjectId(input.draftId, 'Trainee review draft'),
            isDeleted: false,
          },
          { $set: draftPayload },
          { new: true },
        )
      : await PmsProbationReviewDraft.create({
          ...draftPayload,
          createdBy: actorId,
        });

    if (!draft) throw new Error('Trainee review draft not found.');

    return this.getDraft(draft._id.toString());
  }

  async deleteDraft(id: string) {
    this.assertPrivilegedActor('Only admin users can discard trainee review drafts.');
    const actorId = this.getActorObjectId();
    await PmsProbationReviewDraft.updateOne(
      { _id: this.toObjectId(id, 'Trainee review draft'), isDeleted: false },
      { $set: { isDeleted: true, updatedBy: actorId } },
    );
    return { draftId: id };
  }

  async assignDraft(id: string) {
    this.assertPrivilegedActor('Only admin users can assign trainee review drafts.');
    const draft = await PmsProbationReviewDraft.findOne({
      _id: this.toObjectId(id, 'Trainee review draft'),
      isDeleted: false,
    }).lean();
    if (!draft) throw new Error('Trainee review draft not found.');
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
    this.assertPrivilegedActor('Only admin users can sync trainee review windows.');
    const asOfDate = input.asOfDate
      ? this.parseDate(input.asOfDate, 'Sync date')
      : this.getCurrentDate();
    return this.openDueScheduledReviews(asOfDate, 'SYNC_OPENED', input.assignmentIds, Boolean(input.assignmentIds?.length));
  }

  async openAssignment(id: string, input: OpenProbationReviewInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertPrivilegedActor('Only admin users can manually open trainee reviews.');
    if (assignment.status !== ProbationReviewStatus.SCHEDULED) {
      throw new Error('Only scheduled trainee reviews can be opened.');
    }

    const asOfDate = input.asOfDate
      ? this.parseDate(input.asOfDate, 'Open date')
      : this.getCurrentDate();

    if (!input.force && asOfDate.getTime() < assignment.reviewOpenDate.getTime()) {
      throw new Error(
        `This trainee review opens on ${assignment.reviewOpenDate.toISOString().slice(0, 10)}. Use sync on or after that date.`,
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

    await this.assertMandatoryReviewValues(
      assignment,
      this.fillingManagerRole(assignment),
    );

    assignment.status = ProbationReviewStatus.MANAGER_1_SUBMITTED;
    assignment.manager1SubmittedAt = this.getCurrentDate();
    assignment.manager1SubmittedBy = this.getActorObjectId();
    assignment.returnReason = undefined;
    assignment.returnedAt = undefined;
    this.touch(assignment, 'MANAGER_1_SUBMITTED');
    await assignment.save();
    return this.getAssignment(id);
  }

  async delegateToManager2(id: string, input: SaveProbationReviewValuesInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertFillingManagerActor(assignment);
    const delegatableStatuses: ProbationReviewStatus[] = [
      ProbationReviewStatus.SCHEDULED,
      ProbationReviewStatus.REVIEW_OPEN,
      ProbationReviewStatus.RETURNED_TO_MANAGER_1,
    ];
    if (!delegatableStatuses.includes(assignment.status)) {
      throw new Error('Only scheduled, open, or returned trainee reviews can be delegated to Approver Level Two.');
    }

    const fromStatus = assignment.status;
    const values = this.normalizeValues(input);
    if (values.length > 0) {
      assignment.reviewValues = this.mergePermittedValues(
        assignment.reviewValues,
        values,
        assignment,
        this.fillingManagerRole(assignment),
      );
    }

    assignment.status = ProbationReviewStatus.DELEGATED_TO_APPROVER;
    assignment.delegatedAt = this.getCurrentDate();
    assignment.delegatedBy = this.getActorObjectId();
    assignment.delegatedToRole = this.approvingManagerRole(assignment);
    assignment.delegatedFromStatus = fromStatus;
    assignment.delegationReason = input.reason?.trim() || undefined;
    assignment.returnReason = undefined;
    assignment.returnedAt = undefined;
    this.touch(assignment, 'DELEGATED_TO_MANAGER_2');
    await assignment.save();
    return this.getAssignment(id);
  }

  async approveByManager2(id: string, input: ApproveProbationReviewInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertApprovingManagerActor(assignment);
    if (!APPROVER_ACTION_STATUSES.includes(assignment.status)) {
      throw new Error('The configured approving manager can approve only after the review is submitted, delegated, or reassigned.');
    }

    const values = this.normalizeValues(input);
    if (values.length > 0) {
      assignment.reviewValues = this.mergePermittedValues(
        assignment.reviewValues,
        values,
        assignment,
        this.approvingManagerRole(assignment),
      );
    }

    await this.assertMandatoryReviewValues(
      assignment,
      this.approvingManagerRole(assignment),
    );

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
    if (!APPROVER_ACTION_STATUSES.includes(assignment.status)) {
      throw new Error('The configured approving manager can return only after the review is submitted, delegated, or reassigned.');
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

  async reassignApprovalToManager1(id: string, input: ReturnProbationReviewInput = { reason: '' }) {
    const assignment = await this.loadMutableAssignment(id);
    if (!this.isPrivilegedActor()) {
      const actorId = this.requireActorObjectId();
      if (!this.sameObjectId(actorId, assignment.manager2Id)) {
        throw new Error('Only Approver Level Two can assign approval to Approver Level One.');
      }
    }
    if (!APPROVER_ACTION_STATUSES.includes(assignment.status)) {
      throw new Error('Approval can be reassigned only after the review is submitted, delegated, or already reassigned.');
    }

    assignment.approvalOwnerOriginalRole =
      assignment.approvalOwnerOriginalRole || this.approvingManagerRole(assignment);
    assignment.approvalOwnerRoleOverride = 'MANAGER_1';
    assignment.approvalOwnerOverrideBy = this.getActorObjectId();
    assignment.approvalOwnerOverrideAt = this.getCurrentDate();
    assignment.approvalOwnerOverrideReason = input.reason?.trim() || undefined;
    assignment.status = ProbationReviewStatus.APPROVAL_REASSIGNED;
    this.touch(assignment, 'APPROVAL_REASSIGNED_TO_MANAGER_1', assignment.approvalOwnerOverrideReason);
    await assignment.save();
    return this.getAssignment(id);
  }

  async cancelAssignment(id: string, input: CancelProbationReviewInput = {}) {
    const assignment = await this.loadMutableAssignment(id);
    this.assertPrivilegedActor('Only admin users can cancel trainee reviews.');
    if (assignment.status !== ProbationReviewStatus.SCHEDULED) {
      throw new Error('Only scheduled trainee reviews can be cancelled before they are opened.');
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
      _id: this.toObjectId(id, 'Trainee review assignment'),
      isDeleted: false,
    });

    if (!assignment) {
      throw new Error('Trainee review assignment not found.');
    }

    if (assignment.status === ProbationReviewStatus.CANCELLED) {
      throw new Error('Cancelled trainee reviews cannot be updated.');
    }

    if (assignment.status === ProbationReviewStatus.FINALIZED) {
      throw new Error('Finalized trainee reviews cannot be updated.');
    }

    return assignment;
  }

  private ensureManager1CanEdit(status: ProbationReviewStatus) {
    if (!MUTABLE_MANAGER_1_STATUSES.includes(status)) {
      throw new Error(
        'Approver Level One can edit the review only when the trainee review is open or returned.',
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
    throw new Error('You do not have access to this trainee review.');
  }

  private assertFillingManagerActor(assignment: any) {
    if (this.isPrivilegedActor()) return;
    const actorId = this.requireActorObjectId();
    const expectedManagerId =
      this.fillingManagerRole(assignment) === 'MANAGER_2'
        ? assignment.manager2Id
        : assignment.manager1Id;
    if (!this.sameObjectId(actorId, expectedManagerId)) {
      throw new Error('Only the configured filling manager can edit or submit this trainee review.');
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
      throw new Error('Only the configured approving manager can approve or return this trainee review.');
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

        const fieldType = String(field.fieldType || field.type || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_');
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
        $in: assignmentIds.map((id) => this.toObjectId(id, 'Trainee review assignment')),
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
          `${this.userName((activeAssignment as any).employeeId, 'This employee')} already has a trainee review assignment.`,
        );
      }
    }

    const draftFilter: Record<string, unknown> = {
      'assignments.employeeId': { $in: uniqueEmployeeIds },
      isDeleted: false,
    };
    if (excludeDraftId) {
      draftFilter._id = { $ne: this.toObjectId(excludeDraftId, 'Trainee review draft') };
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
        `${this.userName(duplicateRow?.employeeId, 'This employee')} already exists in another trainee review draft.`,
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
    if (!assignment.reviewerConfiguration?.permissions?.length) {
      throw new Error(
        'This trainee review has no assigned field-permission snapshot. Recreate or migrate the assignment before editing it.',
      );
    }
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
        throw new Error(`You cannot edit ${value.fieldKey} in this trainee review.`);
      }
      merged.set(key, value);
    }
    return [...merged.values()];
  }

  private async assertMandatoryReviewValues(
    assignment: any,
    role: ProbationReviewerRole,
  ) {
    const mandatoryPermissions = (assignment.reviewerConfiguration?.permissions ?? []).filter(
      (permission: IProbationReviewFieldPermission) => {
        const access = role === 'MANAGER_1' ? permission.manager1 : permission.manager2;
        return Boolean(access?.visible && access.editable && access.mandatory);
      },
    );
    if (mandatoryPermissions.length === 0) return;

    const valueMap = new Map<string, IProbationReviewValue>();
    for (const value of assignment.reviewValues ?? []) {
      valueMap.set(this.permissionKey(value.sectionKey, value.fieldKey), value);
    }

    const mandatoryGridPermissions = mandatoryPermissions.filter(
      (permission: IProbationReviewFieldPermission) => permission.isGridRow && permission.parentFieldKey,
    );
    const templateVersion = mandatoryGridPermissions.length > 0
      ? await PmsTemplateVersion.findOne({
          _id: assignment.templateVersionId,
          isDeleted: false,
        }).lean()
      : null;
    if (mandatoryGridPermissions.length > 0 && !templateVersion) {
      throw new Error('The assigned template version is unavailable for mandatory-field validation.');
    }

    const templateFieldMap = new Map<string, any>();
    for (const section of templateVersion?.sections ?? []) {
      for (const field of section.fields ?? []) {
        templateFieldMap.set(
          this.permissionKey(String(section.sectionKey), String(field.fieldKey)),
          field,
        );
      }
    }

    const missing: string[] = [];
    for (const permission of mandatoryPermissions) {
      if (permission.isGridRow && permission.parentFieldKey) {
        const parentKey = this.permissionKey(permission.sectionKey, permission.parentFieldKey);
        const savedRows = this.reviewGridRows(valueMap.get(parentKey)?.value);
        const requiredRowKey = permission.gridRowKey ||
          this.gridRowKeyFromPermission(permission.fieldKey, permission.parentFieldKey);
        const savedRow = savedRows.find(
          (row, rowIndex) => this.gridRowKey(row, rowIndex) === requiredRowKey,
        );
        const templateField = templateFieldMap.get(parentKey);
        const requiredColumns = (templateField?.gridConfig?.columns ?? []).filter(
          (column: any) => column.required && column.editable !== false && column.readOnly !== true,
        );
        const rowIsIncomplete =
          !savedRow ||
          (requiredColumns.length > 0 && requiredColumns.some((column: any) =>
            this.isBlankReviewValue(this.recordValue(savedRow, column.key, column.label)),
          ));
        if (rowIsIncomplete) {
          missing.push(permission.fieldLabel || `row ${requiredRowKey}`);
        }
        continue;
      }

      const value = valueMap.get(this.permissionKey(permission.sectionKey, permission.fieldKey))?.value;
      if (this.isBlankReviewValue(value)) {
        missing.push(permission.fieldLabel || permission.fieldKey);
      }
    }

    if (missing.length > 0) {
      const visible = missing.slice(0, 6);
      const remaining = missing.length - visible.length;
      const detail = `${visible.join(', ')}${remaining > 0 ? `, and ${remaining} more` : ''}`;
      throw new Error(`Cannot submit. Complete the following required fields: ${detail}.`);
    }
  }

  private reviewGridRows(value: unknown): Array<Record<string, unknown>> {
    if (Array.isArray(value)) {
      return value.filter((row) => row && typeof row === 'object') as Array<Record<string, unknown>>;
    }
    if (!value || typeof value !== 'object') return [];
    const record = value as Record<string, unknown>;
    const rows = record.rows || record.items || record.values || record.data || record.entries || record.tableRows;
    return Array.isArray(rows)
      ? rows.filter((row) => row && typeof row === 'object') as Array<Record<string, unknown>>
      : [];
  }

  private recordValue(record: Record<string, unknown>, ...keys: unknown[]) {
    for (const key of keys) {
      if (!key) continue;
      if (record[String(key)] !== undefined) return record[String(key)];
    }
    const normalizedKeys = keys.map((key) => this.normalizeFieldToken(key)).filter(Boolean);
    const match = Object.entries(record).find(([key]) =>
      normalizedKeys.includes(this.normalizeFieldToken(key)),
    );
    return match?.[1];
  }

  private normalizeFieldToken(value: unknown) {
    return String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private isBlankReviewValue(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim().length === 0;
    if (Array.isArray(value)) return value.length === 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
    return false;
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
        const sectionIdentity = String(
          section.sectionLabel || section.label || section.title || sectionKey,
        )
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '_');
        const isEmployeeInformationSection =
          sectionIdentity.includes('employee_information') ||
          sectionIdentity.includes('employee_details');
        const fields = (section.fields ?? [])
          .map((field: any) => {
            const fieldKey = String(field.fieldKey || field.key || field.id || '');
            // Employee details describe the assignment rather than a
            // reviewer answer. They remain visible and read-only even though
            // they intentionally have no field permission in the snapshot.
            if (isEmployeeInformationSection) {
              return {
                ...field,
                visible: true,
                editable: false,
                required: false,
              };
            }
            const fieldType = String(field.fieldType || field.type || '')
              .trim()
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '_');
            if (fieldType === 'data_grid' && Array.isArray(field.gridConfig?.defaultRows)) {
              const parentPermission = permissionMap.get(
                this.permissionKey(sectionKey, fieldKey),
              );
              const visibleRows = field.gridConfig.defaultRows
                .map((row: any, rowIndex: number) => {
                  const rowKey = this.gridRowKey(row, rowIndex);
                  const permission =
                    permissionMap.get(
                      this.permissionKey(sectionKey, this.gridRowPermissionKey(fieldKey, rowKey)),
                    ) || parentPermission;
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
    if (REVIEWER_ROLES.includes(assignment.approvalOwnerRoleOverride)) {
      return assignment.approvalOwnerRoleOverride;
    }
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
        throw new Error('You cannot edit one or more performance assessment rows in this trainee review.');
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
        'Trainee Review Assignment Created',
        `Hello ${managerName},

A trainee review assignment has been created for ${employeeName}.

Your role: ${roleLabel}
Review opens: ${reviewOpenDate}
Probation end date: ${probationEndDate}
Form availability: ${formAvailabilityText}

${statusText}`,
        `<p>Hello ${this.escapeHtml(managerName)},</p>
<p>A trainee review assignment has been created for <strong>${this.escapeHtml(employeeName)}</strong>.</p>
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
            'Trainee Review Opened',
            `Hello ${managerName},

The trainee review for ${employeeName} is now open.

Your role: ${roleLabel}
Review open date: ${reviewOpenDate}
Probation end date: ${probationEndDate}`,
            `<p>Hello ${this.escapeHtml(managerName)},</p>
<p>The trainee review for <strong>${this.escapeHtml(employeeName)}</strong> is now open.</p>
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
      console.warn('Trainee review email notification failed:', error);
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
