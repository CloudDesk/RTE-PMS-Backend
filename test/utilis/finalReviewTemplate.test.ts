import {
  assertFinalReviewTemplateConfigured,
  validateFinalReviewTemplateSections,
} from '../../src/utilis/finalReviewTemplate';

function finalReviewSection() {
  return {
    sectionKey: 'final_reviewer_assessment',
    title: 'Final Reviewer Assessment',
    sectionType: 'OVERALL_FEEDBACK',
    level: 'ANNUAL',
    renderingScope: 'ANNUAL_ONLY',
    metadata: { finalReviewSection: true },
    fields: [
      {
        fieldKey: 'final_reviewer_assessment',
        label: 'Final Reviewer Assessment',
        fieldType: 'TEXTAREA',
        isRequired: true,
        behaviors: [
          {
            role: 'DIRECTOR',
            workflowState: 'MANAGEMENT_DECISION_SUBMITTED',
            visibility: 'VISIBLE',
            editability: 'EDITABLE',
          },
        ],
      },
    ],
  } as any;
}

describe('Final Reviewer template validation', () => {
  it('accepts one valid annual Final Reviewer Assessment section', () => {
    expect(() =>
      assertFinalReviewTemplateConfigured([finalReviewSection()]),
    ).not.toThrow();
  });

  it('rejects duplicate Final Reviewer sections', () => {
    expect(() =>
      validateFinalReviewTemplateSections([
        finalReviewSection(),
        finalReviewSection(),
      ]),
    ).toThrow('only one Final Reviewer Assessment section');
  });

  it('rejects a final-review section without a mandatory reviewer field', () => {
    const section = finalReviewSection();
    section.fields[0].isRequired = false;
    expect(() => validateFinalReviewTemplateSections([section])).toThrow(
      'at least one mandatory reviewer field',
    );
  });

  it('requires a Final Reviewer section when cycle Final Review is enabled', () => {
    expect(() => assertFinalReviewTemplateConfigured([])).toThrow(
      'template has no Final Reviewer Assessment section',
    );
  });
});
