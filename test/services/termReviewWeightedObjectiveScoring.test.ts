import { Types } from 'mongoose';
import {
  NoObjectiveScoringPolicy,
  ObjectiveScoringMode,
  PmsRole,
} from '../../src/constants/pms.enums';
import { TermReviewService } from '../../src/services/termReview.service';
import type { RequestContext } from '../../src/types/context';

function createService() {
  const actorId = new Types.ObjectId();
  const context: RequestContext = {
    requestId: 'term-review-weighted-objective-scoring-test',
    reqRole: 'manager',
    user: {
      _id: actorId,
      email: 'manager@example.com',
      name: 'Manager',
      role: PmsRole.MANAGER,
      departmentId: 'Engineering',
      active: true,
      country: 'IN',
      currency: 'INR',
      licenseType: 'FULL',
      portalAccess: true,
    },
  };

  return new TermReviewService(context) as any;
}

function weightedReviewConfig(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'AUTO',
    objectiveRatingRule: {
      scoreType: 'MANUAL',
      minScore: 0,
      maxScore: 100,
    },
    objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
    objectiveScoringEnabled: true,
    perObjectiveScoreEntryAllowed: true,
    overallScoreEntryAllowed: false,
    noObjectiveScoringPolicy: NoObjectiveScoringPolicy.NO_OBJECTIVES_NOT_APPLICABLE,
    overallScoreMax: 100,
    sections: [],
    ...overrides,
  };
}

function overallReviewConfig(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'AUTO',
    objectiveRatingRule: null,
    objectiveScoringMode: ObjectiveScoringMode.OVERALL_OBJECTIVE_SCORE,
    objectiveScoringEnabled: true,
    perObjectiveScoreEntryAllowed: false,
    overallScoreEntryAllowed: true,
    noObjectiveScoringPolicy: NoObjectiveScoringPolicy.NO_OBJECTIVES_NOT_APPLICABLE,
    overallScoreMax: 100,
    sections: [
      {
        sectionKey: 'objectives_section',
        sectionType: 'OBJECTIVES',
        weightage: 40,
        aggregationMethod: 'WEIGHTED_AVERAGE',
        maxSectionScore: null,
        scoringFields: [
          {
            fieldKey: 'overall_objective_score',
            sectionKey: 'objectives_section',
            fieldLabel: 'Overall Objective Score',
            fieldType: 'NUMBER',
            scoreType: 'MANUAL',
            weightage: 100,
            semanticRole: 'OVERALL_OBJECTIVE_SCORE',
          },
        ],
        objectiveScoringEnabled: true,
        objectiveScoringMode: ObjectiveScoringMode.OVERALL_OBJECTIVE_SCORE,
        perObjectiveScoreEntryAllowed: false,
        overallScoreEntryAllowed: true,
        overallObjectiveScoreFieldKey: 'overall_objective_score',
      },
    ],
    ...overrides,
  };
}

function manualReviewConfig(overrides: Record<string, unknown> = {}) {
  return {
    mode: 'MANUAL',
    objectiveRatingRule: null,
    objectiveScoringMode: ObjectiveScoringMode.CONTEXT_ONLY,
    objectiveScoringEnabled: false,
    perObjectiveScoreEntryAllowed: false,
    overallScoreEntryAllowed: false,
    noObjectiveScoringPolicy: NoObjectiveScoringPolicy.NO_OBJECTIVES_NOT_APPLICABLE,
    overallScoreMax: null,
    sections: [],
    ...overrides,
  };
}

