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
} as const;

export type PmsTemplateSectionType =
  (typeof PmsTemplateSectionType)[keyof typeof PmsTemplateSectionType];

export const PmsTemplateFieldType = {
  SHORT_TEXT: 'SHORT_TEXT',
  LONG_TEXT: 'LONG_TEXT',
  NUMERIC_INPUT: 'NUMERIC_INPUT',
  DROPDOWN: 'DROPDOWN',
  RADIO: 'RADIO',
  CHECKBOX: 'CHECKBOX',
  DATE: 'DATE',
  RATING_SCALE: 'RATING_SCALE',
  WEIGHTED_SCORE: 'WEIGHTED_SCORE',
  CURRENCY: 'CURRENCY',
  PERCENTAGE: 'PERCENTAGE',
  ATTACHMENT: 'ATTACHMENT',
  RICH_TEXT: 'RICH_TEXT',
  FORMULA: 'FORMULA',
  COMMENT_BOX: 'COMMENT_BOX',
  BOOLEAN: 'BOOLEAN',
  MATRIX: 'MATRIX',
  DATA_GRID: 'DATA_GRID',
} as const;

export type PmsTemplateFieldType =
  (typeof PmsTemplateFieldType)[keyof typeof PmsTemplateFieldType];

export const LetterTemplateType = {
  MERIT: 'MERIT',
  GRADE: 'GRADE',
  BOTH: 'BOTH',
  GENERIC_APPRAISAL: 'GENERIC_APPRAISAL',
  NIL: 'NIL',
  PROMOTION_APPRAISAL: 'PROMOTION_APPRAISAL',
} as const;

export type LetterTemplateType =
  (typeof LetterTemplateType)[keyof typeof LetterTemplateType];

export const LetterTemplateChannel = {
  EMAIL: 'EMAIL',
  PDF: 'PDF',
  DOCUMENT: 'DOCUMENT',
} as const;

export type LetterTemplateChannel =
  (typeof LetterTemplateChannel)[keyof typeof LetterTemplateChannel];

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

const quarterWorkflowStates = Object.values(QuarterWorkflowState) as string[];
const annualWorkflowStates = Object.values(AnnualWorkflowState) as string[];
const annualDecisionStatuses = Object.values(AnnualDecisionStatus) as string[];
const quarterReviewStatuses = Object.values(QuarterReviewStatus) as string[];
const objectiveStatuses = Object.values(ObjectiveStatus) as string[];

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
