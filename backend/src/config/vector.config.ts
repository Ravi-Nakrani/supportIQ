import { createHash } from 'node:crypto';
import { Env, env as defaultEnv } from './env.js';

/**
 * Computes a deterministic SHA-256 fingerprint for an embedding model configuration.
 * When the model name or dimension changes, the fingerprint changes, signaling that
 * stored vectors must be regenerated.
 *
 * @param model Model identifier (e.g. 'text-embedding-3-small').
 * @param dimensions Vector dimensions (e.g. 1536).
 * @returns Hex-encoded SHA-256 fingerprint.
 */
export function computeEmbeddingFingerprint(model: string, dimensions: number): string {
  return createHash('sha256')
    .update(`${model.trim().toLowerCase()}:${dimensions}`)
    .digest('hex');
}

/**
 * Validated vector and embedding configuration structure.
 */
export interface VectorConfig {
  mongoUri?: string | undefined;
  dbName: string;
  collectionName: string;
  indexName: string;
  openAiApiKey?: string | undefined;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingFingerprint: string;
  retrievalDefaultTopK: number;
  retrievalMinScore: number;
  retrievalTimeoutMs: number;
}

/**
 * Resolves the vector configuration from the validated environment.
 *
 * @param activeEnv Validated application environment (defaults to singleton `env`).
 * @returns Immutable VectorConfig object.
 */
export function getVectorConfig(activeEnv: Env = defaultEnv): Readonly<VectorConfig> {
  const model = activeEnv.OPENAI_EMBEDDING_MODEL;
  const dimensions = activeEnv.OPENAI_EMBEDDING_DIMENSIONS;

  return Object.freeze({
    mongoUri: activeEnv.MONGODB_URI,
    dbName: activeEnv.MONGODB_DB_NAME,
    collectionName: activeEnv.MONGODB_VECTOR_COLLECTION,
    indexName: activeEnv.MONGODB_VECTOR_INDEX_NAME,
    openAiApiKey: activeEnv.OPENAI_API_KEY,
    embeddingModel: model,
    embeddingDimensions: dimensions,
    embeddingFingerprint: computeEmbeddingFingerprint(model, dimensions),
    retrievalDefaultTopK: activeEnv.RETRIEVAL_DEFAULT_TOP_K,
    retrievalMinScore: activeEnv.RETRIEVAL_MIN_SCORE,
    retrievalTimeoutMs: activeEnv.RETRIEVAL_TIMEOUT_MS,
  });
}

/**
 * Asserts that the MongoDB connection URI is configured.
 * Throws a descriptive configuration error if missing.
 */
export function assertMongoConfig(
  config: VectorConfig
): asserts config is VectorConfig & { mongoUri: string } {
  if (!config.mongoUri) {
    throw new Error(
      '[CONFIG ERROR] Missing required MONGODB_URI. ' +
        'Please configure MONGODB_URI in your environment or .env file before performing database vector operations.'
    );
  }
}

/**
 * Asserts that the OpenAI API key is configured.
 * Throws a descriptive configuration error if missing.
 */
export function assertOpenAIConfig(
  config: VectorConfig
): asserts config is VectorConfig & { openAiApiKey: string } {
  if (!config.openAiApiKey) {
    throw new Error(
      '[CONFIG ERROR] Missing required OPENAI_API_KEY. ' +
        'Please configure OPENAI_API_KEY in your environment or .env file before performing live embedding operations.'
    );
  }
}
