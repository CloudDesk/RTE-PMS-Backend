import { QuarterWorkflowState } from './pms.enums';
import type { QuarterWorkflowState as QuarterWorkflowStateType } from './pms.enums';

const activeClosableQuarterStates: readonly QuarterWorkflowStateType[] = [
  QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
  QuarterWorkflowState.OBJECTIVE_DRAFT,
  QuarterWorkflowState.OBJECTIVE_SUBMITTED,
  QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  QuarterWorkflowState.OBJECTIVE_APPROVED,
  QuarterWorkflowState.MANAGER_REVIEW_OPEN,
  QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED,
  QuarterWorkflowState.REOPENED_BY_ADMIN,
] as const;

const quarterTransitionsBase = {
  [QuarterWorkflowState.NOT_STARTED]: [
    QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
  ],
  [QuarterWorkflowState.OBJECTIVE_SETTING_OPEN]: [
    QuarterWorkflowState.OBJECTIVE_DRAFT,
    QuarterWorkflowState.OBJECTIVE_APPROVED,
  ],
  [QuarterWorkflowState.OBJECTIVE_DRAFT]: [
    QuarterWorkflowState.OBJECTIVE_SUBMITTED,
  ],
  [QuarterWorkflowState.OBJECTIVE_SUBMITTED]: [
    QuarterWorkflowState.OBJECTIVE_APPROVED,
    QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
  ],
  [QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED]: [
    QuarterWorkflowState.OBJECTIVE_SUBMITTED,
  ],
  [QuarterWorkflowState.OBJECTIVE_APPROVED]: [
    QuarterWorkflowState.MANAGER_REVIEW_OPEN,
  ],
  [QuarterWorkflowState.MANAGER_REVIEW_OPEN]: [
    QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED,
  ],
  [QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED]: [
    QuarterWorkflowState.QUARTER_FINALIZED,
  ],
  [QuarterWorkflowState.QUARTER_FINALIZED]: [
    QuarterWorkflowState.REOPENED_BY_ADMIN,
  ],
  [QuarterWorkflowState.REOPENED_BY_ADMIN]: [
    QuarterWorkflowState.QUARTER_FINALIZED,
  ],
  [QuarterWorkflowState.CLOSED_BY_ADMIN]: [],
} as const satisfies Record<
  QuarterWorkflowStateType,
  readonly QuarterWorkflowStateType[]
>;

function withAdminClose(
  state: QuarterWorkflowStateType,
  nextStates: readonly QuarterWorkflowStateType[],
): readonly QuarterWorkflowStateType[] {
  if (!activeClosableQuarterStates.includes(state)) {
    return nextStates;
  }

  return [...nextStates, QuarterWorkflowState.CLOSED_BY_ADMIN];
}

export const quarterTransitions: Record<
  QuarterWorkflowStateType,
  readonly QuarterWorkflowStateType[]
> = {
  [QuarterWorkflowState.NOT_STARTED]: withAdminClose(
    QuarterWorkflowState.NOT_STARTED,
    quarterTransitionsBase[QuarterWorkflowState.NOT_STARTED],
  ),
  [QuarterWorkflowState.OBJECTIVE_SETTING_OPEN]: withAdminClose(
    QuarterWorkflowState.OBJECTIVE_SETTING_OPEN,
    quarterTransitionsBase[QuarterWorkflowState.OBJECTIVE_SETTING_OPEN],
  ),
  [QuarterWorkflowState.OBJECTIVE_DRAFT]: withAdminClose(
    QuarterWorkflowState.OBJECTIVE_DRAFT,
    quarterTransitionsBase[QuarterWorkflowState.OBJECTIVE_DRAFT],
  ),
  [QuarterWorkflowState.OBJECTIVE_SUBMITTED]: withAdminClose(
    QuarterWorkflowState.OBJECTIVE_SUBMITTED,
    quarterTransitionsBase[QuarterWorkflowState.OBJECTIVE_SUBMITTED],
  ),
  [QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED]: withAdminClose(
    QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED,
    quarterTransitionsBase[QuarterWorkflowState.OBJECTIVE_REVISION_REQUIRED],
  ),
  [QuarterWorkflowState.OBJECTIVE_APPROVED]: withAdminClose(
    QuarterWorkflowState.OBJECTIVE_APPROVED,
    quarterTransitionsBase[QuarterWorkflowState.OBJECTIVE_APPROVED],
  ),
  [QuarterWorkflowState.MANAGER_REVIEW_OPEN]: withAdminClose(
    QuarterWorkflowState.MANAGER_REVIEW_OPEN,
    quarterTransitionsBase[QuarterWorkflowState.MANAGER_REVIEW_OPEN],
  ),
  [QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED]: withAdminClose(
    QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED,
    quarterTransitionsBase[QuarterWorkflowState.MANAGER_REVIEW_SUBMITTED],
  ),
  [QuarterWorkflowState.QUARTER_FINALIZED]: withAdminClose(
    QuarterWorkflowState.QUARTER_FINALIZED,
    quarterTransitionsBase[QuarterWorkflowState.QUARTER_FINALIZED],
  ),
  [QuarterWorkflowState.REOPENED_BY_ADMIN]: withAdminClose(
    QuarterWorkflowState.REOPENED_BY_ADMIN,
    quarterTransitionsBase[QuarterWorkflowState.REOPENED_BY_ADMIN],
  ),
  [QuarterWorkflowState.CLOSED_BY_ADMIN]: withAdminClose(
    QuarterWorkflowState.CLOSED_BY_ADMIN,
    quarterTransitionsBase[QuarterWorkflowState.CLOSED_BY_ADMIN],
  ),
};
