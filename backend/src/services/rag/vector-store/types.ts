import { ChunkMetadata } from '../ingestion/types.js';

/**
 * In-store representation of a vectorized knowledge chunk.
 */
export interface VectorDocument {
  id: string; // Maps to MongoDB primary key (_id)
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
  embeddingConfig: {
    model: string;
    dimensions: number;
    fingerprint: string;
  };
}

/**
 * Lightweight signature used to detect vector drift without loading full vectors.
 */
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

/**
 * Options supplied to a vector similarity search.
 */
export interface VectorSearchOptions {
  topK: number;
  minScore?: number | undefined;
  maxTimeMs?: number | undefined;
  signal?: AbortSignal | undefined;
  filter?: Record<string, unknown> | undefined;
}

/**
 * Result item returned by vector similarity search.
 */
export interface VectorSearchResult {
  id: string;
  text: string;
  metadata: ChunkMetadata;
  score: number;
}

/**
 * Common abstraction for vector database storage.
 */
export interface IVectorStore {
  /**
   * Searches for top-k chunks nearest to queryVector.
   */
  search(queryVector: number[], options: VectorSearchOptions): Promise<VectorSearchResult[]>;

  /**
   * Retrieves lightweight chunk signatures to detect missing, outdated, or stale vectors.
   */
  getStoredSignatures(): Promise<StoredChunkSignature[]>;

  /**
   * Idempotently upserts vector documents using chunk.id as filter key.
   */
  bulkUpsert(chunks: VectorDocument[]): Promise<{ upsertedCount: number; modifiedCount: number }>;

  /**
   * Updates chunk metadata without touching or re-generating the embedding vector.
   */
  updateMetadataBatch(updates: Array<{ id: string; metadata: ChunkMetadata }>): Promise<number>;

  /**
   * Deletes vectors by their chunk IDs.
   */
  deleteByIds(ids: string[]): Promise<number>;

  /**
   * Health probe verifying database connectivity.
   */
  ping(): Promise<boolean>;

  /**
   * Gracefully releases client connections.
   */
  close(): Promise<void>;
}
