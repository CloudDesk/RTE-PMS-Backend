import {
  AppraisalOutcomeType,
  type AppraisalOutcomeType as AppraisalOutcomeTypeType,
} from '../../src/constants/pms.enums';
import {
  AnnualDecisionService,
  assertFinalReviewFreezeAllowed,
  assertObjectiveMatrixFreezeIntegrity,
  buildObjectiveEvidenceSnapshotManifest,
  maskStoredObjectiveMatrixSnapshot,
  isFinalReviewerFieldEditable,
  isFinalReviewerOwnedDecisionValue,
  validateSubmittedDecisionOverrideReason,
  type SaveDecisionDraftInput,
} from '../../src/services/annualDecision.service';

describe('Final Review Phase 3 guards', () => {
  it('allows freeze only after completion or when review is not required', () => {
    expect(() => assertFinalReviewFreezeAllowed('COMPLETED')).not.toThrow();
    expect(() => assertFinalReviewFreezeAllowed('NOT_REQUIRED')).not.toThrow();
    expect(() => assertFinalReviewFreezeAllowed('PENDING')).toThrow(
      'L2 and Director assessments must be completed before finalisation',
    );
    expect(() => assertFinalReviewFreezeAllowed('IN_PROGRESS')).toThrow();
    expect(() => assertFinalReviewFreezeAllowed('COMPLETED', 'PENDING')).toThrow();
    expect(() => assertFinalReviewFreezeAllowed('COMPLETED', 'COMPLETED')).not.toThrow();
  });

  it('accepts only the canonical Director submitted-state editable behavior', () => {
    expect(isFinalReviewerFieldEditable({
      behaviors: [{
        role: 'DIRECTOR',
        workflowState: 'MANAGEMENT_DECISION_SUBMITTED',
        visibility: 'VISIBLE',
        editability: 'EDITABLE',
      }],
    })).toBe(true);
    expect(isFinalReviewerFieldEditable({
      behaviors: [{
        role: 'ADMIN',
        workflowState: 'MANAGEMENT_DECISION_SUBMITTED',
        visibility: 'VISIBLE',
        editability: 'EDITABLE',
      }],
    })).toBe(false);
  });
});

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

  it('proposes the latest applicable manager rating without requiring a score', () => {
    const proposedRating = (service as any).resolveProposedFinalRating(
      { applicableTerms: ['Q1', 'Q2'] },
      [
        { assessmentTermCode: 'Q1', termRating: 'Average', termScore: undefined },
        { assessmentTermCode: 'Q2', termRating: 'Good', termScore: undefined },
      ],
    );

    expect(proposedRating).toBe('Good');
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

describe('Submitted annual decision corrections', () => {
  const service = Object.create(AnnualDecisionService.prototype) as AnnualDecisionService;

  it('requires an override reason only when correcting a submitted decision', () => {
    expect(() =>
      validateSubmittedDecisionOverrideReason('SUBMITTED', '   '),
    ).toThrow('Override reason is required to correct a submitted annual decision');
    expect(validateSubmittedDecisionOverrideReason('SUBMITTED', ' L3 recommendation ')).toBe(
      'L3 recommendation',
    );
    expect(validateSubmittedDecisionOverrideReason('DRAFT', undefined)).toBeUndefined();
  });

  it('allows correction, resubmission, or freeze after both final reviewers complete', () => {
    const actions = (service as unknown as {
      resolveAvailableActions: (input: Record<string, unknown>) => string[];
    }).resolveAvailableActions({
      annualState: 'MANAGEMENT_DECISION_SUBMITTED',
      finalDecisionStatus: 'SUBMITTED',
      finalReviewStatus: 'COMPLETED',
      directorReviewStatus: 'COMPLETED',
      allTermsFinalized: true,
      isAppraisalWindowOpen: true,
    });

    expect(actions).toEqual(['SAVE_DRAFT', 'SUBMIT', 'FREEZE']);
  });

  it('keeps a submitted decision locked until both final reviewers complete', () => {
    const actions = (service as unknown as {
      resolveAvailableActions: (input: Record<string, unknown>) => string[];
    }).resolveAvailableActions({
      annualState: 'MANAGEMENT_DECISION_SUBMITTED',
      finalDecisionStatus: 'SUBMITTED',
      finalReviewStatus: 'COMPLETED',
      directorReviewStatus: 'PENDING',
      allTermsFinalized: true,
      isAppraisalWindowOpen: true,
    });

    expect(actions).toEqual([]);
  });

  it('keeps L2/L3 values outside the Admin decision ownership boundary', () => {
    expect(isFinalReviewerOwnedDecisionValue({ roleCode: 'DIRECTOR' })).toBe(true);
    expect(isFinalReviewerOwnedDecisionValue({ roleCode: 'director' })).toBe(true);
    expect(isFinalReviewerOwnedDecisionValue({ roleCode: 'ADMIN' })).toBe(false);
    expect(isFinalReviewerOwnedDecisionValue({})).toBe(false);
  });

  it('does not validate stored L2/L3 values as Admin values during resubmit', () => {
    const input = (service as unknown as {
      buildDecisionInputFromRecord: (
        decision: Record<string, unknown>,
        values: Array<Record<string, unknown>>,
      ) => SaveDecisionDraftInput;
    }).buildDecisionInputFromRecord(
      {
        isGradeApplied: false,
        isMeritApplied: true,
        meritDetails: { meritPercentage: '60' },
        finalRating: 'Excellent',
      },
      [
        {
          fieldKey: 'merit_percentage',
          sectionKey: 'annual_decision',
          roleCode: 'ADMIN',
          valueNumber: 60,
        },
        {
          fieldKey: 'ed_svp_assessment',
          sectionKey: 'yearly_reviewer_assessment',
          roleCode: 'DIRECTOR',
          valueText: 'Approved',
        },
      ],
    );

    expect(input.decisionValues).toEqual([
      expect.objectContaining({
        fieldKey: 'merit_percentage',
        roleCode: 'ADMIN',
      }),
    ]);
  });
});
