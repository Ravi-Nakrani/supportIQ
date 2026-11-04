import { describe, it, expect, vi } from 'vitest';
import { OpenAIEmbeddingService } from '../../src/services/rag/embeddings/openaiEmbeddingService.js';
import { MockEmbeddingService } from '../../src/services/rag/embeddings/mockEmbeddingService.js';
import { computeEmbeddingFingerprint, VectorConfig } from '../../src/config/vector.config.js';
import OpenAI from 'openai';

describe('Embedding Service (Unit)', () => {
  const baseConfig: VectorConfig = {
    dbName: 'supportiq',
    collectionName: 'knowledge_chunks',
    indexName: 'supportiq_vector_index',
    embeddingModel: 'text-embedding-3-small',
    embeddingDimensions: 1536,
    embeddingFingerprint: computeEmbeddingFingerprint('text-embedding-3-small', 1536),
    retrievalDefaultTopK: 4,
    retrievalMinScore: 0.65,
    retrievalTimeoutMs: 2500,
  };

  describe('Configuration Fingerprint', () => {
    it('should generate consistent SHA-256 fingerprint for identical config', () => {
      const fp1 = computeEmbeddingFingerprint('text-embedding-3-small', 1536);
      const fp2 = computeEmbeddingFingerprint('text-embedding-3-small', 1536);
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });

    it('should generate different fingerprint when model name differs', () => {
      const fp1 = computeEmbeddingFingerprint('text-embedding-3-small', 1536);
      const fp2 = computeEmbeddingFingerprint('text-embedding-3-large', 1536);
      expect(fp1).not.toBe(fp2);
    });

    it('should generate different fingerprint when dimensions differ', () => {
      const fp1 = computeEmbeddingFingerprint('text-embedding-3-small', 1536);
      const fp2 = computeEmbeddingFingerprint('text-embedding-3-small', 512);
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('OpenAIEmbeddingService with Mocked Client', () => {
    it('should pass maxRetries: 0 and timeout to client on embedQuery', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        data: [{ index: 0, embedding: new Array(1536).fill(0.1) }],
      });

      const mockClient = {
        embeddings: { create: mockCreate },
      } as unknown as OpenAI;

      const service = new OpenAIEmbeddingService({
        config: baseConfig,
        client: mockClient,
      });

      const vector = await service.embedQuery('How do returns work?', {
        timeoutMs: 1500,
      });

      expect(vector).toHaveLength(1536);
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith(
        {
          model: 'text-embedding-3-small',
          input: 'How do returns work?',
          dimensions: 1536,
        },
        expect.objectContaining({
          timeout: 1500,
          maxRetries: 0, // Interactive retrieval uses zero retries
        })
      );
    });

    it('should pass abort signal to client when provided', async () => {
      const controller = new AbortController();
      const mockCreate = vi.fn().mockResolvedValue({
        data: [{ index: 0, embedding: new Array(1536).fill(0.2) }],
      });

      const mockClient = {
        embeddings: { create: mockCreate },
      } as unknown as OpenAI;

      const service = new OpenAIEmbeddingService({
        config: baseConfig,
        client: mockClient,
      });

      await service.embedQuery('Testing signal', { signal: controller.signal });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ signal: controller.signal })
      );
    });

    it('should preserve input-to-embedding mapping using response indices', async () => {
      // Simulate OpenAI returning out-of-order response data
      const mockCreate = vi.fn().mockResolvedValue({
        data: [
          { index: 2, embedding: new Array(1536).fill(0.3) },
          { index: 0, embedding: new Array(1536).fill(0.1) },
          { index: 1, embedding: new Array(1536).fill(0.2) },
        ],
      });

      const mockClient = {
        embeddings: { create: mockCreate },
      } as unknown as OpenAI;

      const service = new OpenAIEmbeddingService({
        config: baseConfig,
        client: mockClient,
      });

      const inputDocs = ['Doc 0', 'Doc 1', 'Doc 2'];
      const result = await service.embedDocuments(inputDocs);

      expect(result).toHaveLength(3);
      expect(result[0]![0]).toBe(0.1); // Corresponds to Doc 0 (index 0)
      expect(result[1]![0]).toBe(0.2); // Corresponds to Doc 1 (index 1)
      expect(result[2]![0]).toBe(0.3); // Corresponds to Doc 2 (index 2)
      expect(mockCreate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ maxRetries: 2 }) // Batch ingestion uses maxRetries: 2
      );
    });

    it('should reject dimension mismatch from provider', async () => {
      const mockCreate = vi.fn().mockResolvedValue({
        data: [{ index: 0, embedding: new Array(512).fill(0.1) }], // 512 instead of 1536
      });

      const mockClient = {
        embeddings: { create: mockCreate },
      } as unknown as OpenAI;

      const service = new OpenAIEmbeddingService({
        config: baseConfig,
        client: mockClient,
      });

      await expect(service.embedQuery('Dimension test')).rejects.toThrow(
        /Dimension mismatch/
      );
    });
  });

  describe('MockEmbeddingService', () => {
    it('should produce unit-length normalized 1536-dim vectors', async () => {
      const mockService = new MockEmbeddingService();
      const vector = await mockService.embedQuery('Hello ShopEase');

      expect(vector).toHaveLength(1536);

      // Verify L2 norm is ~1.0
      const normSquared = vector.reduce((sum, val) => sum + val * val, 0);
      expect(Math.abs(Math.sqrt(normSquared) - 1.0)).toBeLessThan(1e-5);
    });

    it('should abort when signal is triggered during simulated delay', async () => {
      const mockService = new MockEmbeddingService({ simulatedDelayMs: 50 });
      const controller = new AbortController();

      setTimeout(() => controller.abort(new Error('Manual abort')), 10);

      await expect(
        mockService.embedQuery('Aborting query', { signal: controller.signal })
      ).rejects.toThrow(/Manual abort/);
    });
  });
});

