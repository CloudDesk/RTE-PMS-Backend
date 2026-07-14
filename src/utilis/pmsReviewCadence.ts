import {
  AssessmentTermCode,
  AssessmentTermType,
  getAssessmentTermLabel,
  getAssessmentTerms,
} from '../constants/pms.enums';
import type {
  AssessmentTermCode as AssessmentTermCodeType,
  AssessmentTermType as AssessmentTermTypeType,
} from '../constants/pms.enums';

export type ManagerReviewMode = 'TERM' | 'GROUPED';
export type ManagerReviewCadence =
  | 'SAME_AS_EMPLOYEE'
  | 'HALF_YEARLY'
  | 'ANNUAL'
  | 'CUSTOM';
export type ManagerReviewScoreDistribution = 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS';
export type ManagerReviewAnnualGate = 'ALL_TERMS_FINALIZED' | 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED';

export interface ManagerReviewGroupConfig {
  reviewCode: string;
  label: string;
  includedTerms: AssessmentTermCodeType[];
  anchorTerm: AssessmentTermCodeType;
  windowSource?: 'ANCHOR_TERM';
}

export interface ReviewCadenceConfig {
  version: number;
  managerReviewMode: ManagerReviewMode;
  managerReviewCadence: ManagerReviewCadence;
  groups: ManagerReviewGroupConfig[];
  scoreDistribution: ManagerReviewScoreDistribution;
  annualDecisionGate: ManagerReviewAnnualGate;
}

export function defaultReviewCadenceConfig(): ReviewCadenceConfig {
  return {
    version: 1,
    managerReviewMode: 'TERM',
    managerReviewCadence: 'SAME_AS_EMPLOYEE',
    groups: [],
    scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
    annualDecisionGate: 'ALL_TERMS_FINALIZED',
  };
}

export function normalizeReviewCadenceConfig(
  input: unknown,
  assessmentTermType: AssessmentTermTypeType | string = AssessmentTermType.QUARTERLY,
): ReviewCadenceConfig {
  const record = isRecord(input) ? input : {};
  const managerReviewMode = record.managerReviewMode === 'GROUPED' ? 'GROUPED' : 'TERM';
  const managerReviewCadence = normalizeManagerReviewCadence(record.managerReviewCadence);

  if (managerReviewMode === 'TERM' || managerReviewCadence === 'SAME_AS_EMPLOYEE') {
    return defaultReviewCadenceConfig();
  }

  const terms = getAssessmentTerms(assessmentTermType);
  const rawGroups = Array.isArray(record.groups) && record.groups.length > 0
    ? record.groups
    : buildPresetGroups(managerReviewCadence, terms);
  const groups = normalizeGroups(rawGroups, terms);

  validateGroupedReviewConfig(groups, terms);

  return {
    version: 1,
    managerReviewMode: 'GROUPED',
    managerReviewCadence,
    groups,
    scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
    annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
  };
}

export function isGroupedManagerReviewConfig(input: unknown): boolean {
  return isRecord(input) && input.managerReviewMode === 'GROUPED';
}

export function intersectGroupTerms(
  group: ManagerReviewGroupConfig,
  applicableTerms: AssessmentTermCodeType[],
): AssessmentTermCodeType[] {
  const applicable = new Set(applicableTerms);
  return group.includedTerms.filter((term) => applicable.has(term));
}

function normalizeManagerReviewCadence(value: unknown): ManagerReviewCadence {
  if (
    value === 'HALF_YEARLY' ||
    value === 'ANNUAL' ||
    value === 'CUSTOM' ||
    value === 'SAME_AS_EMPLOYEE'
  ) {
    return value;
  }

  return 'SAME_AS_EMPLOYEE';
}

function buildPresetGroups(
  cadence: ManagerReviewCadence,
  terms: AssessmentTermCodeType[],
): ManagerReviewGroupConfig[] {
  if (cadence === 'ANNUAL') {
    return [
      {
        reviewCode: 'ANNUAL',
        label: 'Annual Manager Review',
        includedTerms: terms,
        anchorTerm: terms[terms.length - 1],
        windowSource: 'ANCHOR_TERM',
      },
    ];
  }

  if (
    cadence === 'HALF_YEARLY' &&
    terms.length === 4 &&
    terms.includes(AssessmentTermCode.Q1) &&
    terms.includes(AssessmentTermCode.Q4)
  ) {
    return [
      {
        reviewCode: 'H1',
        label: 'H1 Manager Review',
        includedTerms: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
        anchorTerm: AssessmentTermCode.Q2,
        windowSource: 'ANCHOR_TERM',
      },
      {
        reviewCode: 'H2',
        label: 'H2 Manager Review',
        includedTerms: [AssessmentTermCode.Q3, AssessmentTermCode.Q4],
        anchorTerm: AssessmentTermCode.Q4,
        windowSource: 'ANCHOR_TERM',
      },
    ];
  }

  return [];
}

function normalizeGroups(
  groups: unknown[],
  validTerms: AssessmentTermCodeType[],
): ManagerReviewGroupConfig[] {
  return groups.map((group, index) => {
    if (!isRecord(group)) {
      throw new Error(`Manager review group ${index + 1} must be an object`);
    }

    const includedTerms = Array.isArray(group.includedTerms)
      ? group.includedTerms.filter((term): term is AssessmentTermCodeType =>
          validTerms.includes(term as AssessmentTermCodeType),
        )
      : [];
    const anchorTerm = validTerms.includes(group.anchorTerm as AssessmentTermCodeType)
      ? group.anchorTerm as AssessmentTermCodeType
      : includedTerms[includedTerms.length - 1];
    const reviewCode = String(group.reviewCode ?? '').trim().toUpperCase();
    const label = String(group.label ?? '').trim();

    return {
      reviewCode,
      label: label || reviewCode || includedTerms.map(getAssessmentTermLabel).join(' + '),
      includedTerms,
      anchorTerm,
      windowSource: 'ANCHOR_TERM',
    };
  });
}

function validateGroupedReviewConfig(
  groups: ManagerReviewGroupConfig[],
  expectedTerms: AssessmentTermCodeType[],
): void {
  if (groups.length === 0) {
    throw new Error('Grouped manager review requires at least one review group');
  }

  const seenTerms = new Set<AssessmentTermCodeType>();
  const seenCodes = new Set<string>();

  for (const group of groups) {
    if (!group.reviewCode) {
      throw new Error('Every manager review group requires a reviewCode');
    }
    if (seenCodes.has(group.reviewCode)) {
      throw new Error(`Duplicate manager review group code ${group.reviewCode}`);
    }
    seenCodes.add(group.reviewCode);

    if (group.includedTerms.length === 0) {
      throw new Error(`${group.reviewCode} must include at least one assessment term`);
    }
    if (!group.includedTerms.includes(group.anchorTerm)) {
      throw new Error(`${group.reviewCode} anchorTerm must be one of its includedTerms`);
    }

    for (const term of group.includedTerms) {
      if (!expectedTerms.includes(term)) {
        throw new Error(`${term} is not valid for the selected assessment term type`);
      }
      if (seenTerms.has(term)) {
        throw new Error(`${term} is included in more than one manager review group`);
      }
      seenTerms.add(term);
    }
  }

  const missingTerms = expectedTerms.filter((term) => !seenTerms.has(term));
  if (missingTerms.length > 0) {
    throw new Error(
      `Grouped manager review must cover every assessment term. Missing: ${missingTerms.join(', ')}`,
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
