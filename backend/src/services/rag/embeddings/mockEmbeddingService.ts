import { createHash } from 'node:crypto';
import { computeEmbeddingFingerprint } from '../../../config/vector.config.js';
import { EmbeddingRequestOptions, IEmbeddingService } from './types.js';

export interface MockEmbeddingServiceOptions {
  modelName?: string;
  dimensions?: number;
  customFingerprint?: string;
  simulatedDelayMs?: number;
}

/**
 * Deterministic in-memory embedding service for testing.
 * Produces unit-length normalized vectors without network or provider costs.
 */
export class MockEmbeddingService implements IEmbeddingService {
  private readonly modelName: string;
  private readonly dimensions: number;
  private readonly fingerprint: string;
  private readonly delayMs: number;

  public queryCallCount = 0;
  public documentCallCount = 0;
  public totalDocumentsEmbedded = 0;
  public lastQueryOptions?: EmbeddingRequestOptions | undefined;
  public lastDocumentOptions?: EmbeddingRequestOptions | undefined;
  public lastUsage?: { promptTokens: number; totalTokens: number } | undefined;

  constructor(options: MockEmbeddingServiceOptions = {}) {
    this.modelName = options.modelName ?? 'mock-embedding-model';
    this.dimensions = options.dimensions ?? 1536;
    this.fingerprint =
      options.customFingerprint ??
      computeEmbeddingFingerprint(this.modelName, this.dimensions);
    this.delayMs = options.simulatedDelayMs ?? 0;
  }

  /**
   * Generates a deterministic normalized float vector derived from the input text.
   */
  private generateVector(text: string): number[] {
    const hash = createHash('sha256').update(text).digest();
    const vector = new Array<number>(this.dimensions);

    let normSquared = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const byte = hash[i % hash.length]!;
      // Map byte 0-255 to a float roughly between -1 and 1
      const val = (byte - 128) / 128.0;
      vector[i] = val;
      normSquared += val * val;
    }

    // Normalize to unit length (L2 norm)
    const norm = Math.sqrt(normSquared) || 1;
    for (let i = 0; i < this.dimensions; i++) {
      vector[i] = vector[i]! / norm;
    }

    return vector;
  }

  private async waitOrAbort(options?: EmbeddingRequestOptions): Promise<void> {
    if (options?.signal?.aborted) {
      throw options.signal.reason ?? new Error('Operation aborted');
    }

    if (this.delayMs > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cleanup();
          resolve();
        }, this.delayMs);

        const onAbort = () => {
          cleanup();
          reject(options?.signal?.reason ?? new Error('Operation aborted'));
        };

        const cleanup = () => {
          clearTimeout(timer);
          options?.signal?.removeEventListener('abort', onAbort);
        };

        if (options?.signal) {
          options.signal.addEventListener('abort', onAbort, { once: true });
        }
      });
    }
  }

  async embedQuery(query: string, options?: EmbeddingRequestOptions): Promise<number[]> {
    this.queryCallCount++;
    this.lastQueryOptions = options;
    const tokens = Math.max(1, Math.ceil(query.length / 4));
    this.lastUsage = { promptTokens: tokens, totalTokens: tokens };

    await this.waitOrAbort(options);
    return this.generateVector(query);
  }

  async embedDocuments(
    documents: string[],
    options?: EmbeddingRequestOptions
  ): Promise<number[][]> {
    this.documentCallCount++;
    this.totalDocumentsEmbedded += documents.length;
    this.lastDocumentOptions = options;

    await this.waitOrAbort(options);
    return documents.map((doc) => this.generateVector(doc));
  }

  getConfigFingerprint(): string {
    return this.fingerprint;
  }

  getDimensions(): number {
    return this.dimensions;
  }

  getModelName(): string {
    return this.modelName;
  }

  getLastUsage(): { promptTokens: number; totalTokens: number } | undefined {
    return this.lastUsage;
  }
}
