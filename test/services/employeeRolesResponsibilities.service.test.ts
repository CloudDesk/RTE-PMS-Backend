import { Types } from 'mongoose';
import {
  EmployeeRoleResponsibilityStatus,
  EmployeeRolesResponsibilities,
} from '../../src/models/employee-roles-responsibilities.model';
import { User } from '../../src/models/user.model';
import { auditService } from '../../src/services/audit.service';
import {
  EmployeeRolesResponsibilitiesError,
  EmployeeRolesResponsibilitiesService,
} from '../../src/services/employee-roles-responsibilities.service';
import type { RequestContext } from '../../src/types/context';

describe('EmployeeRolesResponsibilitiesService viewer access', () => {
  const managerId = new Types.ObjectId();
  const employeeId = new Types.ObjectId();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each(['employee', 'manager'])(
    'keeps existing own roles and responsibilities visible to the %s role',
    async (role) => {
      mockRolesRecord([
        entry('Submitted row', 'SUBMITTED', true),
        entry('Existing draft row', 'DRAFT', false),
      ]);

      const result = await serviceFor(employeeId, role).getOwn();

      expect(result.entries.map((item) => item.description)).toEqual([
        'Submitted row',
        'Existing draft row',
      ]);
    },
  );

  it('shows a direct manager only submitted and visible rows', async () => {
    mockEmployeeManager(managerId.toString());
    mockRolesRecord([
      entry('Visible submitted row', 'SUBMITTED', true),
      entry('Hidden submitted row', 'SUBMITTED', false),
      entry('Private draft row', 'DRAFT', false),
    ]);

    const result = await serviceFor(managerId, 'manager').getForEmployee(
      employeeId.toString(),
    );

    expect(result?.entries.map((item) => item.description)).toEqual([
      'Visible submitted row',
    ]);
  });

  it('denies a manager who is not the employee’s direct manager', async () => {
    mockEmployeeManager(new Types.ObjectId().toString());

    const request = serviceFor(managerId, 'manager').getForEmployee(
      employeeId.toString(),
    );

    await expect(request).rejects.toMatchObject<Partial<EmployeeRolesResponsibilitiesError>>({
      statusCode: 403,
      errorCode: 'ROLES_RESPONSIBILITIES_ACCESS_DENIED',
    });
  });

  it('shows HR only submitted and visible rows without requiring direct-manager access', async () => {
    mockRolesRecord([
      entry('Visible submitted row', 'SUBMITTED', true),
      entry('Hidden submitted row', 'SUBMITTED', false),
      entry('Private draft row', 'DRAFT', false),
    ]);
    const userLookup = jest.spyOn(User, 'findById');

    const result = await serviceFor(managerId, 'HR').getForEmployee(
      employeeId.toString(),
    );

    expect(userLookup).not.toHaveBeenCalled();
    expect(result?.entries.map((item) => item.description)).toEqual([
      'Visible submitted row',
    ]);
  });

  it.each(['HR', 'Admin'])(
    'shows all target employee rows to the %s management view',
    async (role) => {
      mockRolesRecord([
        entry('Visible submitted row', 'SUBMITTED', true),
        entry('Hidden submitted row', 'SUBMITTED', false),
        entry('Draft row', 'DRAFT', false),
      ]);

      const result = await serviceFor(managerId, role).getForEmployeeManagement(
        employeeId.toString(),
      );

      expect(result.entries.map((item) => item.description)).toEqual([
        'Visible submitted row',
        'Hidden submitted row',
        'Draft row',
      ]);
    },
  );

  it('returns no viewer data when all submitted rows are hidden', async () => {
    mockEmployeeManager(managerId.toString());
    mockRolesRecord([entry('Hidden row', 'SUBMITTED', false)]);

    await expect(
      serviceFor(managerId, 'manager').getForEmployee(employeeId.toString()),
    ).resolves.toBeNull();
  });

  it('updates a legacy row by serial number when its temporary id changed', async () => {
    const record = new EmployeeRolesResponsibilities({
      employeeId,
      entries: [entry('Legacy draft row', 'DRAFT', false)],
      status: EmployeeRoleResponsibilityStatus.DRAFT,
      isVisible: false,
      version: 1,
      createdBy: employeeId,
      updatedBy: employeeId,
    });
    jest
      .spyOn(EmployeeRolesResponsibilities, 'findOne')
      .mockResolvedValue(record as any);
    jest.spyOn(record, 'save').mockResolvedValue(record as any);
    jest.spyOn(auditService, 'createAuditLog').mockResolvedValue({} as any);

    const result = await serviceFor(employeeId, 'HR').submitEntry(
      'Updated legacy row',
      new Types.ObjectId().toString(),
      1,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      description: 'Updated legacy row',
      status: 'SUBMITTED',
      isVisible: true,
    });
  });

  it('allows an Admin to delete a submitted row when another row remains', async () => {
    const record = new EmployeeRolesResponsibilities({
      employeeId,
      entries: [
        entry('First submitted row', 'SUBMITTED', true),
        entry('Second submitted row', 'SUBMITTED', true),
      ],
      status: EmployeeRoleResponsibilityStatus.SUBMITTED,
      isVisible: true,
      version: 1,
      createdBy: employeeId,
      updatedBy: employeeId,
    });
    const firstEntryId = record.entries[0]._id.toString();
    jest
      .spyOn(EmployeeRolesResponsibilities, 'findOne')
      .mockResolvedValue(record as any);
    jest.spyOn(record, 'save').mockResolvedValue(record as any);
    jest.spyOn(auditService, 'createAuditLog').mockResolvedValue({} as any);

    const result = await serviceFor(employeeId, 'Admin').deleteEntry(
      firstEntryId,
      1,
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].description).toBe('Second submitted row');
  });

  it.each(['employee', 'manager'])(
    'denies all write operations for the %s role before accessing data',
    async (role) => {
      const findOne = jest.spyOn(EmployeeRolesResponsibilities, 'findOne');
      const service = serviceFor(employeeId, role);

      const operations = [
        () => service.getForEmployeeManagement(employeeId.toString()),
        () => service.saveEntryDraft('New responsibility', undefined, undefined, employeeId.toString()),
        () => service.submitEntry('New responsibility', undefined, undefined, employeeId.toString()),
        () => service.setEntryVisibility(new Types.ObjectId().toString(), true, undefined, employeeId.toString()),
        () => service.deleteEntry(new Types.ObjectId().toString(), undefined, employeeId.toString()),
      ];

      for (const operation of operations) {
        await expect(operation()).rejects.toMatchObject<Partial<EmployeeRolesResponsibilitiesError>>({
          statusCode: 403,
          errorCode: 'ROLES_RESPONSIBILITIES_WRITE_ACCESS_DENIED',
        });
      }
      expect(findOne).not.toHaveBeenCalled();
    },
  );

  it.each(['HR', 'Admin'])(
    'allows the %s role to create, update, change visibility, and delete entries',
    async (role) => {
      const record = new EmployeeRolesResponsibilities({
        employeeId,
        entries: [
          entry('First submitted row', 'SUBMITTED', true),
          entry('Second submitted row', 'SUBMITTED', true),
        ],
        status: EmployeeRoleResponsibilityStatus.SUBMITTED,
        isVisible: true,
        version: 1,
        createdBy: employeeId,
        updatedBy: employeeId,
      });
      jest
        .spyOn(EmployeeRolesResponsibilities, 'findOne')
        .mockResolvedValue(record as any);
      jest.spyOn(record, 'save').mockResolvedValue(record as any);
      jest.spyOn(auditService, 'createAuditLog').mockResolvedValue({} as any);
      const service = serviceFor(managerId, role);

      const created = await service.saveEntryDraft(
        'New draft row',
        undefined,
        undefined,
        employeeId.toString(),
      );
      const newEntry = created.entries[2];
      expect(newEntry).toMatchObject({ description: 'New draft row', status: 'DRAFT' });

      const updated = await service.submitEntry(
        'Updated submitted row',
        newEntry.id,
        3,
        employeeId.toString(),
      );
      expect(updated.entries[2]).toMatchObject({
        description: 'Updated submitted row',
        status: 'SUBMITTED',
        isVisible: true,
      });

      const hidden = await service.setEntryVisibility(
        newEntry.id,
        false,
        3,
        employeeId.toString(),
      );
      expect(hidden.entries[2].isVisible).toBe(false);

      const deleted = await service.deleteEntry(
        newEntry.id,
        3,
        employeeId.toString(),
      );
      expect(deleted.entries).toHaveLength(2);
      expect(record.updatedBy?.toString()).toBe(managerId.toString());
    },
  );

  function entry(
    description: string,
    status: 'DRAFT' | 'SUBMITTED',
    isVisible: boolean,
  ) {
    return {
      serialNo: 1,
      description,
      status,
      isVisible,
      submittedAt: status === 'SUBMITTED' ? new Date() : undefined,
    };
  }

  function mockRolesRecord(entries: Array<Record<string, unknown>>) {
    const record = new EmployeeRolesResponsibilities({
      employeeId,
      entries,
      status: EmployeeRoleResponsibilityStatus.SUBMITTED,
      isVisible: true,
      version: 1,
      createdBy: employeeId,
      updatedBy: employeeId,
    });
    jest
      .spyOn(EmployeeRolesResponsibilities, 'findOne')
      .mockResolvedValue(record as any);
  }

  function serviceFor(actorId: Types.ObjectId, role: string) {
    const context: RequestContext = {
      requestId: 'roles-responsibilities-test',
      reqRole: role.toUpperCase(),
      user: {
        _id: actorId,
        email: 'actor@example.com',
        name: 'Test Actor',
        role,
        departmentId: 'engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'employee',
        portalAccess: true,
      },
    };
    return new EmployeeRolesResponsibilitiesService(context);
  }

  function mockEmployeeManager(manager: string) {
    const query = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ managerId: manager }),
    };
    jest.spyOn(User, 'findById').mockReturnValue(query as any);
  }
});
