import { PmsBulkOperationsService } from '../src/services/pmsBulkOperations.service';
import { PmsRole } from '../src/constants/pms.enums';
import { Types } from 'mongoose';

// ── Mocks Setup ────────────────────────────────────────────────────────────────
let mockUserFindByIdVal: any = null;
let mockAnnualAssignmentFindOneVal: any = null;
let mockQuarterCycleFindVal: any[] = [];
let mockQuarterAssignmentFindVal: any[] = [];
let mockAnnualDecisionFindOneVal: any = null;
let mockCommunicationDispatchFindOneVal: any = null;
let mockBulkOperationJobCreateVal: any = null;
let mockBulkOperationJobFindVal: any[] = [];

jest.mock('../src/models', () => {
  return {
    User: {
      findById: jest.fn(() => ({
        lean: jest.fn(() => mockUserFindByIdVal),
      })),
    },
    AnnualAssignment: {
      findOne: jest.fn(() => {
        const chain: any = Promise.resolve(mockAnnualAssignmentFindOneVal);
        chain.populate = jest.fn(() => chain);
        chain.lean = jest.fn(() => mockAnnualAssignmentFindOneVal);
        return chain;
      }),
    },
    QuarterCycle: {
      find: jest.fn(() => ({
        lean: jest.fn(() => mockQuarterCycleFindVal),
      })),
    },
    QuarterAssignment: {
      find: jest.fn(() => ({
        populate: jest.fn(() => ({
          populate: jest.fn(() => ({
            lean: jest.fn(() => mockQuarterAssignmentFindVal),
          })),
        })),
      })),
    },
    AnnualDecision: {
      findOne: jest.fn(() => ({
        select: jest.fn(() => ({
          lean: jest.fn(() => mockAnnualDecisionFindOneVal),
        })),
      })),
    },
    CommunicationDispatch: {
      findOne: jest.fn(() => ({
        lean: jest.fn(() => mockCommunicationDispatchFindOneVal),
      })),
    },
    BulkOperationJob: {
      create: jest.fn(() => mockBulkOperationJobCreateVal),
      find: jest.fn(() => ({
        populate: jest.fn(() => ({
          sort: jest.fn(() => ({
            lean: jest.fn(() => mockBulkOperationJobFindVal),
          })),
        })),
      })),
    },
    NotificationEvent: {
      create: jest.fn(() => ({ _id: new Types.ObjectId() })),
    },
  };
});

