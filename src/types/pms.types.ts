import type {
  AnnualWorkflowState as AnnualWorkflowStateEnum,
  AnnualDecisionStatus as AnnualDecisionStatusEnum,
  ObjectiveStatus as ObjectiveStatusEnum,
  PmsErrorCode,
  PmsRole,
  TermReviewStatus as TermReviewStatusEnum,
  TermWorkflowState as TermWorkflowStateEnum,
  WorkflowEntityType,
} from '../constants/pms.enums';

export type TermWorkflowState = TermWorkflowStateEnum;
export type AnnualWorkflowState = AnnualWorkflowStateEnum;
export type AnnualDecisionStatus = AnnualDecisionStatusEnum;
export type ObjectiveStatus = ObjectiveStatusEnum;
export type TermReviewStatus = TermReviewStatusEnum;

export interface WorkflowTransitionInput {
  entityType: WorkflowEntityType;
  entityId: string;
  currentState: string;
  nextState: string;
  actorId: string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowActorContext {
  actorId: string;
  actorRole: string;
}

export interface WorkflowValidationResult {
  allowed: boolean;
  errorCode?: string;
  message?: string;
}

export interface WorkflowTransitionResult {
  entityType: WorkflowEntityType;
  entityId: string;
  previousState: TermWorkflowState | AnnualWorkflowState;
  currentState: TermWorkflowState | AnnualWorkflowState;
  actorId: string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  transitionedAt: Date;
}

export type PmsMappedRole = PmsRole | 'UNKNOWN';

export interface AccessActorContext {
  actorId: string;
  actorRole: string;
}

export interface AccessResourceContext {
  employeeId?: string;
  managerId?: string;
  assignedManagerId?: string;
  ownerId?: string;
  allowedManagerIds?: string[];
  cycleId?: string;        // For delegation scope check (cycle-scoped delegation)
  delegatorId?: string;   // For delegation scope check (original owner of the resource)
}

export interface AccessCheckInput {
  actor: AccessActorContext;
  action: string;
  resource?: AccessResourceContext;
  requiresAdmin?: boolean;
}

export interface AccessCheckResult {
  allowed: boolean;
  errorCode?: PmsErrorCode;
  message?: string;
  mappedRole: PmsMappedRole;
}

export interface CreateAuditLogInput {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
  correlationId?: string;
  assignmentId?: string;
}

export interface VisibilityMaskContext {
  actorRole: string;
  employeeGradeVisible?: boolean;
  employeeMeritVisible?: boolean;
  managerGradeVisible?: boolean;
  managerMeritVisible?: boolean;
  visibleFrom?: Date | string;
  confidentialFields?: Set<string>;
  hasVisibilityOverride?: boolean;
}
