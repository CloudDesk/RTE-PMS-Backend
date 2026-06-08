export const PmsRole = {
  EMPLOYEE: 'EMPLOYEE',
  MANAGER: 'MANAGER',
  ADMIN: 'ADMIN',
  MANAGEMENT: 'MANAGEMENT',
  DIRECTOR: 'DIRECTOR',
} as const;

// We change PmsRole to just be a standard string so dynamic roles can be used throughout the app
export type PmsRole = string;

export const PmsRoleLabel: Record<string, string> = {
  [PmsRole.EMPLOYEE]: 'Employee',
  [PmsRole.MANAGER]: 'Manager',
  [PmsRole.ADMIN]: 'Admin',
  [PmsRole.MANAGEMENT]: 'Management',
  [PmsRole.DIRECTOR]: 'Director',
};

export const QuarterWorkflowState = {
  NOT_STARTED: 'NOT_STARTED',
  OBJECTIVE_SETTING_OPEN: 'OBJECTIVE_SETTING_OPEN',
  OBJECTIVE_DRAFT: 'OBJECTIVE_DRAFT',
  OBJECTIVE_SUBMITTED: 'OBJECTIVE_SUBMITTED',
  OBJECTIVE_REVISION_REQUIRED: 'OBJECTIVE_REVISION_REQUIRED',
  OBJECTIVE_APPROVED: 'OBJECTIVE_APPROVED',
  MANAGER_REVIEW_OPEN: 'MANAGER_REVIEW_OPEN',
  MANAGER_REVIEW_SUBMITTED: 'MANAGER_REVIEW_SUBMITTED',
  QUARTER_FINALIZED: 'QUARTER_FINALIZED',
  REOPENED_BY_ADMIN: 'REOPENED_BY_ADMIN',
  CLOSED_BY_ADMIN: 'CLOSED_BY_ADMIN',
} as const;

export type QuarterWorkflowState =
  (typeof QuarterWorkflowState)[keyof typeof QuarterWorkflowState];

export const AnnualWorkflowState = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  ACTIVE: 'ACTIVE',
  IN_PROGRESS: 'IN_PROGRESS',
  ALL_QUARTERS_FINALIZED: 'ALL_QUARTERS_FINALIZED',
  APPRAISAL_WINDOW_OPEN: 'APPRAISAL_WINDOW_OPEN',
  MANAGEMENT_DECISION_DRAFT: 'MANAGEMENT_DECISION_DRAFT',
  MANAGEMENT_DECISION_SUBMITTED: 'MANAGEMENT_DECISION_SUBMITTED',
  ANNUAL_FINALIZED: 'ANNUAL_FINALIZED',
  VISIBILITY_ENABLED: 'VISIBILITY_ENABLED',
  COMMUNICATION_READY: 'COMMUNICATION_READY',
  COMMUNICATION_SENT: 'COMMUNICATION_SENT',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
  CANCELLED: 'CANCELLED',
} as const;

export type AnnualWorkflowState =
  (typeof AnnualWorkflowState)[keyof typeof AnnualWorkflowState];

export const AnnualDecisionStatus = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  FROZEN: 'FROZEN',
  VISIBILITY_ENABLED: 'VISIBILITY_ENABLED',
  CLOSED: 'CLOSED',
} as const;

export type AnnualDecisionStatus =
  (typeof AnnualDecisionStatus)[keyof typeof AnnualDecisionStatus];

export const QuarterReviewStatus = {
  MANAGER_REVIEW_OPEN: 'MANAGER_REVIEW_OPEN',
  MANAGER_REVIEW_SUBMITTED: 'MANAGER_REVIEW_SUBMITTED',
  FINALIZED: 'FINALIZED',
} as const;

export type QuarterReviewStatus =
  (typeof QuarterReviewStatus)[keyof typeof QuarterReviewStatus];

export const ObjectiveStatus = {
  OBJECTIVE_DRAFT: QuarterWorkflowState.OBJECTIVE_DRAFT,
  OBJECTIVE_SUBMITTED: QuarterWorkflowState.OBJECTIVE_SUBMITTED,
  OBJECTIVE_REVISION_REQUIRED: QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  OBJECTIVE_APPROVED: QuarterWorkflowState.OBJECTIVE_APPROVED,
} as const;

export type ObjectiveStatus =
  (typeof ObjectiveStatus)[keyof typeof ObjectiveStatus];

export const ObjectiveSource = {
  PREDEFINED: 'PREDEFINED',
  EMPLOYEE_CREATED: 'EMPLOYEE_CREATED',
  MANAGER_CREATED: 'MANAGER_CREATED',
} as const;

