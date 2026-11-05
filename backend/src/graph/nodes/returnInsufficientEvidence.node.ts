import {
  DEFAULT_SUGGESTED_QUESTIONS,
  STANDARD_REFUSAL_ANSWER,
} from '../../services/rag/generation/types.js';
import { SupportIQGraphState } from '../state.js';

export function returnInsufficientEvidence(
  state: SupportIQGraphState
): Partial<SupportIQGraphState> {
  const followUps =
    state.rawAnswer?.suggestedFollowUps &&
    state.rawAnswer.suggestedFollowUps.length > 0
      ? state.rawAnswer.suggestedFollowUps
      : DEFAULT_SUGGESTED_QUESTIONS;

  return {
    status: 'insufficient_evidence',
    answer: STANDARD_REFUSAL_ANSWER,
    sources: [],
    suggestedFollowUps: followUps,
    reason:
      state.reason ??
      state.evidenceAssessment?.reason ??
      'Insufficient policy evidence retrieved.',
    executionTimeMs: Date.now() - state.startTime,
  };
}

