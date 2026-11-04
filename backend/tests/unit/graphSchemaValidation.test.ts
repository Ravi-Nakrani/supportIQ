import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SupportIQGraphService } from '../../src/graph/supportiqGraph.js';
import { MockLlmChatService } from '../../src/services/rag/generation/mockLlmChatService.js';
import { RetrievalService } from '../../src/services/rag/retrieval/retrievalService.js';
import { RetrievedChunk } from '../../src/services/rag/retrieval/types.js';

describe('Graph Structured Schema Validation & Rewrite Protection (Unit)', () => {
  let mockLlmService: MockLlmChatService;
  let mockRetrievalService: { retrieveChunks: ReturnType<typeof vi.fn> };

  const sampleChunk: RetrievedChunk = {
    id: 'shopease-returns-policy#1',
    text: 'Standard policy text.',
    sourceId: 'shopease-returns-policy',
    sourceTitle: 'ShopEase Returns Policy',
    sectionTitle: 'Returns',
    chunkIndex: 1,
    category: 'returns',
    score: 0.85,
  };

  beforeEach(() => {
    mockLlmService = new MockLlmChatService();
    mockRetrievalService = {
      retrieveChunks: vi.fn(),
    };
  });

  it('should safely transition to status error when evidence assessment produces malformed schema', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'SUCCESS',
      chunks: [sampleChunk],
      executionTimeMs: 15,
    });

    // Provide malformed assessment output (missing isSufficient boolean)
    mockLlmService.enqueueAssessmentResponse({
      status: 'SUCCESS',
      data: {
        isSufficient: undefined as unknown as boolean,
        reason: 'Missing boolean',
      },
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'What is the return policy?',
    });

    expect(result.status).toBe('error');
    expect(result.reason).toContain('Evidence assessment produced malformed data');
  });

  it('should safely transition to status error when query rewrite produces an empty string', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'EMPTY_BELOW_THRESHOLD',
      chunks: [],
      executionTimeMs: 10,
    });

    // Assessment short-circuits to insufficient, triggering query rewrite
    // Rewrite produces invalid empty string
    mockLlmService.enqueueRewriteResponse({
      status: 'SUCCESS',
      data: {
        rewrittenQuery: '',
        reason: 'Empty query',
      },
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Where is my package?',
    });

    expect(result.status).toBe('error');
    expect(result.reason).toContain('Query rewrite produced invalid output');
  });

  it('should safely transition to status error when query rewrite exceeds 1000 characters', async () => {
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'EMPTY_BELOW_THRESHOLD',
      chunks: [],
      executionTimeMs: 10,
    });

    const overlongQuery = 'A'.repeat(1005);
    mockLlmService.enqueueRewriteResponse({
      status: 'SUCCESS',
      data: {
        rewrittenQuery: overlongQuery,
        reason: 'Overlong query',
      },
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Where is my package?',
    });

    expect(result.status).toBe('error');
    expect(result.reason).toContain('Query rewrite produced invalid output');
  });

  it('proves that a rewrite-node error does NOT invoke retrieval again', async () => {
    // Initial retrieval returns 0 chunks
    mockRetrievalService.retrieveChunks.mockResolvedValueOnce({
      status: 'EMPTY_BELOW_THRESHOLD',
      chunks: [],
      executionTimeMs: 10,
    });

    // Rewrite fails with an error
    mockLlmService.enqueueRewriteResponse({
      status: 'ERROR',
      reason: 'Model failed to generate structured rewrite.',
    });

    const graphService = new SupportIQGraphService({
      retrievalService: mockRetrievalService as unknown as RetrievalService,
      llmChatService: mockLlmService,
    });

    const result = await graphService.execute({
      question: 'Can I cancel my order?',
    });

    expect(result.status).toBe('error');
    // Critical: retrieveChunks must have been called EXACTLY ONCE for initial retrieval,
    // and MUST NOT have been called a second time after rewrite failed
    expect(mockRetrievalService.retrieveChunks).toHaveBeenCalledTimes(1);
  });
});

