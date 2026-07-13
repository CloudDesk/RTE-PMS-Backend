import { CycleService, CreateCycleInput } from '../src/services/cycle.service';

type TermCycleTestInput = NonNullable<CreateCycleInput['quarters']>[number];

const baseQuarters: TermCycleTestInput[] = [
  {
    assessmentTermCode: 'Q1',
    startDate: '2026-04-01',
    endDate: '2026-06-30',
    objectiveSettingWindow: { startDate: '2026-04-01', endDate: '2026-04-15' },
    objectiveApprovalWindow: { startDate: '2026-04-16', endDate: '2026-04-30' },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: '2026-05-01',
      endDate: '2026-06-15',
      dueDate: '2026-06-15',
    },
    managerReviewWindow: { startDate: '2026-06-16', endDate: '2026-06-25' },
    termFinalizationWindow: { startDate: '2026-06-26', endDate: '2026-06-30' },
  },
  {
    assessmentTermCode: 'Q2',
    startDate: '2026-07-01',
    endDate: '2026-09-30',
    objectiveSettingWindow: { startDate: '2026-07-01', endDate: '2026-07-15' },
    objectiveApprovalWindow: { startDate: '2026-07-16', endDate: '2026-07-31' },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: '2026-08-01',
      endDate: '2026-09-15',
      dueDate: '2026-09-15',
    },
    managerReviewWindow: { startDate: '2026-09-16', endDate: '2026-09-25' },
    termFinalizationWindow: { startDate: '2026-09-26', endDate: '2026-09-30' },
  },
  {
    assessmentTermCode: 'Q3',
    startDate: '2026-10-01',
    endDate: '2026-12-31',
    objectiveSettingWindow: { startDate: '2026-10-01', endDate: '2026-10-15' },
    objectiveApprovalWindow: { startDate: '2026-10-16', endDate: '2026-10-31' },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: '2026-11-01',
      endDate: '2026-12-15',
      dueDate: '2026-12-15',
    },
    managerReviewWindow: { startDate: '2026-12-16', endDate: '2026-12-24' },
    termFinalizationWindow: { startDate: '2026-12-26', endDate: '2026-12-31' },
  },
  {
    assessmentTermCode: 'Q4',
    startDate: '2027-01-01',
    endDate: '2027-03-31',
    objectiveSettingWindow: { startDate: '2027-01-01', endDate: '2027-01-15' },
    objectiveApprovalWindow: { startDate: '2027-01-16', endDate: '2027-01-31' },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: '2027-02-01',
      endDate: '2027-03-15',
      dueDate: '2027-03-15',
    },
    managerReviewWindow: { startDate: '2027-03-16', endDate: '2027-03-25' },
    termFinalizationWindow: { startDate: '2027-03-26', endDate: '2027-03-31' },
  },
];

const halfYearlyTerms: TermCycleTestInput[] = [
  {
    assessmentTermCode: 'H1',
    termCode: 'H1',
    termLabel: 'H1',
    startDate: '2026-04-01',
    endDate: '2026-09-30',
    objectiveSettingWindow: { startDate: '2026-04-01', endDate: '2026-04-15' },
    objectiveApprovalWindow: { startDate: '2026-04-16', endDate: '2026-04-30' },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: '2026-05-01',
      endDate: '2026-09-15',
      dueDate: '2026-09-15',
    },
    managerReviewWindow: { startDate: '2026-09-16', endDate: '2026-09-25' },
    termFinalizationWindow: { startDate: '2026-09-26', endDate: '2026-09-30' },
  },
  {
    assessmentTermCode: 'H2',
    termCode: 'H2',
    termLabel: 'H2',
    startDate: '2026-10-01',
    endDate: '2027-03-31',
    objectiveSettingWindow: { startDate: '2026-10-01', endDate: '2026-10-15' },
    objectiveApprovalWindow: { startDate: '2026-10-16', endDate: '2026-10-31' },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: '2026-11-01',
      endDate: '2027-03-15',
      dueDate: '2027-03-15',
    },
    managerReviewWindow: { startDate: '2027-03-16', endDate: '2027-03-25' },
    termFinalizationWindow: { startDate: '2027-03-26', endDate: '2027-03-31' },
  },
];

