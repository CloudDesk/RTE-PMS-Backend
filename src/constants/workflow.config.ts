import { AnnualWorkflowState, TermWorkflowState } from './pms.enums';
import type {
  AnnualWorkflowState as AnnualWorkflowStateType,
  TermWorkflowState as TermWorkflowStateType,
} from './pms.enums';

const activeClosableTermStates: readonly TermWorkflowStateType[] = [
  TermWorkflowState.OBJECTIVE_SETTING_OPEN,
  TermWorkflowState.OBJECTIVE_DRAFT,
  TermWorkflowState.OBJECTIVE_SUBMITTED,
  TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  TermWorkflowState.OBJECTIVE_APPROVED,
  TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
  TermWorkflowState.MANAGER_REVIEW_OPEN,
  TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
  TermWorkflowState.REOPENED_BY_ADMIN,
] as const;

const termTransitionsBase = {
  [TermWorkflowState.NOT_STARTED]: [
    TermWorkflowState.OBJECTIVE_SETTING_OPEN,
  ],
  [TermWorkflowState.OBJECTIVE_SETTING_OPEN]: [
    TermWorkflowState.OBJECTIVE_DRAFT,
    TermWorkflowState.OBJECTIVE_SUBMITTED,
    TermWorkflowState.OBJECTIVE_APPROVED,
  ],
  [TermWorkflowState.OBJECTIVE_DRAFT]: [
    TermWorkflowState.OBJECTIVE_SUBMITTED,
  ],
  [TermWorkflowState.OBJECTIVE_SUBMITTED]: [
    TermWorkflowState.OBJECTIVE_APPROVED,
    TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  ],
  [TermWorkflowState.OBJECTIVE_REVISION_REQUIRED]: [
    TermWorkflowState.OBJECTIVE_SUBMITTED,
  ],
  [TermWorkflowState.OBJECTIVE_APPROVED]: [
    TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
    TermWorkflowState.MANAGER_REVIEW_OPEN,
  ],
  [TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN]: [
    TermWorkflowState.MANAGER_REVIEW_OPEN,
  ],
  [TermWorkflowState.MANAGER_REVIEW_OPEN]: [
    TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
  ],
  [TermWorkflowState.MANAGER_REVIEW_SUBMITTED]: [
    TermWorkflowState.TERM_FINALIZED,
  ],
  [TermWorkflowState.TERM_FINALIZED]: [
    TermWorkflowState.REOPENED_BY_ADMIN,
  ],
  [TermWorkflowState.REOPENED_BY_ADMIN]: [
    TermWorkflowState.TERM_FINALIZED,
  ],
  [TermWorkflowState.CLOSED_BY_ADMIN]: [],
} as const satisfies Record<
  TermWorkflowStateType,
  readonly TermWorkflowStateType[]
>;

function withAdminClose(
  state: TermWorkflowStateType,
  nextStates: readonly TermWorkflowStateType[],
): readonly TermWorkflowStateType[] {
  if (!activeClosableTermStates.includes(state)) {
    return nextStates;
  }

  return [...nextStates, TermWorkflowState.CLOSED_BY_ADMIN];
}

export const termTransitions: Record<
  TermWorkflowStateType,
  readonly TermWorkflowStateType[]
