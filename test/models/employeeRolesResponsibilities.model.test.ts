import { Types } from 'mongoose';
import {
  EmployeeRoleResponsibilityStatus,
  EmployeeRolesResponsibilities,
} from '../../src/models/employee-roles-responsibilities.model';

describe('EmployeeRolesResponsibilities model', () => {
  const employeeId = new Types.ObjectId();
  const actorId = new Types.ObjectId();

  it('permits an empty employee record before the first row is saved', async () => {
    const record = createRecord([]);
    await expect(record.validate()).resolves.toBeUndefined();
  });

  it('rejects visibility on an individual draft entry', async () => {
    const record = createRecord([
      {
        serialNo: 1,
        description: 'Draft responsibility',
        status: EmployeeRoleResponsibilityStatus.DRAFT,
        isVisible: true,
      },
    ]);

    await expect(record.validate()).rejects.toThrow(
      'A draft responsibility cannot be visible',
    );
  });

  it('supports independent submitted and draft rows', async () => {
    const record = createRecord([
      {
        serialNo: 1,
        description: 'Submitted responsibility',
        status: EmployeeRoleResponsibilityStatus.SUBMITTED,
        isVisible: true,
      },
      {
        serialNo: 2,
        description: 'Draft responsibility',
        status: EmployeeRoleResponsibilityStatus.DRAFT,
        isVisible: false,
      },
    ]);

    await expect(record.validate()).resolves.toBeUndefined();
  });

  it('normalizes serial numbers in display order', async () => {
    const record = createRecord([
      {
        serialNo: 8,
        description: 'First responsibility',
        status: EmployeeRoleResponsibilityStatus.SUBMITTED,
        isVisible: true,
      },
      {
        serialNo: 3,
        description: 'Second responsibility',
        status: EmployeeRoleResponsibilityStatus.DRAFT,
        isVisible: false,
      },
    ]);

    await record.validate();
    expect(record.entries.map((entry) => entry.serialNo)).toEqual([1, 2]);
  });

  function createRecord(entries: Array<Record<string, unknown>>) {
    return new EmployeeRolesResponsibilities({
      employeeId,
      entries,
      status: EmployeeRoleResponsibilityStatus.DRAFT,
      isVisible: false,
      createdBy: actorId,
      updatedBy: actorId,
    });
  }
});