const yearlyTerms: TermCycleTestInput[] = [
  {
    assessmentTermCode: 'Y1',
    termCode: 'Y1',
    termLabel: 'Y1',
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    objectiveSettingWindow: { startDate: '2026-04-01', endDate: '2026-04-15' },
    objectiveApprovalWindow: { startDate: '2026-04-16', endDate: '2026-04-30' },
    achievementSubmissionWindow: {
      enabled: true,
      startDate: '2026-05-01',
      endDate: '2027-03-15',
      dueDate: '2027-03-15',
    },
    managerReviewWindow: { startDate: '2027-03-16', endDate: '2027-03-25' },
    termFinalizationWindow: { startDate: '2027-03-26', endDate: '2027-03-31' },
  },
];

function buildCycle(overrides: Partial<CreateCycleInput> = {}): CreateCycleInput {
  return {
    name: 'Annual PMS 2026',
    code: 'PMS_2026',
    appraisalYear: 2026,
    startDate: '2026-04-01',
    endDate: '2027-03-31',
    templateVersionId: '666666666666666666666666',
    quarters: structuredClone(baseQuarters),
    appraisalWindowConfig: {
      type: 'RELATIVE_OFFSET',
      base: 'Q4_FINALIZATION',
      offsetDays: 1,
      durationDays: 15,
    },
    ...overrides,
  };
}

