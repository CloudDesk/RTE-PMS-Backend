import { ObjectiveSource, PmsTemplateFieldType, PmsTemplateSectionType } from '../constants/pms.enums';

export type PmsScoringReviewValue = {
  fieldKey?: string;
  sectionKey?: string;
  valueJson?: any;
  valueText?: string;
  valueNumber?: number;
};

export type PmsScoringRating = {
  objectiveId?: string;
  rating?: number;
};

export type PmsScoringConfig = {
  objectiveRatingRule?: { maxScore?: number } | null;
  overallScoreMax?: number | null;
  scoringPolicy?: PmsScoringPolicy;
  sections: Array<{
    sectionKey: string;
    sectionType?: string;
    weightage: number;
    aggregationMethod: 'WEIGHTED_AVERAGE' | 'SIMPLE_AVERAGE' | 'SUM' | 'MAX_FIELD';
    maxSectionScore: number | null;
    scoringFields: any[];
    objectiveBuckets?: any[];
    scoringPolicy?: PmsScoringPolicy;
  }>;
};

export type PmsNormalizationPolicy = {
  method?: 'NONE' | 'CLAMP' | 'SCALE_TO_MAX';
  minScore?: number;
  maxScore?: number;
  targetMaxScore?: number;
};

export type PmsRoundingPolicy = {
  method?: 'NONE' | 'NEAREST' | 'UP' | 'DOWN';
  precision?: number;
};

export type PmsConditionalScoringRule = {
  dependsOn: string;
  operator: 'EQUALS' | 'NOT_EQUALS' | 'IN' | 'NOT_IN' | 'GREATER_THAN' | 'LESS_THAN' | 'IS_EMPTY' | 'IS_NOT_EMPTY';
  value?: unknown;
  action: 'INCLUDE' | 'EXCLUDE' | 'MULTIPLY';
  multiplier?: number;
};

export type PmsScoringPolicy = {
  normalization?: PmsNormalizationPolicy;
  rounding?: PmsRoundingPolicy;
  conditionalScoring?: PmsConditionalScoringRule[];
};

export class PmsScoringService {
  getOptionScore(selectedValue: string, field: any, row?: any): number | undefined {
    if (!selectedValue) return undefined;

    if (row && Array.isArray(row.options)) {
      const match = row.options.find((opt: any) => opt.value === selectedValue);
      if (match?.score !== undefined && match.score !== null) return Number(match.score);
      if (match?.weight !== undefined && match.weight !== null) return Number(match.weight);
    }

    if (field.matrixConfig && Array.isArray(field.matrixConfig.options)) {
      const match = field.matrixConfig.options.find((opt: any) => opt.value === selectedValue);
      if (match?.score !== undefined && match.score !== null) return Number(match.score);
      if (match?.weight !== undefined && match.weight !== null) return Number(match.weight);
    }

    if (Array.isArray(field.options)) {
      const match = field.options.find((opt: any) => opt.value === selectedValue);
      if (match?.score !== undefined && match.score !== null) return Number(match.score);
      if (match?.weight !== undefined && match.weight !== null) return Number(match.weight);
    }

    if (field.scoringConfig && Array.isArray(field.scoringConfig.optionScores)) {
      const rowKey = row?.key ?? row?.id;
      const match = field.scoringConfig.optionScores.find(
        (opt: any) =>
          opt.optionValue === selectedValue ||
          opt.value === selectedValue ||
          (rowKey && opt.optionValue === `${rowKey}:${selectedValue}`),
      );
      if (match?.score !== undefined && match.score !== null) return Number(match.score);
    }

    return undefined;
  }

  private getMatrixSelectionScore(selectedValue: string | string[], field: any, row: any, rowMaxScore: number): number {
    const selectedValues = Array.isArray(selectedValue)
      ? (field.matrixConfig?.selectionControl === 'checkbox' ? selectedValue : selectedValue.slice(0, 1)).filter(Boolean)
      : [selectedValue].filter(Boolean);
    const scores = selectedValues
      .map((value) => this.getOptionScore(value, field, row) ?? 0)
      .filter((score) => Number.isFinite(score));

    if (scores.length === 0) return 0;
    if (!Array.isArray(selectedValue) || field.matrixConfig?.selectionControl !== 'checkbox') return scores[0];

    switch (field.matrixConfig?.multiSelectScoring ?? 'MAX') {
      case 'AVERAGE':
        return scores.reduce((sum, score) => sum + score, 0) / scores.length;
      case 'SUM_CAPPED':
        return Math.min(scores.reduce((sum, score) => sum + score, 0), rowMaxScore);
      case 'MAX':
      default:
        return Math.max(...scores);
    }
  }

