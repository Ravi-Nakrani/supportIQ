import { EmbeddingsInterface } from '@langchain/core/embeddings';

export interface EmbeddingRequestOptions {
  timeoutMs?: number | undefined;
  maxRetries?: number | undefined;
  signal?: AbortSignal | undefined;
}

export interface IEmbeddingService extends EmbeddingsInterface {
  embedQuery(query: string, options?: EmbeddingRequestOptions | undefined): Promise<number[]>;

  embedDocuments(
    documents: string[],
    options?: EmbeddingRequestOptions | undefined
  ): Promise<number[][]>;

  getConfigFingerprint(): string;

  getDimensions(): number;

  getModelName(): string;

  getLastUsage?(): { promptTokens: number; totalTokens: number } | undefined;
}