describe('TermReviewService - weighted objective scoring validation', () => {
  it('accepts 100 and rejects a manual assessment term score above 100 for draft and submit', () => {
    const service = createService();
    const input = {
      ratings: [],
      comments: 'Reviewed.',
      score: 101,
    };
    const config = manualReviewConfig();

    expect(() => service.validateDraftInput({ ...input, score: 100 }, [], config, 100)).not.toThrow();
    expect(() => service.validateReviewInput({ ...input, score: 100 }, [], config, 100)).not.toThrow();

    expect(() => service.validateDraftInput(input, [], config, 101)).toThrow(
      'Assessment Term Score cannot exceed 100.',
    );
    expect(() => service.validateReviewInput(input, [], config, 101)).toThrow(
      'Assessment Term Score cannot exceed 100.',
    );
  });

  it('rejects manager objective score above 100', () => {
    const service = createService();
    const objectiveId = new Types.ObjectId();

    expect(() =>
      service.validateReviewInput(
        {
          ratings: [{ objectiveId: objectiveId.toString(), rating: 101 }],
          comments: 'Reviewed.',
          score: 80,
        },
        [
          {
            _id: objectiveId,
            title: 'Revenue',
            weightage: 100,
          },
        ],
        weightedReviewConfig(),
        80,
      ),
    ).toThrow('Objective rating cannot exceed 100');
  });

  it('rejects scoreable objective weightage above 100 total', () => {
    const service = createService();
    const firstObjectiveId = new Types.ObjectId();
    const secondObjectiveId = new Types.ObjectId();

    expect(() =>
      service.validateReviewInput(
        {
          ratings: [
            { objectiveId: firstObjectiveId.toString(), rating: 80 },
            { objectiveId: secondObjectiveId.toString(), rating: 70 },
          ],
          comments: 'Reviewed.',
          score: 80,
        },
        [
          {
            _id: firstObjectiveId,
            title: 'Revenue',
            objectiveSnapshot: { scoreable: true, approvedWeightage: 70 },
          },
          {
            _id: secondObjectiveId,
            title: 'Quality',
            objectiveSnapshot: { scoreable: true, approvedWeightage: 40 },
          },
        ],
        weightedReviewConfig(),
        80,
      ),
    ).toThrow('Total scoreable objective weightage cannot exceed 100%');
  });

  it('blocks submission when configured policy requires scoreable objectives', () => {
    const service = createService();

    expect(() =>
      service.validateReviewInput(
        {
          ratings: [],
          comments: 'Reviewed.',
          score: 80,
        },
        [],
        weightedReviewConfig({
          noObjectiveScoringPolicy: NoObjectiveScoringPolicy.BLOCK_REVIEW_SUBMISSION,
        }),
        80,
      ),
    ).toThrow('Scoreable objectives are required before weighted objective review can be submitted.');
  });

  it('rejects per-objective ratings in overall objective score mode', () => {
    const service = createService();
    const objectiveId = new Types.ObjectId();

    expect(() =>
      service.validateReviewInput(
        {
          ratings: [{ objectiveId: objectiveId.toString(), rating: 80 }],
          comments: 'Reviewed.',
          score: 80,
          reviewValues: [
            {
              sectionKey: 'objectives_section',
              fieldKey: 'overall_objective_score',
              valueNumber: 80,
            },
          ],
        },
        [{ _id: objectiveId, title: 'Revenue', weightage: 100 }],
        overallReviewConfig(),
        80,
      ),
    ).toThrow('Objective ratings are not allowed when objectives are context-only or overall-scored.');
  });

  it('requires an overall objective score on submit in overall objective score mode', () => {
    const service = createService();

    expect(() =>
      service.validateReviewInput(
        {
          ratings: [],
          comments: 'Reviewed.',
          score: 80,
          reviewValues: [],
        },
        [],
        overallReviewConfig(),
        80,
      ),
    ).toThrow('Overall objective score is required for overall objective scoring mode.');
  });

  it('rejects overall objective score outside 0 to 100', () => {
    const service = createService();

    expect(() =>
      service.validateReviewInput(
        {
          ratings: [],
          comments: 'Reviewed.',
          score: 120,
          reviewValues: [
            {
              sectionKey: 'objectives_section',
              fieldKey: 'overall_objective_score',
              valueNumber: 120,
            },
          ],
        },
        [],
        overallReviewConfig(),
        120,
      ),
    ).toThrow('Overall objective score must be between 0 and 100.');
  });

  it('accepts a rating-only submission without a numeric score', () => {
    const service = createService();

    expect(() =>
      service.validateRatingOnlyReviewInput({
        ratings: [],
        comments: 'Reviewed.',
        overallRating: 'Good',
      }),
    ).not.toThrow();
  });
});
