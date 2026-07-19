import type { ObjectiveMatrixMode } from './pms-objective-matrix';

export type ObjectiveMatrixPdfSnapshotMode = 'live' | 'frozen';

export interface ObjectiveMatrixPdfQuery {
  view?: ObjectiveMatrixMode;
  snapshot?: ObjectiveMatrixPdfSnapshotMode;
}

export interface ObjectiveMatrixReportHeaderGroup {
  label: string;
  colspan: number;
}

export interface ObjectiveMatrixReportColumn {
  key: string;
  columnId: string;
  label: string;
  groupLabel: string;
  termCode?: string;
  width: number;
}

export interface ObjectiveMatrixReportCell {
  value: string;
  calculated: boolean;
}

export interface ObjectiveMatrixReportRow {
  objectiveRowKey: string;
  objectiveTitle: string;
  rowGroup: string;
  source: string;
  status: string;
  cells: ObjectiveMatrixReportCell[];
}

export interface ObjectiveMatrixReportColumnBand {
  index: number;
  total: number;
  label: string;
  columns: ObjectiveMatrixReportColumn[];
  headerGroups: ObjectiveMatrixReportHeaderGroup[];
  rows: ObjectiveMatrixReportRow[];
}

export interface ObjectiveMatrixReportViewModel {
  documentTitle: string;
  official: boolean;
  watermark?: string;
  snapshotModeLabel: string;
  viewLabel: string;
  employeeName: string;
  employeeCode: string;
  employeeRole: string;
  department: string;
  managerName: string;
  cycleName: string;
  cycleCode: string;
  cadence: string;
  termOrder: string;
  templateName: string;
  templateVersion: string;
  annualAssignmentId: string;
  finalDecisionReference: string;
  finalDecisionStatus: string;
  showFinalDecisionOutcome: boolean;
  finalScore: string;
  finalRating: string;
  wasReopened: boolean;
  generatedAt: string;
  snapshotCreatedAt: string;
  contentHash: string;
  matrixContentHash: string;
  layoutVersion: number;
  contentVersion: number;
  columnBands: ObjectiveMatrixReportColumnBand[];
  formulaResults: Array<{ label: string; scope: string; value: string }>;
  calculatedRows: Array<{ label: string; scope: string; value: string }>;
  termStates: Array<{ term: string; state: string }>;
}

export interface ObjectiveMatrixPdfResult {
  buffer: Buffer;
  fileName: string;
  contentHash: string;
  matrixContentHash: string;
  snapshotMode: ObjectiveMatrixPdfSnapshotMode;
  snapshotCreatedAt?: string;
}
