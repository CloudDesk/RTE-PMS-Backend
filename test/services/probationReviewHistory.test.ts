import { Types } from 'mongoose';
import { PmsProbationReviewAssignment } from '../../src/models/pms-probation-review-assignment.model';
import { User } from '../../src/models/user.model';
import { ProbationReviewService } from '../../src/services/probationReview.service';
import type { RequestContext } from '../../src/types/context';

jest.mock('../../src/models/pms-probation-review-assignment.model', () => ({
  ProbationReviewStatus: {
    SCHEDULED: 'SCHEDULED',
    REVIEW_OPEN: 'REVIEW_OPEN',
    MANAGER_1_SUBMITTED: 'MANAGER_1_SUBMITTED',
    DELEGATED_TO_APPROVER: 'DELEGATED_TO_APPROVER',
    APPROVAL_REASSIGNED: 'APPROVAL_REASSIGNED',
    RETURNED_TO_MANAGER_1: 'RETURNED_TO_MANAGER_1',
    FINALIZED: 'FINALIZED',
    CANCELLED: 'CANCELLED',
  },
  PmsProbationReviewAssignment: { find: jest.fn() },
}));

jest.mock('../../src/models/user.model', () => ({ User: { find: jest.fn() } }));
jest.mock('../../src/services/email.service', () => ({ emailService: {} }));

function context(role: string, userId = new Types.ObjectId()): RequestContext {
  return {
    requestId: 'probation-history-test',
    reqRole: role,
    user: {
      _id: userId,
      name: 'Test user',
      email: 'test@example.com',
      role,
      departmentId: '',
      active: true,
      country: '',
      currency: '',
      licenseType: '',
      portalAccess: true,
    },
  };
}

function mockAssignments(items: unknown[]) {
  const query: any = {
    select: jest.fn(() => query),
    populate: jest.fn(() => query),
    lean: jest.fn().mockResolvedValue(items),
  };
  (PmsProbationReviewAssignment.find as jest.Mock).mockReturnValue(query);
}

function mockActors(items: unknown[]) {
  const query: any = {
    select: jest.fn(() => query),
    lean: jest.fn().mockResolvedValue(items),
  };
  (User.find as jest.Mock).mockReturnValue(query);
}

describe('ProbationReviewService history', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns previous workflow events newest first with actor details', async () => {
    const assignmentId = new Types.ObjectId();
    const employeeId = new Types.ObjectId();
    const actorId = new Types.ObjectId();
    const manager1Id = new Types.ObjectId();
    const manager2Id = new Types.ObjectId();
    mockAssignments([{
      _id: assignmentId,
      employeeId: { _id: employeeId, name: 'Trainee One', employeeCode: 'TR001', departmentId: 'rnd' },
      manager1Id: { _id: manager1Id, name: 'Filling Manager' },
      manager2Id: { _id: manager2Id, name: 'Approving Manager' },
      reviewerConfiguration: { fillingManagerRole: 'MANAGER_1', approvingManagerRole: 'MANAGER_2' },
      auditTrail: [
        { action: 'MANAGER_1_SUBMITTED', actorId, createdAt: new Date('2026-07-14T10:00:00Z') },
        { action: 'RETURNED_TO_MANAGER_1', actorId, comment: 'Update ratings', createdAt: new Date('2026-07-15T10:00:00Z') },
      ],
    }]);
    mockActors([{ _id: actorId, name: 'Manager One', role: 'MANAGER' }]);

    const result = await new ProbationReviewService(context('ADMIN')).listHistory();

    expect(result.total).toBe(2);
    expect(result.items.map((item) => item.action)).toEqual([
      'RETURNED_TO_MANAGER_1',
      'MANAGER_1_SUBMITTED',
    ]);
    expect(result.items[0]).toMatchObject({
      assignmentId: assignmentId.toString(),
      employeeName: 'Trainee One',
      actorName: 'Manager One',
      filledByName: 'Filling Manager',
      approvedByName: 'Approving Manager',
      status: 'RETURNED',
      comment: 'Update ratings',
    });
  });

  it('scopes manager history to reviews assigned to that manager', async () => {
    const managerId = new Types.ObjectId();
    mockAssignments([]);
    mockActors([]);

    await new ProbationReviewService(context('MANAGER', managerId)).listHistory();

    expect(PmsProbationReviewAssignment.find).toHaveBeenCalledWith({
      isDeleted: false,
      $or: [{ manager1Id: managerId }, { manager2Id: managerId }],
    });
  });
});
