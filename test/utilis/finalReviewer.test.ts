import { Types } from 'mongoose';
import {
  FinalReviewerSource,
  FinalReviewStatus,
  resolveFinalReviewer,
  type FinalReviewerUser,
} from '../../src/utilis/finalReviewer';

const employeeId = new Types.ObjectId();
const l1Id = new Types.ObjectId();
const l2Id = new Types.ObjectId();
const directorId = new Types.ObjectId();
const fallbackId = new Types.ObjectId();

function finder(users: FinalReviewerUser[]) {
  return async (id: string) =>
    users.find((user) => user._id.toString() === id) ?? null;
}

describe('Final Reviewer resolution', () => {
  it('does not resolve a reviewer when Final Review is disabled', async () => {
    await expect(
      resolveFinalReviewer({
        employeeId,
        assignedManagerId: l1Id,
        finalReviewRequired: false,
        findUserById: finder([]),
      }),
    ).resolves.toEqual({
      finalReviewStatus: FinalReviewStatus.NOT_REQUIRED,
      directorReviewStatus: FinalReviewStatus.NOT_REQUIRED,
    });
  });

  it('uses the assigned L1 manager manager as the L2 Final Reviewer', async () => {
    const result = await resolveFinalReviewer({
      employeeId,
      assignedManagerId: l1Id,
      finalReviewRequired: true,
      findUserById: finder([
        {
          _id: l1Id,
          name: 'Plant Manager',
          role: 'manager',
          managerId: l2Id,
          active: true,
          portalAccess: true,
        },
        {
          _id: l2Id,
          employeeCode: 'SVP01',
          name: 'SVP',
          role: 'manager',
          specificRole: 'SVP',
          managerId: directorId,
          active: true,
          portalAccess: true,
        },
        {
          _id: directorId,
          name: 'Director',
          role: 'director',
          active: true,
          portalAccess: true,
        },
      ]),
    });

    expect(result.finalReviewStatus).toBe(FinalReviewStatus.PENDING);
    expect(result.finalReviewerId?.toString()).toBe(l2Id.toString());
    expect(result.finalReviewerSource).toBe(FinalReviewerSource.REPORTING_L2);
    expect(result.directorReviewerId?.toString()).toBe(directorId.toString());
  });

  it('uses saved employee L2 and L3 mappings before the reporting chain', async () => {
    const explicitL2Id = new Types.ObjectId();
    const explicitL3Id = new Types.ObjectId();
    const result = await resolveFinalReviewer({
      employeeId,
      assignedManagerId: l1Id,
      finalReviewRequired: true,
      findUserById: finder([
        {
          _id: employeeId,
          name: 'Employee',
          role: 'staff',
          l2ManagerId: explicitL2Id,
          l3ManagerId: explicitL3Id,
          active: true,
          portalAccess: true,
        },
        {
          _id: l1Id,
          name: 'L1',
          role: 'manager',
          managerId: l2Id,
          active: true,
          portalAccess: true,
        },
        {
          _id: explicitL2Id,
          name: 'Mapped L2',
          role: 'manager',
          active: true,
          portalAccess: true,
        },
        {
          _id: explicitL3Id,
          name: 'Mapped L3',
          role: 'director',
          active: true,
          portalAccess: true,
        },
      ]),
    });

    expect(result.finalReviewerId?.toString()).toBe(explicitL2Id.toString());
    expect(result.finalReviewerSource).toBe(FinalReviewerSource.EMPLOYEE_L2_MAPPING);
    expect(result.directorReviewerId?.toString()).toBe(explicitL3Id.toString());
    expect(result.directorReviewerSource).toBe(FinalReviewerSource.EMPLOYEE_L3_MAPPING);
  });

  it('allows L1 to repeat as L2 when L1 reports directly to the mapped L3 Director', async () => {
    const result = await resolveFinalReviewer({
      employeeId,
      assignedManagerId: l1Id,
      finalReviewRequired: true,
      findUserById: finder([
        {
          _id: employeeId,
          name: 'Employee',
          role: 'staff',
          l2ManagerId: l1Id,
          l3ManagerId: directorId,
          active: true,
          portalAccess: true,
        },
        {
          _id: l1Id,
          name: 'L1 and L2 Manager',
          role: 'manager',
          managerId: directorId,
          active: true,
          portalAccess: true,
        },
        {
          _id: directorId,
          name: 'Director',
          role: 'director',
          active: true,
          portalAccess: true,
        },
      ]),
    });

    expect(result.finalReviewerId?.toString()).toBe(l1Id.toString());
    expect(result.finalReviewerSource).toBe(FinalReviewerSource.EMPLOYEE_L2_MAPPING);
    expect(result.directorReviewerId?.toString()).toBe(directorId.toString());
    expect(result.directorReviewerSource).toBe(FinalReviewerSource.EMPLOYEE_L3_MAPPING);
  });

  it('uses the optional cycle fallback only when L2 is missing', async () => {
    const result = await resolveFinalReviewer({
      employeeId,
      assignedManagerId: l1Id,
      defaultFinalReviewerId: fallbackId,
      finalReviewRequired: true,
      findUserById: finder([
        {
          _id: l1Id,
          name: 'Manager',
          role: 'manager',
          active: true,
          portalAccess: true,
        },
        {
          _id: fallbackId,
          name: 'Director',
          role: 'director',
          active: true,
          portalAccess: true,
        },
      ]),
    });

    expect(result.finalReviewerId?.toString()).toBe(fallbackId.toString());
    expect(result.finalReviewerSource).toBe(FinalReviewerSource.CYCLE_DEFAULT);
    expect(result.directorReviewerId?.toString()).toBe(fallbackId.toString());
  });

  it('uses the same top Director for Final Review when Director is the assigned L1', async () => {
    const result = await resolveFinalReviewer({
      employeeId,
      assignedManagerId: l1Id,
      finalReviewRequired: true,
      findUserById: finder([
        {
          _id: l1Id,
          name: 'Director',
          role: 'director',
          active: true,
          portalAccess: true,
        },
      ]),
    });

    expect(result.finalReviewStatus).toBe(FinalReviewStatus.PENDING);
    expect(result.finalReviewerId?.toString()).toBe(l1Id.toString());
    expect(result.finalReviewerSource).toBe(FinalReviewerSource.L1_DIRECTOR);
    expect(result.directorReviewerId?.toString()).toBe(l1Id.toString());
  });

  it('keeps two sequential stages when the resolved L2 is also the Director', async () => {
    const result = await resolveFinalReviewer({
      employeeId,
      assignedManagerId: l1Id,
      finalReviewRequired: true,
      findUserById: finder([
        {
          _id: l1Id,
          name: 'Plant Manager',
          role: 'manager',
          managerId: directorId,
          active: true,
          portalAccess: true,
        },
        {
          _id: directorId,
          name: 'Director',
          role: 'director',
          active: true,
          portalAccess: true,
        },
      ]),
    });

    expect(result.finalReviewerId?.toString()).toBe(directorId.toString());
    expect(result.directorReviewerId?.toString()).toBe(directorId.toString());
    expect(result.finalReviewStatus).toBe(FinalReviewStatus.PENDING);
    expect(result.directorReviewStatus).toBe(FinalReviewStatus.PENDING);
  });

  it('rejects an inactive reviewer', async () => {
    await expect(
      resolveFinalReviewer({
        employeeId,
        assignedManagerId: l1Id,
        finalReviewRequired: true,
        findUserById: finder([
          {
            _id: l1Id,
            name: 'Manager',
            role: 'manager',
            managerId: l2Id,
          },
          {
            _id: l2Id,
            name: 'Inactive L2',
            role: 'manager',
            active: false,
          },
        ]),
      }),
    ).rejects.toThrow('Final Reviewer must be active');
  });
});
