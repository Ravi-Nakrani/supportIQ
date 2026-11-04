import OpenAI from 'openai';
import { VectorConfig, assertOpenAIConfig } from '../../../config/vector.config.js';
import { EmbeddingRequestOptions, IEmbeddingService } from './types.js';

export interface OpenAIEmbeddingServiceOptions {
  config: VectorConfig;
  client?: OpenAI;
}

function buildRequestOptions(
  options?: EmbeddingRequestOptions,
  defaultMaxRetries = 0
): OpenAI.RequestOptions {
  const reqOptions: OpenAI.RequestOptions = {
    maxRetries: options?.maxRetries ?? defaultMaxRetries,
  };
  if (options?.timeoutMs !== undefined) {
    reqOptions.timeout = options.timeoutMs;
  }
  if (options?.signal !== undefined) {
    reqOptions.signal = options.signal;
  }
  return reqOptions;
}

/**
 * Production embedding service using the official OpenAI SDK.
 * Implements LangChain's EmbeddingsInterface for cross-compatibility.
 */
export class OpenAIEmbeddingService implements IEmbeddingService {
  private readonly config: VectorConfig;
  private readonly client: OpenAI;

  constructor(options: OpenAIEmbeddingServiceOptions) {
    this.config = options.config;

    if (options.client) {
      this.client = options.client;
    } else {
      assertOpenAIConfig(this.config);
      this.client = new OpenAI({
        apiKey: this.config.openAiApiKey,
      });
    }
  }

  /**
   * Generates a 1536-dimensional vector for a user query.
   * Defaults to maxRetries: 0 so interactive retrieval never hangs in retry loops.
   */
  async embedQuery(query: string, options?: EmbeddingRequestOptions): Promise<number[]> {
    if (!query || query.trim().length === 0) {
      throw new Error('[Embedding Error] Query must be a non-empty string.');
    }

    const response = await this.client.embeddings.create(
      {
        model: this.config.embeddingModel,
        input: query.trim(),
        dimensions: this.config.embeddingDimensions,
      },
      buildRequestOptions(options, 0)
    );

    const embedding = response.data[0]?.embedding;
    if (!embedding || !Array.isArray(embedding)) {
      throw new Error('[Embedding Error] OpenAI returned an empty embedding for query.');
    }

    if (embedding.length !== this.config.embeddingDimensions) {
      throw new Error(
        `[Embedding Error] Dimension mismatch: expected ${this.config.embeddingDimensions}, but received ${embedding.length} from provider.`
      );
    }

    return embedding;
  }

  /**
   * Generates embeddings for a batch of documents.
   * Strictly preserves input-to-embedding mapping using response item indices.
   * Defaults to maxRetries: 2 for batch ingestion resilience.
   */
  async embedDocuments(
    documents: string[],
    options?: EmbeddingRequestOptions
  ): Promise<number[][]> {
    if (documents.length === 0) {
      return [];
    }

    const response = await this.client.embeddings.create(
      {
        model: this.config.embeddingModel,
        input: documents,
        dimensions: this.config.embeddingDimensions,
      },
      buildRequestOptions(options, 2)
    );

    // CRITICAL: Preserve input-to-embedding mapping using response index
    const sortedEmbeddings: number[][] = new Array(documents.length);

    for (const item of response.data) {
      if (item.index < 0 || item.index >= documents.length) {
        throw new Error(
          `[Embedding Error] OpenAI returned unexpected item index ${item.index} for batch of size ${documents.length}.`
        );
      }
      if (item.embedding.length !== this.config.embeddingDimensions) {
        throw new Error(
          `[Embedding Error] Dimension mismatch on item ${item.index}: expected ${this.config.embeddingDimensions}, but received ${item.embedding.length}.`
        );
      }
      sortedEmbeddings[item.index] = item.embedding;
    }

    // Verify all positions were populated
    for (let i = 0; i < sortedEmbeddings.length; i++) {
      if (!sortedEmbeddings[i]) {
        throw new Error(
          `[Embedding Error] Missing embedding output at position ${i} after mapping response indices.`
        );
      }
    }

    return sortedEmbeddings;
  }

  getConfigFingerprint(): string {
    return this.config.embeddingFingerprint;
  }

  getDimensions(): number {
    return this.config.embeddingDimensions;
  }

  getModelName(): string {
    return this.config.embeddingModel;
  }
}
