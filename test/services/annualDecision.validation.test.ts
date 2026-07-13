import { AppraisalOutcomeType } from '../../src/constants/pms.enums';
import {
  AnnualDecisionService,
  type SaveDecisionDraftInput,
} from '../../src/services/annualDecision.service';

describe('AnnualDecisionService numeric validation', () => {
  const service = Object.create(AnnualDecisionService.prototype) as AnnualDecisionService;

  function validate(input: Partial<SaveDecisionDraftInput>) {
    const decisionInput: SaveDecisionDraftInput = {
      isGradeApplied: false,
      isMeritApplied: true,
      meritDetails: { meritPercentage: '10' },
      ...input,
    };

    return () =>
      (service as unknown as {
        validateDecisionInput: (
          value: SaveDecisionDraftInput,
          outcome: typeof AppraisalOutcomeType.MERIT_ONLY,
        ) => void;
      }).validateDecisionInput(decisionInput, AppraisalOutcomeType.MERIT_ONLY);
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
});
