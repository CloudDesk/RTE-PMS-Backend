import { PmsScoringService } from '../../src/services/pms-scoring.service';
import {
  NoObjectiveScoringPolicy,
  ObjectiveScoringMode,
  PmsTemplateSectionType,
} from '../../src/constants/pms.enums';
import { Types } from 'mongoose';

describe('QuarterReviewService - Template Engine Scoring Logic', () => {
  let service: any;

  beforeEach(() => {
    service = new PmsScoringService();
  });

  describe('Option Scoring', () => {
    it('should correctly extract score from option scores', () => {
      const field = {
        options: [
          { value: 'BELOW', score: 3 },
          { value: 'AVERAGE', score: 6 },
          { value: 'GOOD', score: 8 },
          { value: 'EXCELLENT', score: 10 }
        ]
      };
      
      const score = service.getOptionScore('GOOD', field);
      expect(score).toBe(8);
    });

    it('uses matrix row-specific option scores for competency rows', () => {
      const field = {
        matrixConfig: {
          rows: [
            {
              key: 'job_knowledge',
              options: [
                { value: 'INADEQUATE', score: 3 },
                { value: 'NEEDS_GUIDANCE', score: 6 },
                { value: 'INDEPENDENT', score: 8 },
                { value: 'EXCELLENT', score: 10 },
              ],
            },
          ],
        },
      };

      const score = service.getOptionScore('INDEPENDENT', field, field.matrixConfig.rows[0]);
      expect(score).toBe(8);
    });

    it('falls back to legacy option weight when score is not present', () => {
      const field = {
        options: [
          { value: 'NEEDS_GUIDANCE', weight: 6 },
        ],
      };

      const score = service.getOptionScore('NEEDS_GUIDANCE', field);
      expect(score).toBe(6);
    });

    it('should fallback to legacy scoringConfig.optionScores if options is empty', () => {
      const field = {
        scoringConfig: {
          optionScores: [
            { optionValue: 'BELOW', score: 3 },
            { optionValue: 'AVERAGE', score: 6 }
          ]
        }
      };
      
      const score = service.getOptionScore('AVERAGE', field);
      expect(score).toBe(6);
    });
  });

  describe('Objective Bucket and Row Weightage Scoring', () => {
    it('should calculate objective score properly utilizing bucket and row weightages', () => {
      const reviewConfig = {
        objectiveRatingRule: { maxScore: 10 },
        objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'objectives_section',
            sectionType: PmsTemplateSectionType.OBJECTIVES,
            objectiveScoringEnabled: true,
            objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
            perObjectiveScoreEntryAllowed: true,
            weightage: 100,
            aggregationMethod: 'WEIGHTED_AVERAGE',
            objectiveBuckets: [
              {
                bucketKey: 'employee_dynamic',
                source: 'EMPLOYEE_DYNAMIC',
                bucketWeightage: 60,
                rowWeightMode: 'OWNER_ENTERED'
              },
              {
                bucketKey: 'manager_dynamic',
                source: 'MANAGER_DYNAMIC',
                bucketWeightage: 40,
                rowWeightMode: 'EQUAL_DISTRIBUTION'
              }
            ],
            scoringFields: []
          }
        ]
      };

      const approvedObjectives = [
        {
          _id: new Types.ObjectId(),
          source: 'EMPLOYEE_CREATED',
          weightage: 70
        },
        {
          _id: new Types.ObjectId(),
          source: 'EMPLOYEE_CREATED',
          weightage: 30
        },
        {
          _id: new Types.ObjectId(),
          source: 'MANAGER_CREATED'
        }
      ];

      const ratings = [
        { objectiveId: approvedObjectives[0]._id.toString(), rating: 8 }, // 8/10 -> 80% * 70% row weight * 60% bucket weight * 100% section weight = 33.6
        { objectiveId: approvedObjectives[1]._id.toString(), rating: 5 }, // 5/10 -> 50% * 30% row weight * 60% bucket weight * 100% section weight = 9.0
        { objectiveId: approvedObjectives[2]._id.toString(), rating: 10 } // 10/10 -> 100% * 100% row weight * 40% bucket weight * 100% section weight = 40.0
      ];                                    // Total expected score = 33.6 + 9.0 + 40.0 = 82.6

      const { sectionScores } = service.calculateSectionScores([], reviewConfig, approvedObjectives, ratings);
      
      expect(sectionScores.length).toBe(1);
      expect(sectionScores[0].score).toBeCloseTo(82.6, 1);
    });

    it('keeps objectives context-only by default', () => {
      const reviewConfig = {
        objectiveRatingRule: { maxScore: 10 },
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'objectives_section',
            sectionType: PmsTemplateSectionType.OBJECTIVES,
            weightage: 100,
            aggregationMethod: 'WEIGHTED_AVERAGE',
            objectiveBuckets: [
              {
                bucketKey: 'employee_dynamic',
                source: 'EMPLOYEE_DYNAMIC',
                bucketWeightage: 100,
                rowWeightMode: 'OWNER_ENTERED'
              }
            ],
            scoringFields: []
          }
        ]
      };

      const approvedObjectives = [
        {
          _id: new Types.ObjectId(),
          source: 'EMPLOYEE_CREATED',
          weightage: 100
        }
      ];
      const ratings = [{ objectiveId: approvedObjectives[0]._id.toString(), rating: 10 }];

      const { sectionScores, sectionsSnapshot } = service.calculateSectionScores([], reviewConfig, approvedObjectives, ratings);

      expect(sectionScores[0].score).toBe(0);
      expect(sectionsSnapshot[0].contextOnly).toBe(true);
      expect(sectionsSnapshot[0].objectiveScoringMode).toBe(ObjectiveScoringMode.CONTEXT_ONLY);
    });

    it('calculates weighted objective score from manager score and objective weightage', () => {
      const reviewConfig = {
        objectiveRatingRule: { maxScore: 100 },
        objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'objectives_section',
            sectionType: PmsTemplateSectionType.OBJECTIVES,
            objectiveScoringEnabled: true,
            objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
            perObjectiveScoreEntryAllowed: true,
            useObjectiveWeightageScoring: true,
            weightage: 40,
            aggregationMethod: 'WEIGHTED_AVERAGE',
            scoringFields: []
          }
        ]
      };

      const approvedObjectives = [
        {
          _id: new Types.ObjectId(),
          title: 'Revenue',
          source: 'EMPLOYEE_CREATED',
          weightage: 60
        },
        {
          _id: new Types.ObjectId(),
          title: 'Quality',
          source: 'MANAGER_CREATED',
          weightage: 40
        }
      ];

      const ratings = [
        { objectiveId: approvedObjectives[0]._id.toString(), rating: 80 },
        { objectiveId: approvedObjectives[1]._id.toString(), rating: 50 }
      ];

      const { sectionScores, sectionsSnapshot } = service.calculateSectionScores([], reviewConfig, approvedObjectives, ratings);

      expect(sectionScores[0].score).toBe(68);
      expect(sectionsSnapshot[0].objectiveSectionContribution).toBeCloseTo(27.2, 1);
      expect(sectionsSnapshot[0].objectives).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ managerScore: 80, weightage: 60, contribution: 48 }),
          expect.objectContaining({ managerScore: 50, weightage: 40, contribution: 20 }),
        ]),
      );
    });

    it('returns no-objective policy snapshot when weighted mode has no scoreable objectives', () => {
      const reviewConfig = {
        objectiveRatingRule: { maxScore: 100 },
        objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'objectives_section',
            sectionType: PmsTemplateSectionType.OBJECTIVES,
            objectiveScoringEnabled: true,
            objectiveScoringMode: ObjectiveScoringMode.WEIGHTED_OBJECTIVE_SCORE,
            perObjectiveScoreEntryAllowed: true,
            useObjectiveWeightageScoring: true,
            noObjectiveScoringPolicy: NoObjectiveScoringPolicy.BLOCK_REVIEW_SUBMISSION,
            weightage: 40,
            aggregationMethod: 'WEIGHTED_AVERAGE',
            scoringFields: []
          }
        ]
      };

      const { sectionScores, sectionsSnapshot } = service.calculateSectionScores([], reviewConfig, [], []);

      expect(sectionScores[0].score).toBe(0);
      expect(sectionsSnapshot[0].noObjectiveScoringPolicy).toBe(NoObjectiveScoringPolicy.BLOCK_REVIEW_SUBMISSION);
      expect(sectionsSnapshot[0].objectives).toEqual([]);
    });

    it('calculates overall objective section score from a single manager-entered score', () => {
      const reviewConfig = {
        objectiveRatingRule: null,
        objectiveScoringMode: ObjectiveScoringMode.OVERALL_OBJECTIVE_SCORE,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'objectives_section',
            sectionType: PmsTemplateSectionType.OBJECTIVES,
            objectiveScoringEnabled: true,
            objectiveScoringMode: ObjectiveScoringMode.OVERALL_OBJECTIVE_SCORE,
            perObjectiveScoreEntryAllowed: false,
            overallScoreEntryAllowed: true,
            overallObjectiveScoreFieldKey: 'overall_objective_score',
            weightage: 40,
            aggregationMethod: 'WEIGHTED_AVERAGE',
            scoringFields: [
              {
                fieldKey: 'overall_objective_score',
                sectionKey: 'objectives_section',
                fieldLabel: 'Overall Objective Score',
                fieldType: 'NUMBER',
                weightage: 100,
                semanticRole: 'OVERALL_OBJECTIVE_SCORE',
              },
            ],
          },
        ],
      };

      const reviewValues = [
        {
          sectionKey: 'objectives_section',
          fieldKey: 'overall_objective_score',
          valueNumber: 72,
        },
      ];

      const { sectionScores, sectionsSnapshot } = service.calculateSectionScores(reviewValues, reviewConfig, [], []);

      expect(sectionScores[0].score).toBe(72);
      expect(sectionsSnapshot[0].overallObjectiveScore).toBe(72);
      expect(sectionsSnapshot[0].objectiveSectionScore).toBe(72);
      expect(sectionsSnapshot[0].objectiveSectionContribution).toBeCloseTo(28.8, 1);
      expect(sectionsSnapshot[0].activeBuckets).toEqual([]);
    });
  });
  
  describe('Locked Template Scoring', () => {
    it('should calculate section score using locked template version config', () => {
       const reviewConfig = {
         objectiveRatingRule: null,
         overallScoreMax: 100,
         sections: [
           {
             sectionKey: 'competency_section',
             sectionType: PmsTemplateSectionType.COMPETENCIES,
             weightage: 100,
             aggregationMethod: 'SUM',
             scoringFields: [
               {
                 fieldKey: 'comp_matrix',
                 sectionKey: 'competency_section',
                 fieldType: 'MATRIX',
                 weightage: 100,
                 maxScore: 100,
                 matrixConfig: {
                   rows: [
                     { key: 'communication', weightage: 50 },
                     { key: 'leadership', weightage: 50 }
                   ],
                   options: [
                     { value: 'POOR', score: 0 },
                     { value: 'EXCELLENT', score: 10 }
                   ]
                 }
               }
             ]
           }
         ]
       };

       const reviewValues = [
         {
           sectionKey: 'competency_section',
           fieldKey: 'comp_matrix',
           valueJson: {
             communication: 'EXCELLENT',
             leadership: 'POOR'
           }
         }
       ];

       // 50% weight * 10/10 + 50% weight * 0/10 = 50% of 100 maxScore = 50 total score
       const { sectionScores } = service.calculateSectionScores(reviewValues, reviewConfig, [], []);
       
       expect(sectionScores[0].score).toBeCloseTo(50, 1);
    });
  });

  describe('Phase 3 scoring policies', () => {
    it('ignores employee work update and includeInScore=false fields even if they are present in scoring config', () => {
      const reviewConfig = {
        objectiveRatingRule: null,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'employee_achievement',
            sectionType: PmsTemplateSectionType.QUARTER_REVIEW,
            weightage: 100,
            aggregationMethod: 'WEIGHTED_AVERAGE',
            maxSectionScore: null,
            scoringFields: [
              {
                fieldKey: 'manager_rating',
                sectionKey: 'employee_achievement',
                fieldType: 'NUMBER',
                scoreType: 'MANUAL',
                weightage: 100,
                maxScore: 100,
              },
              {
                fieldKey: 'employee_work_update',
                sectionKey: 'employee_achievement',
                fieldType: 'NUMBER',
                scoreType: 'MANUAL',
                weightage: 100,
                maxScore: 100,
                metadata: { purpose: 'EMPLOYEE_WORK_UPDATE', includeInScore: false },
              },
              {
                fieldKey: 'view_only_note',
                sectionKey: 'employee_achievement',
                fieldType: 'NUMBER',
                scoreType: 'MANUAL',
                weightage: 100,
                maxScore: 100,
                metadata: { includeInScore: false },
              },
            ],
          },
        ],
      };

      const reviewValues = [
        { sectionKey: 'employee_achievement', fieldKey: 'manager_rating', valueNumber: 50 },
        { sectionKey: 'employee_achievement', fieldKey: 'employee_work_update', valueNumber: 100 },
        { sectionKey: 'employee_achievement', fieldKey: 'view_only_note', valueNumber: 100 },
      ];

      const { sectionScores, sectionsSnapshot } = service.calculateSectionScores(reviewValues, reviewConfig, [], []);

      expect(sectionScores[0].score).toBe(50);
      expect(sectionsSnapshot[0].fields).toHaveLength(1);
      expect(sectionsSnapshot[0].fields[0].fieldKey).toBe('manager_rating');
    });

    it('applies conditional scoring, normalization, and rounding policies', () => {
      const reviewConfig = {
        objectiveRatingRule: null,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'review',
            sectionType: PmsTemplateSectionType.QUARTER_REVIEW,
            weightage: 100,
            aggregationMethod: 'SUM',
            maxSectionScore: null,
            scoringFields: [
              {
                fieldKey: 'rating',
                sectionKey: 'review',
                fieldType: 'RADIO',
                scoreType: 'OPTION_BASED',
                weightage: 100,
                maxScore: 10,
                options: [{ value: 'GOOD', score: 8 }],
                scoringConfig: {
                  scoringPolicy: {
                    normalization: { method: 'SCALE_TO_MAX', maxScore: 100, targetMaxScore: 50 },
                    rounding: { method: 'NEAREST', precision: 1 },
                  },
                  conditionalScoring: [
                    { dependsOn: 'eligible', operator: 'EQUALS', value: 'YES', action: 'MULTIPLY', multiplier: 1.25 },
                  ],
                },
              },
            ],
          },
        ],
      };

      const reviewValues = [
        { sectionKey: 'review', fieldKey: 'eligible', valueText: 'YES' },
        { sectionKey: 'review', fieldKey: 'rating', valueText: 'GOOD' },
      ];

      const { sectionScores } = service.calculateSectionScores(reviewValues, reviewConfig, [], []);

      expect(sectionScores[0].score).toBeCloseTo(50, 1);
    });

    it('calculates weighted annual rollup with rounding policy', () => {
      const score = service.calculateAnnualRollup(
        { Q1: 80, Q2: 90, Q3: 70, Q4: 100 },
        {
          aggregationMethod: 'WEIGHTED_AVERAGE',
          quarterWeights: { Q1: 10, Q2: 20, Q3: 30, Q4: 40 },
          scoringPolicy: { rounding: { method: 'NEAREST', precision: 0 } },
        },
      );

      expect(score).toBe(87);
    });

    it('calculates equal term average for configured included terms only', () => {
      const score = service.calculateAnnualRollup(
        { Q1: 80, Q2: 60, Q3: 30, Q4: 100 },
        {
          aggregationMethod: 'EQUAL_TERM_AVERAGE',
          includedTerms: ['Q1', 'Q2'],
        },
      );

      expect(score).toBe(70);
    });

    it('calculates term weighted average and requires included weights to total 100', () => {
      const score = service.calculateAnnualRollup(
        { Q1: 80, Q2: 60, Q3: 30 },
        {
          aggregationMethod: 'TERM_WEIGHTED_AVERAGE',
          includedTerms: ['Q1', 'Q2'],
          termWeights: { Q1: 75, Q2: 25, Q3: 100 },
        },
      );

      expect(score).toBe(75);
      expect(() =>
        service.calculateAnnualRollup(
          { Q1: 80, Q2: 60 },
          {
            aggregationMethod: 'TERM_WEIGHTED_AVERAGE',
            includedTerms: ['Q1', 'Q2'],
            termWeights: { Q1: 50, Q2: 20 },
          },
        ),
      ).toThrow('Term weighted average requires included term weights to total 100%');
    });

    it('uses manual group overall score when configured by locked policy', () => {
      const score = service.calculateAnnualRollup(
        { Q1: 80, Q2: 60 },
        {
          aggregationMethod: 'MANUAL_GROUP_OVERALL_SCORE',
          manualGroupOverallScore: 88,
        },
      );

      expect(score).toBe(88);
    });

    it('excludes a field when an INCLUDE condition does not match', () => {
      const reviewConfig = {
        objectiveRatingRule: null,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'review',
            sectionType: PmsTemplateSectionType.QUARTER_REVIEW,
            weightage: 100,
            aggregationMethod: 'SUM',
            maxSectionScore: null,
            scoringFields: [
              {
                fieldKey: 'bonus',
                sectionKey: 'review',
                fieldType: 'NUMBER',
                scoreType: 'MANUAL',
                weightage: 100,
                maxScore: 100,
                scoringConfig: {
                  conditionalScoring: [
                    { dependsOn: 'eligible', operator: 'EQUALS', value: 'YES', action: 'INCLUDE' },
                  ],
                },
              },
            ],
          },
        ],
      };

      const reviewValues = [
        { sectionKey: 'review', fieldKey: 'eligible', valueText: 'NO' },
        { sectionKey: 'review', fieldKey: 'bonus', valueNumber: 100 },
      ];

      const { sectionScores, sectionsSnapshot } = service.calculateSectionScores(reviewValues, reviewConfig, [], []);

      expect(sectionScores[0].score).toBe(0);
      expect(sectionsSnapshot[0].fields).toBeUndefined();
    });

    it('supports comma-separated IN condition values from the builder UI', () => {
      const reviewConfig = {
        objectiveRatingRule: null,
        overallScoreMax: 100,
        sections: [
          {
            sectionKey: 'review',
            sectionType: PmsTemplateSectionType.QUARTER_REVIEW,
            weightage: 100,
            aggregationMethod: 'SUM',
            maxSectionScore: null,
            scoringFields: [
              {
                fieldKey: 'stretch_bonus',
                sectionKey: 'review',
                fieldType: 'NUMBER',
                scoreType: 'MANUAL',
                weightage: 100,
                maxScore: 100,
                scoringConfig: {
                  conditionalScoring: [
                    { dependsOn: 'grade', operator: 'IN', value: 'A,B', action: 'MULTIPLY', multiplier: 1.5 },
                  ],
                  scoringPolicy: {
                    rounding: { method: 'NEAREST', precision: 0 },
                  },
                },
              },
            ],
          },
        ],
      };

      const reviewValues = [
        { sectionKey: 'review', fieldKey: 'grade', valueText: 'B' },
        { sectionKey: 'review', fieldKey: 'stretch_bonus', valueNumber: 40 },
      ];

      const { sectionScores } = service.calculateSectionScores(reviewValues, reviewConfig, [], []);

      expect(sectionScores[0].score).toBe(60);
    });
  });
});
