import { PmsTemplateSectionType } from '../constants/pms.enums';
import type {
  ITemplateBehaviorRule,
  ITemplateField,
  ITemplateSection,
} from '../models/pms-template-version.model';

export type TemplatePermissionPurpose =
  | 'OBJECTIVE_SETTING'
  | 'EMPLOYEE_ACHIEVEMENT'
  | 'MANAGER_REVIEW'
  | 'MANAGEMENT_DECISION'
  | 'VISIBILITY_COMMUNICATION'
  | 'GENERAL';

const POLICY_VERSION = 'PERMISSION_POLICY_V1';

const ROLE_ORDER = ['EMPLOYEE', 'MANAGER', 'ADMIN', 'MANAGEMENT', 'DIRECTOR'] as const;

type PermissionAccessLevel = 'hidden' | 'view' | 'edit';

type PermissionRoleAccessPolicy = Partial<Record<(typeof ROLE_ORDER)[number], PermissionAccessLevel>>;

const MANAGEMENT_DECISION_DRAFT_EDIT_ROLES = new Set(['ADMIN', 'MANAGEMENT']);

const MANAGEMENT_DECISION_SECTION_TYPES = new Set<string>([
  PmsTemplateSectionType.ANNUAL_SUMMARY,
  PmsTemplateSectionType.FINAL_GRADE,
  PmsTemplateSectionType.MERIT,
  PmsTemplateSectionType.APPRAISAL_COMMUNICATION,
  PmsTemplateSectionType.OVERALL_FEEDBACK,
]);

const MANAGER_REVIEW_SECTION_TYPES = new Set<string>([
  PmsTemplateSectionType.COMPETENCIES,
  PmsTemplateSectionType.KPIS,
  PmsTemplateSectionType.BEHAVIOURAL_TRAITS,
  PmsTemplateSectionType.DEVELOPMENT_PLAN,
  PmsTemplateSectionType.QUARTER_REVIEW,
]);

export function permissionPolicyValidationErrors(
  sections: ITemplateSection[],
): string[] {
  const errors: string[] = [];

  for (const section of sections) {
    const policyManaged = section.metadata?.permissionPolicyVersion === POLICY_VERSION;
    const purpose = getSectionPermissionPurpose(section);

    for (const field of section.fields ?? []) {
      const seenBehaviorKeys = new Set<string>();

      for (const behavior of field.behaviors ?? []) {
        const behaviorKey = `${behavior.role}:${behavior.workflowState}`;
        const fieldLabel = field.fieldLabel || field.fieldKey;
        const sectionLabel = section.sectionLabel || section.sectionKey;

        if (seenBehaviorKeys.has(behaviorKey)) {
          errors.push(
            `Duplicate workflow behavior for role "${behavior.role}" and state "${behavior.workflowState}" in field "${fieldLabel}" (section "${sectionLabel}")`,
          );
        }
        seenBehaviorKeys.add(behaviorKey);

        if (behavior.visibility === 'HIDDEN' && behavior.editability === 'EDITABLE') {
          errors.push(
            `Hidden behavior cannot be editable for role "${behavior.role}" and state "${behavior.workflowState}" in field "${fieldLabel}" (section "${sectionLabel}")`,
          );
        }

        if (
          policyManaged &&
          purpose === 'MANAGEMENT_DECISION' &&
          behavior.workflowState === 'MANAGEMENT_DECISION_DRAFT' &&
          behavior.editability === 'EDITABLE' &&
          !MANAGEMENT_DECISION_DRAFT_EDIT_ROLES.has(behavior.role)
        ) {
          errors.push(
            `Only ADMIN and MANAGEMENT can edit Management Decision Draft fields. Field "${fieldLabel}" grants "${behavior.role}" edit access in section "${sectionLabel}"`,
          );
        }
      }
    }
  }

  return errors;
}

