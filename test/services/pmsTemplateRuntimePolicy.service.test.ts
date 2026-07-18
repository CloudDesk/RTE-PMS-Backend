import { PmsTemplateFieldType } from '../../src/constants/pms.enums';
import type { ITemplateField } from '../../src/models/pms-template-version.model';
import { PmsTemplateService } from '../../src/services/pms-template.service';
import type { RequestContext } from '../../src/types/context';

function context(): RequestContext {
  return {
    requestId: 'template-runtime-policy-test',
    reqRole: 'ADMIN',
    user: {
      _id: '64b000000000000000000001',
      email: 'admin@test.local',
      name: 'Admin',
      role: 'ADMIN',
      departmentId: '',
      active: true,
      country: '',
      currency: '',
      licenseType: '',
      portalAccess: true,
    },
  } as unknown as RequestContext;
}

function serviceRuntime() {
  return new PmsTemplateService(context()) as unknown as {
    resolveVisibleFieldKeys(
      fields: ITemplateField[],
      context: {
        role: string;
        workflowState: string;
        visibilityFlags: Set<string>;
        values: Record<string, unknown>;
        policyManagedSection?: boolean;
      },
    ): Set<string>;
    toResolvedField(
      field: ITemplateField,
      context: {
        role: string;
        workflowState: string;
        visibilityFlags: Set<string>;
        policyManagedSection?: boolean;
      },
    ): { visible: boolean; editable: boolean; key: string };
  };
}

function finalDecisionField(): ITemplateField {
  return {
    fieldKey: 'annual_rating',
    fieldLabel: 'Final Annual Rating',
    fieldType: PmsTemplateFieldType.DROPDOWN,
    isRequired: true,
    visibilityRules: {
      visibleTo: ['EMPLOYEE', 'ADMIN', 'MANAGEMENT', 'DIRECTOR'],
      visibleStates: [
        'MANAGEMENT_DECISION_DRAFT',
        'MANAGEMENT_DECISION_SUBMITTED',
        'ANNUAL_FINALIZED',
        'VISIBILITY_ENABLED',
      ],
    },
    editabilityRules: {
      editableBy: ['ADMIN', 'MANAGEMENT'],
      editableStates: ['MANAGEMENT_DECISION_DRAFT', 'MANAGEMENT_DECISION_SUBMITTED'],
    },
    options: [
      { label: 'Meets Expectation', value: 'meets_expectation' },
    ],
    behaviors: [
      {
        role: 'ADMIN',
        workflowState: 'MANAGEMENT_DECISION_DRAFT',
        visibility: 'VISIBLE',
        editability: 'EDITABLE',
        mandatory: true,
      },
      {
        role: 'MANAGEMENT',
        workflowState: 'MANAGEMENT_DECISION_DRAFT',
        visibility: 'VISIBLE',
        editability: 'EDITABLE',
        mandatory: true,
      },
      {
        role: 'DIRECTOR',
        workflowState: 'MANAGEMENT_DECISION_SUBMITTED',
        visibility: 'VISIBLE',
        editability: 'READ_ONLY',
        mandatory: false,
      },
      {
        role: 'DIRECTOR',
        workflowState: 'VISIBILITY_ENABLED',
        visibility: 'VISIBLE',
        editability: 'READ_ONLY',
        mandatory: false,
      },
      {
        role: 'EMPLOYEE',
        workflowState: 'VISIBILITY_ENABLED',
        visibility: 'VISIBLE',
        editability: 'READ_ONLY',
        mandatory: false,
      },
    ],
  };
}

describe('PMS template runtime policy regression', () => {
  it('does not show Director Management Decision Draft fields for policy-managed sections', () => {
    const runtime = serviceRuntime();
    const fields = [finalDecisionField()];

    const visibleKeys = runtime.resolveVisibleFieldKeys(fields, {
      role: 'DIRECTOR',
      workflowState: 'MANAGEMENT_DECISION_DRAFT',
      visibilityFlags: new Set(),
      values: {},
      policyManagedSection: true,
    });

    expect([...visibleKeys]).toEqual([]);
  });

  it('keeps Admin and Management editable in Management Decision Draft', () => {
    const runtime = serviceRuntime();
    const field = finalDecisionField();

    expect(
      runtime.toResolvedField(field, {
        role: 'ADMIN',
        workflowState: 'MANAGEMENT_DECISION_DRAFT',
        visibilityFlags: new Set(),
        policyManagedSection: true,
      }).editable,
    ).toBe(true);
    expect(
      runtime.toResolvedField(field, {
        role: 'MANAGEMENT',
        workflowState: 'MANAGEMENT_DECISION_DRAFT',
        visibilityFlags: new Set(),
        policyManagedSection: true,
      }).editable,
    ).toBe(true);
  });

  it('shows Director as read-only after Management Decision is submitted', () => {
    const runtime = serviceRuntime();
    const field = finalDecisionField();
    const visibleKeys = runtime.resolveVisibleFieldKeys([field], {
      role: 'DIRECTOR',
      workflowState: 'MANAGEMENT_DECISION_SUBMITTED',
      visibilityFlags: new Set(),
      values: {},
      policyManagedSection: true,
    });
    const resolved = runtime.toResolvedField(field, {
      role: 'DIRECTOR',
      workflowState: 'MANAGEMENT_DECISION_SUBMITTED',
      visibilityFlags: new Set(),
      policyManagedSection: true,
    });

    expect([...visibleKeys]).toEqual(['annual_rating']);
    expect(resolved.editable).toBe(false);
  });

  it('keeps legacy non-policy sections compatible with visibilityRules fallback', () => {
    const runtime = serviceRuntime();
    const fields = [finalDecisionField()];

    const visibleKeys = runtime.resolveVisibleFieldKeys(fields, {
      role: 'DIRECTOR',
      workflowState: 'MANAGEMENT_DECISION_DRAFT',
      visibilityFlags: new Set(),
      values: {},
      policyManagedSection: false,
    });

    expect([...visibleKeys]).toEqual(['annual_rating']);
  });
});
