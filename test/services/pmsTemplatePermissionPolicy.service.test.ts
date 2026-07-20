import { PmsTemplateSectionLevel, PmsTemplateSectionType } from '../../src/constants/pms.enums';
import type { ITemplateSection } from '../../src/models/pms-template-version.model';
import {
  getSectionPermissionPurpose,
  normalizeTemplateSectionPermissionPolicy,
  permissionPolicyValidationErrors,
} from '../../src/services/pms-template-permission-policy';

function managementDecisionSection(
  role: string,
  editability: 'EDITABLE' | 'READ_ONLY',
): ITemplateSection {
  return {
    sectionKey: 'final_annual_decision',
    sectionLabel: 'Final Annual Decision',
    sectionType: PmsTemplateSectionType.FINAL_GRADE,
    level: PmsTemplateSectionLevel.ANNUAL,
    metadata: {
      permissionPurpose: 'MANAGEMENT_DECISION',
      permissionPolicyVersion: 'PERMISSION_POLICY_V1',
    },
    fields: [
      {
        fieldKey: 'annual_rating',
        fieldLabel: 'Final Annual Rating',
        fieldType: 'DROPDOWN',
        behaviors: [
          {
            role,
            workflowState: 'MANAGEMENT_DECISION_DRAFT',
            visibility: 'VISIBLE',
            editability,
            mandatory: false,
          },
        ],
      },
    ],
  };
}

