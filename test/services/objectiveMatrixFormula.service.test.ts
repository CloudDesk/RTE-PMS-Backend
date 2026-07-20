import { PmsTemplateFieldType } from '../../src/constants/pms.enums';
import type {
  ITemplateObjectiveCalculatedRow,
  ITemplateObjectiveFormula,
  ITemplateObjectiveTableLayout,
} from '../../src/models/pms-template-version.model';
import {
  evaluateObjectiveMatrixFormulas,
  objectiveFormulaDependentColumnIds,
  objectiveFormulaEvaluationOrder,
} from '../../src/services/objective-matrix-formula.service';

const sourceColumnIds = ['q1', 'q2', 'q3', 'q4'];

function formula(
  formulaId: string,
  targetColumnId: string,
  scope: ITemplateObjectiveFormula['scope'],
  name: string,
  columnIds: string[],
): ITemplateObjectiveFormula {
  return {
    formulaId,
    targetColumnId,
    scope,
    ast: {
      type: 'FUNCTION',
      name,
      arguments: columnIds.map((columnId) => ({ type: 'COLUMN', columnId })),
    },
    emptyPolicy: 'IGNORE',
    divideByZeroPolicy: 'NULL',
    decimalPrecision: 2,
  };
}

function layout(
  formulas: ITemplateObjectiveFormula[],
  calculatedRows: ITemplateObjectiveCalculatedRow[] = [],
): ITemplateObjectiveTableLayout {
  const targetIds = formulas.map((item) => item.targetColumnId);
  return {
    enabled: true,
    layoutVersion: 1,
    columns: [
      ...sourceColumnIds.map((columnId, index) => ({
        columnId,
        bindingKey: `custom.${columnId}`,
        label: columnId.toUpperCase(),
        type: PmsTemplateFieldType.NUMERIC_INPUT,
        displayOrder: index + 1,
        fillOwner: 'MANAGER' as const,
        workflowStage: 'MANAGER_REVIEW' as const,
        access: [],
      })),
      ...targetIds.map((columnId, index) => ({
        columnId,
        bindingKey: `formula.${columnId}`,
        label: columnId,
        type: PmsTemplateFieldType.FORMULA,
        displayOrder: sourceColumnIds.length + index + 1,
        fillOwner: 'SYSTEM' as const,
        workflowStage: 'CALCULATED' as const,
        access: [],
      })),
    ],
    columnGroups: [],
    rowGroups: [],
    rowAssignments: [],
    termPolicies: [],
    formulas,
    calculatedRows,
    dynamicRowPolicy: {
      employeeDefaultScope: 'CURRENT_TERM',
      managerDefaultScope: 'CURRENT_TERM',
      allowEmployeeTermChoice: false,
      allowManagerTermChoice: false,
    },
  };
}