  evaluateFormulaExpression(formula: string, context: Record<string, number>): number | undefined {
    const substituted = formula.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key: string) => {
      const value = context[key];
      return Number.isFinite(value) ? String(value) : '0';
    });

    if (/[A-Za-z_]/.test(substituted)) return undefined;
    if (!/^[0-9+\-*/().\s]+$/.test(substituted)) return undefined;

    try {
      const result = Function(`"use strict"; return (${substituted});`)();
      return Number.isFinite(Number(result)) ? Number(result) : undefined;
    } catch {
      return undefined;
    }
  }

  calculateSectionScores(
    reviewValues: PmsScoringReviewValue[],
    reviewConfig: PmsScoringConfig,
    approvedObjectives: any[],
    ratings: PmsScoringRating[],
  ): {
    sectionScores: Array<{ sectionKey: string; score: number; weightage: number }>;
    sectionsSnapshot: any[];
  } {
    const valueMap = new Map(
      reviewValues
        .filter((value) => value.fieldKey?.trim() && value.sectionKey?.trim())
        .map((value) => [`${value.sectionKey}::${value.fieldKey}`, value]),
    );

    const sectionScores: Array<{ sectionKey: string; score: number; weightage: number }> = [];
    const sectionsSnapshot: any[] = [];

    for (const section of reviewConfig.sections) {
      let sectionScore = 0;
      let sectionDetails: any = {};

      if (section.sectionType === PmsTemplateSectionType.OBJECTIVES) {
        const { score, snapshot } = this.calculateObjectiveSectionScore(
          section,
          reviewConfig,
          approvedObjectives,
          ratings,
        );
        sectionScore = score;
        sectionDetails = snapshot;
      } else {
        const { score, snapshot } = this.calculateFieldSectionScore(section, valueMap);
        sectionScore = score;
        sectionDetails = snapshot;
      }

      const cappedScore =
        section.maxSectionScore !== null && sectionScore > section.maxSectionScore
          ? section.maxSectionScore
          : sectionScore;
      const normalizedScore = this.applyScorePolicies(
        cappedScore,
        section.scoringPolicy ?? reviewConfig.scoringPolicy,
      );

      sectionScores.push({
        sectionKey: section.sectionKey,
        score: normalizedScore,
        weightage: section.weightage,
      });

      sectionsSnapshot.push({
        sectionKey: section.sectionKey,
        sectionType: section.sectionType,
        score: normalizedScore,
        weightage: section.weightage,
        maxSectionScore: section.maxSectionScore,
        aggregationMethod: section.aggregationMethod,
        ...sectionDetails,
      });
    }

    return { sectionScores, sectionsSnapshot };
  }

  calculateOverallScore(
    sectionScores: Array<{ sectionKey: string; score: number; weightage: number }>,
    reviewConfig: PmsScoringConfig,
  ): number | undefined {
    if (sectionScores.length === 0) return undefined;

    const totalWeight = sectionScores.reduce((total, item) => total + item.weightage, 0);
    const rawScore = totalWeight > 0
      ? sectionScores.reduce((total, item) => total + (item.score * item.weightage), 0) / totalWeight
      : sectionScores.reduce((total, item) => total + item.score, 0) / sectionScores.length;

    const cappedScore = reviewConfig.overallScoreMax !== null && reviewConfig.overallScoreMax !== undefined && rawScore > reviewConfig.overallScoreMax
      ? reviewConfig.overallScoreMax
      : rawScore;

    return this.applyScorePolicies(cappedScore, reviewConfig.scoringPolicy);
  }

  private calculateObjectiveSectionScore(
    section: PmsScoringConfig['sections'][number],
    reviewConfig: PmsScoringConfig,
    approvedObjectives: any[],
    ratings: PmsScoringRating[],
  ): { score: number; snapshot: any } {
    const buckets = section.objectiveBuckets ?? [];
    const objectivesByBucket = new Map<string, any[]>();

    for (const obj of approvedObjectives.filter((objective) => objective.source === ObjectiveSource.PREDEFINED)) {
      let bucketKey = 'employee_dynamic';
      if (obj.source === ObjectiveSource.PREDEFINED) bucketKey = 'template_predefined';

      const matchedBucket = buckets.find(
        (b) =>
          b.bucketKey === bucketKey ||
          (obj.source === ObjectiveSource.PREDEFINED && b.source === 'TEMPLATE_PREDEFINED'),
      );
      const actualBucketKey = matchedBucket ? matchedBucket.bucketKey : bucketKey;

      if (!objectivesByBucket.has(actualBucketKey)) objectivesByBucket.set(actualBucketKey, []);
      objectivesByBucket.get(actualBucketKey)!.push(obj);
    }

    const activeBuckets = buckets.filter((b) => (objectivesByBucket.get(b.bucketKey) ?? []).length > 0);
    const sumOfActiveBucketWeightages = activeBuckets.reduce(
      (sum, b) => sum + Number(b.bucketWeightage ?? 0),
      0,
    );

    const bucketSnapshots: any[] = [];
    let runningSectionScore = 0;

    for (const bucket of activeBuckets) {
      const adjustedBucketWeight = sumOfActiveBucketWeightages > 0
        ? (Number(bucket.bucketWeightage ?? 0) / sumOfActiveBucketWeightages) * 100
        : 0;

      const bucketObjs = objectivesByBucket.get(bucket.bucketKey) ?? [];
      const objWeights = this.resolveObjectiveRowWeights(bucket, bucketObjs);

      let bucketScoreSum = 0;
      const objsSnapshot: any[] = [];

      bucketObjs.forEach((obj, idx) => {
        const rowWeight = objWeights[idx] ?? 0;
        const ratingMatch = ratings.find((r) => r.objectiveId?.toString() === obj._id.toString());
        const ratingValue = ratingMatch?.rating !== undefined && ratingMatch.rating !== null
          ? Number(ratingMatch.rating)
          : 0;

        const maxRatingScore = reviewConfig.objectiveRatingRule?.maxScore ?? 10;
        const normalizedRatingScore = maxRatingScore > 0 ? (ratingValue / maxRatingScore) * 100 : 0;
        const objContribution = (rowWeight / 100) * normalizedRatingScore;
        bucketScoreSum += objContribution;

        objsSnapshot.push({
          objectiveId: obj._id.toString(),
          title: obj.title,
          weightage: obj.weightage,
          rowWeight,
          rating: ratingValue,
          normalizedRatingScore,
          contribution: objContribution,
        });
      });

      runningSectionScore += (adjustedBucketWeight / 100) * bucketScoreSum;

      bucketSnapshots.push({
        bucketKey: bucket.bucketKey,
        label: bucket.label,
        bucketWeightage: bucket.bucketWeightage,
        adjustedBucketWeight,
        rowWeightMode: bucket.rowWeightMode,
        score: bucketScoreSum,
        objectives: objsSnapshot,
      });
    }

    return { score: runningSectionScore, snapshot: { activeBuckets: bucketSnapshots } };
  }

  private resolveObjectiveRowWeights(bucket: any, bucketObjs: any[]): number[] {
    if (bucketObjs.length === 0) return [];

    const rawWeights = bucket.rowWeightMode === 'EQUAL_DISTRIBUTION'
      ? bucketObjs.map(() => 100 / bucketObjs.length)
      : bucketObjs.every((o) => o.weightage !== undefined && o.weightage !== null && Number(o.weightage) > 0)
        ? bucketObjs.map((o) => Number(o.weightage))
        : bucketObjs.map(() => 100 / bucketObjs.length);

    const totalWeightSum = rawWeights.reduce((sum, w) => sum + w, 0);
    return rawWeights.map((w) => (totalWeightSum > 0 ? (w / totalWeightSum) * 100 : 0));
  }

  private calculateFieldSectionScore(
    section: PmsScoringConfig['sections'][number],
    valueMap: Map<string, PmsScoringReviewValue>,
  ): { score: number; snapshot: any } {
    const fieldScores: Array<{ score: number; weightage: number }> = [];
    const fieldsSnapshot: any[] = [];

    for (const field of section.scoringFields) {
      const matchedValue = valueMap.get(`${field.sectionKey}::${field.fieldKey}`);
      const conditionalMultiplier = this.resolveConditionalMultiplier(
        field.scoringConfig?.conditionalScoring ?? field.conditionalScoring,
        valueMap,
      );
      if (conditionalMultiplier === 0) {
        continue;
      }
      const resolved = this.resolveFieldScore(field, matchedValue);

      if (resolved && Number.isFinite(resolved.rawScore)) {
        const baseFieldScore = resolved.maxScore > 0 ? (resolved.rawScore / resolved.maxScore) * 100 : 0;
        const normalizedFieldScore = this.applyScorePolicies(
          baseFieldScore * conditionalMultiplier,
          field.scoringConfig?.scoringPolicy ?? field.scoringPolicy,
        );
        fieldScores.push({ score: normalizedFieldScore, weightage: field.weightage });
        fieldsSnapshot.push({
          fieldKey: field.fieldKey,
          fieldType: field.fieldType,
          fieldCategory: field.fieldCategory,
          rawScore: resolved.rawScore,
          maxScore: resolved.maxScore,
          normalizedScore: normalizedFieldScore,
          weightage: field.weightage,
          value: matchedValue?.valueNumber ?? matchedValue?.valueText ?? matchedValue?.valueJson,
          ...resolved.extraDetails,
        });
      }
    }

    if (fieldScores.length === 0) return { score: 0, snapshot: {} };

    let score = 0;
    switch (section.aggregationMethod) {
      case 'SUM':
        score = fieldScores.reduce((total, item) => total + item.score, 0);
        break;
      case 'MAX_FIELD':
        score = Math.max(...fieldScores.map((item) => item.score));
        break;
      case 'SIMPLE_AVERAGE':
        score = fieldScores.reduce((total, item) => total + item.score, 0) / fieldScores.length;
        break;
      case 'WEIGHTED_AVERAGE':
      default: {
        const totalWeight = fieldScores.reduce((total, item) => total + item.weightage, 0);
        score = totalWeight > 0
          ? fieldScores.reduce((total, item) => total + (item.score * item.weightage), 0) / totalWeight
          : fieldScores.reduce((total, item) => total + item.score, 0) / fieldScores.length;
        break;
      }
    }

    return { score, snapshot: { fields: fieldsSnapshot } };
  }

  private resolveFieldScore(field: any, matchedValue?: PmsScoringReviewValue): {
    rawScore: number;
    maxScore: number;
    extraDetails: any;
  } | undefined {
    let rawScore: number | undefined;
    let maxScore = field.maxScore ?? 100;
    let extraDetails: any = {};

    if (field.fieldType === PmsTemplateFieldType.MATRIX || field.fieldType === 'MATRIX') {
      const matrix = this.calculateMatrixScore(field, matchedValue, maxScore);
      rawScore = matrix.rawScore;
      maxScore = 100;
      extraDetails = { rows: matrix.rowsSnapshot };
    } else if (
      ['DROPDOWN', 'RADIO', 'CHECKBOX_GROUP', 'MULTISELECT'].includes(field.fieldType) ||
      field.scoreType === 'OPTION_BASED'
    ) {
      const selectedValue = matchedValue?.valueText ||
        (typeof matchedValue?.valueJson === 'string' ? matchedValue.valueJson : undefined);
      if (selectedValue) rawScore = this.getOptionScore(selectedValue, field);
    } else if (field.scoreType === 'BOOLEAN' || field.fieldType === 'CHECKBOX') {
      const isChecked =
        matchedValue?.valueJson === true ||
        matchedValue?.valueJson === 'true' ||
        matchedValue?.valueText === 'true';
      const checkedScore = field.scoringConfig?.checkedScore !== undefined
        ? Number(field.scoringConfig.checkedScore)
        : undefined;
      const uncheckedScore = field.scoringConfig?.uncheckedScore !== undefined
        ? Number(field.scoringConfig.uncheckedScore)
        : undefined;
      rawScore = isChecked ? (checkedScore ?? maxScore) : (uncheckedScore ?? 0);
    } else if (matchedValue?.valueNumber !== undefined && matchedValue.valueNumber !== null) {
      rawScore = Number(matchedValue.valueNumber);
    }

    if (rawScore === undefined || !Number.isFinite(rawScore)) return undefined;
    return { rawScore, maxScore, extraDetails };
  }

  private applyScorePolicies(score: number, policy?: PmsScoringPolicy): number {
    let nextScore = score;
    const normalization = policy?.normalization;
    if (normalization?.method === 'CLAMP') {
      const min = Number.isFinite(Number(normalization.minScore)) ? Number(normalization.minScore) : 0;
      const max = Number.isFinite(Number(normalization.maxScore)) ? Number(normalization.maxScore) : 100;
      nextScore = Math.min(Math.max(nextScore, min), max);
    } else if (normalization?.method === 'SCALE_TO_MAX') {
      const max = Number(normalization.maxScore);
      const targetMax = Number(normalization.targetMaxScore ?? 100);
      if (Number.isFinite(max) && max > 0 && Number.isFinite(targetMax) && targetMax > 0) {
        nextScore = (nextScore / max) * targetMax;
      }
    }

    const rounding = policy?.rounding;
    if (rounding?.method && rounding.method !== 'NONE') {
      const precision = Math.max(0, Number.isFinite(Number(rounding.precision)) ? Number(rounding.precision) : 2);
      const factor = 10 ** precision;
      if (rounding.method === 'UP') nextScore = Math.ceil(nextScore * factor) / factor;
      else if (rounding.method === 'DOWN') nextScore = Math.floor(nextScore * factor) / factor;
      else nextScore = Math.round(nextScore * factor) / factor;
    }

    return nextScore;
  }

  private resolveConditionalMultiplier(
    rules: PmsConditionalScoringRule[] | undefined,
    valueMap: Map<string, PmsScoringReviewValue>,
  ): number {
    if (!Array.isArray(rules) || rules.length === 0) return 1;

    let multiplier = 1;
    for (const rule of rules) {
      const matched = this.evaluateConditionalRule(rule, valueMap);
      if (rule.action === 'INCLUDE' && !matched) return 0;
      if (!matched) continue;
      if (rule.action === 'EXCLUDE') return 0;
      if (rule.action === 'MULTIPLY') {
        const factor = Number(rule.multiplier);
        multiplier *= Number.isFinite(factor) ? factor : 1;
      }
    }

    return multiplier;
  }

  private evaluateConditionalRule(
    rule: PmsConditionalScoringRule,
    valueMap: Map<string, PmsScoringReviewValue>,
  ): boolean {
    const value = this.resolveConditionValue(rule.dependsOn, valueMap);
    switch (rule.operator) {
      case 'EQUALS':
        return String(value) === String(rule.value);
      case 'NOT_EQUALS':
        return String(value) !== String(rule.value);
      case 'IN':
        return this.normalizeConditionList(rule.value).includes(String(value));
      case 'NOT_IN':
        return !this.normalizeConditionList(rule.value).includes(String(value));
      case 'GREATER_THAN':
        return Number(value) > Number(rule.value);
      case 'LESS_THAN':
        return Number(value) < Number(rule.value);
      case 'IS_EMPTY':
        return value === undefined || value === null || value === '';
      case 'IS_NOT_EMPTY':
        return value !== undefined && value !== null && value !== '';
      default:
        return false;
    }
  }

  private resolveConditionValue(
    fieldKey: string,
    valueMap: Map<string, PmsScoringReviewValue>,
  ): unknown {
    const match = Array.from(valueMap.entries()).find(([key]) => key.endsWith(`::${fieldKey}`))?.[1];
    return match?.valueNumber ?? match?.valueText ?? match?.valueJson;
  }

  private normalizeConditionList(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.map(String);
    }

    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }

    if (value === undefined || value === null) {
      return [];
    }

    return [String(value)];
  }

  calculateAnnualRollup(
    quarterScores: Record<string, number | undefined | null>,
    annualScoringConfig?: {
      aggregationMethod?: 'WEIGHTED_AVERAGE' | 'SIMPLE_AVERAGE';
      quarterWeights?: Record<string, number>;
      excludedQuarters?: string[];
      scoringPolicy?: PmsScoringPolicy;
    },
  ): number | undefined {
    const excluded = new Set(annualScoringConfig?.excludedQuarters ?? []);
    const entries = Object.entries(quarterScores)
      .filter(([quarter, score]) => !excluded.has(quarter) && Number.isFinite(Number(score)))
      .map(([quarter, score]) => ({ quarter, score: Number(score) }));

    if (entries.length === 0) return undefined;

    const method = annualScoringConfig?.aggregationMethod ?? 'WEIGHTED_AVERAGE';
    const rawScore = method === 'SIMPLE_AVERAGE'
      ? entries.reduce((sum, item) => sum + Number(item.score), 0) / entries.length
      : (() => {
          const totalWeight = entries.reduce(
            (sum, item) => sum + Number(annualScoringConfig?.quarterWeights?.[item.quarter] ?? 0),
            0,
          );
          return totalWeight > 0
            ? entries.reduce(
                (sum, item) => sum + (Number(item.score) * Number(annualScoringConfig?.quarterWeights?.[item.quarter] ?? 0)),
                0,
              ) / totalWeight
            : entries.reduce((sum, item) => sum + Number(item.score), 0) / entries.length;
        })();

    return this.applyScorePolicies(rawScore, annualScoringConfig?.scoringPolicy);
  }

  private calculateMatrixScore(field: any, matchedValue: PmsScoringReviewValue | undefined, defaultMaxScore: number): {
    rawScore: number;
    rowsSnapshot: any[];
  } {
    const rows = field.matrixConfig?.rows ?? [];
    const rawWeights = rows.every((r: any) => r.weightage !== undefined && r.weightage !== null && Number(r.weightage) > 0)
      ? rows.map((r: any) => Number(r.weightage))
      : rows.map(() => 100 / rows.length);
    const totalRowWeightSum = rawWeights.reduce((sum: number, w: number) => sum + w, 0);
    const normalizedRowWeights = rawWeights.map((w: number) => (totalRowWeightSum > 0 ? (w / totalRowWeightSum) * 100 : 0));

    let valueJsonMap: Record<string, any> = {};
    if (matchedValue?.valueJson) {
      if (typeof matchedValue.valueJson === 'string') {
        try {
          valueJsonMap = JSON.parse(matchedValue.valueJson);
        } catch {
          valueJsonMap = {};
        }
      } else if (typeof matchedValue.valueJson === 'object') {
        valueJsonMap = matchedValue.valueJson as Record<string, any>;
      }
    }

    let matrixScoreSum = 0;
    const rowsSnapshot: any[] = [];

    rows.forEach((row: any, idx: number) => {
      const rowWeight = normalizedRowWeights[idx];
      const selectedValue = valueJsonMap[row.key] || valueJsonMap.values?.[row.key];
      const allRowOpts = row.options || field.matrixConfig?.options || field.options || [];
      const optionMax = allRowOpts.reduce((max: number, option: any) => {
        const score = Number(option.score ?? option.weight);
        return Number.isFinite(score) && score > max ? score : max;
      }, 0);
      const rowMaxScore = optionMax > 0 ? optionMax : defaultMaxScore;
      const rowScore = selectedValue ? this.getMatrixSelectionScore(selectedValue, field, row, rowMaxScore) : 0;
      const normalizedRowScore = rowMaxScore > 0 ? (rowScore / rowMaxScore) * 100 : 0;
      const contribution = (rowWeight / 100) * normalizedRowScore;
      matrixScoreSum += contribution;

      rowsSnapshot.push({
        key: row.key,
        label: row.label,
        weightage: row.weightage,
        rowWeight,
        selectedValue,
        score: rowScore,
        maxScore: rowMaxScore,
        normalizedRowScore,
        contribution,
      });
    });

    return { rawScore: matrixScoreSum, rowsSnapshot };
  }
}
