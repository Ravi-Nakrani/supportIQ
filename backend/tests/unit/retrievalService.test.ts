import { describe, it, expect, vi } from 'vitest';
import { RetrievalService } from '../../src/services/rag/retrieval/retrievalService.js';
import { InMemoryVectorStore } from '../../src/services/rag/vector-store/inMemoryVectorStore.js';
import { MockEmbeddingService } from '../../src/services/rag/embeddings/mockEmbeddingService.js';
import { computeEmbeddingFingerprint, VectorConfig } from '../../src/config/vector.config.js';
import { VectorDocument } from '../../src/services/rag/vector-store/types.js';

describe('Retrieval Service (Unit)', () => {
  const baseConfig: VectorConfig = {
    dbName: 'supportiq',
    collectionName: 'knowledge_chunks',
    indexName: 'supportiq_vector_index',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 3,
    embeddingFingerprint: computeEmbeddingFingerprint('text-embedding-3-small', 3),
    retrievalDefaultTopK: 2,
    retrievalMinScore: 0.65,
    retrievalTimeoutMs: 100, // Short 100ms timeout for deterministic tests
  };

  const sampleDoc1: VectorDocument = {
    id: 'shopease-returns-policy#defective#0',
    text: 'Opened defective products can be returned within 30 days.',
    embedding: [1.0, 0.0, 0.0],
    metadata: {
      sourceId: 'shopease-returns-policy',
      sourceTitle: 'ShopEase Returns Policy',
      category: 'Returns & Exchanges',
      documentVersion: '1.0.0',
      effectiveDate: '2026-01-01',
      sectionTitle: 'Defective Products',
      headingHierarchy: ['Returns Policy', 'Defective Products'],
      sourcePath: 'knowledge-base/shopease/returns-policy.md',
      chunkIndex: 0,
      contentHash: 'hash-1',
      metadataHash: 'meta-1',
    },
    embeddingConfig: {
      model: 'text-embedding-3-small',
      dimensions: 3,
      fingerprint: baseConfig.embeddingFingerprint,
    },
  };

  it('should return SUCCESS with retrieved chunks and citation metadata', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1]);

    const embeddingService = new MockEmbeddingService({ dimensions: 3 });
    vi.spyOn(embeddingService, 'embedQuery').mockResolvedValue([1.0, 0.0, 0.0]);

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: baseConfig,
    });

    const result = await service.retrieveChunks('Can I return defective blender?');

    expect(result.status).toBe('SUCCESS');
    expect(result.chunks).toHaveLength(1);
    expect(result.chunks[0]!.id).toBe(sampleDoc1.id);
    expect(result.chunks[0]!.sourceTitle).toBe('ShopEase Returns Policy');
    expect(result.chunks[0]!.sectionTitle).toBe('Defective Products');
    expect(result.chunks[0]!.score).toBeCloseTo(1.0);
  });

  it('should return EMPTY_BELOW_THRESHOLD when scores fall below minScore', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1]);

    const embeddingService = new MockEmbeddingService({ dimensions: 3 });
    vi.spyOn(embeddingService, 'embedQuery').mockResolvedValue([0.0, 1.0, 0.0]);

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: { ...baseConfig, retrievalMinScore: 0.7 },
    });

    const result = await service.retrieveChunks('Unrelated query');

    expect(result.status).toBe('EMPTY_BELOW_THRESHOLD');
    expect(result.chunks).toHaveLength(0);
    expect(result.reason).toMatch(/minimum similarity score/);
  });

  it('should clamp topK values within the 1-10 range', async () => {
    const store = new InMemoryVectorStore();
    const searchSpy = vi.spyOn(store, 'search');

    const embeddingService = new MockEmbeddingService({ dimensions: 3 });
    vi.spyOn(embeddingService, 'embedQuery').mockResolvedValue([1, 0, 0]);

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: baseConfig,
    });

    await service.retrieveChunks('test', { topK: 50 });
    expect(searchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topK: 10 })
    );

    await service.retrieveChunks('test', { topK: 0 });
    expect(searchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ topK: 1 })
    );
  });

  it('should return TIMEOUT when embedding generation exceeds deadline', async () => {
    const store = new InMemoryVectorStore();
    const embeddingService = new MockEmbeddingService({
      dimensions: 3,
      simulatedDelayMs: 150, // Exceeds 50ms timeout
    });

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: { ...baseConfig, retrievalTimeoutMs: 50 },
    });

    const result = await service.retrieveChunks('Slow embedding query');

    expect(result.status).toBe('TIMEOUT');
    expect(result.chunks).toHaveLength(0);
    expect(result.reason).toMatch(/Retrieval deadline exceeded/i);
  });

  it('should return TIMEOUT when database search exceeds deadline', async () => {
    const store = new InMemoryVectorStore({ simulatedDelayMs: 150 });
    const embeddingService = new MockEmbeddingService({ dimensions: 3 });
    vi.spyOn(embeddingService, 'embedQuery').mockResolvedValue([1, 0, 0]);

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: { ...baseConfig, retrievalTimeoutMs: 50 },
    });

    const result = await service.retrieveChunks('Slow database query');

    expect(result.status).toBe('TIMEOUT');
    expect(result.chunks).toHaveLength(0);
    expect(result.reason).toMatch(/Retrieval deadline exceeded/i);
  });

  it('should return TIMEOUT if database search resolves after the deadline', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1]);

    const embeddingService = new MockEmbeddingService({ dimensions: 3 });
    vi.spyOn(embeddingService, 'embedQuery').mockResolvedValue([1, 0, 0]);

    vi.spyOn(store, 'search').mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return [{ id: sampleDoc1.id, text: sampleDoc1.text, metadata: sampleDoc1.metadata, score: 0.9 }];
    });

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: { ...baseConfig, retrievalTimeoutMs: 40 },
    });

    const result = await service.retrieveChunks('Late result query');

    expect(result.status).toBe('TIMEOUT');
    expect(result.chunks).toHaveLength(0);
  });

  it('should return ABORTED immediately for a pre-aborted external signal', async () => {
    const store = new InMemoryVectorStore();
    const searchSpy = vi.spyOn(store, 'search');
    const embeddingService = new MockEmbeddingService({ dimensions: 3 });
    const embedSpy = vi.spyOn(embeddingService, 'embedQuery');

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: baseConfig,
    });

    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted request'));

    const result = await service.retrieveChunks('Query', { signal: controller.signal });

    expect(result.status).toBe('ABORTED');
    expect(result.chunks).toHaveLength(0);
    expect(embedSpy).not.toHaveBeenCalled();
    expect(searchSpy).not.toHaveBeenCalled();
  });

  it('should return ABORTED when external signal is aborted mid-operation', async () => {
    const store = new InMemoryVectorStore({ simulatedDelayMs: 50 });
    const embeddingService = new MockEmbeddingService({ dimensions: 3 });
    vi.spyOn(embeddingService, 'embedQuery').mockResolvedValue([1, 0, 0]);

    const service = new RetrievalService({
      vectorStore: store,
      embeddingService,
      config: { ...baseConfig, retrievalTimeoutMs: 1000 },
    });

    const controller = new AbortController();
    setTimeout(() => controller.abort(new Error('Caller cancelled request')), 15);

    const result = await service.retrieveChunks('Mid-operation cancel', {
      signal: controller.signal,
    });

    expect(result.status).toBe('ABORTED');
    expect(result.chunks).toHaveLength(0);
    expect(result.reason).toMatch(/aborted by caller/);
  });
});
