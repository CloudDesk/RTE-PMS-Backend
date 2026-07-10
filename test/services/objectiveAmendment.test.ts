import { Types } from 'mongoose';
import {
  AssessmentTermCode,
  FlexibleObjectiveSourceType,
  ObjectiveApplicabilityStatus,
  ObjectiveSource,
  ObjectiveStatus,
  TermWorkflowState,
} from '../../src/constants/pms.enums';
import { ObjectiveService } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

describe('ObjectiveService - Flexible objective amendment helpers', () => {
  const actorId = new Types.ObjectId();
  let service: any;

  beforeEach(() => {
    const context: RequestContext = {
      requestId: 'objective-amendment-test',
      reqRole: 'admin',
      user: {
        _id: actorId,
        email: 'admin@example.com',
        name: 'Admin',
        role: 'ADMIN',
        departmentId: 'Engineering',
        active: true,
        country: 'IN',
        currency: 'INR',
        licenseType: 'FULL',
        portalAccess: true,
      },
    };
    service = new ObjectiveService(context) as any;
  });

  it('blocks amendments on finalized or closed term assignments', () => {
    expect(() => service.assertObjectiveAmendmentAllowed({
      termState: TermWorkflowState.TERM_FINALIZED,
    })).toThrow('Finalized or closed term objectives cannot be amended');

    expect(() => service.assertObjectiveAmendmentAllowed({
      termState: TermWorkflowState.CLOSED_BY_ADMIN,
    })).toThrow('Finalized or closed term objectives cannot be amended');
  });

  it('keeps amendment state separate from legacy objective workflow status', () => {
    const objective = {
      source: ObjectiveSource.PREDEFINED,
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
      applicabilityStatus: ObjectiveApplicabilityStatus.NOT_APPLICABLE,
      objectiveMasterId: new Types.ObjectId(),
      objectiveVersionId: new Types.ObjectId(),
      assessmentTerm: AssessmentTermCode.Q1,
      sourceType: FlexibleObjectiveSourceType.COMPANY_OBJECTIVE,
    };

    expect(objective.status).toBe(ObjectiveStatus.OBJECTIVE_APPROVED);
    expect(objective.applicabilityStatus).toBe(ObjectiveApplicabilityStatus.NOT_APPLICABLE);
  });
});