export function normalizeTemplateSectionPermissionPolicy(
  section: ITemplateSection,
): ITemplateSection {
  const purpose = getSectionPermissionPurpose(section);
  const defaultAccess = defaultRoleAccessForPurpose(purpose);
  const sectionWithMetadata: ITemplateSection = {
    ...section,
    metadata: {
      ...(section.metadata ?? {}),
      permissionPurpose: purpose,
      permissionPolicyVersion: POLICY_VERSION,
    },
  };

  return {
    ...sectionWithMetadata,
    visibilityRules: sectionVisibilityRules(defaultAccess),
    editabilityRules: sectionEditabilityRules(defaultAccess),
    fields: (section.fields ?? []).map((field) =>
      normalizeTemplateFieldPermissionPolicy(field, purpose, defaultAccess),
    ),
  };
}

export function normalizeTemplateFieldPermissionPolicy(
  field: ITemplateField,
  purpose: TemplatePermissionPurpose,
  defaultAccess: PermissionRoleAccessPolicy = defaultRoleAccessForPurpose(purpose),
): ITemplateField {
  const metadata = field.metadata ?? {};
  if (metadata.workflowBehaviorMode === 'MANUAL_OVERRIDE') {
    return field;
  }

  const roleAccess = applyFieldPermissionOverrides(
    defaultAccess,
    metadata.permissionOverride,
  );
  const behaviors = generatePolicyBehaviors(field, purpose, roleAccess);
  const visibleStates = unique(
    behaviors
      .filter((behavior) => behavior.visibility === 'VISIBLE')
      .map((behavior) => behavior.workflowState),
  );
  const editableStates = unique(
    behaviors
      .filter((behavior) => behavior.editability === 'EDITABLE')
      .map((behavior) => behavior.workflowState),
  );
  const visibleTo = ROLE_ORDER.filter((role) => roleAccess[role] !== 'hidden');
  const hiddenFrom = ROLE_ORDER.filter((role) => roleAccess[role] === 'hidden');
  const editableBy = ROLE_ORDER.filter((role) => roleAccess[role] === 'edit');

  return {
    ...field,
    behaviors,
    visibilityRules: {
      ...(field.visibilityRules ?? {}),
      visibleTo,
      hiddenFrom,
      visibleStates,
    },
    editabilityRules: {
      ...(field.editabilityRules ?? {}),
      editableBy,
      editableStates,
    },
    validationRules: {
      ...(field.validationRules ?? {}),
      requiredFor: field.isRequired ? editableBy : [],
    },
    metadata: {
      ...metadata,
      permissionPolicyVersion: POLICY_VERSION,
      workflowBehaviorMode: 'AUTO',
    },
  };
}

export function getSectionPermissionPurpose(
  section: ITemplateSection,
): TemplatePermissionPurpose {
  const metadataPurpose = normalizePurpose(
    section.metadata?.permissionPurpose ?? section.metadata?.purpose,
  );
  if (metadataPurpose) return metadataPurpose;

  if (section.sectionKey === 'employee_achievement_submission') {
    return 'EMPLOYEE_ACHIEVEMENT';
  }
  if (section.sectionType === PmsTemplateSectionType.OBJECTIVES) {
    return 'OBJECTIVE_SETTING';
  }
  if (MANAGER_REVIEW_SECTION_TYPES.has(section.sectionType)) {
    return 'MANAGER_REVIEW';
  }
  if (MANAGEMENT_DECISION_SECTION_TYPES.has(section.sectionType)) {
    return 'MANAGEMENT_DECISION';
  }
  if (section.sectionType === PmsTemplateSectionType.VISIBILITY_GOVERNANCE) {
    return 'VISIBILITY_COMMUNICATION';
  }

  return 'GENERAL';
}

