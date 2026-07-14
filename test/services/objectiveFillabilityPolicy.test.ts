import { Types } from 'mongoose';
import { PmsRole, TermWorkflowState } from '../../src/constants/pms.enums';
import { ObjectiveService, type ObjectiveFillabilityPolicy } from '../../src/services/objective.service';
import type { RequestContext } from '../../src/types/context';

function createService(role: string) {
  const actorId = new Types.ObjectId();
  const context: RequestContext = {
    requestId: `objective-fillability-${role}`,
    reqRole: role.toLowerCase(),
    user: {
      _id: actorId,
      email: `${role.toLowerCase()}@example.com`,
      name: role,
      role,
      departmentId: 'Engineering',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'FULL',
      portalAccess: true,
    },
  };
  return new ObjectiveService(context) as any;
}

function createPolicy(
  role: string,
  editable: boolean,
  overrides: Partial<ObjectiveFillabilityPolicy['fields'][number]> = {},
): ObjectiveFillabilityPolicy {
  return {
    objectiveId: new Types.ObjectId().toString(),
    termAssignmentId: new Types.ObjectId().toString(),
    annualAssignmentId: new Types.ObjectId().toString(),
    cycleId: new Types.ObjectId().toString(),
    employeeId: new Types.ObjectId().toString(),
    assignedManagerId: new Types.ObjectId().toString(),
    assessmentTermCode: 'Q1',
    actorRole: role,
    actorUserId: new Types.ObjectId().toString(),
    workflowState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    canEditAnyField: editable,
    source: 'TEMPLATE',
    fields: [
      {
        templateFieldId: 'target_value',
        fieldKey: 'target_value',
        sectionKey: 'objectives',
        fieldLabel: 'Target Value',
        fieldType: 'text',
        visible: true,
        editable,
        required: false,
        roleCode: role,
        workflowState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
        ...overrides,
      },
    ],
  };
}

describe('ObjectiveService - objective fillability policy', () => {
  it('allows writes to editable template objective fields', () => {
    const service = createService(PmsRole.EMPLOYEE);

    expect(() =>
      service.assertObjectiveValuesFillable(
        [{ fieldKey: 'target_value', sectionKey: 'objectives', valueText: '100' }],
        createPolicy(PmsRole.EMPLOYEE, true),
      ),
    ).not.toThrow();
  });

  it('blocks non-admin writes to read-only template objective fields', () => {
    const service = createService(PmsRole.EMPLOYEE);

    expect(() =>
      service.assertObjectiveValuesFillable(
        [{ fieldKey: 'target_value', sectionKey: 'objectives', valueText: '100' }],
        createPolicy(PmsRole.EMPLOYEE, false),
      ),
    ).toThrow('Target Value');
  });

  it('keeps admin compatibility for visible fields on older templates', () => {
    const service = createService(PmsRole.ADMIN);

    expect(() =>
      service.assertObjectiveValuesFillable(
        [{ fieldKey: 'target_value', sectionKey: 'objectives', valueText: '100' }],
        createPolicy(PmsRole.ADMIN, false),
      ),
    ).not.toThrow();
  });

  it('allows a unique field key match when the submitted section key differs', () => {
    const service = createService(PmsRole.EMPLOYEE);

    expect(() =>
      service.assertObjectiveValuesFillable(
        [{ fieldKey: 'target_value', sectionKey: 'legacy_section_id', valueText: '100' }],
        createPolicy(PmsRole.EMPLOYEE, true),
      ),
    ).not.toThrow();
  });

  it('filters hidden and read-only values from assignment template autosave payloads', () => {
    const service = createService(PmsRole.EMPLOYEE);
    const policy = createPolicy(PmsRole.EMPLOYEE, true);
    policy.fields.push({
      templateFieldId: 'hidden_notes',
      fieldKey: 'hidden_notes',
      sectionKey: 'objectives',
      fieldLabel: 'Hidden Notes',
      fieldType: 'textarea',
      visible: false,
      editable: true,
      required: false,
      roleCode: PmsRole.EMPLOYEE,
      workflowState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    });
    policy.fields.push({
      templateFieldId: 'readonly_notes',
      fieldKey: 'readonly_notes',
      sectionKey: 'objectives',
      fieldLabel: 'Read-only Notes',
      fieldType: 'textarea',
      visible: true,
      editable: false,
      required: false,
      roleCode: PmsRole.EMPLOYEE,
      workflowState: TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    });

    expect(
      service.filterObjectiveValuesFillable(
        [
          { fieldKey: 'target_value', sectionKey: 'objectives', valueText: '100' },
          { fieldKey: 'hidden_notes', sectionKey: 'objectives', valueText: 'hidden' },
          { fieldKey: 'readonly_notes', sectionKey: 'objectives', valueText: 'readonly' },
          { fieldKey: 'unknown_notes', sectionKey: 'objectives', valueText: 'unknown' },
        ],
        policy,
      ),
    ).toEqual([{ fieldKey: 'target_value', sectionKey: 'objectives', valueText: '100' }]);
  });

  it('evaluates assignment template values with employee perspective for the assigned employee', () => {
    const service = createService(PmsRole.MANAGER);
    const employeeId = new Types.ObjectId();

    expect(
      service.assignmentTemplateValuePolicyRole(
        { employeeId } as any,
        { actorId: employeeId.toString(), actorRole: PmsRole.MANAGER },
        PmsRole.MANAGER,
      ),
    ).toBe(PmsRole.EMPLOYEE);
  });

  it('keeps admin perspective when an admin edits assignment template values', () => {
    const service = createService(PmsRole.ADMIN);
    const employeeId = new Types.ObjectId();

    expect(
      service.assignmentTemplateValuePolicyRole(
        { employeeId } as any,
        { actorId: employeeId.toString(), actorRole: PmsRole.ADMIN },
        PmsRole.ADMIN,
      ),
    ).toBe(PmsRole.ADMIN);
  });
});
