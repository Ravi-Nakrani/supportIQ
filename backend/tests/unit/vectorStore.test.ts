import { describe, it, expect } from 'vitest';
import { InMemoryVectorStore } from '../../src/services/rag/vector-store/inMemoryVectorStore.js';
import { VectorDocument } from '../../src/services/rag/vector-store/types.js';

describe('Vector Store (Unit)', () => {
  const sampleDoc1: VectorDocument = {
    id: 'shopease-returns-policy#defective#0',
    text: 'Opened products that are defective can be returned within 30 days.',
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
      contentHash: 'content-hash-1',
      metadataHash: 'meta-hash-1',
    },
    embeddingConfig: {
      model: 'text-embedding-3-small',
      dimensions: 3,
      fingerprint: 'fp-1',
    },
  };

  const sampleDoc2: VectorDocument = {
    id: 'shopease-shipping-policy#delivery#0',
    text: 'Standard shipping takes 3-5 business days across the country.',
    embedding: [0.0, 1.0, 0.0],
    metadata: {
      sourceId: 'shopease-shipping-policy',
      sourceTitle: 'ShopEase Shipping Policy',
      category: 'Shipping & Delivery',
      documentVersion: '1.0.0',
      effectiveDate: '2026-01-01',
      sectionTitle: 'Standard Shipping',
      headingHierarchy: ['Shipping Policy', 'Standard Shipping'],
      sourcePath: 'knowledge-base/shopease/shipping-policy.md',
      chunkIndex: 0,
      contentHash: 'content-hash-2',
      metadataHash: 'meta-hash-2',
    },
    embeddingConfig: {
      model: 'text-embedding-3-small',
      dimensions: 3,
      fingerprint: 'fp-1',
    },
  };

  it('should bulk upsert documents and report counts', async () => {
    const store = new InMemoryVectorStore();
    const result = await store.bulkUpsert([sampleDoc1, sampleDoc2]);

    expect(result.upsertedCount).toBe(2);
    expect(result.modifiedCount).toBe(0);
    expect(store.size()).toBe(2);

    const updatedDoc1 = { ...sampleDoc1, text: 'Updated text' };
    const reResult = await store.bulkUpsert([updatedDoc1]);

    expect(reResult.upsertedCount).toBe(0);
    expect(reResult.modifiedCount).toBe(1);
    expect(store.size()).toBe(2);
    expect(store.getRawDocument(sampleDoc1.id)?.text).toBe('Updated text');
  });

  it('should rank results by cosine similarity descending', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1, sampleDoc2]);

    const query = [0.95, 0.05, 0.0];
    const results = await store.search(query, { topK: 2 });

    expect(results).toHaveLength(2);
    expect(results[0]!.id).toBe(sampleDoc1.id);
    expect(results[0]!.score).toBeGreaterThan(0.9);
    expect(results[1]!.id).toBe(sampleDoc2.id);
  });

  it('should filter results below minScore threshold', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1, sampleDoc2]);

    const query = [1.0, 0.0, 0.0];
    const results = await store.search(query, { topK: 5, minScore: 0.5 });

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBe(sampleDoc1.id);
  });

  it('should update metadata batch while preserving existing embeddings', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1]);

    const updatedMetadata = {
      ...sampleDoc1.metadata,
      sectionTitle: 'Updated Section Title',
      metadataHash: 'new-meta-hash',
    };

    const count = await store.updateMetadataBatch([
      { id: sampleDoc1.id, metadata: updatedMetadata },
    ]);

    expect(count).toBe(1);
    const stored = store.getRawDocument(sampleDoc1.id);
    expect(stored?.metadata.sectionTitle).toBe('Updated Section Title');
    expect(stored?.metadata.metadataHash).toBe('new-meta-hash');
    expect(stored?.embedding).toEqual(sampleDoc1.embedding);
  });

  it('should return stored signatures without embedding vectors', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1]);

    const signatures = await store.getStoredSignatures();
    expect(signatures).toHaveLength(1);
    expect(signatures[0]).toEqual({
      id: sampleDoc1.id,
      contentHash: sampleDoc1.metadata.contentHash,
      metadataHash: sampleDoc1.metadata.metadataHash,
      embeddingConfig: sampleDoc1.embeddingConfig,
    });
  });

  it('should delete vectors by chunk IDs', async () => {
    const store = new InMemoryVectorStore();
    await store.bulkUpsert([sampleDoc1, sampleDoc2]);

    const deleted = await store.deleteByIds([sampleDoc1.id]);
    expect(deleted).toBe(1);
    expect(store.size()).toBe(1);
    expect(store.getRawDocument(sampleDoc1.id)).toBeUndefined();
  });

  it('should abort search when signal is aborted', async () => {
    const store = new InMemoryVectorStore();
    const controller = new AbortController();
    controller.abort(new Error('Pre-aborted search'));

    await expect(
      store.search([1, 0, 0], { topK: 2, signal: controller.signal })
    ).rejects.toThrow(/Pre-aborted search/);
  });
});

