import { EmbeddingsInterface } from '@langchain/core/embeddings';

/**
 * Options that can be supplied per embedding invocation.
 */
export interface EmbeddingRequestOptions {
  timeoutMs?: number | undefined;
  maxRetries?: number | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Common interface for embedding services in SupportIQ.
 * Extends LangChain's EmbeddingsInterface so that this service can be passed directly
 * to LangChain retrievers, vector stores, and prompt chains.
 */
export interface IEmbeddingService extends EmbeddingsInterface {
  /**
   * Generates an embedding vector for a single query string.
   */
  embedQuery(query: string, options?: EmbeddingRequestOptions | undefined): Promise<number[]>;

  /**
   * Generates embedding vectors for an array of document chunks.
   * Preserves exact input index order using OpenAI response indices.
   */
  embedDocuments(
    documents: string[],
    options?: EmbeddingRequestOptions | undefined
  ): Promise<number[][]>;

  /**
   * Returns the configuration fingerprint (SHA-256 of model:dimensions).
   */
  getConfigFingerprint(): string;

  /**
   * Returns the configured dimension count (e.g. 1536).
   */
  getDimensions(): number;

  /**
   * Returns the model identifier (e.g. 'text-embedding-3-small').
   */
  getModelName(): string;
}
