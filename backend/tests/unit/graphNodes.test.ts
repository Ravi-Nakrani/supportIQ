import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRetrieveDocumentsNode } from '../../src/graph/nodes/retrieveDocuments.node.js';
import { createAssessEvidenceNode } from '../../src/graph/nodes/assessEvidence.node.js';
import { createRewriteQueryNode } from '../../src/graph/nodes/rewriteQuery.node.js';
import { createGenerateAnswerNode } from '../../src/graph/nodes/generateAnswer.node.js';
import { createValidateCitationsNode } from '../../src/graph/nodes/validateCitations.node.js';
import { returnInsufficientEvidence } from '../../src/graph/nodes/returnInsufficientEvidence.node.js';
import { SupportIQGraphState } from '../../src/graph/state.js';
import { MockLlmChatService } from '../../src/services/rag/generation/mockLlmChatService.js';
import { RetrievalService } from '../../src/services/rag/retrieval/retrievalService.js';
import { RetrievedChunk } from '../../src/services/rag/retrieval/types.js';

describe('LangGraph Workflow Nodes (Unit)', () => {
  let mockLlmService: MockLlmChatService;
  let mockRetrievalService: { retrieveChunks: ReturnType<typeof vi.fn> };

  const sampleChunk: RetrievedChunk = {
    id: 'shopease-returns-policy#defective-products#1',
    text: 'Opened products with manufacturing defects may be returned within 30 days.',
    sourceId: 'shopease-returns-policy',
    sourceTitle: 'ShopEase Returns Policy',
    sectionTitle: 'Defective Products',
    chunkIndex: 1,
    category: 'returns',
    score: 0.92,
  };

  const createInitialState = (overrides?: Partial<SupportIQGraphState>): SupportIQGraphState => ({
    question: 'Can I return an opened blender if defective?',
    history: [],
    topK: 5,
    minScore: 0.65,
    currentQuery: 'Can I return an opened blender if defective?',
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

  beforeEach(() => {
    mockLlmService = new MockLlmChatService();
    mockRetrievalService = {
      retrieveChunks: vi.fn(),
    };
  });

  describe('retrieveDocuments node', () => {
    it('should bypass retrieval completely if state.status is not pending (early guard)', async () => {
      const node = createRetrieveDocumentsNode({
        retrievalService: mockRetrievalService as unknown as RetrievalService,
      });

      const state = createInitialState({ status: 'error' });
      const result = await node(state);

      expect(mockRetrievalService.retrieveChunks).not.toHaveBeenCalled();
      expect(result).toBe(state);
    });

    it('should retrieve chunks and preserve pending status on success', async () => {
      mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
        status: 'SUCCESS',
        chunks: [sampleChunk],
        executionTimeMs: 50,
      });

      const node = createRetrieveDocumentsNode({
        retrievalService: mockRetrievalService as unknown as RetrievalService,
      });

      const state = createInitialState();
      const result = await node(state);

      expect(mockRetrievalService.retrieveChunks).toHaveBeenCalledWith(
        state.currentQuery,
        expect.objectContaining({ topK: 5, minScore: 0.65 })
      );
      expect(result.chunks).toEqual([sampleChunk]);
      expect(result.status).toBeUndefined(); // Remains pending in state
    });

    it('should map EMPTY_BELOW_THRESHOLD to empty chunks array with pending status', async () => {
      mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
        status: 'EMPTY_BELOW_THRESHOLD',
        chunks: [],
        reason: 'No chunks met minScore threshold.',
        executionTimeMs: 30,
      });

      const node = createRetrieveDocumentsNode({
        retrievalService: mockRetrievalService as unknown as RetrievalService,
      });

      const state = createInitialState();
      const result = await node(state);

      expect(result.chunks).toEqual([]);
      expect(result.status).toBeUndefined();
    });

    it('should map TIMEOUT to status timeout', async () => {
      mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
        status: 'TIMEOUT',
        chunks: [],
        reason: 'Retrieval exceeded deadline.',
        executionTimeMs: 2500,
      });

      const node = createRetrieveDocumentsNode({
        retrievalService: mockRetrievalService as unknown as RetrievalService,
      });

      const state = createInitialState();
      const result = await node(state);

      expect(result.status).toBe('timeout');
      expect(result.reason).toBe('Retrieval exceeded deadline.');
    });
  });

  describe('assessEvidence node', () => {
    it('should fast short-circuit on empty chunks without calling LLM', async () => {
      const node = createAssessEvidenceNode({
        llmChatService: mockLlmService,
      });

      const state = createInitialState({ chunks: [] });
      const result = await node(state);

      expect(mockLlmService.assessmentInvocationCount).toBe(0);
      expect(result.evidenceAssessment).toEqual({
        isSufficient: false,
        reason: 'Initial retrieval yielded 0 chunks meeting similarity threshold.',
      });
      expect(result.status).toBeUndefined(); // Remains pending
    });

    it('should invoke LLM assessment when candidate chunks exist', async () => {
      mockLlmService.enqueueAssessmentSuccess({
        isSufficient: true,
        reason: 'Retrieved defective returns policy directly covers opened items.',
      });

      const node = createAssessEvidenceNode({
        llmChatService: mockLlmService,
      });

      const state = createInitialState({ chunks: [sampleChunk] });
      const result = await node(state);

      expect(mockLlmService.assessmentInvocationCount).toBe(1);
      expect(result.evidenceAssessment?.isSufficient).toBe(true);
      expect(result.status).toBeUndefined();
    });

    it('should bypass assessment if state.status is already non-pending', async () => {
      const node = createAssessEvidenceNode({
        llmChatService: mockLlmService,
      });

      const state = createInitialState({ status: 'aborted', chunks: [sampleChunk] });
      const result = await node(state);

      expect(mockLlmService.assessmentInvocationCount).toBe(0);
      expect(result).toBe(state);
    });
  });

  describe('rewriteQuery node', () => {
    it('should increment retryCount and update currentQuery on valid rewrite', async () => {
      mockLlmService.enqueueRewriteSuccess({
        rewrittenQuery: 'ShopEase return policy opened defective products',
        reason: 'Resolved defective blender context to ShopEase return policy.',
      });

      const node = createRewriteQueryNode({
        llmChatService: mockLlmService,
      });

      const state = createInitialState({ retryCount: 0 });
      const result = await node(state);

      expect(mockLlmService.rewriteInvocationCount).toBe(1);
      expect(result.retryCount).toBe(1);
      expect(result.currentQuery).toBe('ShopEase return policy opened defective products');
      expect(result.status).toBeUndefined();
    });

    it('should set status error and increment retryCount if rewrite output is invalid', async () => {
      mockLlmService.enqueueRewriteResponse({
        status: 'SUCCESS',
        data: {
          rewrittenQuery: '', // Invalid empty query
          reason: 'empty',
        },
      });

      const node = createRewriteQueryNode({
        llmChatService: mockLlmService,
      });

      const state = createInitialState({ retryCount: 0 });
      const result = await node(state);

      expect(result.retryCount).toBe(1);
      expect(result.status).toBe('error');
      expect(result.reason).toContain('Query rewrite produced invalid output');
    });
  });

  describe('generateAnswer node', () => {
    it('should synthesize answer and retain pending status before citation validation', async () => {
      mockLlmService.enqueueSuccess({
        answer: 'Opened defective products may be returned within 30 days.',
        hasSufficientEvidence: true,
        citations: [
          {
            chunkId: sampleChunk.id,
            quote: 'Opened products with manufacturing defects may be returned within 30 days.',
          },
        ],
        suggestedFollowUps: ['How long do refunds take?'],
      });

      const node = createGenerateAnswerNode({
        llmChatService: mockLlmService,
      });

      const state = createInitialState({ chunks: [sampleChunk] });
      const result = await node(state);

      expect(mockLlmService.invocationCount).toBe(1);
      expect(result.rawAnswer).toBeDefined();
      expect(result.status).toBeUndefined(); // Crucial: must NOT be 'answered' yet
    });
  });

  describe('validateCitations node', () => {
    it('should assign status answered only when citations successfully verify', () => {
      const node = createValidateCitationsNode();

      const state = createInitialState({
        chunks: [sampleChunk],
        rawAnswer: {
          answer: 'Opened defective products may be returned within 30 days.',
          hasSufficientEvidence: true,
          citations: [
            {
              chunkId: sampleChunk.id,
              quote: 'Opened products with manufacturing defects may be returned within 30 days.',
            },
          ],
          suggestedFollowUps: ['How long do refunds take?'],
        },
      });

      const result = node(state);

      expect(result.status).toBe('answered');
      expect(result.sources).toHaveLength(1);
      expect(result.sources?.[0]?.id).toBe(sampleChunk.id);
    });

    it('should reject ungrounded answer and set status insufficient_evidence if zero citations survive', () => {
      const node = createValidateCitationsNode();

      const state = createInitialState({
        chunks: [sampleChunk],
        rawAnswer: {
          answer: 'Opened defective products may be returned within 30 days.',
          hasSufficientEvidence: true,
          citations: [
            {
              chunkId: 'fabricated-chunk-id-999',
              quote: 'Non-existent quote',
            },
          ],
          suggestedFollowUps: [],
        },
      });

      const result = node(state);

      expect(result.status).toBe('insufficient_evidence');
      expect(result.sources).toEqual([]);
      expect(result.answer).toContain("I couldn't find enough information");
    });
  });

  describe('returnInsufficientEvidence node', () => {
    it('should construct standardized refusal response with fallback suggestions', () => {
      const state = createInitialState({
        reason: 'Zero matching chunks after bounded retry.',
      });

      const result = returnInsufficientEvidence(state);

      expect(result.status).toBe('insufficient_evidence');
      expect(result.answer).toBe(
        "I couldn't find enough information about that in the ShopEase documentation."
      );
      expect(result.sources).toEqual([]);
      expect(result.suggestedFollowUps?.length).toBeGreaterThan(0);
      expect(result.reason).toBe('Zero matching chunks after bounded retry.');
    });
  });
});

