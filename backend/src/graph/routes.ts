import { SupportIQGraphState } from './state.js';

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

export function routeAfterRewrite(state: SupportIQGraphState): string {
  if (state.status !== 'pending') {
    return '__end__';
  }

  return 'retrieveDocuments';
}

export function routeAfterGeneration(state: SupportIQGraphState): string {
  if (state.status !== 'pending') {
    return '__end__';
  }

  if (!state.rawAnswer?.hasSufficientEvidence) {
    return 'returnInsufficientEvidence';
  }

  return 'validateCitations';
}
