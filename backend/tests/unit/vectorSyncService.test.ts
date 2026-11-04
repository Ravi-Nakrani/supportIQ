import { describe, it, expect } from 'vitest';
import { syncVectors } from '../../src/services/rag/ingestion/vectorSyncService.js';
import { InMemoryVectorStore } from '../../src/services/rag/vector-store/inMemoryVectorStore.js';
import { MockEmbeddingService } from '../../src/services/rag/embeddings/mockEmbeddingService.js';
import { KnowledgeChunk } from '../../src/services/rag/ingestion/types.js';

describe('Vector Sync Service (Unit)', () => {
  const createMockChunk = (id: string, text: string, section: string): KnowledgeChunk => ({
    id,
    text,
    metadata: {
      sourceId: 'shopease-returns-policy',
      sourceTitle: 'ShopEase Returns Policy',
      category: 'Returns & Exchanges',
      documentVersion: '1.0.0',
      effectiveDate: '2026-01-01',
      sectionTitle: section,
      headingHierarchy: ['Returns Policy', section],
      sourcePath: 'knowledge-base/shopease/returns-policy.md',
      chunkIndex: 0,
      contentHash: `hash-${text}`,
      metadataHash: `meta-${section}`,
    },
  });

  const chunk1 = createMockChunk('chunk-1', 'Return window is 30 days.', 'Return Window');
  const chunk2 = createMockChunk('chunk-2', 'Opened items must be defective.', 'Defective Products');
  const chunk3 = createMockChunk('chunk-3', 'Refund takes 3-5 business days.', 'Refund Timelines');

  it('should perform initial full sync on an empty vector store', async () => {
    const store = new InMemoryVectorStore();
    const embeddingService = new MockEmbeddingService();

    const report = await syncVectors([chunk1, chunk2, chunk3], store, embeddingService, {
      batchSize: 2,
    });

    expect(report.totalManifestChunks).toBe(3);
    expect(report.added).toBe(3);
    expect(report.reEmbedded).toBe(0);
    expect(report.metadataUpdated).toBe(0);
    expect(report.staleDeleted).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(report.isFullySynced).toBe(false); // First run modified state
    expect(store.size()).toBe(3);
    expect(embeddingService.totalDocumentsEmbedded).toBe(3);
  });

  it('should be completely idempotent when running against an up-to-date store', async () => {
    const store = new InMemoryVectorStore();
    const embeddingService = new MockEmbeddingService();

    // First run
    await syncVectors([chunk1, chunk2], store, embeddingService);
    embeddingService.totalDocumentsEmbedded = 0;

    // Second run
    const report = await syncVectors([chunk1, chunk2], store, embeddingService);

    expect(report.totalManifestChunks).toBe(2);
    expect(report.added).toBe(0);
    expect(report.reEmbedded).toBe(0);
    expect(report.metadataUpdated).toBe(0);
    expect(report.staleDeleted).toBe(0);
    expect(report.unchanged).toBe(2);
    expect(report.isFullySynced).toBe(true);
    expect(embeddingService.totalDocumentsEmbedded).toBe(0); // 0 embedding calls
  });

  it('should prune stale vectors when a chunk is removed from the manifest', async () => {
    const store = new InMemoryVectorStore();
    const embeddingService = new MockEmbeddingService();

    // Seed store with chunk1, chunk2, chunk3
    await syncVectors([chunk1, chunk2, chunk3], store, embeddingService);
    expect(store.size()).toBe(3);

    // Sync manifest containing only chunk1 and chunk2
    const report = await syncVectors([chunk1, chunk2], store, embeddingService);

    expect(report.staleDeleted).toBe(1);
    expect(report.unchanged).toBe(2);
    expect(store.size()).toBe(2);
    expect(store.getRawDocument('chunk-3')).toBeUndefined();
  });

  it('should recover from a partial sync failure on subsequent retry without duplicates', async () => {
    const store = new InMemoryVectorStore();
    const embeddingService = new MockEmbeddingService();

    // Simulate partial failure: sync chunk1 and chunk2 first (simulating batch 1 succeeded before crash)
    await syncVectors([chunk1, chunk2], store, embeddingService);
    expect(store.size()).toBe(2);
    embeddingService.totalDocumentsEmbedded = 0;

    // Retry with complete manifest [chunk1, chunk2, chunk3]
    const retryReport = await syncVectors(
      [chunk1, chunk2, chunk3],
      store,
      embeddingService
    );

    expect(retryReport.totalManifestChunks).toBe(3);
    expect(retryReport.added).toBe(1); // Only chunk3 is missing
    expect(retryReport.unchanged).toBe(2); // chunk1 and chunk2 were recognized as up-to-date
    expect(embeddingService.totalDocumentsEmbedded).toBe(1); // Only embedded the missing chunk
    expect(store.size()).toBe(3);
  });

  it('should detect embedding configuration change and re-embed all chunks', async () => {
    const store = new InMemoryVectorStore();
    const serviceV1 = new MockEmbeddingService({
      modelName: 'text-embedding-3-small',
      dimensions: 1536,
    });

    // Seed store with V1 configuration
    await syncVectors([chunk1, chunk2], store, serviceV1);
    expect(store.size()).toBe(2);

    // Create service with new model name (simulating .env change)
    const serviceV2 = new MockEmbeddingService({
      modelName: 'text-embedding-3-large',
      dimensions: 1536,
    });

    // Sync with V2 service
    const report = await syncVectors([chunk1, chunk2], store, serviceV2);

    expect(report.reEmbedded).toBe(2);
    expect(report.added).toBe(0);
    expect(report.unchanged).toBe(0);
    expect(serviceV2.totalDocumentsEmbedded).toBe(2);

    // Verify stored document has updated fingerprint and model
    const storedDoc = store.getRawDocument(chunk1.id);
    expect(storedDoc?.embeddingConfig.model).toBe('text-embedding-3-large');
    expect(storedDoc?.embeddingConfig.fingerprint).toBe(serviceV2.getConfigFingerprint());
  });

  it('should update metadata only with zero embedding calls when text is unchanged', async () => {
    const store = new InMemoryVectorStore();
    const embeddingService = new MockEmbeddingService();

    // Initial sync
    await syncVectors([chunk1], store, embeddingService);
    embeddingService.totalDocumentsEmbedded = 0;

    // Modify sectionTitle and metadataHash, keeping contentHash unchanged
    const updatedChunk1: KnowledgeChunk = {
      ...chunk1,
      metadata: {
        ...chunk1.metadata,
        sectionTitle: 'Renamed Section',
        metadataHash: 'updated-meta-hash',
      },
    };

    const report = await syncVectors([updatedChunk1], store, embeddingService);

    expect(report.metadataUpdated).toBe(1);
    expect(report.reEmbedded).toBe(0);
    expect(report.added).toBe(0);
    expect(report.unchanged).toBe(0);
    // CRITICAL: Assert 0 embedding calls were made!
    expect(embeddingService.totalDocumentsEmbedded).toBe(0);

    const stored = store.getRawDocument(chunk1.id);
    expect(stored?.metadata.sectionTitle).toBe('Renamed Section');
  });
});

