import type {
  AssessmentTermCode,
  AssessmentTermType,
} from '../constants/pms.enums';
import type {
  ITemplateObjectiveColumnGroup,
  ITemplateObjectiveRowGroup,
  ITemplateObjectiveTableColumn,
  ITemplateObjectiveColumnTermPolicy,
  ITemplateObjectiveTableLayout,
} from '../models/pms-template-version.model';
import type {
  ObjectiveMatrixCalculatedRowResult,
  ObjectiveMatrixFormulaResult,
} from '../services/objective-matrix-formula.service';

export type ObjectiveMatrixMode = 'employee' | 'manager' | 'reviewer' | 'admin';

export interface ObjectiveMatrixReadQuery {
  mode?: ObjectiveMatrixMode;
  employeeId?: string;
  termAssignmentId?: string;
  currentTermCode?: AssessmentTermCode;
  includeAudit?: boolean | string;
}

export type ObjectiveMatrixCellDenialReason =
  | 'COLUMN_HIDDEN'
  | 'SYSTEM_CALCULATED'
  | 'TERM_FINALIZED'
  | 'TERM_NOT_OPEN'
  | 'WINDOW_CLOSED'
  | 'COLUMN_OWNER_MISMATCH'
  | 'ROLE_READ_ONLY'
  | 'CORRECTION_FLOW_REQUIRED'
  | 'COLUMN_READ_ONLY';

export interface ObjectiveMatrixCellPermission {
  visible: boolean;
  editable: boolean;
  required: boolean;
  denialReason?: ObjectiveMatrixCellDenialReason;
}

export interface ObjectiveMatrixCell extends ObjectiveMatrixCellPermission {
  cellKey: string;
  columnId: string;
  fieldKey: string;
  kind: 'SOURCE' | 'FORMULA';
  termCode?: AssessmentTermCode;
  objectiveId: string;
  termAssignmentId: string;
  value: unknown;
  recordVersion: number;
  valueVersion?: number;
  sourceCellKeys?: string[];
  sourceVersions?: Record<string, number>;
  audit?: {
    actorUserId?: string;
    roleCode?: string;
    workflowStage?: string;
    updatedAt?: string;
  };
}

export interface ObjectiveMatrixSibling {
  termCode: AssessmentTermCode;
  termAssignmentId: string;
  objectiveId: string;
  status: string;
  version: number;
}

export interface ObjectiveEvidenceAttachmentSummary {
  id: string;
  documentId: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  uploadedAt: string;
  uploadedByName?: string;
  previewAvailable: boolean;
  downloadAvailable: boolean;
}

export interface ObjectiveTermEvidenceSummary {
  evidenceId?: string;
  objectiveId: string;
  termAssignmentId: string;
  termCode: AssessmentTermCode;
  version: number;
  editable: boolean;
  denialReason?: ObjectiveMatrixCellDenialReason;
  attachments: ObjectiveEvidenceAttachmentSummary[];
  /** Backward-compatible first attachment for older clients. */
  attachment?: ObjectiveEvidenceAttachmentSummary;
}

export interface ObjectiveMatrixRowActions {
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReturn: boolean;
  canComment: boolean;
  canAttach: boolean;
}

export interface ObjectiveMatrixRow {
  objectiveRowKey: string;
  /** Gapless one-based position derived by the backend after canonical row sorting. */
  serialNo?: number;
  source: string;
  matrixCode?: string;
  matrixLabel?: string;
  title: string;
  rowOriginTermCode?: AssessmentTermCode;
  rowCoverage: AssessmentTermCode[];
  rowGroupKey?: string;
  rowOrder: number;
  siblings: ObjectiveMatrixSibling[];
  sharedCells: ObjectiveMatrixCell[];
  termCells: Partial<Record<AssessmentTermCode, ObjectiveMatrixCell[]>>;
  evidenceByTerm: Partial<Record<AssessmentTermCode, ObjectiveTermEvidenceSummary>>;
  actions: ObjectiveMatrixRowActions;
}

export interface AnnualObjectiveMatrixResponse {
  annualAssignmentId: string;
  cycleId: string;
  employeeId: string;
  managerId: string;
  templateVersionId: string;
  layoutVersion: number;
  mode: ObjectiveMatrixMode;
  viewRole: string;
  assessmentTermType: AssessmentTermType;
  termOrder: AssessmentTermCode[];
  currentTermCode?: AssessmentTermCode;
  columns: ITemplateObjectiveTableColumn[];
  columnGroups: ITemplateObjectiveColumnGroup[];
  termPolicies: ITemplateObjectiveColumnTermPolicy[];
  rowGroupColumnLabel?: string;
  dynamicRowPolicy: ITemplateObjectiveTableLayout['dynamicRowPolicy'];
  showRowGroups: boolean;
  rowGroups: ITemplateObjectiveRowGroup[];
  rows: ObjectiveMatrixRow[];
  formulaResults: ObjectiveMatrixFormulaResult[];
  calculatedRows: ObjectiveMatrixCalculatedRowResult[];
  evaluationOrder: string[];
  generatedAt: string;
  contentVersion: number;
  contentHash: string;
}

export interface ObjectiveMatrixCellChange {
  objectiveRowKey: string;
  objectiveId: string;
  termAssignmentId: string;
  termCode: AssessmentTermCode;
  columnId: string;
  fieldKey: string;
  value: unknown;
  expectedObjectiveVersion: number;
  expectedValueVersion?: number;
}

export interface ObjectiveMatrixCellSaveInput {
  changes: ObjectiveMatrixCellChange[];
}

export interface ObjectiveMatrixWriteResult {
  changedCellKeys: string[];
  affectedFormulaColumnIds: string[];
  matrix: AnnualObjectiveMatrixResponse;
}

export interface ObjectiveMatrixCreateRowInput {
  source: 'EMPLOYEE_CREATED' | 'MANAGER_CREATED';
  matrixCode: string;
  matrixLabel?: string;
  currentTermCode: AssessmentTermCode;
  selectedTermCoverage?: AssessmentTermCode[];
  rowGroupKey?: string;
  coreValues: {
    title: string;
    description?: string;
    priority?: string;
    expectedOutcome?: string;
    targetMetric?: string;
    targetValue?: string | number;
    targetDate?: string;
    weightage?: number;
    successCriteria?: string;
  };
  customValues?: Record<string, unknown>;
  correlationId: string;
}

export interface ObjectiveMatrixCreateRowResult {
  objectiveRowKey: string;
  objectiveIds: string[];
  coverage: AssessmentTermCode[];
  matrix: AnnualObjectiveMatrixResponse;
}

export interface ObjectiveMatrixDeleteRowInput {
  scope: 'CURRENT_TERM' | 'SELECTED_LINKED_DRAFTS';
  currentTermCode: AssessmentTermCode;
  selectedTerms?: AssessmentTermCode[];
  expectedObjectiveVersions: Record<string, number>;
}

export interface ObjectiveMatrixDeleteRowResult {
  objectiveRowKey: string;
  deletedObjectiveIds: string[];
  deletedTerms: AssessmentTermCode[];
  matrix: AnnualObjectiveMatrixResponse;
}
