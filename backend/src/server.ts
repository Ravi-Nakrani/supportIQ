import { MongoClient } from 'mongodb';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { getVectorConfig } from './config/vector.config.js';
import { getLlmConfig } from './config/llm.config.js';
import { calculateWorstCaseReservationCost } from './config/llmPricing.js';
import { MongoAtlasVectorStore } from './services/rag/vector-store/mongoAtlasVectorStore.js';
import { InMemoryVectorStore } from './services/rag/vector-store/inMemoryVectorStore.js';
import { OpenAIEmbeddingService } from './services/rag/embeddings/openaiEmbeddingService.js';
import { MockEmbeddingService } from './services/rag/embeddings/mockEmbeddingService.js';
import { OpenAiChatService } from './services/rag/generation/openAiChatService.js';
import { MockLlmChatService } from './services/rag/generation/mockLlmChatService.js';
import { RetrievalService } from './services/rag/retrieval/retrievalService.js';
import { SupportIQGraphService } from './graph/supportiqGraph.js';
import { MongoUsageTracker } from './services/usage/mongoUsageTracker.js';
import { InMemoryUsageTracker } from './services/usage/inMemoryUsageTracker.js';
import { MongoReadinessChecker } from './services/health/readinessChecker.js';

const isProduction = env.NODE_ENV === 'production';
const isLiveMode = Boolean(env.OPENAI_API_KEY);

if (isProduction) {
  if (!env.MONGODB_URI) {
    console.error(
      '[FATAL CONFIG ERROR] MONGODB_URI is strictly mandatory in production. Failing closed.'
    );
    process.exit(1);
  }
  if (!env.OPENAI_API_KEY) {
    console.error(
      '[FATAL CONFIG ERROR] OPENAI_API_KEY is strictly mandatory in production. Failing closed.'
    );
    process.exit(1);
  }
} else if (isLiveMode && !env.MONGODB_URI) {
  console.error(
    '[FATAL CONFIG ERROR] MONGODB_URI is strictly mandatory when live OPENAI_API_KEY is configured. Failing closed.'
  );
  process.exit(1);
}

const reservedCostMicroUsd = calculateWorstCaseReservationCost(
  env.OPENAI_CHAT_MODEL,
  env.OPENAI_EMBEDDING_MODEL
);

console.log(
  `[SERVER] Cost guard initialized: model="${env.OPENAI_CHAT_MODEL}", reservationCost=${reservedCostMicroUsd} μUSD ($${(reservedCostMicroUsd / 1000000).toFixed(6)}), reservationTokens=14100`
);

let mongoClient: MongoClient | undefined;
if (env.MONGODB_URI) {
  try {
    mongoClient = new MongoClient(env.MONGODB_URI, {
      appName: 'supportiq-backend',
      maxPoolSize: 10,
    });
    await mongoClient.connect();
    console.log('[SERVER] Connected to MongoDB Atlas cluster successfully.');
  } catch (dbErr) {
    console.error('[FATAL DATABASE ERROR] Failed to connect to MongoDB Atlas at startup:', dbErr);
    process.exit(1);
  }
}

const currentVectorConfig = getVectorConfig();
const currentLlmConfig = getLlmConfig();

const vectorStore = mongoClient
  ? new MongoAtlasVectorStore({ config: currentVectorConfig, client: mongoClient })
  : new InMemoryVectorStore();

const embeddingService = env.OPENAI_API_KEY
  ? new OpenAIEmbeddingService({ config: currentVectorConfig })
  : new MockEmbeddingService();

const retrievalService = new RetrievalService({
  vectorStore,
  embeddingService,
  config: currentVectorConfig,
});

const llmChatService = env.OPENAI_API_KEY
  ? new OpenAiChatService({ config: currentLlmConfig })
  : new MockLlmChatService();

const graphService = new SupportIQGraphService({
  retrievalService,
  llmChatService,
});

const usageTracker = mongoClient
  ? new MongoUsageTracker({
      client: mongoClient,
      dbName: env.MONGODB_DB_NAME,
      collectionName: env.MONGODB_USAGE_COLLECTION,
      dailyMaxRequests: env.DAILY_MAX_REQUESTS,
      dailyMaxTokens: env.DAILY_MAX_TOKENS,
      dailyMaxBudgetMicroUsd: env.DAILY_MAX_BUDGET_MICRO_USD,
      reservedCostMicroUsd,
      reservedTokens: 14100,
      reservedRequests: 1,
    })
  : new InMemoryUsageTracker({
      dailyMaxRequests: env.DAILY_MAX_REQUESTS,
      dailyMaxTokens: env.DAILY_MAX_TOKENS,
      dailyMaxBudgetMicroUsd: env.DAILY_MAX_BUDGET_MICRO_USD,
      reservedCostMicroUsd,
      reservedTokens: 14100,
      reservedRequests: 1,
    });

if (isProduction) {
  if (
    vectorStore instanceof InMemoryVectorStore ||
    embeddingService instanceof MockEmbeddingService ||
    llmChatService instanceof MockLlmChatService ||
    usageTracker instanceof InMemoryUsageTracker
  ) {
    console.error(
      '[FATAL CONFIG ERROR] Production mode cannot instantiate mock adapters. All services must be live. Failing closed.'
    );
    process.exit(1);
  }
}

const readinessChecker = mongoClient
  ? new MongoReadinessChecker({
      client: mongoClient,
      dbName: env.MONGODB_DB_NAME,
      vectorCollectionName: env.MONGODB_VECTOR_COLLECTION,
      vectorIndexName: env.MONGODB_VECTOR_INDEX_NAME,
      usageCollectionName: env.MONGODB_USAGE_COLLECTION,
    })
  : undefined;

const app = createApp({
  graphService,
  usageTracker,
  readinessChecker,
});

const server = app.listen(env.PORT, () => {
  console.log(`[SERVER] SupportIQ API server listening on port ${env.PORT} in '${env.NODE_ENV}' mode`);
  console.log(`[SERVER] Health check ready at http://localhost:${env.PORT}/api/health`);
  console.log(`[SERVER] Demo metadata ready at http://localhost:${env.PORT}/api/demo`);
  console.log(`[SERVER] Chat endpoint ready at http://localhost:${env.PORT}/api/chat`);
});

function handleShutdown(signal: string): void {
  console.log(`[SERVER] Received ${signal}. Closing HTTP listener gracefully...`);

  server.close(async (err) => {
    if (err) {
      console.error('[SERVER] Error while closing HTTP server:', err);
    }
    if (mongoClient) {
      try {
        await mongoClient.close();
        console.log('[SERVER] Closed MongoDB client pool.');
      } catch (clientErr) {
        console.error('[SERVER] Error while closing MongoDB client:', clientErr);
      }
    }
    console.log('[SERVER] Process exiting cleanly.');
    process.exit(err ? 1 : 0);
  });

  const forceTimer = setTimeout(() => {
    console.error('[SERVER] Forcefully terminating process after 10s shutdown timeout.');
    process.exit(1);
  }, 10000);

  forceTimer.unref();
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('uncaughtException', (err: Error) => {
  console.error('[SERVER] Uncaught exception:', err);
  handleShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[SERVER] Unhandled promise rejection:', reason);
  handleShutdown('unhandledRejection');
});
