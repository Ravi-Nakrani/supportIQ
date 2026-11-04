import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RagAnswerService } from '../../src/services/rag/generation/ragAnswerService.js';
import { MockLlmChatService } from '../../src/services/rag/generation/mockLlmChatService.js';
import { RetrievalService } from '../../src/services/rag/retrieval/retrievalService.js';
import { InMemoryVectorStore } from '../../src/services/rag/vector-store/inMemoryVectorStore.js';
import { MockEmbeddingService } from '../../src/services/rag/embeddings/mockEmbeddingService.js';
import { VectorConfig } from '../../src/config/vector.config.js';
import { LlmConfig } from '../../src/config/llm.config.js';
import {
  STANDARD_ABORTED_ANSWER,
  STANDARD_REFUSAL_ANSWER,
  STANDARD_TECHNICAL_ERROR_ANSWER,
  STANDARD_TIMEOUT_ANSWER,
} from '../../src/services/rag/generation/types.js';

describe('RagAnswerService (Unit)', () => {
  const vectorConfig: VectorConfig = {
    dbName: 'supportiq',
    collectionName: 'knowledge_chunks',
    indexName: 'supportiq_vector_index',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 3,
    embeddingFingerprint: 'test-fingerprint',
    retrievalDefaultTopK: 4,
    retrievalMinScore: 0.65,
    retrievalTimeoutMs: 2500,
  };

  const llmConfig: LlmConfig = {
    chatModel: 'gpt-6-luna',
    temperature: 0.0,
    reasoningEffort: 'none',
    maxOutputTokens: 800,
    timeoutMs: 6000,
    maxRetries: 1,
  };

  let vectorStore: InMemoryVectorStore;
  let embeddingService: MockEmbeddingService;
  let retrievalService: RetrievalService;
  let mockLlm: MockLlmChatService;
  let ragService: RagAnswerService;

  beforeEach(async () => {
    vectorStore = new InMemoryVectorStore();
    embeddingService = new MockEmbeddingService({ dimensions: 3 });
    // Default: query vector matches stored chunk vector [1, 0, 0]
    vi.spyOn(embeddingService, 'embedQuery').mockResolvedValue([1.0, 0.0, 0.0]);

    retrievalService = new RetrievalService({
      vectorStore,
      embeddingService,
      config: vectorConfig,
    });
    mockLlm = new MockLlmChatService();
    ragService = new RagAnswerService({
      retrievalService,
      llmChatService: mockLlm,
      config: llmConfig,
    });

    // Populate vector store with sample ShopEase chunk
    const chunkText =
      'Opened products that suffer from a manufacturing defect upon arrival may be returned within 30 days for a full refund or direct replacement.';

    await vectorStore.bulkUpsert([
      {
        id: 'shopease-returns-policy#defective-products#1',
        text: chunkText,
        embedding: [1.0, 0.0, 0.0],
        embeddingConfig: {
          model: 'text-embedding-3-small',
          dimensions: 3,
          fingerprint: 'test-fingerprint',
        },
        metadata: {
          sourceId: 'shopease-returns-policy',
          sourceTitle: 'ShopEase Returns Policy',
          sectionTitle: 'Defective Products',
          headingHierarchy: ['ShopEase Returns Policy', 'Defective Products'],
          sourcePath: 'knowledge-base/shopease/returns-policy.md',
          chunkIndex: 1,
          category: 'Returns & Exchanges',
          documentVersion: '1.0.0',
          effectiveDate: '2026-01-01',
          contentHash: 'hash-1',
          metadataHash: 'meta-hash-1',
        },
      },
    ]);
  });

  it('should answer supported policy questions with verified source citations (Happy Path)', async () => {
    mockLlm.enqueueSuccess({
      answer:
        'According to the ShopEase Returns Policy, opened products with a manufacturing defect may be returned within 30 days for a full refund or direct replacement.',
      hasSufficientEvidence: true,
      citations: [
        {
          chunkId: 'shopease-returns-policy#defective-products#1',
          quote:
            'Opened products that suffer from a manufacturing defect upon arrival may be returned within 30 days for a full refund or direct replacement.',
        },
      ],
      suggestedFollowUps: ['How long does the refund take after return approval?'],
    });

    const result = await ragService.generateAnswer({
      question: 'Can I return an opened blender if it is defective?',
    });

    expect(result.status).toBe('answered');
    expect(result.answer).toContain('returned within 30 days');
    expect(result.sources.length).toBe(1);
    expect(result.sources[0]?.id).toBe('shopease-returns-policy#defective-products#1');
    expect(result.sources[0]?.title).toBe('ShopEase Returns Policy');
    expect(result.sources[0]?.section).toBe('Defective Products');
    expect(result.suggestedFollowUps.length).toBe(1);
    expect(mockLlm.invocationCount).toBe(1);
  });

  it('should abstain with standard refusal when LLM identifies insufficient evidence', async () => {
    mockLlm.enqueueSuccess({
      answer: STANDARD_REFUSAL_ANSWER,
      hasSufficientEvidence: false,
      citations: [],
      suggestedFollowUps: [],
    });

    const result = await ragService.generateAnswer({
      question: 'Do you sell blenders in a physical store in Surat?',
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toBe(STANDARD_REFUSAL_ANSWER);
    expect(result.sources).toEqual([]);
    expect(result.suggestedFollowUps.length).toBeGreaterThan(0);
  });

  it('should short-circuit and skip LLM call when retrieval returns no chunks above threshold', async () => {
    // Clear vector store so retrieval returns EMPTY_BELOW_THRESHOLD
    await vectorStore.clear();

    const result = await ragService.generateAnswer({
      question: 'What is the speed of light?',
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toBe(STANDARD_REFUSAL_ANSWER);
    expect(result.sources).toEqual([]);
    // Critical: LLM was never invoked, saving tokens and latency
    expect(mockLlm.invocationCount).toBe(0);
  });

  it('should reject fabricated citation chunk IDs and fallback to insufficient evidence', async () => {
    mockLlm.enqueueSuccess({
      answer: 'You can return defective items within 30 days.',
      hasSufficientEvidence: true,
      citations: [
        {
          chunkId: 'fabricated-chunk-id-999',
          quote: 'returned within 30 days',
        },
      ],
      suggestedFollowUps: [],
    });

    const result = await ragService.generateAnswer({
      question: 'Can I return defective items?',
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toBe(STANDARD_REFUSAL_ANSWER);
    expect(result.sources).toEqual([]);
    expect(result.reason).toContain('ungrounded');
  });

  it('should reject unverifiable quotes and fallback without creating synthetic excerpts', async () => {
    mockLlm.enqueueSuccess({
      answer: 'You can return defective items within 30 days.',
      hasSufficientEvidence: true,
      citations: [
        {
          chunkId: 'shopease-returns-policy#defective-products#1',
          // Valid chunk ID, but quote does not exist in chunk
          quote: 'Free unconditional returns for five years.',
        },
      ],
      suggestedFollowUps: [],
    });

    const result = await ragService.generateAnswer({
      question: 'Can I return defective items?',
    });

    expect(result.status).toBe('insufficient_evidence');
    expect(result.answer).toBe(STANDARD_REFUSAL_ANSWER);
    expect(result.sources).toEqual([]);
    expect(result.reason).toContain('ungrounded');
  });

  it('should return safe timeout status without masking when retrieval times out', async () => {
    const timingOutEmbedding = new MockEmbeddingService({
      dimensions: 3,
      simulatedDelayMs: 100,
    });

    const timingOutRetrieval = new RetrievalService({
      vectorStore,
      embeddingService: timingOutEmbedding,
      config: { ...vectorConfig, retrievalTimeoutMs: 20 },
    });

    const service = new RagAnswerService({
      retrievalService: timingOutRetrieval,
      llmChatService: mockLlm,
      config: llmConfig,
    });

    const result = await service.generateAnswer({
      question: 'Can I return an opened blender?',
    });

    expect(result.status).toBe('timeout');
    expect(result.answer).toBe(STANDARD_TIMEOUT_ANSWER);
    expect(result.reason).toContain('Retrieval deadline exceeded');
    expect(mockLlm.invocationCount).toBe(0);
  });

  it('should return safe aborted status when caller aborts request', async () => {
    const controller = new AbortController();
    controller.abort(new Error('User disconnected'));

    const result = await ragService.generateAnswer({
      question: 'Can I return an opened blender?',
      signal: controller.signal,
    });

    expect(result.status).toBe('aborted');
    expect(result.answer).toBe(STANDARD_ABORTED_ANSWER);
    expect(result.reason).toContain('User disconnected');
    expect(mockLlm.invocationCount).toBe(0);
  });

  it('should return safe error status when LLM generation is truncated (finish_reason: length)', async () => {
    mockLlm.enqueueResponse({
      status: 'TRUNCATED',
      finishReason: 'length',
      reason: 'Generation exceeded max_completion_tokens (800) and was truncated.',
    });

    const result = await ragService.generateAnswer({
      question: 'Can I return an opened blender?',
    });

    expect(result.status).toBe('error');
    expect(result.answer).toBe(STANDARD_TECHNICAL_ERROR_ANSWER);
    expect(result.reason).toContain('truncated');
  });

  it('should return safe error status when LLM provider returns a refusal', async () => {
    mockLlm.enqueueResponse({
      status: 'REFUSAL',
      finishReason: 'refusal',
      rawRefusal: 'Content policy violation',
      reason: 'The LLM provider refused to process the request.',
    });

    const result = await ragService.generateAnswer({
      question: 'Dangerous prompt',
    });

    expect(result.status).toBe('error');
    expect(result.answer).toBe(STANDARD_TECHNICAL_ERROR_ANSWER);
    expect(result.reason).toContain('refused');
  });

  it('should maintain strict grounding even when conversation history claims contradictory facts', async () => {
    mockLlm.enqueueSuccess({
      answer:
        'According to the ShopEase Returns Policy, opened defective items must be returned within 30 days, not 90 days.',
      hasSufficientEvidence: true,
      citations: [
        {
          chunkId: 'shopease-returns-policy#defective-products#1',
          quote: 'returned within 30 days for a full refund or direct replacement.',
        },
      ],
      suggestedFollowUps: ['What proof of purchase is required?'],
    });

    const result = await ragService.generateAnswer({
      question: 'Is it true that I have 90 days?',
      history: [
        {
          role: 'user',
          content: 'You told me earlier that return windows for blenders are 90 days.',
        },
      ],
    });

    expect(result.status).toBe('answered');
    expect(result.answer).toContain('30 days');
    expect(result.sources.length).toBe(1);
    expect(result.sources[0]?.id).toBe('shopease-returns-policy#defective-products#1');
  });
});