describe('Objective matrix formula service Phase 3', () => {
  it('calculates sum and latest across terms deterministically with source versions', () => {
    const formulas = [
      formula('sum', 'actual_sum', 'ROW_ACROSS_TERMS', 'SUM_TERMS', sourceColumnIds),
      formula('latest', 'actual_latest', 'ROW_ACROSS_TERMS', 'LATEST_FILLED_TERM', sourceColumnIds),
      {
        formulaId: 'double',
        targetColumnId: 'double_actual',
        scope: 'ROW' as const,
        ast: {
          type: 'OPERATOR',
          operator: 'MULTIPLY',
          left: { type: 'COLUMN', columnId: 'actual_sum' },
          right: { type: 'LITERAL', value: 2 },
        },
        emptyPolicy: 'IGNORE' as const,
        divideByZeroPolicy: 'NULL' as const,
        decimalPrecision: 2,
      },
    ];
    const evaluated = evaluateObjectiveMatrixFormulas({
      layout: layout(formulas),
      termOrder: ['Q1', 'Q2', 'Q3', 'Q4'],
      cells: sourceColumnIds.map((columnId, index) => ({
        rowKey: 'row-1',
        rowGroupKey: 'sales',
        termCode: `Q${index + 1}`,
        columnId,
        value: (index + 1) * 10,
        version: index + 1,
      })),
    });

    expect(evaluated.evaluationOrder).toEqual(['sum', 'latest', 'double']);
    expect(evaluated.results.find((result) => result.formulaId === 'sum')?.value).toBe(100);
    expect(evaluated.results.find((result) => result.formulaId === 'latest')?.value).toBe(40);
    expect(evaluated.results.find((result) => result.formulaId === 'double')?.value).toBe(200);
    expect(evaluated.results.find((result) => result.formulaId === 'double')?.sourceVersions).toEqual({
      'row-1:Q1:q1': 1,
      'row-1:Q2:q2': 2,
      'row-1:Q3:q3': 3,
      'row-1:Q4:q4': 4,
    });
  });

  it('calculates group and table fixtures and exposes calculated rows', () => {
    const formulas = [
      formula('group_sum', 'group_total', 'GROUP', 'SUM_GROUP', ['q1']),
      formula('table_average', 'table_average', 'TABLE', 'AVERAGE_TABLE', ['q1']),
    ];
    const evaluated = evaluateObjectiveMatrixFormulas({
      layout: layout(formulas, [
        {
          calculatedRowId: 'sales-total',
          label: 'Sales total',
          scope: 'GROUP',
          formulaId: 'group_sum',
          rowGroupKey: 'sales',
          displayOrder: 1,
        },
        {
          calculatedRowId: 'overall-average',
          label: 'Overall average',
          scope: 'TABLE',
          formulaId: 'table_average',
          displayOrder: 2,
        },
      ]),
      cells: [
        { rowKey: 'sales-1', rowGroupKey: 'sales', termCode: 'Q1', columnId: 'q1', value: 10 },
        { rowKey: 'sales-2', rowGroupKey: 'sales', termCode: 'Q1', columnId: 'q1', value: 20 },
        { rowKey: 'ops-1', rowGroupKey: 'operations', termCode: 'Q1', columnId: 'q1', value: 30 },
      ],
    });

    expect(evaluated.results.find((result) => result.formulaId === 'group_sum' && result.rowGroupKey === 'sales')?.value).toBe(30);
    expect(evaluated.results.find((result) => result.formulaId === 'group_sum' && result.rowGroupKey === 'operations')?.value).toBe(30);
    expect(evaluated.results.find((result) => result.formulaId === 'table_average')?.value).toBe(20);
    expect(evaluated.calculatedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ calculatedRowId: 'sales-total', value: 30 }),
      expect.objectContaining({ calculatedRowId: 'overall-average', value: 20 }),
    ]));
  });

  it('returns only affected transitive dependents for incremental recalculation', () => {
    const formulas = [
      formula('sum', 'actual_sum', 'ROW_ACROSS_TERMS', 'SUM_TERMS', sourceColumnIds),
      {
        ...formula('maximum', 'maximum', 'ROW', 'MAX', ['actual_sum']),
        ast: {
          type: 'FUNCTION',
          name: 'MAX',
          arguments: [
            { type: 'COLUMN', columnId: 'actual_sum' },
            { type: 'LITERAL', value: 50 },
          ],
        },
      },
    ];
    expect(objectiveFormulaDependentColumnIds(formulas, ['q2'])).toEqual(['actual_sum', 'maximum']);
    expect(objectiveFormulaDependentColumnIds(formulas, ['unrelated'])).toEqual([]);
  });

  it('blocks circular dependencies', () => {
    const formulas = [
      formula('formula-a', 'a', 'ROW', 'MAX', ['b']),
      formula('formula-b', 'b', 'ROW', 'MAX', ['a']),
    ];
    expect(() => objectiveFormulaEvaluationOrder(formulas)).toThrow('Objective formula cycle detected');
  });

  it('applies empty and divide-by-zero policies', () => {
    const zeroWhenEmpty = {
      ...formula('empty', 'empty_total', 'ROW', 'SUM_TERMS', ['q1']),
      emptyPolicy: 'ZERO' as const,
    };
    const division = {
      formulaId: 'division',
      targetColumnId: 'ratio',
      scope: 'ROW' as const,
      ast: {
        type: 'OPERATOR',
        operator: 'DIVIDE',
        left: { type: 'LITERAL', value: 10 },
        right: { type: 'LITERAL', value: 0 },
      },
      emptyPolicy: 'IGNORE' as const,
      divideByZeroPolicy: 'ZERO' as const,
      decimalPrecision: 2,
    };
    const evaluated = evaluateObjectiveMatrixFormulas({
      layout: layout([zeroWhenEmpty, division]),
      cells: [{ rowKey: 'row-1', columnId: 'q2', value: 1 }],
    });
    expect(evaluated.results.find((result) => result.formulaId === 'empty')?.value).toBe(0);
    expect(evaluated.results.find((result) => result.formulaId === 'division')?.value).toBe(0);
  });
});
