import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupportIQGraphService } from '../../src/graph/supportiqGraph.js';
import { MockLlmChatService } from '../../src/services/rag/generation/mockLlmChatService.js';
import { RetrievalService } from '../../src/services/rag/retrieval/retrievalService.js';
import { RetrievedChunk } from '../../src/services/rag/retrieval/types.js';

describe('SupportIQ LangGraph Service (End-to-End Unit)', () => {
  let mockLlmService: MockLlmChatService;
  let mockRetrievalService: { retrieveChunks: ReturnType<typeof vi.fn> };

  const sampleChunk: RetrievedChunk = {
    id: 'shopease-returns-policy#defective-products#1',
    text: 'Opened products with manufacturing defects may be returned within 30 days for a full refund.',
    sourceId: 'shopease-returns-policy',
    sourceTitle: 'ShopEase Returns Policy',
    sectionTitle: 'Defective Products',
    chunkIndex: 1,
    category: 'returns',
    score: 0.95,
  };

  beforeEach(() => {
    mockLlmService = new MockLlmChatService();
    mockRetrievalService = {
      retrieveChunks: vi.fn(),
    };
  });

  it('Scenario 1: Happy path - sufficient initial retrieval produces grounded answer with citations', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 25,
    });

    mockLlmService.enqueueAssessmentSuccess({
      isSufficient: true,
      reason: 'Documentation covers defective product returns.',
    });

    mockLlmService.enqueueSuccess({
      answer: 'According to the policy, opened defective products may be returned within 30 days for a full refund.',
      hasSufficientEvidence: true,
      citations: [
        {
          chunkId: sampleChunk.id,
          quote: 'Opened products with manufacturing defects may be returned within 30 days for a full refund.',
        },
      ],
      suggestedFollowUps: ['How long do refunds take after return approval?'],
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Can I return an opened blender if defective?',
    });

    expect(result.status).toBe('answered');
    expect(result.answer).toContain('30 days');
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.id).toBe(sampleChunk.id);
    expect(result.suggestedFollowUps).toContain('How long do refunds take after return approval?');
    expect(mockRetrievalService.retrieveChunks).toHaveBeenCalledTimes(1);
    expect(mockLlmService.rewriteInvocationCount).toBe(0);
  });

  it('Scenario 2: Empty initial retrieval triggers query rewrite and succeeds on second retrieval', async () => {
    // Attempt 1: 0 chunks returned
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'EMPTY_BELOW_THRESHOLD',
      chunks: [],
      executionTimeMs: 15,
    });

    // Query rewrite executes
    mockLlmService.enqueueRewriteSuccess({
      rewrittenQuery: 'ShopEase policy on opened defective electronics return',
      reason: 'Refined search terms to defective returns policy.',
    });

    // Attempt 2: matching chunks returned
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 20,
    });

    // Assessment for attempt 2
    mockLlmService.enqueueAssessmentSuccess({
      isSufficient: true,
      reason: 'Second retrieval yielded matching policy chunk.',
    });

    // Answer generation
    mockLlmService.enqueueSuccess({
      answer: 'Opened defective products can be returned within 30 days.',
      hasSufficientEvidence: true,
      citations: [
        {
          chunkId: sampleChunk.id,
          quote: 'Opened products with manufacturing defects may be returned within 30 days for a full refund.',
        },
      ],
      suggestedFollowUps: [],
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Can I return a broken blender with opened box?',
    });

    expect(result.status).toBe('answered');
    expect(result.sources).toHaveLength(1);
    // Verifies two retrievals occurred
    expect(mockRetrievalService.retrieveChunks).toHaveBeenCalledTimes(2);
    // Verifies exactly one rewrite occurred
    expect(mockLlmService.rewriteInvocationCount).toBe(1);
    // Verifies assessment on empty chunks was skipped, so only attempt 2 called LLM assessment
    expect(mockLlmService.assessmentInvocationCount).toBe(1);
  });

  it('Scenario 3: Empty initial retrieval triggers query rewrite, second retrieval still empty -> returns insufficient_evidence (proves retry limit strictly 1)', async () => {
    // Attempt 1: empty
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'EMPTY_BELOW_THRESHOLD',
      chunks: [],
      executionTimeMs: 10,
    });

    mockLlmService.enqueueRewriteSuccess({
      rewrittenQuery: 'Fictional out-of-domain query',
      reason: 'Attempted reformulation.',
    });

    // Attempt 2: still empty
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'EMPTY_BELOW_THRESHOLD',
      chunks: [],
      executionTimeMs: 10,
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Does ShopEase have physical retail stores in Surat?',
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toBe(
      "I couldn't find enough information about that in the ShopEase documentation."
    );
    expect(result.sources).toEqual([]);
    expect(result.suggestedFollowUps.length).toBeGreaterThan(0);
    // Critical: strictly capped at 2 retrievals (1 initial + 1 retry)
    expect(mockRetrievalService.retrieveChunks).toHaveBeenCalledTimes(2);
    expect(mockLlmService.rewriteInvocationCount).toBe(1);
  });

  it('Scenario 4: Weak initial retrieval triggers rewrite, retry still weak -> returns insufficient_evidence', async () => {
    // Attempt 1: weak chunk
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 10,
    });

    mockLlmService.enqueueAssessmentSuccess({
      isSufficient: false,
      reason: 'First retrieval chunks do not answer customer question.',
    });

    mockLlmService.enqueueRewriteSuccess({
      rewrittenQuery: 'Rewritten inquiry',
      reason: 'Clarified terms.',
    });

    // Attempt 2: weak chunk
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 10,
    });

    mockLlmService.enqueueAssessmentSuccess({
      isSufficient: false,
      reason: 'Still insufficient evidence.',
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'What is the personal phone number of the CEO?',
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toContain("I couldn't find enough information");
    expect(mockRetrievalService.retrieveChunks).toHaveBeenCalledTimes(2);
    expect(mockLlmService.rewriteInvocationCount).toBe(1);
  });

  it('Scenario 5: Fabricated citations rejected as ungrounded', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 20,
    });

    mockLlmService.enqueueAssessmentSuccess({
      isSufficient: true,
      reason: 'Sufficient evidence claimed.',
    });

    // Generation hallucinated chunk ID
    mockLlmService.enqueueSuccess({
      answer: 'You have 90 days to return according to hallucinated clause.',
      hasSufficientEvidence: true,
      citations: [
        {
          chunkId: 'fake-chunk-id-12345',
          quote: 'Fabricated quote.',
        },
      ],
      suggestedFollowUps: [],
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Can I return an item?',
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toContain("I couldn't find enough information");
    expect(result.sources).toEqual([]);
  });

  it('Scenario 6: Empty question input returns safe error', async () => {
    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: '   ',
    });

    expect(result.status).toBe('error');
    expect(result.reason).toContain('User question must be a non-empty string');
    expect(mockRetrievalService.retrieveChunks).not.toHaveBeenCalled();
  });
});