function defaultRoleAccessForPurpose(
  purpose: TemplatePermissionPurpose,
): PermissionRoleAccessPolicy {
  switch (purpose) {
    case 'OBJECTIVE_SETTING':
    case 'EMPLOYEE_ACHIEVEMENT':
      return {
        EMPLOYEE: 'edit',
        MANAGER: 'view',
        ADMIN: 'edit',
        DIRECTOR: 'view',
      };
    case 'MANAGER_REVIEW':
      return {
        EMPLOYEE: 'view',
        MANAGER: 'edit',
        ADMIN: 'view',
        DIRECTOR: 'view',
      };
    case 'MANAGEMENT_DECISION':
      return {
        EMPLOYEE: 'hidden',
        MANAGER: 'hidden',
        ADMIN: 'edit',
        MANAGEMENT: 'edit',
        DIRECTOR: 'view',
      };
    case 'VISIBILITY_COMMUNICATION':
      return {
        EMPLOYEE: 'hidden',
        MANAGER: 'hidden',
        ADMIN: 'edit',
        MANAGEMENT: 'view',
        DIRECTOR: 'view',
      };
    case 'GENERAL':
    default:
      return {
        EMPLOYEE: 'hidden',
        MANAGER: 'hidden',
        ADMIN: 'edit',
        MANAGEMENT: 'hidden',
        DIRECTOR: 'hidden',
      };
  }
}

function workflowStatesForPurposeRoleAccess(
  purpose: TemplatePermissionPurpose,
  role: string,
  access: PermissionAccessLevel,
): string[] {
  if (access === 'hidden') {
    return hiddenWorkflowStatesForPurposeRole(purpose, role);
  }

  switch (purpose) {
    case 'OBJECTIVE_SETTING':
      if (role === 'EMPLOYEE') return ['OBJECTIVE_SETTING_OPEN'];
      if (role === 'MANAGER') return ['MANAGER_REVIEW_OPEN'];
      if (role === 'ADMIN' || role === 'MANAGEMENT') {
        return ['MANAGEMENT_DECISION_DRAFT'];
      }
      return [];

    case 'EMPLOYEE_ACHIEVEMENT':
      if (role === 'EMPLOYEE') return ['EMPLOYEE_ACHIEVEMENT_OPEN'];
      if (role === 'MANAGER') return ['MANAGER_REVIEW_OPEN'];
      if (role === 'ADMIN' || role === 'MANAGEMENT') {
        return ['MANAGEMENT_DECISION_DRAFT'];
      }
      return [];

    case 'MANAGER_REVIEW':
      if (role === 'EMPLOYEE') return ['MANAGER_REVIEW_OPEN'];
      if (role === 'MANAGER') return ['MANAGER_REVIEW_OPEN'];
      if (role === 'ADMIN' || role === 'MANAGEMENT') {
        return ['MANAGEMENT_DECISION_DRAFT'];
      }
      return [];

    case 'MANAGEMENT_DECISION':
      if (role === 'ADMIN' || role === 'MANAGEMENT') {
        return ['MANAGEMENT_DECISION_DRAFT'];
      }
      if (role === 'DIRECTOR') {
        return ['MANAGEMENT_DECISION_SUBMITTED'];
      }
      if (role === 'EMPLOYEE') {
        return ['VISIBILITY_ENABLED'];
      }
      return [];

    case 'VISIBILITY_COMMUNICATION':
      if (role === 'EMPLOYEE') return ['COMMUNICATION_READY'];
      if (role === 'ADMIN') return ['MANAGEMENT_DECISION_DRAFT'];
      if (role === 'MANAGEMENT' || role === 'DIRECTOR') {
        return ['COMMUNICATION_READY'];
      }
      return [];

    case 'GENERAL':
    default:
      if (role === 'EMPLOYEE') return ['OBJECTIVE_SETTING_OPEN'];
      if (role === 'MANAGER') return ['MANAGER_REVIEW_OPEN'];
      if (role === 'ADMIN' || role === 'MANAGEMENT') {
        return ['MANAGEMENT_DECISION_DRAFT'];
      }
      return [];
  }
}

function hiddenWorkflowStatesForPurposeRole(
  purpose: TemplatePermissionPurpose,
  role: string,
): string[] {
  return workflowStatesForPurposeRoleAccess(purpose, role, 'view');
}

