import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupportIQGraphService } from '../../src/graph/supportiqGraph.js';
import { MockLlmChatService } from '../../src/services/rag/generation/mockLlmChatService.js';
import { RetrievalService } from '../../src/services/rag/retrieval/retrievalService.js';
import { RetrievedChunk } from '../../src/services/rag/retrieval/types.js';

describe('Master Workflow Deadline & Invocation Rejection (Unit)', () => {
  let mockLlmService: MockLlmChatService;
  let mockRetrievalService: { retrieveChunks: ReturnType<typeof vi.fn> };

  const sampleChunk: RetrievedChunk = {
    id: 'shopease-returns-policy#1',
    text: 'Returns policy text for testing.',
    sourceId: 'shopease-returns-policy',
    sourceTitle: 'ShopEase Returns Policy',
    sectionTitle: 'Returns',
    chunkIndex: 1,
    category: 'returns',
    score: 0.9,
  };

  beforeEach(() => {
    mockLlmService = new MockLlmChatService();
    mockRetrievalService = {
      retrieveChunks: vi.fn(),
    };
  });

  it('should return status timeout when master deadline expires during evidence assessment', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 10,
    });

    // Assessment node encounters timeout
    mockLlmService.enqueueAssessmentResponse({
      status: 'TIMEOUT',
      reason: 'LLM assessment timed out after 4000ms.',
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
      masterDeadlineMs: 20000,
    });

    const result = await graphService.execute({
      question: 'How long do returns take?',
    });

    expect(result.status).toBe('timeout');
    expect(result.answer).toContain('timed out');
    expect(result.status).not.toBe('insufficient_evidence');
  });

  it('should return status timeout when master deadline expires during query rewrite', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'EMPTY_BELOW_THRESHOLD',
      chunks: [],
      executionTimeMs: 10,
    });

    // Assessment short-circuits to insufficient, triggering query rewrite
    // Rewrite node encounters timeout
    mockLlmService.enqueueRewriteResponse({
      status: 'TIMEOUT',
      reason: 'Query rewrite timed out.',
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
      masterDeadlineMs: 20000,
    });

    const result = await graphService.execute({
      question: 'Where is my order?',
    });

    expect(result.status).toBe('timeout');
    expect(result.answer).toContain('timed out');
    expect(result.status).not.toBe('insufficient_evidence');
  });

  it('should return status timeout when master deadline expires during answer generation', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 10,
    });

    mockLlmService.enqueueAssessmentSuccess({
      isSufficient: true,
      reason: 'Sufficient context present.',
    });

    // Generation node encounters timeout
    mockLlmService.enqueueResponse({
      status: 'TIMEOUT',
      reason: 'Generation exceeded deadline.',
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
      masterDeadlineMs: 20000,
    });

    const result = await graphService.execute({
      question: 'What is the return window?',
    });

    expect(result.status).toBe('timeout');
    expect(result.answer).toContain('timed out');
    expect(result.status).not.toBe('insufficient_evidence');
  });

  it('should handle invocation rejection when graph.invoke throws due to deadline cancellation', async () => {
    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
      masterDeadlineMs: 50, // Tiny 50ms deadline
    });

    // Mock retrieval to delay longer than the master deadline
    mockRetrievalService.retrieveChunks.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 80));
      return {
        status: 'SUCCESS',
        chunks: [sampleChunk],
        executionTimeMs: 80,
      };
    });

    const result = await graphService.execute({
      question: 'Tell me about returns.',
    });

    expect(result.status).toBe('timeout');
    expect(result.answer).toContain('timed out');
  });

  it('should handle invocation rejection when caller aborts signal mid-flight', async () => {
    const abortController = new AbortController();

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
      masterDeadlineMs: 20000,
    });

    mockRetrievalService.retrieveChunks.mockImplementation(async () => {
      abortController.abort('User navigated away');
      const err = new Error('Operation aborted');
      err.name = 'AbortError';
      throw err;
    });

    const result = await graphService.execute({
      question: 'Tell me about returns.',
      signal: abortController.signal,
    });

    expect(result.status).toBe('aborted');
    expect(result.answer).toContain('cancelled');
    expect(result.reason).toContain('User navigated away');
  });

  it('should handle pre-flight aborted signal immediately with zero execution time', async () => {
    const abortController = new AbortController();
    abortController.abort('Pre-cancelled');

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Can I return an item?',
      signal: abortController.signal,
    });

    expect(result.status).toBe('aborted');
    expect(result.executionTimeMs).toBe(0);
    expect(mockRetrievalService.retrieveChunks).not.toHaveBeenCalled();
  });
});

