import { QuarterReviewService } from '../src/services/quarterReview.service';
import { PmsTemplateSectionType } from '../src/constants/pms.enums';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTests() {
  console.log('Starting verification of PMS scoring calculations...');

  // 1. Initialize QuarterReviewService with a mocked context
  const mockContext: any = {
    actor: {
      actorId: '507f1f77bcf86cd799439011',
      actorRole: 'MANAGER',
    },
    actorIdObject: () => new Object('507f1f77bcf86cd799439011'),
  };
  const service = new QuarterReviewService(mockContext);

  // 2. Define the template config (reviewConfig)
  const reviewConfig: any = {
    objectiveRatingRule: {
      scoreType: 'RATING_SCALE',
      minScore: 0,
      maxScore: 10,
    },
    overallScoreMax: 100,
    sections: [
      {
        sectionKey: 'competencies_section',
        sectionType: 'COMPETENCIES',
        weightage: 40,
        aggregationMethod: 'WEIGHTED_AVERAGE',
        maxSectionScore: 100,
        scoringFields: [
          {
            fieldKey: 'competency_matrix',
            sectionKey: 'competencies_section',
            fieldType: 'MATRIX',
            scoreType: 'OPTION_BASED',
            weightage: 100,
            maxScore: 10,
            matrixConfig: {
              rows: [
                {
                  key: 'job_knowledge',
                  label: 'Job Knowledge / Skills',
                  weightage: 60, // 60% of matrix field
                  options: [
                    { label: 'Below', value: 'BELOW', score: 3 },
                    { label: 'Excellent Override', value: 'EXCELLENT', score: 10 },
                  ],
                },
                {
                  key: 'communication',
                  label: 'Communication Skills',
                  weightage: 40, // 40% of matrix field
                  // No options override, fallback to matrixConfig.options
                },
              ],
              options: [
                { label: 'Below', value: 'BELOW', score: 2 },
                { label: 'Excellent', value: 'EXCELLENT', score: 8 },
              ],
            },
          },
        ],
      },
      {
        sectionKey: 'objectives_section',
        sectionType: PmsTemplateSectionType.OBJECTIVES,
        weightage: 60,
        aggregationMethod: 'WEIGHTED_AVERAGE',
        maxSectionScore: 100,
        objectiveBuckets: [
          {
            bucketKey: 'template_predefined',
            label: 'Predefined',
            source: 'TEMPLATE_PREDEFINED',
            owner: 'SYSTEM',
            bucketWeightage: 20,
            rowWeightMode: 'FIXED_BY_TEMPLATE',
          },
          {
            bucketKey: 'employee_dynamic',
            label: 'Employee Dynamic',
            source: 'EMPLOYEE_DYNAMIC',
            owner: 'EMPLOYEE',
            bucketWeightage: 50,
            rowWeightMode: 'OWNER_ENTERED',
          },
          {
            bucketKey: 'manager_dynamic',
            label: 'Manager Dynamic',
            source: 'MANAGER_DYNAMIC',
            owner: 'MANAGER',
            bucketWeightage: 30,
            rowWeightMode: 'OWNER_ENTERED',
          },
        ],
        scoringFields: [],
      },
    ],
  };

  // 3. Define review values (input)
  const reviewValues: any[] = [
    {
      sectionKey: 'competencies_section',
      fieldKey: 'competency_matrix',
      valueJson: {
        job_knowledge: 'EXCELLENT', // gets override: 10
        communication: 'EXCELLENT', // gets fallback to matrixConfig.options: 8
      },
    },
  ];

  // 4. Define objectives & ratings
  // Note: Only predefined and employee_dynamic have objectives.
  // manager_dynamic is empty, so its 30% weight should be redistributed to predefined and employee_dynamic.
  // Predefined: 20%, Employee Dynamic: 50%.
  // Total active weight = 20 + 50 = 70.
  // Predefined redistributed weight = (20 / 70) * 100 = 28.5714%
  // Employee Dynamic redistributed weight = (50 / 70) * 100 = 71.4285%
  const approvedObjectives: any[] = [
    {
      _id: '507f1f77bcf86cd799439021',
      source: 'PREDEFINED',
      title: 'KPI 1',
      weightage: 100,
    },
    {
      _id: '507f1f77bcf86cd799439022',
      source: 'EMPLOYEE_CREATED',
      title: 'KPI 2',
      weightage: 40,
    },
    {
      _id: '507f1f77bcf86cd799439023',
      source: 'EMPLOYEE_CREATED',
      title: 'KPI 3',
      weightage: 60,
    },
  ];

  const ratings: any[] = [
    { objectiveId: '507f1f77bcf86cd799439021', rating: 9 }, // 9/10 = 90%
    { objectiveId: '507f1f77bcf86cd799439022', rating: 8 }, // 8/10 = 80%
    { objectiveId: '507f1f77bcf86cd799439023', rating: 7 }, // 7/10 = 70%
  ];

  // 5. Run Section Scores Calculation
  const { sectionScores, sectionsSnapshot } = (service as any).calculateSectionScores(
    reviewValues,
    reviewConfig,
    approvedObjectives,
    ratings,
  );

  console.log('Section Scores:', JSON.stringify(sectionScores, null, 2));
  console.log('Sections Snapshot:', JSON.stringify(sectionsSnapshot, null, 2));

  // Assert Competency Matrix Scoring:
  // - job_knowledge row weight: 60%
  //   selected: EXCELLENT -> score 10. Max score = 10. normalizedRowScore = 100%. contribution = 60%
  // - communication row weight: 40%
  //   selected: EXCELLENT -> score 8. Max score = 8 (max of options). normalizedRowScore = 100%. contribution = 40%
  //   Wait, max of options is 8. Selected score is 8. So normalizedRowScore = 100%.
  //   Total matrix field score = 60 + 40 = 100%
  //   Competency section weight: 40%
  //   Section Score should be 100.
  const compSection = sectionScores.find((s: any) => s.sectionKey === 'competencies_section');
  assert(compSection !== undefined, 'Competency section score not calculated');
  assert(compSection!.score === 100, `Competency section score expected 100, got ${compSection!.score}`);
  console.log('✅ Competency Matrix calculation assertions passed!');

  // Assert Objectives Redistribution & Scoring:
  // - Predefined bucket score: 9/10 rating -> 90%
  // - Employee dynamic bucket score:
  //   obj 2 (weight 40, rating 8 -> 80%): contribution = 0.40 * 80 = 32%
  //   obj 3 (weight 60, rating 7 -> 70%): contribution = 0.60 * 70 = 42%
  //   Employee bucket total score = 32 + 42 = 74%
  // - Redistributed weight ratio:
  //   Predefined active weight = 20 / 70 = 0.285714...
  //   Employee active weight = 50 / 70 = 0.714285...
  // - Objectives section score:
  //   sectionScore = (28.5714 * 90 + 71.4285 * 74) / 100
  //   sectionScore = 0.285714 * 90 + 0.714285 * 74 = 25.7142 + 52.857 = 78.5714%
  const objSection = sectionScores.find((s: any) => s.sectionKey === 'objectives_section');
  assert(objSection !== undefined, 'Objectives section score not calculated');
  const expectedObjScore = (20 / 70) * 90 + (50 / 70) * 74;
  assert(
    Math.abs(objSection!.score - expectedObjScore) < 0.01,
    `Objectives section score expected ${expectedObjScore}, got ${objSection!.score}`,
  );
  console.log('✅ Objectives bucket redistribution and rating scoring assertions passed!');

  // Assert Overall Score Calculation:
  // Weighted overall score:
  // Section 1: score 100, weight 40
  // Section 2: score 78.5714, weight 60
  // overallScore = (100 * 40 + 78.5714 * 60) / 100 = 40 + 47.1428 = 87.1428
  const overallScore = (service as any).calculateOverallScore(sectionScores, reviewConfig);
  const expectedOverallScore = (100 * 40 + expectedObjScore * 60) / 100;
  console.log('Overall Score:', overallScore, 'Expected:', expectedOverallScore);
  assert(
    Math.abs(overallScore - expectedOverallScore) < 0.01,
    `Overall score expected ${expectedOverallScore}, got ${overallScore}`,
  );
  console.log('✅ Overall score calculation assertion passed!');

  console.log('\nALL ASSIGNMENT SCORING UTILITY VERIFICATIONS COMPLETED SUCCESSFULLY!');
}

runTests().catch((err) => {
  console.error('Verification script failed:');
  console.error(err);
  process.exit(1);
});
