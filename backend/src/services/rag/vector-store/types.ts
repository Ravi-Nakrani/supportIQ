import { ChunkMetadata } from '../ingestion/types.js';

export interface VectorDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
  embeddingConfig: {
    model: string;
    dimensions: number;
    fingerprint: string;
  };
}

export interface StoredChunkSignature {
  id: string;
  contentHash: string;
  metadataHash: string;
  embeddingConfig: {
    model: string;
    dimensions: number;
    fingerprint: string;
  };
}

export interface VectorSearchOptions {
  topK: number;
  minScore?: number | undefined;
  maxTimeMs?: number | undefined;
  signal?: AbortSignal | undefined;
  filter?: Record<string, unknown> | undefined;
}

export interface VectorSearchResult {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  score: number;
}

export interface IVectorStore {
  search(queryVector: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]>;

  getStoredSignatures(): Promise<StoredChunkSignature[]>;

  bulkUpsert(chunks: VectorDocument[]): Promise<{ upsertedCount: number; modifiedCount: number }>;

  updateMetadataBatch(updates: Array<{ id: string; metadata: ChunkMetadata }>): Promise<number>;

  deleteByIds(ids: string[]): Promise<number>;

  ping(): Promise<boolean>;

  close(): Promise<void>;
}