// Mock individual services used by Bulk Operations
jest.mock('../src/services/audit.service', () => ({
  auditService: {
    createAuditLog: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../src/services/assignment.service', () => {
  return {
    AssignmentService: jest.fn().mockImplementation(() => ({
      assignEmployee: jest.fn().mockResolvedValue({
        annualAssignment: { _id: new Types.ObjectId() },
        quarterAssignments: [{ _id: new Types.ObjectId() }],
      }),
      bulkAssign: jest.fn().mockResolvedValue({}),
      closeAssignment: jest.fn().mockResolvedValue({}),
    })),
  };
});

jest.mock('../src/services/annualDecision.service', () => {
  return {
    AnnualDecisionService: jest.fn().mockImplementation(() => ({
      updateVisibility: jest.fn().mockResolvedValue({}),
    })),
  };
});

jest.mock('../src/services/pmsCommunication.service', () => {
  return {
    PmsCommunicationService: jest.fn().mockImplementation(() => ({
      previewCommunication: jest.fn().mockResolvedValue({}),
      dispatchAppraisalLetter: jest.fn().mockResolvedValue({}),
    })),
  };
});

describe('Bulk Operations Service Tests - All 5 Core Tasks', () => {
  let bulkService: PmsBulkOperationsService;
  const mockCycleId = '507f1f77bcf86cd799439011';
  const mockEmployeeId = '507f1f77bcf86cd799439022';
  const mockManagerId = '507f1f77bcf86cd799439033';

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup Context User as Admin to bypass assertions
    bulkService = new PmsBulkOperationsService({
      user: {
        _id: new Types.ObjectId('507f1f77bcf86cd799439000'),
        role: PmsRole.ADMIN,
      },
    } as any);

    // Default mock data setups
    mockUserFindByIdVal = {
      _id: new Types.ObjectId(mockEmployeeId),
      name: 'Test Employee',
      role: PmsRole.EMPLOYEE,
    };

    mockAnnualAssignmentFindOneVal = {
      _id: new Types.ObjectId(),
      employeeId: new Types.ObjectId(mockEmployeeId),
      cycleId: new Types.ObjectId(mockCycleId),
      appraisalOutcomeType: 'BOTH',
      visibility: {},
      isDeleted: false,
    };

    mockQuarterCycleFindVal = [
      { _id: new Types.ObjectId(), code: 'Q1', startDate: new Date() },
    ];

    mockQuarterAssignmentFindVal = [
      {
        _id: new Types.ObjectId(),
        employeeId: mockUserFindByIdVal,
        assignedManagerId: { _id: new Types.ObjectId(mockManagerId), name: 'Manager' },
        quarterState: 'OBJECTIVE_DRAFT',
        isDeleted: false,
      },
    ];

    mockAnnualDecisionFindOneVal = {
      decisionStatus: 'FROZEN',
    };

    mockCommunicationDispatchFindOneVal = null; // letter not sent yet

    mockBulkOperationJobCreateVal = {
      _id: new Types.ObjectId(),
      status: 'RUNNING',
      metadata: {},
      successCount: 0,
      failureCount: 0,
      failureSummary: [],
      save: jest.fn().mockResolvedValue({}),
    };
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 1: Bulk Assignments (Preview & Execution)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 1: Launch PMS Assignments', () => {
    it('should successfully preview and mark assignment as eligible', async () => {
      // Mock so that employee has no existing assignments (ready to be assigned)
      mockAnnualAssignmentFindOneVal = null;

      const res = await bulkService.previewBulkAssignment(mockCycleId, [
        { employeeId: mockEmployeeId, managerId: mockManagerId },
      ]);

      expect(res.eligibleCount).toBe(1);
      expect(res.records[0].status).toBe('ELIGIBLE');
    });

    it('should successfully execute bulk assignment job', async () => {
      mockAnnualAssignmentFindOneVal = null;

      const res = await bulkService.executeBulkAssignment(mockCycleId, [
        { employeeId: mockEmployeeId, managerId: mockManagerId },
      ]);

      expect(res.jobId).toBeDefined();
      expect(res.status).toBe('RUNNING');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 2: Bulk Reminders (Preview & Execution)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 2: Dispatch PMS Reminders', () => {
    it('should preview and discover targeted employees pending objectives', async () => {
      const res = await bulkService.previewBulkReminder(mockCycleId, 'OBJECTIVES');

      expect(res.totalTargeted).toBe(1);
      expect(res.records[0].status).toBe('PENDING_OBJECTIVE');
    });

    it('should successfully execute dispatch reminders job', async () => {
      const res = await bulkService.executeBulkReminder(
        mockCycleId,
        'OBJECTIVES',
        'Subject',
        'Message'
      );

      expect(res.jobId).toBeDefined();
      expect(res.status).toBe('RUNNING');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 3: Bulk Visibility Settings (Preview & Execution)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 3: Update Visibility Settings', () => {
    it('should preview and mark visibility as eligible when decisions are frozen', async () => {
      const res = await bulkService.previewBulkVisibility(mockCycleId, [mockEmployeeId], {
        employeeReviewVisible: true,
      });

      expect(res.eligibleCount).toBe(1);
      expect(res.records[0].status).toBe('ELIGIBLE');
    });

    it('should successfully execute bulk visibility update job', async () => {
      const res = await bulkService.executeBulkVisibility(
        mockCycleId,
        [mockEmployeeId],
        { employeeReviewVisible: true }
      );

      expect(res.jobId).toBeDefined();
      expect(res.status).toBe('RUNNING');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 4: Bulk Communication Dispatch (Preview & Execution)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 4: Dispatch Appraisal Letters', () => {
    it('should preview and verify appraisal letter eligibility', async () => {
      const res = await bulkService.previewBulkCommunication(mockCycleId, [mockEmployeeId]);

      expect(res.eligibleCount).toBe(1);
      expect(res.records[0].status).toBe('ELIGIBLE');
    });

    it('should successfully execute bulk communication letter dispatch', async () => {
      const res = await bulkService.executeBulkCommunication(mockCycleId, [mockEmployeeId]);

      expect(res.jobId).toBeDefined();
      expect(res.status).toBe('RUNNING');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // TASK 5: Administrative Force Closure (Preview & Execution)
  // ──────────────────────────────────────────────────────────────────────────
  describe('Task 5: Administrative Force Closure', () => {
    it('should preview and mark active assignment as eligible for close', async () => {
      const res = await bulkService.previewBulkClose(mockCycleId, [mockEmployeeId]);

      expect(res.eligibleCount).toBe(1);
      expect(res.records[0].status).toBe('ELIGIBLE');
    });

    it('should successfully execute bulk administrative close with reason', async () => {
      const res = await bulkService.executeBulkClose(mockCycleId, [mockEmployeeId], 'Mandatory Reason');

      expect(res.jobId).toBeDefined();
      expect(res.status).toBe('SUCCESS'); // Close runs synchronously, status returns SUCCESS/PARTIAL
    });
  });
});
