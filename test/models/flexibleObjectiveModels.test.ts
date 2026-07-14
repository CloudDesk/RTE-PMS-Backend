import { Types } from 'mongoose';
import {
  AssessmentTermCode,
  FlexibleObjectiveSourceType,
  ObjectiveAssignmentRuleStatus,
  ObjectiveAttachmentPolicy,
  ObjectiveMasterVersionStatus,
  ObjectiveSource,
  ObjectiveStatus,
  ObjectiveTargetDirection,
} from '../../src/constants/pms.enums';
import { ObjectiveAssignmentRule } from '../../src/models/pms-objective-assignment-rule.model';
import { ObjectiveMaster } from '../../src/models/pms-objective-master.model';
import { ObjectiveMasterVersion } from '../../src/models/pms-objective-master-version.model';
import { Objective } from '../../src/models/pms-objective.model';

describe('Flexible objective model foundation', () => {
  const userId = new Types.ObjectId();

  it('keeps legacy assigned objectives valid without flexible objective fields', () => {
    const objective = new Objective({
      termAssignmentId: new Types.ObjectId(),
      employeeId: new Types.ObjectId(),
      assignedManagerId: new Types.ObjectId(),
      source: ObjectiveSource.EMPLOYEE_CREATED,
      title: 'Improve customer follow-up',
      status: ObjectiveStatus.OBJECTIVE_DRAFT,
      createdByRole: 'EMPLOYEE',
      createdByUserId: userId,
      createdBy: userId,
    });

    expect(objective.validateSync()).toBeUndefined();
    expect(objective.objectiveMasterId).toBeUndefined();
    expect(objective.objectiveSnapshot).toBeUndefined();
  });

  it('validates objective master ownership and source type', () => {
    const master = new ObjectiveMaster({
      sourceType: FlexibleObjectiveSourceType.DEPARTMENT_OBJECTIVE,
      ownerUserId: userId,
      ownerRole: 'DEPARTMENT_HEAD',
      ownerDepartment: 'Engineering',
      createdBy: userId,
    });

    expect(master.validateSync()).toBeUndefined();
    expect(master.status).toBe('ACTIVE');
  });

  it('accepts an LOV-defined objective master source type without a hardcoded enum', () => {
    const master = new ObjectiveMaster({
      sourceType: 'CUSTOM_GROUP_OBJECTIVE',
      ownerUserId: userId,
      ownerRole: 'ADMIN',
      createdBy: userId,
    });

    expect(master.validateSync()).toBeUndefined();
  });

  it('validates objective master versions as immutable business-detail records', () => {
    const version = new ObjectiveMasterVersion({
      objectiveMasterId: new Types.ObjectId(),
      versionNo: 1,
      status: ObjectiveMasterVersionStatus.DRAFT,
      title: 'Reduce escaped defects',
      description: 'Improve release quality for the assessment term.',
      measurementGuidance: 'Track escaped production defects.',
      targetValue: 'Less than 3 escaped defects',
      targetDescription: 'Production defects after release',
      targetDirection: ObjectiveTargetDirection.DECREASE,
      priority: 'HIGH',
      attachmentPolicy: ObjectiveAttachmentPolicy.OPTIONAL,
      scoreable: true,
      approvedWeightage: 20,
      applicableTermLabels: [AssessmentTermCode.Q1],
      ownerUserId: userId,
      ownerRole: 'MANAGER',
      assignerUserId: userId,
      assignerRole: 'MANAGER',
      createdBy: userId,
    });

    expect(version.validateSync()).toBeUndefined();
  });

  it('validates assignment rules with cycle, term, org, and employee targeting', () => {
    const rule = new ObjectiveAssignmentRule({
      objectiveMasterId: new Types.ObjectId(),
      objectiveVersionId: new Types.ObjectId(),
      cycleId: new Types.ObjectId(),
      assessmentTermType: 'QUARTERLY',
      termLabels: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
      status: ObjectiveAssignmentRuleStatus.ACTIVE,
      effectiveFrom: new Date('2026-07-01T00:00:00.000Z'),
      criteria: {
        company: 'RTE',
        businessUnit: 'Cloud',
        location: 'Chennai',
        department: 'Engineering',
        team: 'Platform',
        role: 'Engineer',
        designation: 'Senior Engineer',
        grade: 'G5',
        employeeGroup: 'Full Time',
        reportingManagerId: userId,
        employeeIds: [new Types.ObjectId()],
      },
      note: 'Assigned to the platform team for Q1 and Q2 focus.',
      createdBy: userId,
    });

    expect(rule.validateSync()).toBeUndefined();
  });

  it('stores frozen objective snapshots on assigned objectives when flexible mode is used', () => {
    const objectiveMasterId = new Types.ObjectId();
    const objectiveVersionId = new Types.ObjectId();
    const assignmentRuleId = new Types.ObjectId();
    const objective = new Objective({
      termAssignmentId: new Types.ObjectId(),
      annualAssignmentId: new Types.ObjectId(),
      cycleId: new Types.ObjectId(),
      assessmentTermCode: AssessmentTermCode.Q1,
      assessmentTerm: AssessmentTermCode.Q1,
      employeeId: new Types.ObjectId(),
      assignedManagerId: userId,
      objectiveMasterId,
      objectiveVersionId,
      assignmentRuleRefs: [assignmentRuleId],
      sourceType: FlexibleObjectiveSourceType.COMPANY_OBJECTIVE,
      source: ObjectiveSource.PREDEFINED,
      isPredefined: true,
      title: 'Reduce release incidents',
      status: ObjectiveStatus.OBJECTIVE_APPROVED,
      createdByRole: 'ADMIN',
      createdByUserId: userId,
      createdBy: userId,
      objectiveSnapshot: {
        title: 'Reduce release incidents',
        description: 'Frozen copy from objective master version 1.',
        source: FlexibleObjectiveSourceType.COMPANY_OBJECTIVE,
        measurementGuidance: 'Track P1 and P2 incidents after release.',
        targetValue: 'Zero P1 incidents',
        targetDescription: 'Release stability target',
        targetDirection: ObjectiveTargetDirection.DECREASE,
        priority: 'HIGH',
        attachmentPolicy: ObjectiveAttachmentPolicy.OPTIONAL,
        scoreable: true,
        approvedWeightage: 25,
        applicableTerm: AssessmentTermCode.Q1,
        ownerUserId: userId,
        ownerRole: 'ADMIN',
        assignerUserId: userId,
        assignerRole: 'ADMIN',
        frozenAt: new Date('2026-07-07T00:00:00.000Z'),
      },
    });

    expect(objective.validateSync()).toBeUndefined();
    expect(objective.assignmentRuleRefs?.map(String)).toContain(String(assignmentRuleId));
    expect(objective.objectiveSnapshot?.title).toBe('Reduce release incidents');
  });
});
