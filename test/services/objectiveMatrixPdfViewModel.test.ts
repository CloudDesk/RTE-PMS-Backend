import {
  buildObjectiveMatrixReportViewModel,
  objectiveEvidenceReportValue,
  renderObjectiveMatrixReportHtml,
} from '../../src/services/pms-objective-matrix-pdf.service';
import type { AnnualObjectiveMatrixResponse } from '../../src/types/pms-objective-matrix';

function matrixFor(viewRole: string, mode: 'employee' | 'manager' | 'reviewer' | 'admin') {
  const columns = Array.from({ length: 7 }, (_, index) => ({
    columnId: `column-${index + 1}`,
    bindingKey: index === 0 ? 'objective.title' : `custom.field_${index + 1}`,
    label: index === 0 ? 'Objective' : `Result ${index + 1}`,
    type: index === 6 ? 'FORMULA' : 'SHORT_TEXT',
    displayOrder: index + 1,
    width: 180,
    required: index === 0,
    fillOwner: index === 6 ? 'SYSTEM' : 'ROW_CREATOR',
    workflowStage: index === 6 ? 'CALCULATED' : 'OBJECTIVE_SETTING',
    access: [{ role: viewRole, visible: true, editable: false, required: false }],
  }));
  return {
    annualAssignmentId: '507f1f77bcf86cd799439011',
    cycleId: '507f1f77bcf86cd799439012',
    employeeId: '507f1f77bcf86cd799439013',
    managerId: '507f1f77bcf86cd799439014',
    templateVersionId: '507f1f77bcf86cd799439015',
    layoutVersion: 3,
    mode,
    viewRole,
    assessmentTermType: 'QUARTERLY',
    termOrder: ['Q1', 'Q2', 'Q3', 'Q4'],
    currentTermCode: 'Q4',
    columns,
    columnGroups: [
      { groupId: 'group-plan', label: 'Plan', columnIds: columns.slice(0, 3).map((column) => column.columnId), displayOrder: 1 },
      { groupId: 'group-results', label: 'Results', columnIds: columns.slice(3).map((column) => column.columnId), displayOrder: 2 },
    ],
    termPolicies: columns.map((column, index) => ({
      columnId: column.columnId,
      mode: index === 4 ? 'EVERY_REVIEW_PERIOD' : 'SHARED_ANNUAL',
    })),
    dynamicRowPolicy: {
      employeeDefaultScope: 'CURRENT_TERM',
      managerDefaultScope: 'CURRENT_TERM',
      allowEmployeeTermChoice: false,
      allowManagerTermChoice: true,
    },
    rowGroups: [{ rowGroupKey: 'company', label: 'Company Objectives', source: 'PREDEFINED', displayOrder: 1 }],
    rows: [{
      objectiveRowKey: 'row-1',
      source: 'PREDEFINED',
      title: 'Improve on-time delivery without exposing ADMIN SECRET',
      rowOriginTermCode: 'Q1',
      rowCoverage: ['Q1', 'Q2', 'Q3', 'Q4'],
      rowGroupKey: 'company',
      rowOrder: 1,
      siblings: ['Q1', 'Q2', 'Q3', 'Q4'].map((term, index) => ({
        termCode: term,
        termAssignmentId: `term-${index + 1}`,
        objectiveId: `objective-${index + 1}`,
        status: term === 'Q4' ? 'OBJECTIVE_APPROVED' : 'TERM_FINALIZED',
        version: 1,
      })),
      sharedCells: columns.filter((_, index) => index !== 4).map((column, index) => ({
        cellKey: `row-1:${column.columnId}`,
        columnId: column.columnId,
        fieldKey: column.bindingKey,
        kind: column.type === 'FORMULA' ? 'FORMULA' : 'SOURCE',
        objectiveId: 'objective-1',
        termAssignmentId: 'term-1',
        value: column.type === 'FORMULA' ? 94.5 : index === 0 ? 'Improve on-time delivery' : `Value ${index + 1}`,
        recordVersion: 1,
        visible: true,
        editable: false,
        required: false,
      })),
      termCells: Object.fromEntries(['Q1', 'Q2', 'Q3', 'Q4'].map((term, index) => [term, [{
        cellKey: `row-1:column-5:${term}`,
        columnId: 'column-5',
        fieldKey: 'custom.field_5',
        kind: 'SOURCE',
        termCode: term,
        objectiveId: `objective-${index + 1}`,
        termAssignmentId: `term-${index + 1}`,
        value: 90 + index,
        recordVersion: 1,
        visible: true,
        editable: false,
        required: false,
      }]])),
      actions: {
        canEdit: false,
        canDelete: false,
        canSubmit: false,
        canApprove: false,
        canReturn: false,
        canComment: false,
        canAttach: false,
      },
    }],
    formulaResults: [{
      formulaId: 'formula-1',
      targetColumnId: 'column-7',
      scope: 'ROW',
      rowKey: 'row-1',
      value: 94.5,
      sourceCellKeys: ['hidden-internal-cell-key'],
      sourceVersions: { 'hidden-internal-cell-key': 1 },
    }],
    calculatedRows: [{
      calculatedRowId: 'calculated-1',
      label: 'Overall result',
      scope: 'TABLE',
      value: 94.5,
      formulaId: 'formula-1',
    }],
    evaluationOrder: ['formula-1'],
    generatedAt: '2026-07-19T10:00:00.000Z',
    contentVersion: 9,
    contentHash: 'a'.repeat(64),
  } as unknown as AnnualObjectiveMatrixResponse;
}

