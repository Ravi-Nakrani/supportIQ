import { createHash } from 'node:crypto';
import { Env, env as defaultEnv } from './env.js';

export function computeEmbeddingFingerprint(model: string, dimensions: number): string {
  return createHash('sha256')
    .update(`${model.trim().toLowerCase()}:${dimensions}`)
    .digest('hex');
}

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