export type ObjectiveSource = (typeof ObjectiveSource)[keyof typeof ObjectiveSource];

export const AppraisalOutcomeType = {
  BOTH: 'BOTH',
  MERIT_ONLY: 'MERIT_ONLY',
  GRADE_ONLY: 'GRADE_ONLY',
  NIL: 'NIL',
} as const;

export type AppraisalOutcomeType =
  (typeof AppraisalOutcomeType)[keyof typeof AppraisalOutcomeType];

export const PmsTemplateStatus = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  ARCHIVED: 'ARCHIVED',
} as const;

export type PmsTemplateStatus =
  (typeof PmsTemplateStatus)[keyof typeof PmsTemplateStatus];

export const PmsTemplateSectionLevel = {
  ANNUAL: 'ANNUAL',
  QUARTER: 'QUARTER',
} as const;

export type PmsTemplateSectionLevel =
  (typeof PmsTemplateSectionLevel)[keyof typeof PmsTemplateSectionLevel];

export const PmsTemplateSectionType = {
  OBJECTIVES: 'OBJECTIVES',
  COMPETENCIES: 'COMPETENCIES',
  KPIS: 'KPIS',
  BEHAVIOURAL_TRAITS: 'BEHAVIOURAL_TRAITS',
  DEVELOPMENT_PLAN: 'DEVELOPMENT_PLAN',
  QUARTER_REVIEW: 'QUARTER_REVIEW',
  ANNUAL_SUMMARY: 'ANNUAL_SUMMARY',
  FINAL_GRADE: 'FINAL_GRADE',
  MERIT: 'MERIT',
  APPRAISAL_COMMUNICATION: 'APPRAISAL_COMMUNICATION',
  OVERALL_FEEDBACK: 'OVERALL_FEEDBACK',
  VISIBILITY_GOVERNANCE: 'VISIBILITY_GOVERNANCE',
} as const;

export type PmsTemplateSectionType =
  (typeof PmsTemplateSectionType)[keyof typeof PmsTemplateSectionType];

export const PmsTemplateFieldType = {
  SHORT_TEXT: 'SHORT_TEXT',
  LONG_TEXT: 'LONG_TEXT',
  STATIC_TEXT: 'STATIC_TEXT',
  SECTION_DIVIDER: 'SECTION_DIVIDER',
  NUMERIC_INPUT: 'NUMERIC_INPUT',
  DROPDOWN: 'DROPDOWN',
  RADIO: 'RADIO',
  CHECKBOX: 'CHECKBOX',
  CHECKBOX_GROUP: 'CHECKBOX_GROUP',
  MULTISELECT: 'MULTISELECT',
  DATE: 'DATE',
  DATE_RANGE: 'DATE_RANGE',
  RATING_SCALE: 'RATING_SCALE',
  WEIGHTED_SCORE: 'WEIGHTED_SCORE',
  CURRENCY: 'CURRENCY',
  PERCENTAGE: 'PERCENTAGE',
  ATTACHMENT: 'ATTACHMENT',
  RICH_TEXT: 'RICH_TEXT',
  FORMULA: 'FORMULA',
  COMMENT_BOX: 'COMMENT_BOX',
  BOOLEAN: 'BOOLEAN',
  SIGNATURE: 'SIGNATURE',
  MATRIX: 'MATRIX',
  DATA_GRID: 'DATA_GRID',
} as const;

export type PmsTemplateFieldType =
  (typeof PmsTemplateFieldType)[keyof typeof PmsTemplateFieldType];

export const FieldCategory = {
  NORMAL: 'NORMAL',
  SCORING: 'SCORING',
  CALCULATED: 'CALCULATED',
  SYSTEM: 'SYSTEM',
  CONFIDENTIAL: 'CONFIDENTIAL',
  HIDDEN: 'HIDDEN',
} as const;

export type FieldCategory = (typeof FieldCategory)[keyof typeof FieldCategory];