const common = {
  assignment: {
    employeeSnapshot: {
      name: 'Asha Kumar',
      employeeCode: 'EMP-104',
      specificRole: 'Production Lead',
      departmentName: 'Operations',
    },
    managerSnapshot: { name: 'Manoj Rao' },
    finalDecisionStatus: 'FROZEN',
    visibility: { employeeGradeVisible: false, managerGradeVisible: true },
  },
  cycle: { name: 'FY 2026', code: 'FY26' },
  template: { name: 'Operations PMS' },
  templateVersion: { versionNo: 4 },
  decision: {
    _id: 'decision-1',
    decisionStatus: 'FROZEN',
    finalScore: 94.5,
    finalRating: 'Exceeds Expectations',
  },
  termStates: [
    { term: 'Q1', state: 'TERM_FINALIZED' },
    { term: 'Q2', state: 'TERM_FINALIZED' },
    { term: 'Q3', state: 'TERM_FINALIZED' },
    { term: 'Q4', state: 'TERM_FINALIZED' },
  ],
  snapshotId: 'snapshot-1',
  snapshotCreatedAt: '2026-07-19T10:00:00.000Z',
  generatedAt: '2026-07-19T11:00:00.000Z',
};

describe('PMS objective matrix PDF view model', () => {
  it('creates a watermarked live preview and splits unsafe wide matrices into ordered bands', () => {
    const report = buildObjectiveMatrixReportViewModel({
      ...common,
      matrix: matrixFor('EMPLOYEE', 'employee'),
      snapshotMode: 'live',
    });
    expect(report.watermark).toBe('DRAFT - LIVE DATA');
    expect(report.official).toBe(false);
    expect(report.columnBands.length).toBeGreaterThan(1);
    expect(report.columnBands.flatMap((band) => band.columns).map((column) => column.key)).toEqual(
      expect.arrayContaining(['column-1', 'column-5:Q1', 'column-5:Q4', 'column-7']),
    );
    expect(report.showFinalDecisionOutcome).toBe(false);
  });

  it('prints only role-masked data and never exposes formula internals', () => {
    const matrix = matrixFor('EMPLOYEE', 'employee');
    matrix.rows[0].title = 'Employee-visible objective';
    const report = buildObjectiveMatrixReportViewModel({
      ...common,
      matrix,
      snapshotMode: 'frozen',
    });
    const html = renderObjectiveMatrixReportHtml(report);
    expect(html).toContain('Official frozen record');
    expect(html).toContain('Employee-visible objective');
    expect(html).not.toContain('ADMIN SECRET');
    expect(html).not.toContain('hidden-internal-cell-key');
    expect(html).toContain('display: table-header-group');
    expect(report.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('includes final outcome only for a role allowed by publication visibility', () => {
    const managerReport = buildObjectiveMatrixReportViewModel({
      ...common,
      matrix: matrixFor('MANAGER', 'manager'),
      snapshotMode: 'frozen',
    });
    const employeeReport = buildObjectiveMatrixReportViewModel({
      ...common,
      matrix: matrixFor('EMPLOYEE', 'employee'),
      snapshotMode: 'frozen',
    });
    expect(managerReport.showFinalDecisionOutcome).toBe(true);
    expect(managerReport.finalRating).toBe('Exceeds Expectations');
    expect(employeeReport.showFinalDecisionOutcome).toBe(false);
    expect(employeeReport.finalRating).toBe('N/A');
  });

  it('exports objective evidence once as term-labelled metadata without storage URLs', () => {
    const matrix = matrixFor('MANAGER', 'manager');
    matrix.columns[5] = {
      ...matrix.columns[5],
      columnId: 'supporting-documents',
      bindingKey: 'system.objectiveEvidence',
      label: 'Supporting Documents',
      type: 'OBJECTIVE_EVIDENCE',
      workflowStage: 'EMPLOYEE_ACHIEVEMENT',
    } as any;
    matrix.termPolicies[5] = {
      columnId: 'supporting-documents',
      mode: 'EVERY_REVIEW_PERIOD',
    };
    matrix.rows[0].evidenceByTerm = {
      Q1: {
        evidenceId: 'evidence-q1',
        objectiveId: 'objective-1',
        termAssignmentId: 'term-1',
        termCode: 'Q1',
        version: 2,
        editable: false,
        attachment: {
          id: 'attachment-q1',
          documentId: 'document-q1',
          fileName: 'q1-summary.pdf',
          uploadedAt: '2026-04-15T10:00:00.000Z',
          previewAvailable: true,
          downloadAvailable: true,
        },
      },
      Q3: {
        evidenceId: 'evidence-q3',
        objectiveId: 'objective-3',
        termAssignmentId: 'term-3',
        termCode: 'Q3',
        version: 1,
        editable: false,
        attachment: {
          id: 'attachment-q3',
          documentId: 'document-q3',
          fileName: 'customer-feedback.png',
          uploadedAt: '2026-10-15T10:00:00.000Z',
          previewAvailable: true,
          downloadAvailable: true,
        },
      },
    } as any;

    expect(objectiveEvidenceReportValue(matrix.rows[0], matrix.termOrder)).toBe(
      'Q1 — q1-summary.pdf | Q3 — customer-feedback.png',
    );
    const report = buildObjectiveMatrixReportViewModel({
      ...common,
      matrix,
      snapshotMode: 'frozen',
    });
    const evidenceColumns = report.columnBands
      .flatMap((band) => band.columns)
      .filter((column) => column.columnType === 'OBJECTIVE_EVIDENCE');
    expect(evidenceColumns).toHaveLength(1);
    const evidenceValues = report.columnBands
      .flatMap((band) => band.rows)
      .flatMap((row) => row.cells)
      .map((cell) => cell.value);
    expect(evidenceValues).toContain('Q1 — q1-summary.pdf | Q3 — customer-feedback.png');
    expect(JSON.stringify(report)).not.toContain('storage.googleapis.com');
  });
});
