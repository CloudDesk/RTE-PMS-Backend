import type {
  ITemplateObjectiveCalculatedRow,
  ITemplateObjectiveFormula,
  ITemplateObjectiveTableLayout,
} from '../models/pms-template-version.model';

export interface ObjectiveMatrixFormulaSourceCell {
  rowKey: string;
  rowGroupKey?: string;
  termCode?: string;
  columnId: string;
  value: unknown;
  version?: number;
}

export interface ObjectiveMatrixFormulaResult {
  formulaId: string;
  targetColumnId: string;
  scope: ITemplateObjectiveFormula['scope'];
  rowKey?: string;
  rowGroupKey?: string;
  value: number | null;
  sourceCellKeys: string[];
  sourceVersions: Record<string, number>;
}

export interface ObjectiveMatrixCalculatedRowResult {
  calculatedRowId: string;
  label: string;
  scope: ITemplateObjectiveCalculatedRow['scope'];
  rowGroupKey?: string;
  value: number | null;
  formulaId: string;
}

export interface ObjectiveMatrixFormulaEvaluation {
  results: ObjectiveMatrixFormulaResult[];
  calculatedRows: ObjectiveMatrixCalculatedRowResult[];
  evaluationOrder: string[];
}

type FormulaAst = Record<string, unknown>;
type EvaluationScope = {
  rowKey?: string;
  rowGroupKey?: string;
};
type TrackedValue = {
  value: number;
  cellKey: string;
  version?: number;
  termCode?: string;
  order: number;
  sourceCellKeys?: string[];
  sourceVersions?: Record<string, number>;
};

function cellKey(cell: Pick<ObjectiveMatrixFormulaSourceCell, 'rowKey' | 'termCode' | 'columnId'>) {
  return `${cell.rowKey}:${cell.termCode || 'SHARED'}:${cell.columnId}`;
}

function numericValue(value: unknown): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

function formulaReferences(node: unknown, references = new Set<string>()): Set<string> {
  if (!node || typeof node !== 'object' || Array.isArray(node)) return references;
  const expression = node as FormulaAst;
  if (expression.type === 'COLUMN') {
    const columnId = String(expression.columnId || '').trim();
    if (columnId) references.add(columnId);
    return references;
  }
  if (expression.type === 'OPERATOR') {
    formulaReferences(expression.left, references);
    formulaReferences(expression.right, references);
  }
  if (expression.type === 'FUNCTION') {
    for (const argument of Array.isArray(expression.arguments) ? expression.arguments : []) {
      formulaReferences(argument, references);
    }
  }
  return references;
}

export function objectiveFormulaEvaluationOrder(
  formulas: ITemplateObjectiveFormula[],
): ITemplateObjectiveFormula[] {
  const formulaByTarget = new Map(formulas.map((formula) => [formula.targetColumnId, formula]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const ordered: ITemplateObjectiveFormula[] = [];

  const visit = (formula: ITemplateObjectiveFormula) => {
    if (visited.has(formula.formulaId)) return;
    if (visiting.has(formula.formulaId)) {
      throw new Error(`Objective formula cycle detected at "${formula.formulaId}"`);
    }
    visiting.add(formula.formulaId);
    for (const reference of formulaReferences(formula.ast)) {
      const dependency = formulaByTarget.get(reference);
      if (dependency) visit(dependency);
    }
    visiting.delete(formula.formulaId);
    visited.add(formula.formulaId);
    ordered.push(formula);
  };

  formulas.forEach(visit);
  return ordered;
}

export function objectiveFormulaDependentColumnIds(
  formulas: ITemplateObjectiveFormula[],
  changedColumnIds: string[],
): string[] {
  const affected = new Set(changedColumnIds);
  const dependents = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const formula of formulas) {
      if (dependents.has(formula.targetColumnId)) continue;
      if ([...formulaReferences(formula.ast)].some((columnId) => affected.has(columnId))) {
        dependents.add(formula.targetColumnId);
        affected.add(formula.targetColumnId);
        changed = true;
      }
    }
  }
  return [...dependents];
}

