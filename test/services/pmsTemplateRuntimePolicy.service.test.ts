import { PmsTemplateFieldType } from '../../src/constants/pms.enums';
import type { ITemplateField } from '../../src/models/pms-template-version.model';
import { PmsTemplateService } from '../../src/services/pms-template.service';
import type { RequestContext } from '../../src/types/context';
import { PmsEmployeeCareerProfile } from '../../src/models/pms-employee-career-profile.model';

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
    ): {
      visible: boolean;
      editable: boolean;
      key: string;
      metadata?: Record<string, unknown>;
    };
    resolveEmployeeProfileSystemValues(
      employeeId?: string,
    ): Promise<Record<string, unknown>>;
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
  afterEach(() => {
    jest.restoreAllMocks();
  });
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

  it('forces employee career-profile bindings to remain read-only and preserves binding metadata', () => {
    const runtime = serviceRuntime();
    const field: ITemplateField = {
      fieldKey: 'employeeProfile.currentGrade',
      fieldLabel: 'Current Grade',
      fieldType: PmsTemplateFieldType.SHORT_TEXT,
      visibilityRules: { visibleTo: ['ADMIN', 'MANAGER'] },
      editabilityRules: { editableBy: ['ADMIN', 'MANAGER'] },
      metadata: {
        bindingKey: 'employeeProfile.currentGrade',
        valueSourceType: 'PMS_EMPLOYEE_CAREER_PROFILE',
      },
    };

    const resolved = runtime.toResolvedField(field, {
      role: 'ADMIN',
      workflowState: 'MANAGER_REVIEW_OPEN',
      visibilityFlags: new Set(),
    });

    expect(resolved.editable).toBe(false);
    expect(resolved.metadata).toMatchObject({
      bindingKey: 'employeeProfile.currentGrade',
      valueSourceType: 'PMS_EMPLOYEE_CAREER_PROFILE',
    });
  });

  it('resolves standardized scalar and repeating career-profile bindings without a generic grade key', async () => {
    jest.spyOn(PmsEmployeeCareerProfile, 'findOne').mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        qualification: 'B.E.',
        currentGrade: 'G5',
        gradeEffectiveDate: new Date('2025-01-12T00:00:00.000Z'),
        yearsInGrade: undefined,
        previousExperienceYears: 4,
        asOfDate: new Date('2026-07-24T00:00:00.000Z'),
        careerProgressionPast: [
          {
            year: 2023,
            grade: 'G4',
            function: 'Production',
            unitOrDepartment: 'Plant 1',
            sequence: 1,
          },
        ],
      }),
    } as any);

    const values = await serviceRuntime().resolveEmployeeProfileSystemValues(
      '64b000000000000000000099',
    );

    expect(values['employeeProfile.currentGrade']).toBe('G5');
    expect(values['employeeProfile.gradeEffectiveDate']).toBe('2025-01-12');
    expect(values['employeeProfile.careerProgressionPast']).toEqual([
      {
        year: 2023,
        grade: 'G4',
        function: 'Production',
        unitOrDepartment: 'Plant 1',
      },
    ]);
    expect(values).not.toHaveProperty('grade');
  });
});
