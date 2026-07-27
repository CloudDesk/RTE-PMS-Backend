import {
  normalizeManagerReviewValidationFields,
} from '../../src/services/termReview.service';
import type { ResolvedTemplateField } from '../../src/services/pms-template.service';

function field(
  key: string,
  label: string,
  required = true,
): ResolvedTemplateField {
  return {
    id: key,
    key,
    label,
    type: 'textarea',
    required,
    visible: true,
    editable: true,
  };
}

describe('manager review V3 validation fields', () => {
  it('does not require hidden Overview duplicates under Career Progression - Past', () => {
    const fields = normalizeManagerReviewValidationFields([
      {
        key: 'personal_development_2_career_progression_past',
        title: 'Career Progression - Past',
        fields: [
          field(
            'personal_development_2_career_progression_past_manager_comments',
            'Manager Comments',
          ),
          field(
            'personal_development_2_career_progression_past_manager_rating',
            'Manager Rating',
          ),
          field('career_history_confirmation', 'Career History Confirmation'),
        ],
      },
    ]);

    expect(fields.map((item) => [item.key, item.required])).toEqual([
      [
        'personal_development_2_career_progression_past_manager_comments',
        false,
      ],
      [
        'personal_development_2_career_progression_past_manager_rating',
        false,
      ],
      ['career_history_confirmation', true],
    ]);
  });

  it('preserves required Manager Comments in normal manager-review sections', () => {
    const [managerComments] = normalizeManagerReviewValidationFields([
      {
        key: 'manager_term_review',
        title: 'Manager Term Review',
        fields: [field('manager_comments', 'Manager Comments')],
      },
    ]);

    expect(managerComments.required).toBe(true);
  });

  it('recognizes a renamed career section from its profile binding', () => {
    const careerBinding = field(
      'employeeProfile.careerProgressionPast',
      'Employment History',
      false,
    );
    careerBinding.metadata = {
      bindingKey: 'employeeProfile.careerProgressionPast',
    };

    const [, managerComments] = normalizeManagerReviewValidationFields([
      {
        key: 'renamed_read_only_section',
        title: 'Employment History',
        fields: [
          careerBinding,
          field('generated_manager_comments', 'Manager Comments'),
        ],
      },
    ]);

    expect(managerComments.required).toBe(false);
  });
});
