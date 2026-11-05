import { VectorConfig } from '../../../config/vector.config.js';
import { IEmbeddingService } from '../embeddings/types.js';
import { IVectorStore } from '../vector-store/types.js';
import { RetrievalOptions, RetrievalResult, RetrievedChunk } from './types.js';

export interface RetrievalServiceDependencies {
  vectorStore: IVectorStore;
  embeddingService: IEmbeddingService;
  config: VectorConfig;
}

export class RetrievalService {
  private readonly vectorStore: IVectorStore;
  private readonly embeddingService: IEmbeddingService;
  private readonly config: VectorConfig;

  constructor(dependencies: RetrievalServiceDependencies) {
    this.vectorStore = dependencies.vectorStore;
    this.embeddingService = dependencies.embeddingService;
    this.config = dependencies.config;
  }

  async retrieveChunks(
    query: string,
    options: RetrievalOptions = {}
  ): Promise<RetrievalResult> {
    const startTime = Date.now();

    if (options.signal?.aborted) {
      return {
        status: 'ABORTED',
        chunks: [],
        reason: options.signal.reason
          ? String(options.signal.reason)
          : 'Operation was aborted by caller prior to execution.',
        executionTimeMs: 0,
      };
    }

    if (!query || query.trim().length === 0) {
      return {
        status: 'ERROR',
        chunks: [],
        reason: 'Search query must be a non-empty string.',
        executionTimeMs: 0,
      };
    }

    const topK = Math.max(1, Math.min(10, options.topK ?? this.config.retrievalDefaultTopK));
    const minScore = Math.max(0, Math.min(1, options.minScore ?? this.config.retrievalMinScore));
    const timeoutMs = options.timeoutMs ?? this.config.retrievalTimeoutMs;
    const deadline = startTime + timeoutMs;

    const controller = new AbortController();
    let isDeadlineTimeout = false;
    let isExternalAbort = false;

    const timeoutId = setTimeout(() => {
      isDeadlineTimeout = true;
      controller.abort(new Error(`Retrieval deadline exceeded (${timeoutMs}ms)`));
    }, timeoutMs);

    const onExternalAbort = () => {
      isExternalAbort = true;
      controller.abort(options.signal?.reason ?? new Error('External caller abort requested'));
    };

    if (options.signal) {
      options.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const embeddingTimeout = Math.max(1, deadline - Date.now());
      const queryVector = await this.embeddingService.embedQuery(query, {
        signal: controller.signal,
        timeoutMs: embeddingTimeout,
        maxRetries: 0,
      });

      const embeddingUsage = this.embeddingService.getLastUsage
        ? this.embeddingService.getLastUsage()
        : undefined;

      if (isExternalAbort || options.signal?.aborted) {
        return {
          status: 'ABORTED',
          chunks: [],
          reason: 'Operation was aborted by caller after embedding generation.',
          executionTimeMs: Date.now() - startTime,
        };
      }
      if (isDeadlineTimeout || Date.now() >= deadline || controller.signal.aborted) {
        return {
          status: 'TIMEOUT',
          chunks: [],
          reason: `Retrieval deadline exceeded (${timeoutMs}ms) during embedding generation.`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const remainingMs = deadline - Date.now();
      const searchOptions: {
        topK: number;
        minScore: number;
        maxTimeMs: number;
        signal: AbortSignal;
        filter?: Record<string, unknown>;
      } = {
        topK,
        minScore,
        maxTimeMs: remainingMs,
        signal: controller.signal,
      };
      if (options.filter !== undefined) {
        searchOptions.filter = options.filter;
      }
      const searchResults = await this.vectorStore.search(queryVector, searchOptions);

      if (isExternalAbort || options.signal?.aborted) {
        return {
          status: 'ABORTED',
          chunks: [],
          reason: 'Operation was aborted by caller before search results could be returned.',
          executionTimeMs: Date.now() - startTime,
        };
      }
      if (isDeadlineTimeout || Date.now() >= deadline || controller.signal.aborted) {
        return {
          status: 'TIMEOUT',
          chunks: [],
          reason: `Retrieval deadline exceeded (${timeoutMs}ms); search completed after deadline.`,
          executionTimeMs: Date.now() - startTime,
        };
      }

      const chunks: RetrievedChunk[] = [];
      for (const res of searchResults) {
        if (res.score >= minScore) {
          chunks.push({
            id: res.id,
            text: res.text,
            sourceId: res.metadata.sourceId,
            sourceTitle: res.metadata.sourceTitle,
            sectionTitle: res.metadata.sectionTitle,
            chunkIndex: res.metadata.chunkIndex,
            category: res.metadata.category,
            score: res.score,
          });
        }
      }

      if (chunks.length === 0) {
        return {
          status: 'EMPTY_BELOW_THRESHOLD',
          chunks: [],
          reason: `No retrieved chunks met the minimum similarity score threshold of ${minScore}.`,
          executionTimeMs: Date.now() - startTime,
          usage: embeddingUsage,
        };
      }

      return {
        status: 'SUCCESS',
        chunks,
        executionTimeMs: Date.now() - startTime,
        usage: embeddingUsage,
      };
    } catch (err: unknown) {
      const executionTimeMs = Date.now() - startTime;

      if (isExternalAbort || options.signal?.aborted) {
        return {
          status: 'ABORTED',
          chunks: [],
          reason: 'Operation was aborted by caller.',
          executionTimeMs,
        };
      }

      if (isDeadlineTimeout || controller.signal.aborted || Date.now() >= deadline) {
        return {
          status: 'TIMEOUT',
          chunks: [],
          reason: `Retrieval deadline exceeded (${timeoutMs}ms).`,
          executionTimeMs,
        };
      }

      return {
        status: 'ERROR',
        chunks: [],
        reason: err instanceof Error ? err.message : String(err),
        executionTimeMs,
      };
    } finally {
      clearTimeout(timeoutId);
      if (options.signal) {
        options.signal.removeEventListener('abort', onExternalAbort);
      }
    }
  }
}