export const SemanticRole = {
  OBJECTIVE_TITLE: 'OBJECTIVE_TITLE',
  OBJECTIVE_KPI: 'OBJECTIVE_KPI',
  OBJECTIVE_TARGET: 'OBJECTIVE_TARGET',
  OBJECTIVE_WEIGHTAGE: 'OBJECTIVE_WEIGHTAGE',
  OBJECTIVE_ACHIEVEMENT: 'OBJECTIVE_ACHIEVEMENT',
  MANAGER_RATING: 'MANAGER_RATING',
  MANAGER_SCORE: 'MANAGER_SCORE',
  MANAGER_COMMENT: 'MANAGER_COMMENT',
  COMPETENCY_RATING: 'COMPETENCY_RATING',
  COMPETENCY_COMMENT: 'COMPETENCY_COMMENT',
  FINAL_GRADE: 'FINAL_GRADE',
  MERIT_PERCENTAGE: 'MERIT_PERCENTAGE',
  APPRAISAL_OUTCOME: 'APPRAISAL_OUTCOME',
} as const;

export type SemanticRole = (typeof SemanticRole)[keyof typeof SemanticRole];

export const WorkflowEntityType = {
  QUARTER_ASSIGNMENT: 'QUARTER_ASSIGNMENT',
  ANNUAL_CYCLE: 'ANNUAL_CYCLE',
  ANNUAL_ASSIGNMENT: 'ANNUAL_ASSIGNMENT',
} as const;

export type WorkflowEntityType =
  (typeof WorkflowEntityType)[keyof typeof WorkflowEntityType];

export const WorkflowAction = {
  OPEN_OBJECTIVE_SETTING: 'OPEN_OBJECTIVE_SETTING',
  SAVE_OBJECTIVE_DRAFT: 'SAVE_OBJECTIVE_DRAFT',
  SUBMIT_OBJECTIVE: 'SUBMIT_OBJECTIVE',
  APPROVE_OBJECTIVE: 'APPROVE_OBJECTIVE',
  RETURN_OBJECTIVE_FOR_REVISION: 'RETURN_OBJECTIVE_FOR_REVISION',
  OPEN_MANAGER_REVIEW: 'OPEN_MANAGER_REVIEW',
  SUBMIT_MANAGER_REVIEW: 'SUBMIT_MANAGER_REVIEW',
  FINALIZE_QUARTER: 'FINALIZE_QUARTER',
  REOPEN_QUARTER: 'REOPEN_QUARTER',
  CLOSE_QUARTER: 'CLOSE_QUARTER',
} as const;

export type WorkflowAction = (typeof WorkflowAction)[keyof typeof WorkflowAction];

export const PmsErrorCode = {
  ACCESS_DENIED: 'PMS_ACCESS_DENIED',
  ADMIN_ACCESS_REQUIRED: 'PMS_ADMIN_ACCESS_REQUIRED',
  AUTHENTICATION_REQUIRED: 'PMS_AUTHENTICATION_REQUIRED',
  EMPLOYEE_SCOPE_VIOLATION: 'PMS_EMPLOYEE_SCOPE_VIOLATION',
  MANAGER_SCOPE_VIOLATION: 'PMS_MANAGER_SCOPE_VIOLATION',
  UNKNOWN_ROLE: 'PMS_UNKNOWN_ROLE',
  VALIDATION_ERROR: 'PMS_VALIDATION_ERROR',
  WORKFLOW_TRANSITION_DENIED: 'PMS_WORKFLOW_TRANSITION_DENIED',
} as const;

export type PmsErrorCode = (typeof PmsErrorCode)[keyof typeof PmsErrorCode];

