import { SupportIQGraphState } from './state.js';

/**
 * Evaluates routing after evidence assessment.
 *
 * Routes:
 * - '__end__': If an early timeout, cancellation, or error occurred.
 * - 'generateAnswer': If chunks exist and evidence was determined sufficient.
 * - 'rewriteQuery': If evidence is insufficient/empty AND retryCount < 1 (bounded 1 retry).
 * - 'returnInsufficientEvidence': If retryCount >= 1 and evidence remains insufficient.
 */
export function routeAfterAssessment(state: SupportIQGraphState): string {
  if (state.status !== 'pending') {
    return '__end__';
  }

  if (state.evidenceAssessment?.isSufficient && state.chunks.length > 0) {
    return 'generateAnswer';
  }

  if (state.retryCount < 1) {
    return 'rewriteQuery';
  }

  return 'returnInsufficientEvidence';
}

/**
 * Evaluates routing after query rewriting.
 *
 * Routes:
 * - '__end__': If rewriting timed out, was aborted, or produced invalid output.
 * - 'retrieveDocuments': If rewriting succeeded and state remains pending.
 */
export function routeAfterRewrite(state: SupportIQGraphState): string {
  if (state.status !== 'pending') {
    return '__end__';
  }

  return 'retrieveDocuments';
}

/**
 * Evaluates routing after answer generation.
 *
 * Routes:
 * - '__end__': If generation timed out, was aborted, or encountered an error.
 * - 'returnInsufficientEvidence': If the model explicitly flagged hasSufficientEvidence: false.
 * - 'validateCitations': If the model synthesized an answer claiming evidence.
 */
export function routeAfterGeneration(state: SupportIQGraphState): string {
  if (state.status !== 'pending') {
    return '__end__';
  }

  if (!state.rawAnswer?.hasSufficientEvidence) {
    return 'returnInsufficientEvidence';
  }

  return 'validateCitations';
}

