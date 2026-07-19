import fs from 'fs';
import path from 'path';
import {
  AssessmentTermCode,
  AssessmentTermType,
  ObjectiveSource,
  PmsRole,
  TermWorkflowState,
  getAssessmentTerms,
} from '../../src/constants/pms.enums';

const FIXTURE_DIRECTORY = path.resolve(
  process.cwd(),
  'contracts/pms-template-objective-matrix/v1',
);

function loadJson<T = Record<string, unknown>>(fileName: string): T {
  return JSON.parse(
    fs.readFileSync(path.join(FIXTURE_DIRECTORY, fileName), 'utf8'),
  ) as T;
}

const contract = loadJson<any>('contract.v1.json');
const quarterly = loadJson<any>('quarterly.fixture.json');
const halfYearly = loadJson<any>('half-yearly.fixture.json');
const yearly = loadJson<any>('yearly.fixture.json');
const permissions = loadJson<any>('permission-truth-table.v1.json');
const formulas = loadJson<any>('formula-fixtures.v1.json');
const pdfLayout = loadJson<any>('pdf-reference-layout.v1.json');

describe('PMS template objective matrix Phase 0 contract', () => {
  it('keeps all Phase 0 artifacts on the same immutable contract version', () => {
    expect(contract.contractVersion).toBe(1);
    expect([
      quarterly.contractVersion,
      halfYearly.contractVersion,
      yearly.contractVersion,
      permissions.contractVersion,
      formulas.contractVersion,
      pdfLayout.contractVersion,
    ]).toEqual([1, 1, 1, 1, 1, 1]);
  });

  it('matches cadence fixtures to the existing server assessment-term contract', () => {
    expect(contract.cadences).toEqual({
      [AssessmentTermType.QUARTERLY]: getAssessmentTerms(AssessmentTermType.QUARTERLY),
      [AssessmentTermType.HALF_YEARLY]: getAssessmentTerms(AssessmentTermType.HALF_YEARLY),
      [AssessmentTermType.YEARLY]: getAssessmentTerms(AssessmentTermType.YEARLY),
    });
    expect(quarterly.termOrder).toEqual([
      AssessmentTermCode.Q1,
      AssessmentTermCode.Q2,
      AssessmentTermCode.Q3,
      AssessmentTermCode.Q4,
    ]);
    expect(halfYearly.termOrder).toEqual([AssessmentTermCode.H1, AssessmentTermCode.H2]);
    expect(yearly.termOrder).toEqual([AssessmentTermCode.Y1]);
  });

  it('freezes immutable row identity and one active sibling per covered term', () => {
    expect(contract.identity.logicalRowKey).toBe('objectiveRowKey');
    expect(contract.identity.logicalRowKeyImmutable).toBe(true);
    expect(contract.identity.titleIsIdentity).toBe(false);

    for (const row of quarterly.logicalRows) {
      expect(row.objectiveRowKey).toMatch(/^row-[a-z0-9-]+$/);
      expect(new Set(row.rowCoverage).size).toBe(row.rowCoverage.length);
      expect(new Set(row.siblings.map((sibling: any) => sibling.termCode)).size).toBe(
        row.siblings.length,
      );
      expect(row.siblings.map((sibling: any) => sibling.termCode)).toEqual(
        row.rowCoverage,
      );
      for (const sibling of row.siblings) {
        expect(sibling.objectiveId).toBeTruthy();
        expect(sibling.termAssignmentId).toBeTruthy();
        expect(sibling.version).toBeGreaterThan(0);
      }
    }
  });

  it('uses current-term-only defaults for employee and manager dynamic rows', () => {
    expect(contract.dynamicRowPolicy.employeeDefaultScope).toBe('CURRENT_TERM');
    expect(contract.dynamicRowPolicy.managerDefaultScope).toBe('CURRENT_TERM');
    expect(quarterly.layout.dynamicRowPolicy.employeeDefaultScope).toBe('CURRENT_TERM');
    expect(quarterly.layout.dynamicRowPolicy.managerDefaultScope).toBe('CURRENT_TERM');

    const employeeRow = quarterly.logicalRows.find(
      (row: any) => row.source === ObjectiveSource.EMPLOYEE_CREATED,
    );
    expect(employeeRow.rowOriginTermCode).toBe(AssessmentTermCode.Q3);
    expect(employeeRow.rowCoverage).toEqual([AssessmentTermCode.Q3]);
    expect(employeeRow.siblings).toHaveLength(1);
  });

  it('allows arbitrary labels while retaining unique stable column and binding IDs', () => {
    const columns = quarterly.layout.columns;
    expect(new Set(columns.map((column: any) => column.columnId)).size).toBe(columns.length);
    expect(new Set(columns.map((column: any) => column.bindingKey)).size).toBe(columns.length);
    expect(columns.every((column: any) => typeof column.label === 'string' && column.label)).toBe(
      true,
    );
    expect(columns.map((column: any) => column.termPolicy)).toEqual(
      expect.arrayContaining(['SHARED_ANNUAL', 'EVERY_REVIEW_PERIOD']),
    );
  });

  it('uses only existing roles, workflow states, and the most-restrictive rule', () => {
    const roles = new Set(Object.values(PmsRole));
    const workflowStates = new Set(Object.values(TermWorkflowState));
    expect(permissions.resolutionRule).toBe('MOST_RESTRICTIVE_WINS');

    for (const permissionCase of permissions.cases) {
      expect(roles.has(permissionCase.input.role)).toBe(true);
      expect(workflowStates.has(permissionCase.input.workflowState)).toBe(true);
      expect(typeof permissionCase.expected.visible).toBe('boolean');
      expect(typeof permissionCase.expected.editable).toBe('boolean');
      expect(typeof permissionCase.expected.required).toBe('boolean');
      if (!permissionCase.expected.visible || !permissionCase.expected.editable) {
        expect(permissionCase.expected.required).toBe(false);
      }
    }

    expect(new Set(permissions.cases.map((entry: any) => entry.input.role))).toEqual(
      new Set(['EMPLOYEE', 'MANAGER', 'DIRECTOR', 'ADMIN', 'MANAGEMENT']),
    );
    expect(
      permissions.cases.find((entry: any) => entry.id === 'hidden-overrides-edit-permission')
        .expected,
    ).toEqual({
      visible: false,
      editable: false,
      required: false,
      denialReason: 'COLUMN_HIDDEN',
    });
  });

  it('freezes a safe formula AST allowlist and explicit failure behavior', () => {
    const allowedFunctions = new Set(contract.formula.functions);
    const allowedOperators = new Set(contract.formula.operators);
    expect(contract.formula.representation).toBe('ALLOWLISTED_AST');
    expect(contract.formula.serverAuthoritative).toBe(true);
    expect(contract.formula.targetsReadOnly).toBe(true);
    expect(contract.formula.prohibited).toEqual(
      expect.arrayContaining(['EVAL', 'USER_CODE', 'EXTERNAL_API']),
    );

    for (const formulaCase of formulas.validCases) {
      const serialized = JSON.stringify(formulaCase.ast);
      const functions = [...serialized.matchAll(/\"name\":\"([^\"]+)\"/g)].map(
        (match) => match[1],
      );
      const operators = [...serialized.matchAll(/\"operator\":\"([^\"]+)\"/g)].map(
        (match) => match[1],
      );
      expect(functions.every((name) => allowedFunctions.has(name))).toBe(true);
      expect(operators.every((name) => allowedOperators.has(name))).toBe(true);
      expect(contract.formula.emptyPolicies).toContain(formulaCase.policies.empty);
      expect(contract.formula.divideByZeroPolicies).toContain(
        formulaCase.policies.divideByZero,
      );
    }

    expect(formulas.invalidCases.map((entry: any) => entry.reasonCode)).toEqual(
      expect.arrayContaining([
        'FORMULA_SELF_REFERENCE',
        'FORMULA_CYCLE',
        'FORMULA_REFERENCE_NOT_FOUND',
        'FORMULA_SCOPE_MISMATCH',
        'FORMULA_OPERATION_NOT_ALLOWED',
        'FORMULA_NODE_NOT_ALLOWED',
      ]),
    );
  });

  it('keeps calculated rows outside Objective records and scoring by default', () => {
    expect(contract.calculatedRows.createObjectiveRecords).toBe(false);
    expect(contract.calculatedRows.haveObjectiveStatus).toBe(false);
    expect(contract.calculatedRows.submittable).toBe(false);
    expect(contract.calculatedRows.approvable).toBe(false);
    expect(contract.calculatedRows.affectScoringByDefault).toBe(false);
    expect(contract.annualDecision.termScoringRemainsAuthoritative).toBe(true);
  });

  it('requires frozen role-masked official PDF data and integrity metadata', () => {
    expect(pdfLayout.official.snapshotMode).toBe('FROZEN');
    expect(pdfLayout.official.serverGenerated).toBe(true);
    expect(pdfLayout.roleMasking.every((entry: any) => entry.applyBeforeRendering)).toBe(true);
    expect(pdfLayout.integrity.hashAlgorithm).toBe('SHA-256');
    expect(pdfLayout.integrity.hashInput).toBe(
      'CANONICAL_ROLE_MASKED_FROZEN_SNAPSHOT',
    );
    expect(pdfLayout.official.requiredMetadata).toEqual(
      expect.arrayContaining(['generatedAt', 'contentHash', 'finalDecisionReference']),
    );
  });

  it('protects legacy template behavior and excludes standalone routes', () => {
    expect(contract.compatibility.legacyTemplateWithoutTableLayoutUsesExistingCards).toBe(true);
    expect(contract.compatibility.existingSingleTermApisRemainAvailable).toBe(true);
    expect(contract.compatibility.existingWorkflowEnumsChange).toBe(false);
    expect(contract.compatibility.standaloneObjectiveSubsystemChanged).toBe(false);
    expect(contract.compatibility.excludedRoutes).toEqual(
      expect.arrayContaining([
        '/my/objectives',
        '/manager/team-objectives',
        '/admin/pms/objective-library',
      ]),
    );
  });
});
