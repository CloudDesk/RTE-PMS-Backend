import type {
  AnnualWorkflowState as AnnualWorkflowStateEnum,
  QuarterWorkflowState as QuarterWorkflowStateEnum,
  WorkflowEntityType,
} from '../constants/pms.enums';

export type QuarterWorkflowState = QuarterWorkflowStateEnum;
export type AnnualWorkflowState = AnnualWorkflowStateEnum;

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
  previousState: QuarterWorkflowState;
  currentState: QuarterWorkflowState;
  actorId: string;
  actorRole: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  transitionedAt: Date;
}

export type PmsMappedRole = 'Employee' | 'Manager' | 'HR/Admin' | 'Unknown';

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
}

export interface AccessCheckInput {
  actor: AccessActorContext;
  action: string;
  resource?: AccessResourceContext;
  requiresAdmin?: boolean;
}

export interface AccessCheckResult {
  allowed: boolean;
  errorCode?: string;
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
}

export interface VisibilityMaskContext {
  actorRole: string;
  employeeGradeVisible?: boolean;
  employeeMeritVisible?: boolean;
  managerGradeVisible?: boolean;
  managerMeritVisible?: boolean;
}