function generatePolicyBehaviors(
  field: ITemplateField,
  purpose: TemplatePermissionPurpose,
  roleAccess: PermissionRoleAccessPolicy,
): ITemplateBehaviorRule[] {
  const generated = ROLE_ORDER.flatMap((role) => {
    const access = roleAccess[role];
    if (!access) return [];
    return workflowStatesForPurposeRoleAccess(purpose, role, access).map(
      (workflowState) => {
        const editability = editabilityForAccess(
          purpose,
          role,
          workflowState,
          access,
        );
        return {
          workflowState,
          role,
          visibility: access === 'hidden' ? 'HIDDEN' as const : 'VISIBLE' as const,
          editability,
          mandatory: editability === 'EDITABLE' ? field.isRequired === true : false,
        };
      },
    );
  });

  return sortBehaviors(uniqueBehaviors(generated));
}

function editabilityForAccess(
  _purpose: TemplatePermissionPurpose,
  _role: string,
  _workflowState: string,
  access: PermissionAccessLevel,
): ITemplateBehaviorRule['editability'] {
  if (access !== 'edit') return 'READ_ONLY';
  return 'EDITABLE';
}

function applyFieldPermissionOverrides(
  defaultAccess: PermissionRoleAccessPolicy,
  rawOverrides: unknown,
): PermissionRoleAccessPolicy {
  if (!rawOverrides || typeof rawOverrides !== 'object') {
    return { ...defaultAccess };
  }

  const overrides = rawOverrides as Record<string, unknown>;
  return ROLE_ORDER.reduce<PermissionRoleAccessPolicy>((policy, role) => {
    const value = overrides[role];
    policy[role] =
      value === 'hidden' || value === 'view' || value === 'edit'
        ? value
        : defaultAccess[role];
    return policy;
  }, {});
}

function sectionVisibilityRules(roleAccess: PermissionRoleAccessPolicy) {
  return {
    visibleTo: ROLE_ORDER.filter((role) => roleAccess[role] !== 'hidden'),
    hiddenFrom: ROLE_ORDER.filter((role) => roleAccess[role] === 'hidden'),
  };
}

function sectionEditabilityRules(roleAccess: PermissionRoleAccessPolicy) {
  return {
    editableBy: ROLE_ORDER.filter((role) => roleAccess[role] === 'edit'),
  };
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function behaviorKey(rule: Pick<ITemplateBehaviorRule, 'role' | 'workflowState'>) {
  return `${rule.role}:${rule.workflowState}`;
}

function uniqueBehaviors(behaviors: ITemplateBehaviorRule[]) {
  const byKey = new Map<string, ITemplateBehaviorRule>();
  behaviors.forEach((rule) => {
    byKey.set(behaviorKey(rule), { ...rule });
  });
  return Array.from(byKey.values());
}

function sortBehaviors(behaviors: ITemplateBehaviorRule[]) {
  return [...behaviors].sort((left, right) => {
    const roleDelta =
      ROLE_ORDER.indexOf(left.role as (typeof ROLE_ORDER)[number]) -
      ROLE_ORDER.indexOf(right.role as (typeof ROLE_ORDER)[number]);
    if (roleDelta !== 0) return roleDelta;
    return left.workflowState.localeCompare(right.workflowState);
  });
}

function normalizePurpose(value: unknown): TemplatePermissionPurpose | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === 'CUSTOM_SECTION') return 'GENERAL';
  if (normalized === 'EMPLOYEE_ACHIEVEMENT_SUBMISSION') {
    return 'EMPLOYEE_ACHIEVEMENT';
  }
  if (
    normalized === 'OBJECTIVE_SETTING' ||
    normalized === 'EMPLOYEE_ACHIEVEMENT' ||
    normalized === 'MANAGER_REVIEW' ||
    normalized === 'MANAGEMENT_DECISION' ||
    normalized === 'VISIBILITY_COMMUNICATION' ||
    normalized === 'GENERAL'
  ) {
    return normalized;
  }
  return null;
}
