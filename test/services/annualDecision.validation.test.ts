import {
  AppraisalOutcomeType,
  type AppraisalOutcomeType as AppraisalOutcomeTypeType,
} from '../../src/constants/pms.enums';
import {
  AnnualDecisionService,
  assertObjectiveMatrixFreezeIntegrity,
  buildObjectiveEvidenceSnapshotManifest,
  maskStoredObjectiveMatrixSnapshot,
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

  it('requires stable matrix identity before annual decision freeze', () => {
    const matrix = {
      contentHash: 'a'.repeat(64),
      layoutVersion: 3,
      contentVersion: 8,
    } as any;
    expect(() => assertObjectiveMatrixFreezeIntegrity(matrix)).not.toThrow();
    expect(() => assertObjectiveMatrixFreezeIntegrity(null)).not.toThrow();
    expect(() => assertObjectiveMatrixFreezeIntegrity({
      ...matrix,
      contentHash: 'stale',
    })).toThrow('Objective matrix content hash is invalid');
    expect(() => assertObjectiveMatrixFreezeIntegrity({
      ...matrix,
      contentVersion: 0,
    })).toThrow('Objective matrix content version is invalid');
  });

  it('keeps the frozen admin matrix only in admin history responses', () => {
    const snapshot = {
      snapshotKind: 'ANNUAL_DECISION_FREEZE',
      objectiveMatrix: { columns: [{ columnKey: 'admin-only' }] },
      objectiveMatricesByView: {
        admin: { columns: [{ columnKey: 'admin-only' }] },
        employee: { columns: [{ columnKey: 'employee-visible' }] },
      },
      objectiveMatrixContentHash: 'a'.repeat(64),
      objectiveEvidenceManifest: [{ attachmentId: 'admin-only-attachment' }],
      decision: { finalRating: 'Exceeds' },
    };

    expect(maskStoredObjectiveMatrixSnapshot(snapshot, false)).toEqual({
      snapshotKind: 'ANNUAL_DECISION_FREEZE',
      objectiveMatrixContentHash: 'a'.repeat(64),
      decision: { finalRating: 'Exceeds' },
    });
    expect(maskStoredObjectiveMatrixSnapshot(snapshot, true)).toBe(snapshot);
    expect(snapshot).toHaveProperty('objectiveMatrix');
  });

  it('freezes evidence identifiers, metadata, and evidence version in term order', () => {
    const manifest = buildObjectiveEvidenceSnapshotManifest({
      termOrder: ['Q1', 'Q2', 'Q3', 'Q4'],
      rows: [{
        objectiveRowKey: 'row-1',
        evidenceByTerm: {
          Q1: {
            evidenceId: 'evidence-q1',
            version: 3,
            attachment: {
              id: 'attachment-q1',
              documentId: 'document-q1',
              fileName: 'q1-summary.pdf',
              fileType: 'application/pdf',
              fileSize: 42000,
              uploadedAt: '2026-04-15T10:00:00.000Z',
            },
          },
          Q3: {
            evidenceId: 'evidence-q3',
            version: 1,
            attachment: {
              id: 'attachment-q3',
              documentId: 'document-q3',
              fileName: 'q3-feedback.png',
              uploadedAt: '2026-10-15T10:00:00.000Z',
            },
          },
        },
      }],
    } as any);

    expect(manifest).toEqual([
      expect.objectContaining({
        objectiveRowKey: 'row-1',
        termCode: 'Q1',
        evidenceId: 'evidence-q1',
        evidenceVersion: 3,
        attachmentId: 'attachment-q1',
        documentId: 'document-q1',
        fileName: 'q1-summary.pdf',
      }),
      expect.objectContaining({
        termCode: 'Q3',
        evidenceVersion: 1,
        attachmentId: 'attachment-q3',
      }),
    ]);
  });
});
