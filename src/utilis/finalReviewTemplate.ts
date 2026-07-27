import type { ITemplateSection } from '../models/pms-template-version.model';

const ANNUAL_FINAL_REVIEW_SECTION_TYPES = new Set([
  'ANNUAL_SUMMARY',
  'FINAL_GRADE',
  'MERIT',
  'APPRAISAL_COMMUNICATION',
  'OVERALL_FEEDBACK',
]);

export function isFinalReviewSection(section: ITemplateSection): boolean {
  return section.metadata?.finalReviewSection === true;
}

export function validateFinalReviewTemplateSections(
  sections: ITemplateSection[] = [],
): void {
  const finalReviewSections = sections.filter(isFinalReviewSection);
  if (finalReviewSections.length > 1) {
    throw new Error('Template must contain only one Final Reviewer Assessment section');
  }
  if (finalReviewSections.length === 0) return;

  const section = finalReviewSections[0];
  if (String(section.level).toUpperCase() !== 'ANNUAL') {
    throw new Error('Final Reviewer Assessment section must be annual-level');
  }
  if (section.renderingScope !== 'ANNUAL_ONLY') {
    throw new Error('Final Reviewer Assessment section must use ANNUAL_ONLY rendering');
  }
  if (!ANNUAL_FINAL_REVIEW_SECTION_TYPES.has(String(section.sectionType))) {
    throw new Error(
      'Final Reviewer Assessment section must use an annual-decision section type',
    );
  }

  const requiredReviewerFields = (section.fields ?? []).filter(
    (field) => field.isRequired,
  );
  if (requiredReviewerFields.length === 0) {
    throw new Error(
      'Final Reviewer Assessment section requires at least one mandatory reviewer field',
    );
  }

  const missingEditableBehavior = requiredReviewerFields.find(
    (field) =>
      !(field.behaviors ?? []).some(
        (behavior) =>
          String(behavior.role).toUpperCase() === 'DIRECTOR' &&
          behavior.workflowState === 'MANAGEMENT_DECISION_SUBMITTED' &&
          behavior.visibility === 'VISIBLE' &&
          behavior.editability === 'EDITABLE',
      ),
  );
  if (missingEditableBehavior) {
    throw new Error(
      `Final Reviewer field ${missingEditableBehavior.fieldKey} must be editable for DIRECTOR at MANAGEMENT_DECISION_SUBMITTED`,
    );
  }
}

export function assertFinalReviewTemplateConfigured(
  sections: ITemplateSection[] = [],
): void {
  validateFinalReviewTemplateSections(sections);
  if (!sections.some(isFinalReviewSection)) {
    throw new Error(
      'Final Review is enabled, but the template has no Final Reviewer Assessment section',
    );
  }
}