describe('PMS template permission policy validation', () => {
  it('infers legacy employee achievement purpose from metadata', () => {
    expect(
      getSectionPermissionPurpose({
        sectionKey: 'employee_achievement_submission',
        sectionLabel: 'Employee Achievement Submission',
        sectionType: PmsTemplateSectionType.OBJECTIVES,
        level: PmsTemplateSectionLevel.TERM,
        metadata: {
          purpose: 'EMPLOYEE_ACHIEVEMENT_SUBMISSION',
        },
        fields: [],
      }),
    ).toBe('EMPLOYEE_ACHIEVEMENT');
  });

  it('allows Admin and Management to edit Management Decision Draft', () => {
    expect(
      permissionPolicyValidationErrors([
        managementDecisionSection('ADMIN', 'EDITABLE'),
        managementDecisionSection('MANAGEMENT', 'EDITABLE'),
      ]),
    ).toEqual([]);
  });

  it('blocks Director edit access in Management Decision Draft for policy-managed sections', () => {
    expect(
      permissionPolicyValidationErrors([
        managementDecisionSection('DIRECTOR', 'EDITABLE'),
      ]),
    ).toEqual([
      'Only ADMIN and MANAGEMENT can edit Management Decision Draft fields. Field "Final Annual Rating" grants "DIRECTOR" edit access in section "Final Annual Decision"',
    ]);
  });

  it('blocks duplicate role and workflow behavior rows', () => {
    const section = managementDecisionSection('DIRECTOR', 'READ_ONLY');
    section.fields[0].behaviors = [
      section.fields[0].behaviors![0],
      { ...section.fields[0].behaviors![0] },
    ];

    expect(permissionPolicyValidationErrors([section])).toEqual([
      'Duplicate workflow behavior for role "DIRECTOR" and state "MANAGEMENT_DECISION_DRAFT" in field "Final Annual Rating" (section "Final Annual Decision")',
    ]);
  });

  it('blocks hidden editable behavior rows', () => {
    const section = managementDecisionSection('EMPLOYEE', 'EDITABLE');
    section.fields[0].behaviors![0].visibility = 'HIDDEN';

    expect(permissionPolicyValidationErrors([section])).toEqual([
      'Hidden behavior cannot be editable for role "EMPLOYEE" and state "MANAGEMENT_DECISION_DRAFT" in field "Final Annual Rating" (section "Final Annual Decision")',
      'Only ADMIN and MANAGEMENT can edit Management Decision Draft fields. Field "Final Annual Rating" grants "EMPLOYEE" edit access in section "Final Annual Decision"',
    ]);
  });

  it('normalizes a policy section with generated metadata and behavior rows', () => {
    const normalized = normalizeTemplateSectionPermissionPolicy(
      managementDecisionSection('DIRECTOR', 'EDITABLE'),
    );
    const field = normalized.fields[0];

    expect(normalized.metadata?.permissionPurpose).toBe('MANAGEMENT_DECISION');
    expect(normalized.metadata?.permissionPolicyVersion).toBe('PERMISSION_POLICY_V1');
    expect(field.metadata?.permissionPolicyVersion).toBe('PERMISSION_POLICY_V1');
    expect(field.metadata?.workflowBehaviorMode).toBe('AUTO');
    expect(field.behaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'ADMIN',
          workflowState: 'MANAGEMENT_DECISION_DRAFT',
          visibility: 'VISIBLE',
          editability: 'EDITABLE',
        }),
        expect.objectContaining({
          role: 'MANAGEMENT',
          workflowState: 'MANAGEMENT_DECISION_DRAFT',
          visibility: 'VISIBLE',
          editability: 'EDITABLE',
        }),
        expect.objectContaining({
          role: 'DIRECTOR',
          workflowState: 'MANAGEMENT_DECISION_SUBMITTED',
          visibility: 'VISIBLE',
          editability: 'READ_ONLY',
        }),
      ]),
    );
    expect(
      field.behaviors?.some(
        (behavior) =>
          behavior.role === 'DIRECTOR' &&
          behavior.workflowState === 'MANAGEMENT_DECISION_DRAFT',
      ),
    ).toBe(false);
  });

  it('preserves field permission override metadata while normalizing behavior rows', () => {
    const section = managementDecisionSection('DIRECTOR', 'READ_ONLY');
    section.fields[0].metadata = {
      permissionOverride: {
        DIRECTOR: 'hidden',
      },
    };

    const normalized = normalizeTemplateSectionPermissionPolicy(section);
    const field = normalized.fields[0];

    expect(field.metadata?.permissionOverride).toEqual({ DIRECTOR: 'hidden' });
    expect(
      field.behaviors?.filter((behavior) => behavior.role === 'DIRECTOR'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'DIRECTOR',
          visibility: 'HIDDEN',
          editability: 'READ_ONLY',
        }),
      ]),
    );
  });

  it('normalizes objective setting to one workflow state per role policy', () => {
    const normalized = normalizeTemplateSectionPermissionPolicy({
      sectionKey: 'objective_management',
      sectionLabel: 'Objective Management',
      sectionType: PmsTemplateSectionType.OBJECTIVES,
      level: PmsTemplateSectionLevel.TERM,
      repeatFor: ['Q1'],
      metadata: {
        permissionPurpose: 'OBJECTIVE_SETTING',
      },
      fields: [
        {
          fieldKey: 'objective_notes',
          fieldLabel: 'Objective Notes',
          fieldType: 'LONG_TEXT',
          isRequired: true,
          behaviors: [],
        },
      ],
    });
    const behaviors = normalized.fields[0].behaviors ?? [];

    expect(behaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'EMPLOYEE',
          workflowState: 'OBJECTIVE_SETTING_OPEN',
          editability: 'EDITABLE',
          mandatory: true,
        }),
        expect.objectContaining({
          role: 'MANAGER',
          workflowState: 'MANAGER_REVIEW_OPEN',
          editability: 'READ_ONLY',
          mandatory: false,
        }),
        expect.objectContaining({
          role: 'ADMIN',
          workflowState: 'MANAGEMENT_DECISION_DRAFT',
          editability: 'EDITABLE',
          mandatory: true,
        }),
      ]),
    );
    expect(
      behaviors.filter((behavior) => behavior.role === 'EMPLOYEE'),
    ).toHaveLength(1);
    expect(
      behaviors.some(
        (behavior) =>
          behavior.role === 'EMPLOYEE' &&
          ['OBJECTIVE_DRAFT', 'OBJECTIVE_SUBMITTED', 'OBJECTIVE_APPROVED'].includes(
            behavior.workflowState,
          ),
      ),
    ).toBe(false);
    expect(
      behaviors.some(
        (behavior) =>
          behavior.role === 'MANAGER' &&
          ['OBJECTIVE_SETTING_OPEN', 'OBJECTIVE_SUBMITTED', 'OBJECTIVE_APPROVED'].includes(
            behavior.workflowState,
          ),
      ),
    ).toBe(false);
  });

  it('normalizes visibility communication without redundant annual state rows', () => {
    const normalized = normalizeTemplateSectionPermissionPolicy({
      sectionKey: 'visibility_governance',
      sectionLabel: 'Visibility Governance',
      sectionType: PmsTemplateSectionType.VISIBILITY_GOVERNANCE,
      level: PmsTemplateSectionLevel.ANNUAL,
      metadata: {
        permissionPurpose: 'VISIBILITY_COMMUNICATION',
      },
      fields: [
        {
          fieldKey: 'communication_note',
          fieldLabel: 'Communication Note',
          fieldType: 'LONG_TEXT',
          isRequired: true,
          metadata: {
            workflowBehaviorMode: 'AUTO',
          },
          behaviors: [
            {
              role: 'MANAGER',
              workflowState: 'COMMUNICATION_SENT',
              visibility: 'HIDDEN',
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
          ],
        },
      ],
    });
    const behaviors = normalized.fields[0].behaviors ?? [];

    expect(behaviors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'ADMIN',
          workflowState: 'COMMUNICATION_READY',
          editability: 'EDITABLE',
        }),
        expect.objectContaining({
          role: 'MANAGEMENT',
          workflowState: 'COMMUNICATION_READY',
          editability: 'READ_ONLY',
        }),
        expect.objectContaining({
          role: 'DIRECTOR',
          workflowState: 'COMMUNICATION_READY',
          editability: 'READ_ONLY',
        }),
      ]),
    );
    expect(behaviors.some((behavior) => behavior.role === 'MANAGER')).toBe(false);
    expect(
      behaviors.some((behavior) =>
        ['COMMUNICATION_SENT', 'VISIBILITY_ENABLED'].includes(
          behavior.workflowState,
        ),
      ),
    ).toBe(false);
  });
});