export function evaluateObjectiveMatrixFormulas(input: {
  layout: ITemplateObjectiveTableLayout;
  cells: ObjectiveMatrixFormulaSourceCell[];
  termOrder?: string[];
  affectedColumnIds?: string[];
}): ObjectiveMatrixFormulaEvaluation {
  const { layout } = input;
  const termOrder = input.termOrder || ['Q1', 'Q2', 'Q3', 'Q4', 'H1', 'H2', 'Y1'];
  const termIndex = new Map(termOrder.map((term, index) => [term, index]));
  const rows = [...new Set(input.cells.map((cell) => cell.rowKey))].sort();
  const rowGroupByRow = new Map<string, string>();
  input.cells.forEach((cell) => {
    if (cell.rowGroupKey) rowGroupByRow.set(cell.rowKey, cell.rowGroupKey);
  });
  const rowGroups = [...new Set([...rowGroupByRow.values()])].sort();
  const values: TrackedValue[] = input.cells.flatMap((cell, index) => {
    const value = numericValue(cell.value);
    if (value === undefined) return [];
    return [{
      value,
      cellKey: cellKey(cell),
      version: cell.version,
      termCode: cell.termCode,
      order: cell.termCode ? (termIndex.get(cell.termCode) ?? termOrder.length) : termOrder.length + index,
      rowKey: cell.rowKey,
      rowGroupKey: cell.rowGroupKey,
      columnId: cell.columnId,
    } as TrackedValue & { rowKey: string; rowGroupKey?: string; columnId: string }];
  });
  const computedValues: Array<TrackedValue & {
    rowKey?: string;
    rowGroupKey?: string;
    columnId: string;
    sourceCellKeys: string[];
    sourceVersions: Record<string, number>;
  }> = [];
  const results: ObjectiveMatrixFormulaResult[] = [];
  const orderedFormulas = objectiveFormulaEvaluationOrder(layout.formulas || []);
  const requestedTargets = input.affectedColumnIds?.length
    ? new Set(objectiveFormulaDependentColumnIds(orderedFormulas, input.affectedColumnIds))
    : undefined;

  const sourceValues = (columnId: string, scope: EvaluationScope): TrackedValue[] => {
    const raw = [
      ...values.filter((item) => {
        const cell = item as typeof item & { rowKey: string; rowGroupKey?: string; columnId: string };
        if (cell.columnId !== columnId) return false;
        if (scope.rowKey && cell.rowKey !== scope.rowKey) return false;
        if (scope.rowGroupKey && cell.rowGroupKey !== scope.rowGroupKey) return false;
        return true;
      }),
      ...computedValues.filter((item) => {
        if (item.columnId !== columnId) return false;
        if (scope.rowKey && item.rowKey !== scope.rowKey) return false;
        if (scope.rowGroupKey && item.rowGroupKey !== scope.rowGroupKey) return false;
        return true;
      }),
    ];
    return raw.sort((left, right) => left.order - right.order || left.cellKey.localeCompare(right.cellKey));
  };

  const applyEmptyPolicy = (
    formula: ITemplateObjectiveFormula,
    items: TrackedValue[],
    label: string,
  ): TrackedValue[] => {
    if (items.length) return items;
    if (formula.emptyPolicy === 'ZERO') {
      return [{ value: 0, cellKey: `empty:${label}`, order: 0 }];
    }
    if (formula.emptyPolicy === 'ERROR') {
      throw new Error(`Objective formula "${formula.formulaId}" requires a value for ${label}`);
    }
    return [];
  };

  const evaluateFormula = (formula: ITemplateObjectiveFormula, scope: EvaluationScope) => {
    const used = new Map<string, number | undefined>();
    const remember = (items: TrackedValue[]) => {
      items.forEach((item) => {
        if (item.sourceCellKeys?.length) {
          item.sourceCellKeys.forEach((key) => used.set(key, item.sourceVersions?.[key]));
        } else {
          used.set(item.cellKey, item.version);
        }
      });
      return items;
    };
    const collect = (node: unknown): TrackedValue[] => {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return [];
      const expression = node as FormulaAst;
      if (expression.type === 'COLUMN') {
        return remember(sourceValues(String(expression.columnId || ''), scope));
      }
      const scalar = evaluateNode(node);
      return scalar === null ? [] : [{ value: scalar, cellKey: `expression:${formula.formulaId}`, order: 0 }];
    };
    const scalarFrom = (node: unknown): number | null => {
      const items = collect(node);
      if (!items.length) return formula.emptyPolicy === 'ZERO' ? 0 : null;
      return items[items.length - 1].value;
    };
    const aggregate = (name: string, items: TrackedValue[]): number | null => {
      const populated = applyEmptyPolicy(formula, remember(items), name);
      if (!populated.length) return null;
      const numbers = populated.map((item) => item.value);
      if (name.startsWith('COUNT_')) return numbers.length;
      if (name.startsWith('AVERAGE_')) return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
      if (name.startsWith('MIN_')) return Math.min(...numbers);
      if (name.startsWith('MAX_')) return Math.max(...numbers);
      if (name === 'LATEST_FILLED_TERM') return numbers[numbers.length - 1];
      return numbers.reduce((sum, value) => sum + value, 0);
    };
    function evaluateNode(node: unknown): number | null {
      if (!node || typeof node !== 'object' || Array.isArray(node)) return null;
      const expression = node as FormulaAst;
      if (expression.type === 'LITERAL') return numericValue(expression.value) ?? null;
      if (expression.type === 'COLUMN') return scalarFrom(expression);
      if (expression.type === 'OPERATOR') {
        const left = scalarFrom(expression.left);
        const right = scalarFrom(expression.right);
        if (left === null || right === null) return formula.emptyPolicy === 'ZERO' ? (left ?? 0) : null;
        const operator = String(expression.operator || '');
        if (operator === 'ADD') return left + right;
        if (operator === 'SUBTRACT') return left - right;
        if (operator === 'MULTIPLY') return left * right;
        if (right === 0) {
          if (formula.divideByZeroPolicy === 'ZERO') return 0;
          if (formula.divideByZeroPolicy === 'ERROR') {
            throw new Error(`Objective formula "${formula.formulaId}" cannot divide by zero`);
          }
          return null;
        }
        return left / right;
      }
      if (expression.type !== 'FUNCTION') return null;
      const name = String(expression.name || '');
      const args = Array.isArray(expression.arguments) ? expression.arguments : [];
      if (['SUM_TERMS', 'AVERAGE_TERMS', 'LATEST_FILLED_TERM', 'MIN_TERMS', 'MAX_TERMS',
        'SUM_GROUP', 'AVERAGE_GROUP', 'MIN_GROUP', 'MAX_GROUP', 'COUNT_GROUP',
        'SUM_TABLE', 'AVERAGE_TABLE', 'MIN_TABLE', 'MAX_TABLE', 'COUNT_TABLE'].includes(name)) {
        return aggregate(name, args.flatMap(collect));
      }
      const scalars = args.map(scalarFrom).filter((value): value is number => value !== null);
      if (!scalars.length) return formula.emptyPolicy === 'ZERO' ? 0 : null;
      if (name === 'ABS') return Math.abs(scalars[0]);
      if (name === 'ROUND') {
        const precision = scalars[1] ?? formula.decimalPrecision ?? 0;
        const factor = 10 ** precision;
        return Math.round((scalars[0] + Number.EPSILON) * factor) / factor;
      }
      if (name === 'MIN') return Math.min(...scalars);
      if (name === 'MAX') return Math.max(...scalars);
      return null;
    }

    const rawValue = evaluateNode(formula.ast);
    const value = rawValue === null
      ? null
      : Number(rawValue.toFixed(formula.decimalPrecision ?? 12));
    const sourceCellKeys = [...used.keys()].filter((key) => !key.startsWith('empty:')).sort();
    const sourceVersions = Object.fromEntries(
      [...used.entries()]
        .filter((entry): entry is [string, number] => entry[1] !== undefined)
        .sort(([left], [right]) => left.localeCompare(right)),
    );
    return { value, sourceCellKeys, sourceVersions };
  };

  for (const formula of orderedFormulas) {
    if (requestedTargets && !requestedTargets.has(formula.targetColumnId)) continue;
    const scopes: EvaluationScope[] = formula.scope === 'TABLE'
      ? [{}]
      : formula.scope === 'GROUP'
        ? rowGroups.map((rowGroupKey) => ({ rowGroupKey }))
        : rows.map((rowKey) => ({ rowKey, rowGroupKey: rowGroupByRow.get(rowKey) }));
    for (const scope of scopes) {
      const evaluated = evaluateFormula(formula, scope);
      const result: ObjectiveMatrixFormulaResult = {
        formulaId: formula.formulaId,
        targetColumnId: formula.targetColumnId,
        scope: formula.scope,
        ...scope,
        ...evaluated,
      };
      results.push(result);
      if (evaluated.value !== null) {
        computedValues.push({
          value: evaluated.value,
          cellKey: `formula:${formula.formulaId}:${scope.rowKey || scope.rowGroupKey || 'TABLE'}`,
          order: termOrder.length + computedValues.length,
          rowKey: scope.rowKey,
          rowGroupKey: scope.rowGroupKey,
          columnId: formula.targetColumnId,
          sourceCellKeys: evaluated.sourceCellKeys,
          sourceVersions: evaluated.sourceVersions,
        });
      }
    }
  }

  const calculatedRows = (layout.calculatedRows || []).flatMap((calculatedRow) =>
    results
      .filter((result) => result.formulaId === calculatedRow.formulaId)
      .filter((result) => !calculatedRow.rowGroupKey || result.rowGroupKey === calculatedRow.rowGroupKey)
      .map((result) => ({
        calculatedRowId: calculatedRow.calculatedRowId,
        label: calculatedRow.label,
        scope: calculatedRow.scope,
        rowGroupKey: calculatedRow.rowGroupKey || result.rowGroupKey,
        value: result.value,
        formulaId: calculatedRow.formulaId,
      })),
  );

  return {
    results,
    calculatedRows,
    evaluationOrder: orderedFormulas.map((formula) => formula.formulaId),
  };
}