> = {
  [TermWorkflowState.NOT_STARTED]: withAdminClose(
    TermWorkflowState.NOT_STARTED,
    termTransitionsBase[TermWorkflowState.NOT_STARTED],
  ),
  [TermWorkflowState.OBJECTIVE_SETTING_OPEN]: withAdminClose(
    TermWorkflowState.OBJECTIVE_SETTING_OPEN,
    termTransitionsBase[TermWorkflowState.OBJECTIVE_SETTING_OPEN],
  ),
  [TermWorkflowState.OBJECTIVE_DRAFT]: withAdminClose(
    TermWorkflowState.OBJECTIVE_DRAFT,
    termTransitionsBase[TermWorkflowState.OBJECTIVE_DRAFT],
  ),
  [TermWorkflowState.OBJECTIVE_SUBMITTED]: withAdminClose(
    TermWorkflowState.OBJECTIVE_SUBMITTED,
    termTransitionsBase[TermWorkflowState.OBJECTIVE_SUBMITTED],
  ),
  [TermWorkflowState.OBJECTIVE_REVISION_REQUIRED]: withAdminClose(
    TermWorkflowState.OBJECTIVE_REVISION_REQUIRED,
    termTransitionsBase[TermWorkflowState.OBJECTIVE_REVISION_REQUIRED],
  ),
  [TermWorkflowState.OBJECTIVE_APPROVED]: withAdminClose(
    TermWorkflowState.OBJECTIVE_APPROVED,
    termTransitionsBase[TermWorkflowState.OBJECTIVE_APPROVED],
  ),
  [TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN]: withAdminClose(
    TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN,
    termTransitionsBase[TermWorkflowState.EMPLOYEE_ACHIEVEMENT_OPEN],
  ),
  [TermWorkflowState.MANAGER_REVIEW_OPEN]: withAdminClose(
    TermWorkflowState.MANAGER_REVIEW_OPEN,
    termTransitionsBase[TermWorkflowState.MANAGER_REVIEW_OPEN],
  ),
  [TermWorkflowState.MANAGER_REVIEW_SUBMITTED]: withAdminClose(
    TermWorkflowState.MANAGER_REVIEW_SUBMITTED,
    termTransitionsBase[TermWorkflowState.MANAGER_REVIEW_SUBMITTED],
  ),
  [TermWorkflowState.TERM_FINALIZED]: withAdminClose(
    TermWorkflowState.TERM_FINALIZED,
    termTransitionsBase[TermWorkflowState.TERM_FINALIZED],
  ),
  [TermWorkflowState.REOPENED_BY_ADMIN]: withAdminClose(
    TermWorkflowState.REOPENED_BY_ADMIN,
    termTransitionsBase[TermWorkflowState.REOPENED_BY_ADMIN],
  ),
  [TermWorkflowState.CLOSED_BY_ADMIN]: withAdminClose(
    TermWorkflowState.CLOSED_BY_ADMIN,
    termTransitionsBase[TermWorkflowState.CLOSED_BY_ADMIN],
  ),
};

export const annualTransitions: Record<
  AnnualWorkflowStateType,
  readonly AnnualWorkflowStateType[]
> = {
  [AnnualWorkflowState.DRAFT]: [
    AnnualWorkflowState.SCHEDULED,
    AnnualWorkflowState.CANCELLED,
  ],
  [AnnualWorkflowState.SCHEDULED]: [
    AnnualWorkflowState.ACTIVE,
    AnnualWorkflowState.CANCELLED,
  ],
  [AnnualWorkflowState.ACTIVE]: [
    AnnualWorkflowState.IN_PROGRESS,
    AnnualWorkflowState.CANCELLED,
  ],
  [AnnualWorkflowState.IN_PROGRESS]: [
    AnnualWorkflowState.ALL_TERMS_FINALIZED,
    AnnualWorkflowState.CANCELLED,
  ],
  [AnnualWorkflowState.ALL_TERMS_FINALIZED]: [
    AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
  ],
  [AnnualWorkflowState.APPRAISAL_WINDOW_OPEN]: [
    AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT,
  ],
  [AnnualWorkflowState.MANAGEMENT_DECISION_DRAFT]: [
    AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED,
  ],
  [AnnualWorkflowState.MANAGEMENT_DECISION_SUBMITTED]: [
    AnnualWorkflowState.ANNUAL_FINALIZED,
  ],
  [AnnualWorkflowState.ANNUAL_FINALIZED]: [
    AnnualWorkflowState.VISIBILITY_ENABLED,
    AnnualWorkflowState.APPRAISAL_WINDOW_OPEN,
  ],
  [AnnualWorkflowState.VISIBILITY_ENABLED]: [
    AnnualWorkflowState.COMMUNICATION_READY,
  ],
  [AnnualWorkflowState.COMMUNICATION_READY]: [
    AnnualWorkflowState.COMMUNICATION_SENT,
  ],
  [AnnualWorkflowState.COMMUNICATION_SENT]: [
    AnnualWorkflowState.CLOSED,
  ],
  [AnnualWorkflowState.CLOSED]: [
    AnnualWorkflowState.ARCHIVED,
  ],
  [AnnualWorkflowState.ARCHIVED]: [],
  [AnnualWorkflowState.CANCELLED]: [],
};
