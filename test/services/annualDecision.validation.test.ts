import {
  AppraisalOutcomeType,
  type AppraisalOutcomeType as AppraisalOutcomeTypeType,
} from '../../src/constants/pms.enums';
import {
  AnnualDecisionService,
  type SaveDecisionDraftInput,
} from '../../src/services/annualDecision.service';

describe('AnnualDecisionService numeric validation', () => {
  const service = Object.create(AnnualDecisionService.prototype) as AnnualDecisionService;

  function validate(
    input: Partial<SaveDecisionDraftInput>,
    requireComplete = true,
  ) {
    const decisionInput: SaveDecisionDraftInput = {
      isGradeApplied: false,
      isMeritApplied: true,
      meritDetails: { meritPercentage: '10' },
      ...input,
    };
    const outcome: AppraisalOutcomeTypeType = decisionInput.isGradeApplied
      ? decisionInput.isMeritApplied
        ? AppraisalOutcomeType.BOTH
        : AppraisalOutcomeType.GRADE_ONLY
      : decisionInput.isMeritApplied
        ? AppraisalOutcomeType.MERIT_ONLY
        : AppraisalOutcomeType.NIL;

    return () =>
      (service as unknown as {
        validateDecisionInput: (
          value: SaveDecisionDraftInput,
          outcome: AppraisalOutcomeTypeType,
          requireComplete?: boolean,
        ) => void;
      }).validateDecisionInput(
        decisionInput,
        outcome,
        requireComplete,
      );
  }

  it.each([0, 50.5, 100])('accepts final score %s within the 0-100 range', (finalScore) => {
    expect(validate({ finalScore })).not.toThrow();
  });

  it.each([-1, 100.01, 101])('rejects final score %s outside the 0-100 range', (finalScore) => {
    expect(validate({ finalScore })).toThrow('Final Score must be a number from 0 to 100');
  });

  it.each(['text', '10%', '1e2', '-1', '100.01'])('rejects invalid merit percentage %s', (value) => {
    expect(validate({ meritDetails: { meritPercentage: value } })).toThrow(
      'Merit Percentage must be a number from 0 to 100',
    );
  });

  it.each(['0', '10.5', '100'])('accepts numeric merit percentage %s', (value) => {
    expect(validate({ meritDetails: { meritPercentage: value } })).not.toThrow();
  });

  it('allows incomplete merit details while saving a draft', () => {
    expect(validate({ meritDetails: undefined }, false)).not.toThrow();
  });

  it('requires merit details when completing the annual decision', () => {
    expect(validate({ meritDetails: undefined })).toThrow(
      'meritDetails is required when merit is applied',
    );
  });

  it('allows incomplete grade details while saving a draft', () => {
    expect(validate({
      isGradeApplied: true,
      isMeritApplied: false,
      gradeDetails: undefined,
      meritDetails: undefined,
    }, false)).not.toThrow();
  });

  it('requires grade details when completing the annual decision', () => {
    expect(validate({
      isGradeApplied: true,
      isMeritApplied: false,
      gradeDetails: undefined,
      meritDetails: undefined,
    })).toThrow('gradeDetails is required when grade is applied');
  });

  it('allows a missing nil reason while saving a draft', () => {
    expect(validate({
      isGradeApplied: false,
      isMeritApplied: false,
      meritDetails: undefined,
      nilReason: undefined,
    }, false)).not.toThrow();
  });

  it('requires a nil reason when completing the annual decision', () => {
    expect(validate({
      isGradeApplied: false,
      isMeritApplied: false,
      meritDetails: undefined,
      nilReason: undefined,
    })).toThrow('Please provide a reason when neither grade nor merit is applied.');
  });
});
