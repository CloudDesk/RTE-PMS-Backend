import { SlaService } from '../../src/services/sla.service';

describe('SlaService - Employee Achievement Submission SLA', () => {
  let service: any;

  beforeEach(() => {
    service = new SlaService();
  });

  it('does not trigger escalation on or before allowedUntilAt', () => {
    const sla = {
      slaType: 'employee_achievement_submission_pending',
      dueAt: new Date('2026-08-10T00:00:00.000Z'),
      metadata: {
        allowedUntilAt: '2026-08-18T00:00:00.000Z',
      },
    };
    const reminderRule = {
      reminderType: 'ESCALATION',
      offsetDays: 0,
    };

    expect(service.shouldTriggerReminder(
      sla,
      reminderRule,
      new Date('2026-08-18T00:00:00.000Z'),
    )).toBe(false);
  });

  it('triggers escalation on the first calendar day after allowedUntilAt when offsetDays is zero', () => {
    const sla = {
      slaType: 'employee_achievement_submission_pending',
      dueAt: new Date('2026-08-10T00:00:00.000Z'),
      metadata: {
        allowedUntilAt: '2026-08-18T00:00:00.000Z',
      },
    };
    const reminderRule = {
      reminderType: 'ESCALATION',
      offsetDays: 0,
    };

    expect(service.shouldTriggerReminder(
      sla,
      reminderRule,
      new Date('2026-08-19T00:00:00.000Z'),
    )).toBe(true);
  });

  it('uses escalation offset days after allowedUntilAt for employee achievement SLA', () => {
    const sla = {
      slaType: 'employee_achievement_submission_pending',
      dueAt: new Date('2026-08-10T00:00:00.000Z'),
      metadata: {
        allowedUntilAt: '2026-08-18T00:00:00.000Z',
      },
    };
    const reminderRule = {
      reminderType: 'ESCALATION',
      offsetDays: 2,
    };

    expect(service.shouldTriggerReminder(
      sla,
      reminderRule,
      new Date('2026-08-20T00:00:00.000Z'),
    )).toBe(false);
    expect(service.shouldTriggerReminder(
      sla,
      reminderRule,
      new Date('2026-08-21T00:00:00.000Z'),
    )).toBe(true);
  });
});