describe('CycleService cycle setup validation', () => {
  const service = new CycleService({} as never);
  const validate = (input: CreateCycleInput) =>
    (service as unknown as { validateCycleInput(input: CreateCycleInput): void })
      .validateCycleInput(input);

  it('accepts a complete annual cycle with Q1-Q4 windows and relative appraisal offset', () => {
    expect(() => validate(buildCycle())).not.toThrow();
  });

  it('accepts a half-yearly cycle with H1-H2 windows and relative appraisal offset', () => {
    expect(() =>
      validate(
        buildCycle({
          assessmentTermType: 'HALF_YEARLY',
          quarters: structuredClone(halfYearlyTerms),
        }),
      ),
    ).not.toThrow();
  });

  it('accepts a yearly cycle with Y1 window and relative appraisal offset', () => {
    expect(() =>
      validate(
        buildCycle({
          assessmentTermType: 'YEARLY',
          quarters: structuredClone(yearlyTerms),
        }),
      ),
    ).not.toThrow();
  });

  it('requires all Q1-Q4 child quarter configurations', () => {
    const quarters = structuredClone(baseQuarters).filter(
      (quarter) => quarter.assessmentTermCode !== 'Q4',
    );

    expect(() => validate(buildCycle({ quarters }))).toThrow('Missing Q4 configuration');
  });

  it('requires both H1 and H2 for half-yearly cycles', () => {
    const quarters = structuredClone(halfYearlyTerms).filter(
      (quarter) => quarter.assessmentTermCode !== 'H2',
    );

    expect(() =>
      validate(
        buildCycle({
          assessmentTermType: 'HALF_YEARLY',
          quarters,
        }),
      ),
    ).toThrow('Missing H2 configuration');
  });

  it('requires Y1 for yearly cycles', () => {
    expect(() =>
      validate(
        buildCycle({
          assessmentTermType: 'YEARLY',
          quarters: [],
        }),
      ),
    ).toThrow('Missing Y1 configuration');
  });

  it('rejects quarter dates outside the annual cycle', () => {
    const quarters = structuredClone(baseQuarters);
    quarters[0].startDate = '2026-03-31';

    expect(() => validate(buildCycle({ quarters }))).toThrow(
      'Q1 Assessment Term dates must be within annual cycle dates',
    );
  });

  it('rejects overlapping quarter windows inside the same quarter', () => {
    const quarters = structuredClone(baseQuarters);
    quarters[0].objectiveApprovalWindow = {
      startDate: '2026-04-15',
      endDate: '2026-04-30',
    };

    expect(() => validate(buildCycle({ quarters }))).toThrow(
      'Q1 objective approval window must start after objective setting window ends',
    );
  });

  it('rejects fixed appraisal windows before quarter finalization completes', () => {
    expect(() =>
      validate(
        buildCycle({
          appraisalWindowConfig: {
            type: 'FIXED_RANGE',
            startDate: '2027-03-30',
            endDate: '2027-03-31',
          },
        }),
      ),
    ).toThrow('Annual appraisal window must open after applicable assessment term finalization windows');
  });

  it('validates relative appraisal offset values', () => {
    expect(() =>
      validate(
        buildCycle({
          appraisalWindowConfig: {
            type: 'RELATIVE_OFFSET',
            base: 'Q4_FINALIZATION',
            offsetDays: -1,
          },
        }),
      ),
    ).toThrow('appraisalWindowConfig.offsetDays must be a non-negative integer');
  });

  it('accepts quarterly cycles with half-yearly grouped manager review cadence', () => {
    expect(() =>
      validate(
        buildCycle({
          reviewCadenceConfig: {
            version: 1,
            managerReviewMode: 'GROUPED',
            managerReviewCadence: 'HALF_YEARLY',
            groups: [],
            scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
            annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
          },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects half-yearly grouped manager review cadence when employee terms are not quarterly', () => {
    expect(() =>
      validate(
        buildCycle({
          assessmentTermType: 'HALF_YEARLY',
          quarters: structuredClone(halfYearlyTerms),
          reviewCadenceConfig: {
            version: 1,
            managerReviewMode: 'GROUPED',
            managerReviewCadence: 'HALF_YEARLY',
            groups: [],
            scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
            annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
          },
        }),
      ),
    ).toThrow('Grouped manager review requires at least one review group');
  });

  it('rejects grouped manager review when a term is missing from custom groups', () => {
    expect(() =>
      validate(
        buildCycle({
          reviewCadenceConfig: {
            version: 1,
            managerReviewMode: 'GROUPED',
            managerReviewCadence: 'CUSTOM',
            groups: [
              {
                reviewCode: 'H1',
                label: 'H1 Manager Review',
                includedTerms: ['Q1', 'Q2'],
                anchorTerm: 'Q2',
              },
              {
                reviewCode: 'Q3_ONLY',
                label: 'Q3 Manager Review',
                includedTerms: ['Q3'],
                anchorTerm: 'Q3',
              },
            ],
            scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
            annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
          },
        }),
      ),
    ).toThrow('Grouped manager review must cover every assessment term. Missing: Q4');
  });

  it('rejects grouped manager review when a term appears in multiple custom groups', () => {
    expect(() =>
      validate(
        buildCycle({
          reviewCadenceConfig: {
            version: 1,
            managerReviewMode: 'GROUPED',
            managerReviewCadence: 'CUSTOM',
            groups: [
              {
                reviewCode: 'G1',
                label: 'Group 1',
                includedTerms: ['Q1', 'Q2'],
                anchorTerm: 'Q2',
              },
              {
                reviewCode: 'G2',
                label: 'Group 2',
                includedTerms: ['Q2', 'Q3', 'Q4'],
                anchorTerm: 'Q4',
              },
            ],
            scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
            annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
          },
        }),
      ),
    ).toThrow('Q2 is included in more than one manager review group');
  });

  it('rejects grouped manager review when the anchor term is outside the group', () => {
    expect(() =>
      validate(
        buildCycle({
          reviewCadenceConfig: {
            version: 1,
            managerReviewMode: 'GROUPED',
            managerReviewCadence: 'CUSTOM',
            groups: [
              {
                reviewCode: 'H1',
                label: 'H1 Manager Review',
                includedTerms: ['Q1', 'Q2'],
                anchorTerm: 'Q3',
              },
              {
                reviewCode: 'H2',
                label: 'H2 Manager Review',
                includedTerms: ['Q3', 'Q4'],
                anchorTerm: 'Q4',
              },
            ],
            scoreDistribution: 'COPY_GROUP_SCORE_TO_INCLUDED_TERMS',
            annualDecisionGate: 'ALL_MANAGER_REVIEW_GROUPS_FINALIZED',
          },
        }),
      ),
    ).toThrow('H1 anchorTerm must be one of its includedTerms');
  });
});