export const PmsAuditAction = {
  TEMPLATE_CREATED: 'PMS_TEMPLATE_CREATED',
  TEMPLATE_UPDATED: 'PMS_TEMPLATE_UPDATED',
  TEMPLATE_DELETED: 'PMS_TEMPLATE_DELETED',
  TEMPLATE_CLONED: 'PMS_TEMPLATE_CLONED',
  TEMPLATE_VERSION_CREATED: 'PMS_TEMPLATE_VERSION_CREATED',
  TEMPLATE_VERSION_ACTIVATED: 'PMS_TEMPLATE_VERSION_ACTIVATED',
  TEMPLATE_VERSION_DEACTIVATED: 'PMS_TEMPLATE_VERSION_DEACTIVATED',
  TEMPLATE_VERSION_DELETED: 'PMS_TEMPLATE_VERSION_DELETED',
  TEMPLATE_SECTIONS_CONFIGURED: 'PMS_TEMPLATE_SECTIONS_CONFIGURED',
  TEMPLATE_FIELDS_CONFIGURED: 'PMS_TEMPLATE_FIELDS_CONFIGURED',
  TEMPLATE_SECTION_PERMISSIONS_CONFIGURED: 'PMS_TEMPLATE_SECTION_PERMISSIONS_CONFIGURED',
  TEMPLATE_FIELD_PERMISSIONS_CONFIGURED: 'PMS_TEMPLATE_FIELD_PERMISSIONS_CONFIGURED',
  LETTER_TEMPLATE_CREATED: 'PMS_LETTER_TEMPLATE_CREATED',
  LETTER_TEMPLATE_ACTIVATED: 'PMS_LETTER_TEMPLATE_ACTIVATED',
  CYCLE_CREATED: 'PMS_CYCLE_CREATED',
  CYCLE_UPDATED: 'PMS_CYCLE_UPDATED',
  CYCLE_LAUNCHED: 'PMS_CYCLE_LAUNCHED',
  CYCLE_SCHEDULED: 'PMS_CYCLE_SCHEDULED',
  CYCLE_CLOSED: 'PMS_CYCLE_CLOSED',
  CYCLE_ARCHIVED: 'PMS_CYCLE_ARCHIVED',
  CYCLE_CANCELLED: 'PMS_CYCLE_CANCELLED',
  EMPLOYEE_ASSIGNED: 'PMS_EMPLOYEE_ASSIGNED',
  EMPLOYEE_OBJECTIVE_CREATED: 'PMS_EMPLOYEE_OBJECTIVE_CREATED',
  MANAGER_OBJECTIVE_CREATED_AND_APPROVED: 'PMS_MANAGER_OBJECTIVE_CREATED_AND_APPROVED',
  OBJECTIVE_SUBMITTED: 'PMS_OBJECTIVE_SUBMITTED',
  OBJECTIVE_APPROVED: 'PMS_OBJECTIVE_APPROVED',
  OBJECTIVE_RETURNED_FOR_REVISION: 'PMS_OBJECTIVE_RETURNED_FOR_REVISION',
  QUARTER_REVIEW_SUBMITTED: 'PMS_QUARTER_REVIEW_SUBMITTED',
  QUARTER_ASSIGNMENT_FINALIZED: 'PMS_QUARTER_ASSIGNMENT_FINALIZED',
  QUARTER_ASSIGNMENT_REOPENED: 'PMS_QUARTER_ASSIGNMENT_REOPENED',
  ANNUAL_DECISION_DRAFT_SAVED: 'PMS_ANNUAL_DECISION_DRAFT_SAVED',
  ANNUAL_DECISION_SUBMITTED: 'PMS_ANNUAL_DECISION_SUBMITTED',
  ANNUAL_DECISION_FROZEN: 'PMS_ANNUAL_DECISION_FROZEN',
  VISIBILITY_UPDATED: 'PMS_VISIBILITY_UPDATED',
  COMMUNICATION_SENT: 'PMS_COMMUNICATION_SENT',
  COMMUNICATION_RESENT: 'PMS_COMMUNICATION_RESENT',
} as const;

export type PmsAuditAction = (typeof PmsAuditAction)[keyof typeof PmsAuditAction];

const quarterWorkflowStates = Object.values(QuarterWorkflowState) as string[];
const annualWorkflowStates = Object.values(AnnualWorkflowState) as string[];
const annualDecisionStatuses = Object.values(AnnualDecisionStatus) as string[];
const quarterReviewStatuses = Object.values(QuarterReviewStatus) as string[];
const objectiveStatuses = Object.values(ObjectiveStatus) as string[];

export function normalizePmsRole(value: string): string {
  const normalized = value.replace(/[ /-]/g, '_').toUpperCase();
  if (normalized === 'STAFF') return PmsRole.EMPLOYEE;
  if (normalized === 'HR_ADMIN' || normalized === 'HRADMIN') return PmsRole.ADMIN;
  if (normalized === 'SUPERADMIN' || normalized === 'SUPER_ADMIN') return PmsRole.DIRECTOR;
  return normalized;
}

export function isPmsRole(value: string): boolean {
  return typeof value === 'string'; // Dynamic roles mean any string could be a role
}

export function isQuarterWorkflowState(
  value: string,
): value is QuarterWorkflowState {
  return quarterWorkflowStates.includes(value);
}

export function isAnnualWorkflowState(
  value: string,
): value is AnnualWorkflowState {
  return annualWorkflowStates.includes(value);
}

export function isAnnualDecisionStatus(
  value: string,
): value is AnnualDecisionStatus {
  return annualDecisionStatuses.includes(value);
}

export function isQuarterReviewStatus(
  value: string,
): value is QuarterReviewStatus {
  return quarterReviewStatuses.includes(value);
}

export function isObjectiveStatus(value: string): value is ObjectiveStatus {
  return objectiveStatuses.includes(value);
}
