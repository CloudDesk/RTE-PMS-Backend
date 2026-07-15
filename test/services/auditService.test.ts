import { Types } from 'mongoose';
import { SYSTEM_WORKFLOW_SYNC_ACTOR } from '../../src/constants/system-actors';
import { AuditLog } from '../../src/models/audit-log.model';
import { User } from '../../src/models/user.model';
import { auditService } from '../../src/services/audit.service';

jest.mock('../../src/models/audit-log.model', () => ({
  AuditLog: {
    find: jest.fn(),
  },
}));

jest.mock('../../src/models/user.model', () => ({
  User: {
    find: jest.fn(),
  },
}));

describe('AuditService actor enrichment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('labels automatic workflow-sync entries with the system actor name', async () => {
    const timestamp = new Date('2026-07-15T00:00:02.000Z');
    const logs = [{
      _id: new Types.ObjectId().toString(),
      entityType: 'TERM_ASSIGNMENT',
      entityId: new Types.ObjectId(),
      action: 'TERM_ASSIGNMENT_STATE_TRANSITIONED',
      actorId: new Types.ObjectId(SYSTEM_WORKFLOW_SYNC_ACTOR.id),
      actorRole: 'ADMIN',
      reason: 'Automatic daily PMS workflow sync',
      timestamp,
      createdAt: timestamp,
    }];
    const leanLogs = jest.fn().mockResolvedValue(logs);
    const sort = jest.fn().mockReturnValue({ lean: leanLogs });
    (AuditLog.find as jest.Mock).mockReturnValue({ sort });

    const leanUsers = jest.fn().mockResolvedValue([]);
    const select = jest.fn().mockReturnValue({ lean: leanUsers });
    (User.find as jest.Mock).mockReturnValue({ select });

    const result = await auditService.getEntityHistory('TERM_ASSIGNMENT', logs[0].entityId.toString());

    expect(result[0]).toMatchObject({
      actorId: logs[0].actorId,
      actorRole: 'ADMIN',
      actorName: SYSTEM_WORKFLOW_SYNC_ACTOR.name,
      actorEmail: SYSTEM_WORKFLOW_SYNC_ACTOR.email,
    });
  });
});
