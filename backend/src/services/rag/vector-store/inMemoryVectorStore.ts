import { ChunkMetadata } from '../ingestion/types.js';
import {
  IVectorStore,
  StoredChunkSignature,
  VectorDocument,
  VectorSearchOptions,
  VectorSearchResult,
} from './types.js';

export interface InMemoryVectorStoreOptions {
  simulatedDelayMs?: number;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dot += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dot / denominator;
}

export class InMemoryVectorStore implements IVectorStore {
  private readonly documents = new Map<string, VectorDocument>();
  public simulatedDelayMs: number;

  constructor(options: InMemoryVectorStoreOptions = {}) {
    this.simulatedDelayMs = options.simulatedDelayMs ?? 0;
  }

  async search(
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (options.signal?.aborted) {
      throw options.signal.reason ?? new Error('Operation aborted');
    }

    if (this.simulatedDelayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, this.simulatedDelayMs);

        const onAbort = () => {
          cleanup();
          reject(options.signal?.reason ?? new Error('Operation aborted'));
        };

        const cleanup = () => {
          clearTimeout(timer);
          options.signal?.removeEventListener('abort', onAbort);
        };

        if (options.signal) {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }

    const topK = Math.max(1, Math.min(10, options.topK));
    const minScore = options.minScore ?? 0.0;

    const scored: VectorSearchResult[] = [];

    for (const doc of this.documents.values()) {
      if (options.filter) {
        let match = true;
        for (const [key, value] of Object.entries(options.filter)) {
          const docVal = (doc.metadata as unknown as Record<string, unknown>)[key];
          if (docVal !== value) {
            match = false;
            break;
          }
        }
        if (!match) continue;
      }

      const score = cosineSimilarity(queryVector, doc.embedding);
      if (score >= minScore) {
        scored.push({
          id: doc.id,
          text: doc.text,
          metadata: doc.metadata,
          score,
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, topK);
  }

  async getStoredSignatures(): Promise<StoredChunkSignature[]> {
    return Array.from(this.documents.values()).map((doc) => ({
      id: doc.id,
      contentHash: doc.metadata.contentHash,
      metadataHash: doc.metadata.metadataHash,
      embeddingConfig: { ...doc.embeddingConfig },
    }));
  }

  async bulkUpsert(
    chunks: VectorDocument[]
  ): Promise<{ upsertedCount: number; modifiedCount: number }> {
    let upsertedCount = 0;
    let modifiedCount = 0;

    for (const chunk of chunks) {
      if (this.documents.has(chunk.id)) {
        modifiedCount++;
      } else {
        upsertedCount++;
      }
      this.documents.set(chunk.id, {
        ...chunk,
        embedding: [...chunk.embedding],
        metadata: { ...chunk.metadata },
        embeddingConfig: { ...chunk.embeddingConfig },
      });
    }

    return { upsertedCount, modifiedCount };
  }

  async updateMetadataBatch(
    updates: Array<{ id: string; metadata: ChunkMetadata }>
  ): Promise<number> {
    let count = 0;
    for (const update of updates) {
      const existing = this.documents.get(update.id);
      if (existing) {
        existing.metadata = { ...update.metadata };
        count++;
      }
    }
    return count;
  }

  async deleteByIds(ids: string[]): Promise<number> {
    let count = 0;
    for (const id of ids) {
      if (this.documents.delete(id)) {
        count++;
      }
    }
    return count;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
  }

  getRawDocument(id: string): VectorDocument | undefined {
    return this.documents.get(id);
  }

  size(): number {
    return this.documents.size;
  }

  clear(): void {
    this.documents.clear();
  }
}

