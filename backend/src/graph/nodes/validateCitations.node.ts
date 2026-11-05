import { CitationValidator } from '../../services/rag/generation/citationValidator.js';
import {
  DEFAULT_SUGGESTED_QUESTIONS,
  STANDARD_REFUSAL_ANSWER,
} from '../../services/rag/generation/types.js';
import { SupportIQGraphState } from '../state.js';

export interface ValidateCitationsNodeDependencies {
  citationValidator?: CitationValidator | undefined;
}

export function createValidateCitationsNode(
  deps?: ValidateCitationsNodeDependencies
) {
  const validator = deps?.citationValidator ?? new CitationValidator();

  return function validateCitations(
    state: SupportIQGraphState
  ): Partial<SupportIQGraphState> {
    if (state.status !== 'pending') {
      return state;
    }

    if (!state.rawAnswer) {
      return {
        status: 'error',
        reason: 'Cannot validate citations without rawAnswer in state.',
      };
    }

    const validation = validator.validate(
      state.rawAnswer.citations,
      state.chunks,
      state.rawAnswer.hasSufficientEvidence,
      { maxCitations: state.chunks.length }
    );

    if (validation.isUngrounded || validation.validatedCitations.length === 0) {
      return {
        status: 'insufficient_evidence',
        answer: STANDARD_REFUSAL_ANSWER,
        sources: [],
        suggestedFollowUps: DEFAULT_SUGGESTED_QUESTIONS,
        reason:
          'Model response was flagged as ungrounded: no valid citations survived verification against retrieved chunks.',
        executionTimeMs: Date.now() - state.startTime,
      };
    }

    return {
      status: 'answered',
      answer: state.rawAnswer.answer,
      sources: validation.validatedCitations,
      suggestedFollowUps: state.rawAnswer.suggestedFollowUps,
      executionTimeMs: Date.now() - state.startTime,
    };
  };
}

