import { describe, it, expect } from 'vitest';
import {
  routeAfterAssessment,
  routeAfterGeneration,
  routeAfterRewrite,
} from '../../src/graph/routes.js';
import { SupportIQGraphState } from '../../src/graph/state.js';
import { RetrievedChunk } from '../../src/services/rag/retrieval/types.js';

describe('LangGraph Conditional Routing (Unit)', () => {
  const sampleChunk: RetrievedChunk = {
    id: 'shopease-returns-policy#1',
    text: 'Returns policy text',
    sourceId: 'shopease-returns-policy',
    sourceTitle: 'ShopEase Returns Policy',
    sectionTitle: 'Returns',
    chunkIndex: 0,
    category: 'returns',
    score: 0.88,
  };

  const createBaseState = (overrides?: Partial<SupportIQGraphState>): SupportIQGraphState => ({
    question: 'How long do returns take?',
    history: [],
    topK: 5,
    minScore: 0.65,
    currentQuery: 'How long do returns take?',
    retryCount: 0,
    chunks: [],
    evidenceAssessment: null,
    rawAnswer: null,
    status: 'pending',
    answer: '',
    sources: [],
    suggestedFollowUps: [],
    reason: undefined,
    startTime: Date.now(),
    executionTimeMs: 0,
    ...overrides,
  });

  describe('routeAfterAssessment', () => {
    it('should terminate immediately to __end__ if status is non-pending (timeout, aborted, error)', () => {
      expect(routeAfterAssessment(createBaseState({ status: 'timeout' }))).toBe('__end__');
      expect(routeAfterAssessment(createBaseState({ status: 'aborted' }))).toBe('__end__');
      expect(routeAfterAssessment(createBaseState({ status: 'error' }))).toBe('__end__');
    });

    it('should route to generateAnswer when evidence is sufficient and chunks exist', () => {
      const state = createBaseState({
        chunks: [sampleChunk],
        evidenceAssessment: {
          isSufficient: true,
          reason: 'Documentation covers returns thoroughly.',
        },
      });

      expect(routeAfterAssessment(state)).toBe('generateAnswer');
    });

    it('should route to rewriteQuery when evidence is insufficient and retryCount is 0', () => {
      const state = createBaseState({
        chunks: [sampleChunk],
        retryCount: 0,
        evidenceAssessment: {
          isSufficient: false,
          reason: 'Documentation missing specific details.',
        },
      });

      expect(routeAfterAssessment(state)).toBe('rewriteQuery');
    });

    it('should route to rewriteQuery when chunks are empty (0 chunks) and retryCount is 0', () => {
      const state = createBaseState({
        chunks: [],
        retryCount: 0,
        evidenceAssessment: {
          isSufficient: false,
          reason: 'Zero chunks met similarity threshold.',
        },
      });

      expect(routeAfterAssessment(state)).toBe('rewriteQuery');
    });

    it('should route to returnInsufficientEvidence when evidence is insufficient and retryCount is >= 1', () => {
      const state = createBaseState({
        chunks: [sampleChunk],
        retryCount: 1,
        evidenceAssessment: {
          isSufficient: false,
          reason: 'Still insufficient after retry.',
        },
      });

      expect(routeAfterAssessment(state)).toBe('returnInsufficientEvidence');
    });

    it('should route to returnInsufficientEvidence when chunks are empty and retryCount is >= 1', () => {
      const state = createBaseState({
        chunks: [],
        retryCount: 1,
        evidenceAssessment: {
          isSufficient: false,
          reason: 'Still 0 chunks after retry.',
        },
      });

      expect(routeAfterAssessment(state)).toBe('returnInsufficientEvidence');
    });
  });

  describe('routeAfterRewrite', () => {
    it('should route to __end__ if rewrite encountered an error, timeout, or abort', () => {
      expect(routeAfterRewrite(createBaseState({ status: 'error' }))).toBe('__end__');
      expect(routeAfterRewrite(createBaseState({ status: 'timeout' }))).toBe('__end__');
      expect(routeAfterRewrite(createBaseState({ status: 'aborted' }))).toBe('__end__');
    });

    it('should route to retrieveDocuments if rewrite succeeded and status remains pending', () => {
      const state = createBaseState({
        status: 'pending',
        retryCount: 1,
        currentQuery: 'ShopEase return policy',
      });

      expect(routeAfterRewrite(state)).toBe('retrieveDocuments');
    });
  });

  describe('routeAfterGeneration', () => {
    it('should route to __end__ if status is non-pending', () => {
      expect(routeAfterGeneration(createBaseState({ status: 'error' }))).toBe('__end__');
      expect(routeAfterGeneration(createBaseState({ status: 'timeout' }))).toBe('__end__');
      expect(routeAfterGeneration(createBaseState({ status: 'aborted' }))).toBe('__end__');
    });

    it('should route to returnInsufficientEvidence if model indicated hasSufficientEvidence is false', () => {
      const state = createBaseState({
        rawAnswer: {
          answer: "I couldn't find enough information.",
          hasSufficientEvidence: false,
          citations: [],
          suggestedFollowUps: [],
        },
      });

      expect(routeAfterGeneration(state)).toBe('returnInsufficientEvidence');
    });

    it('should route to validateCitations when model indicated hasSufficientEvidence is true', () => {
      const state = createBaseState({
        rawAnswer: {
          answer: 'Returns are accepted within 30 days.',
          hasSufficientEvidence: true,
          citations: [{ chunkId: sampleChunk.id, quote: 'Returns policy text' }],
          suggestedFollowUps: [],
        },
      });

      expect(routeAfterGeneration(state)).toBe('validateCitations');
    });
  });
});

