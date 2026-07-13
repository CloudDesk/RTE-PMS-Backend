import { AssessmentTermCode, AssessmentTermType } from '../../src/constants/pms.enums';
import {
  intersectGroupTerms,
  normalizeReviewCadenceConfig,
} from '../../src/utilis/pmsReviewCadence';

describe('pmsReviewCadence utilities', () => {
  it('defaults to per-term manager review when no config is provided', () => {
    expect(normalizeReviewCadenceConfig(undefined, AssessmentTermType.QUARTERLY)).toEqual({
      version: 1,
      managerReviewMode: 'TERM',
      managerReviewCadence: 'SAME_AS_EMPLOYEE',
      groups: [],
      scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
      annualDecisionGate: 'ALL_TERMS_FINALIZED',
    });
  });

  it('builds the safe half-yearly preset for quarterly employee terms', () => {
    const config = normalizeReviewCadenceConfig(
      {
        managerReviewMode: 'GROUPED',
        managerReviewCadence: 'HALF_YEARLY',
      },
      AssessmentTermType.QUARTERLY,
    );

    expect(config).toMatchObject({
      managerReviewMode: 'GROUPED',
      managerReviewCadence: 'HALF_YEARLY',
      annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
      groups: [
        {
          reviewCode: 'H1',
          includedTerms: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
          anchorTerm: AssessmentTermCode.Q2,
          windowSource: 'ANCHOR_TERM',
        },
        {
          reviewCode: 'H2',
          includedTerms: [AssessmentTermCode.Q3, AssessmentTermCode.Q4],
          anchorTerm: AssessmentTermCode.Q4,
          windowSource: 'ANCHOR_TERM',
        },
      ],
    });
  });

  it('builds the annual preset against the selected employee term type', () => {
    const config = normalizeReviewCadenceConfig(
      {
        managerReviewMode: 'GROUPED',
        managerReviewCadence: 'ANNUAL',
      },
      AssessmentTermType.HALF_YEARLY,
    );

    expect(config.groups).toEqual([
      {
        reviewCode: 'ANNUAL',
        label: 'Annual Manager Review',
        includedTerms: [AssessmentTermCode.H1, AssessmentTermCode.H2],
        anchorTerm: AssessmentTermCode.H2,
        windowSource: 'ANCHOR_TERM',
      },
    ]);
  });

  it('rejects half-yearly manager review when employee terms are not quarterly', () => {
    expect(() =>
      normalizeReviewCadenceConfig(
        {
          managerReviewMode: 'GROUPED',
          managerReviewCadence: 'HALF_YEARLY',
        },
        AssessmentTermType.HALF_YEARLY,
      ),
    ).toThrow('Grouped manager review requires at least one review group');
  });

  it('rejects duplicate manager review codes', () => {
    expect(() =>
      normalizeReviewCadenceConfig(
        {
          managerReviewMode: 'GROUPED',
          managerReviewCadence: 'CUSTOM',
          groups: [
            {
              reviewCode: 'h1',
              label: 'H1',
              includedTerms: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
              anchorTerm: AssessmentTermCode.Q2,
            },
            {
              reviewCode: 'H1',
              label: 'Duplicate H1',
              includedTerms: [AssessmentTermCode.Q3, AssessmentTermCode.Q4],
              anchorTerm: AssessmentTermCode.Q4,
            },
          ],
        },
        AssessmentTermType.QUARTERLY,
      ),
    ).toThrow('Duplicate manager review group code H1');
  });

  it('rejects custom grouped manager review when a term is missing', () => {
    expect(() =>
      normalizeReviewCadenceConfig(
        {
          managerReviewMode: 'GROUPED',
          managerReviewCadence: 'CUSTOM',
          groups: [
            {
              reviewCode: 'H1',
              label: 'H1',
              includedTerms: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
              anchorTerm: AssessmentTermCode.Q2,
            },
            {
              reviewCode: 'Q3',
              label: 'Q3',
              includedTerms: [AssessmentTermCode.Q3],
              anchorTerm: AssessmentTermCode.Q3,
            },
          ],
        },
        AssessmentTermType.QUARTERLY,
      ),
    ).toThrow('Grouped manager review must cover every assessment term. Missing: Q4');
  });

  it('rejects group anchors that are outside the included terms', () => {
    expect(() =>
      normalizeReviewCadenceConfig(
        {
          managerReviewMode: 'GROUPED',
          managerReviewCadence: 'CUSTOM',
          groups: [
            {
              reviewCode: 'H1',
              label: 'H1',
              includedTerms: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
              anchorTerm: AssessmentTermCode.Q3,
            },
            {
              reviewCode: 'H2',
              label: 'H2',
              includedTerms: [AssessmentTermCode.Q3, AssessmentTermCode.Q4],
              anchorTerm: AssessmentTermCode.Q4,
            },
          ],
        },
        AssessmentTermType.QUARTERLY,
      ),
    ).toThrow('H1 anchorTerm must be one of its includedTerms');
  });

  it('intersects grouped review terms with employee-specific applicable terms', () => {
    expect(
      intersectGroupTerms(
        {
          reviewCode: 'H1',
          label: 'H1',
          includedTerms: [AssessmentTermCode.Q1, AssessmentTermCode.Q2],
          anchorTerm: AssessmentTermCode.Q2,
        },
        [AssessmentTermCode.Q2, AssessmentTermCode.Q3],
      ),
    ).toEqual([AssessmentTermCode.Q2]);
  });
});
