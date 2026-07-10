import { Types } from 'mongoose';
import {
  FlexibleObjectiveSourceType,
  ObjectiveMasterStatus,
  ObjectiveMasterVersionStatus,
} from '../../src/constants/pms.enums';
import { ObjectiveMaster } from '../../src/models/pms-objective-master.model';
import { ObjectiveMasterVersion } from '../../src/models/pms-objective-master-version.model';
import { ObjectiveService } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - Objective Master versioning', () => {
  const actorId = new Types.ObjectId();
  const versionId = new Types.ObjectId();
  const masterId = new Types.ObjectId();
  let service: ObjectiveService;

  beforeEach(() => {
    jest.restoreAllMocks();
    const context: RequestContext = {
      requestId: 'objective-versioning-test',
      reqRole: 'admin',
      user: {
        _id: actorId,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        departmentId: 'HR',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    service = new ObjectiveService(context);
  });

  function createServiceFor(role: string, departmentId = 'Engineering') {
    const context: RequestContext = {
      requestId: `objective-versioning-${role}`,
      reqRole: role.toLowerCase(),
      user: {
        _id: actorId,
        email: `${role.toLowerCase()}@example.com`,
        name: role,
        role,
        departmentId,
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    return new ObjectiveService(context);
  }

  it('allows only the current active Objective Master Version to be assigned', async () => {
    jest.spyOn(ObjectiveMasterVersion, 'findOne').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: versionId,
        objectiveMasterId: masterId,
        versionNo: 1,
        status: ObjectiveMasterVersionStatus.ACTIVE,
        title: 'Improve release quality',
        createdBy: actorId,
        applicableTermLabels: [],
      }),
    } as any);
    jest.spyOn(ObjectiveMaster, 'findOne').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: masterId,
        currentVersionId: versionId,
        status: ObjectiveMasterStatus.ACTIVE,
        createdBy: actorId,
      }),
    } as any);

    const result = await service.assertObjectiveVersionAssignable(versionId.toString());

    expect(result.id).toBe(versionId.toString());
    expect(result.status).toBe(ObjectiveMasterVersionStatus.ACTIVE);
  });

  it('blocks Draft, Inactive, and Archived Objective Master Versions from assignment', async () => {
    jest.spyOn(ObjectiveMasterVersion, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: versionId,
        objectiveMasterId: masterId,
        versionNo: 1,
        status: ObjectiveMasterVersionStatus.DRAFT,
        title: 'Improve release quality',
        createdBy: actorId,
        applicableTermLabels: [],
      }),
    } as any);

    await expect(
      service.assertObjectiveVersionAssignable(versionId.toString()),
    ).rejects.toThrow('Only Active objective versions can be assigned');
  });

  it('allows a configured reviewer to review but not assign a version', async () => {
    const reviewerService = createServiceFor('DEPARTMENT_HEAD', 'Engineering');
    jest.spyOn(ObjectiveMasterVersion, 'findOne')
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: versionId,
          objectiveMasterId: masterId,
          versionNo: 1,
          status: ObjectiveMasterVersionStatus.ACTIVE,
          title: 'Improve release quality',
          reviewerRole: 'DEPARTMENT_HEAD',
          reviewerDepartment: 'Engineering',
          createdBy: actorId,
          applicableTermLabels: [],
        }),
      } as any)
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: versionId,
          objectiveMasterId: masterId,
          versionNo: 1,
          status: ObjectiveMasterVersionStatus.ACTIVE,
          title: 'Improve release quality',
          reviewerRole: 'DEPARTMENT_HEAD',
          reviewerDepartment: 'Engineering',
          createdBy: actorId,
          applicableTermLabels: [],
        }),
      } as any);
    jest.spyOn(ObjectiveMaster, 'findOne')
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: masterId,
          sourceType: FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE,
          status: ObjectiveMasterStatus.ACTIVE,
          createdBy: actorId,
        }),
      } as any)
      .mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({
          _id: masterId,
          sourceType: FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE,
          currentVersionId: versionId,
          status: ObjectiveMasterStatus.ACTIVE,
          createdBy: actorId,
        }),
      } as any);

    await expect(
      reviewerService.assertObjectiveVersionReviewable(versionId.toString()),
    ).resolves.toMatchObject({ id: versionId.toString() });

    await expect(
      reviewerService.assertObjectiveVersionAssignable(versionId.toString()),
    ).rejects.toThrow('Only Admin or the Objective Assigner can assign this objective version');
  });

  it('blocks Department Head review access outside the configured department scope', async () => {
    const reviewerService = createServiceFor('DEPARTMENT_HEAD', 'Engineering');
    jest.spyOn(ObjectiveMasterVersion, 'findOne').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: versionId,
        objectiveMasterId: masterId,
        versionNo: 1,
        status: ObjectiveMasterVersionStatus.ACTIVE,
        title: 'Improve release quality',
        reviewerRole: 'DEPARTMENT_HEAD',
        reviewerDepartment: 'Sales',
        createdBy: actorId,
        applicableTermLabels: [],
      }),
    } as any);
    jest.spyOn(ObjectiveMaster, 'findOne').mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: masterId,
        sourceType: FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE,
        status: ObjectiveMasterStatus.ACTIVE,
        createdBy: actorId,
      }),
    } as any);

    await expect(
      reviewerService.assertObjectiveVersionReviewable(versionId.toString()),
    ).rejects.toThrow('Only Admin or the Objective Reviewer can review this objective version');
  });

  it('does not let a reviewer activate an Objective Master Version unless separately configured as owner', async () => {
    const reviewerService = createServiceFor('DEPARTMENT_HEAD', 'Engineering');
    const save = jest.fn();
    jest.spyOn(ObjectiveMasterVersion, 'findOne').mockReturnValueOnce({
      _id: versionId,
      objectiveMasterId: masterId,
      versionNo: 1,
      status: ObjectiveMasterVersionStatus.DRAFT,
      title: 'Improve release quality',
      reviewerRole: 'DEPARTMENT_HEAD',
      reviewerDepartment: 'Engineering',
      createdBy: actorId,
      applicableTermLabels: [],
      save,
    } as any);
    jest.spyOn(ObjectiveMaster, 'findOne').mockReturnValueOnce({
      _id: masterId,
      sourceType: FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE,
      status: ObjectiveMasterStatus.ACTIVE,
      ownerUserId: new Types.ObjectId(),
      ownerRole: 'DEPARTMENT_HEAD',
      ownerDepartment: 'Sales',
      createdBy: actorId,
      save,
    } as any);

    await expect(
      reviewerService.activateObjectiveMasterVersion(versionId.toString()),
    ).rejects.toThrow('Only Admin or the Objective Owner can perform this action');
    expect(save).not.toHaveBeenCalled();
  });
});
