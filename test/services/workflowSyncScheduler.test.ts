import { Types } from 'mongoose';
import { AnnualWorkflowState } from '../../src/constants/pms.enums';
import { AnnualCycle } from '../../src/models/pms-annual-cycle.model';
import { getDatabaseHealth } from '../../src/config/database';
import { WorkflowSyncService } from '../../src/services/workflow-sync.service';
import {
  getBusinessDateAtUtcMidnight,
  runAutomaticWorkflowSyncOnce,
} from '../../src/services/workflow-sync-scheduler.service';

jest.mock('../../src/config/database', () => ({
  getDatabaseHealth: jest.fn(),
}));

jest.mock('../../src/models/pms-annual-cycle.model', () => ({
  AnnualCycle: {
    find: jest.fn(),
  },
}));

const mockSyncWorkflowStates = jest.fn();

jest.mock('../../src/services/workflow-sync.service', () => ({
  WorkflowSyncService: jest.fn().mockImplementation(() => ({
    syncWorkflowStates: mockSyncWorkflowStates,
  })),
}));

describe('Automatic workflow sync scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uses the IST calendar date when the midnight cron fires', () => {
    const cronFireTime = new Date('2026-07-14T18:30:00.000Z');

    expect(getBusinessDateAtUtcMidnight(cronFireTime).toISOString()).toBe(
      '2026-07-15T00:00:00.000Z',
    );
  });

  it('runs the existing workflow sync for active cycles only', async () => {
    const cycleId = new Types.ObjectId();
    const asOfDate = new Date('2026-07-15T00:00:00.000Z');
    const select = jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: cycleId, code: 'PMS-2026' }]),
    });
    (getDatabaseHealth as jest.Mock).mockReturnValue({ ready: true, state: 'connected' });
    (AnnualCycle.find as jest.Mock).mockReturnValue({ select });
    mockSyncWorkflowStates.mockResolvedValue({
      totalChecked: 4,
      totalUpdated: 1,
      failed: 0,
    });

    const result = await runAutomaticWorkflowSyncOnce(asOfDate);

    expect(AnnualCycle.find).toHaveBeenCalledWith({
      isDeleted: false,
      status: { $in: [AnnualWorkflowState.ACTIVE, AnnualWorkflowState.IN_PROGRESS] },
      startDate: { $lte: asOfDate },
      endDate: { $gte: asOfDate },
    });
    expect(select).toHaveBeenCalledWith('_id code');
    expect(WorkflowSyncService).toHaveBeenCalledWith(
      expect.objectContaining({
        reqRole: 'ADMIN',
        pmsCurrentDate: asOfDate,
        user: expect.objectContaining({ role: 'ADMIN' }),
      }),
    );
    expect(mockSyncWorkflowStates).toHaveBeenCalledWith(cycleId.toString(), {
      reason: 'Automatic daily PMS workflow sync',
      source: 'AUTOMATIC_DAILY_SYNC',
    });
    expect(result).toMatchObject({
      checkedCycles: 1,
      updatedAssignments: 1,
      failedAssignments: 0,
    });
  });

  it('skips safely when the database is not ready', async () => {
    (getDatabaseHealth as jest.Mock).mockReturnValue({ ready: false, state: 'connecting' });

    const result = await runAutomaticWorkflowSyncOnce(new Date('2026-07-15T00:00:00.000Z'));

    expect(AnnualCycle.find).not.toHaveBeenCalled();
    expect(mockSyncWorkflowStates).not.toHaveBeenCalled();
    expect(result.skippedReason).toBe('database is connecting');
  });
});
