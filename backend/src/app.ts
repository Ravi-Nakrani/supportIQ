import express, { type Application, Request, Response, NextFunction, RequestHandler } from 'express';
import path from 'node:path';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { createHealthRouter } from './routes/health.routes.js';
import { HealthController, defaultHealthController } from './controllers/health.controller.js';
import { IReadinessChecker } from './services/health/readinessChecker.js';
import { demoRouter } from './routes/demo.routes.js';
import { createChatRouter } from './routes/chat.routes.js';
import { ChatController } from './controllers/chat.controller.js';
import { SupportIQGraphService } from './graph/supportiqGraph.js';
import { IUsageTracker } from './services/usage/types.js';
import { InMemoryUsageTracker } from './services/usage/inMemoryUsageTracker.js';
import { createRateLimiter } from './middleware/rateLimit.middleware.js';
import { createConcurrencyLimiter } from './middleware/concurrency.middleware.js';
import { RetrievalService } from './services/rag/retrieval/retrievalService.js';
import { InMemoryVectorStore } from './services/rag/vector-store/inMemoryVectorStore.js';
import { MockEmbeddingService } from './services/rag/embeddings/mockEmbeddingService.js';
import { MockLlmChatService } from './services/rag/generation/mockLlmChatService.js';
import { getVectorConfig } from './config/vector.config.js';

export interface AppDependencies {
  graphService?: SupportIQGraphService | undefined;
  usageTracker?: IUsageTracker | undefined;
  rateLimiter?: RequestHandler | undefined;
  concurrencyLimiter?: RequestHandler | undefined;
  chatController?: ChatController | undefined;
  healthController?: HealthController | undefined;
  readinessChecker?: IReadinessChecker | undefined;
}

/**
 * Express 5 application factory.
 * Decoupled from HTTP listener to allow deterministic Supertest integration testing.
 */
export function createApp(deps?: AppDependencies): Application {
  const app: Application = express();

  // Deliberate trust proxy configuration
  if (env.TRUST_PROXY === 'true') {
    app.set('trust proxy', true);
  } else if (env.TRUST_PROXY === 'false') {
    app.set('trust proxy', false);
  } else if (!Number.isNaN(Number(env.TRUST_PROXY))) {
    app.set('trust proxy', Number(env.TRUST_PROXY));
  } else {
    app.set('trust proxy', env.TRUST_PROXY);
  }

  // Ingress security headers
  app.use(helmet());

  // CORS restricted strictly to configured FRONTEND_ORIGIN (non-credentialed)
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
    })
  );

  // Payload protection: strictly cap JSON bodies at 10kb
  app.use(express.json({ limit: '10kb' }));

  // JSON Body Parser Error Handling Middleware (Payload Too Large & Malformed JSON)
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction): void => {
    if (err && typeof err === 'object') {
      const anyErr = err as { type?: string; status?: number };
      if (anyErr.type === 'entity.too.large' || anyErr.status === 413) {
        res.status(413).json({
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: 'Request payload exceeds maximum allowed size of 10kb.',
            details: null,
          },
        });
        return;
      }
      if (err instanceof SyntaxError && anyErr.status === 400 && 'body' in err) {
        res.status(400).json({
          error: {
            code: 'BAD_REQUEST',
            message: 'Malformed JSON request body.',
            details: null,
          },
        });
        return;
      }
    }
    next(err);
  });

  // Request latency and access logging
  app.use(requestLogger);

  // Health and Demo Routes
  const healthController =
    deps?.healthController ??
    (deps?.readinessChecker ? new HealthController(deps.readinessChecker) : defaultHealthController);
  const healthRouter = createHealthRouter({ healthController });

  app.use('/api/health', healthRouter);
  app.use('/api/demo', demoRouter);

  // Chat Route Resolution
  const rateLimiter =
    deps?.rateLimiter ??
    createRateLimiter({
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
    });

  const concurrencyLimiter =
    deps?.concurrencyLimiter ??
    createConcurrencyLimiter({
      limit: env.CHAT_CONCURRENCY_LIMIT,
    }).middleware;

  let chatController = deps?.chatController;

  if (!chatController) {
    const usageTracker =
      deps?.usageTracker ??
      new InMemoryUsageTracker({
        dailyMaxRequests: env.DAILY_MAX_REQUESTS,
        dailyMaxTokens: env.DAILY_MAX_TOKENS,
        dailyMaxBudgetMicroUsd: env.DAILY_MAX_BUDGET_MICRO_USD,
      });

    const graphService =
      deps?.graphService ??
      new SupportIQGraphService({
        retrievalService: new RetrievalService({
          vectorStore: new InMemoryVectorStore(),
          embeddingService: new MockEmbeddingService(),
          config: getVectorConfig(),
        }),
        llmChatService: new MockLlmChatService(),
      });

    chatController = new ChatController({
      graphService,
      usageTracker,
      chatModel: env.OPENAI_CHAT_MODEL,
      embeddingModel: env.OPENAI_EMBEDDING_MODEL,
    });
  }

  const chatRouter = createChatRouter({
    chatController,
    rateLimiter,
    concurrencyLimiter,
  });

  app.use('/api/chat', chatRouter);

  // Explicit API 404 Guard: Any unmatched /api/* route returns JSON 404 immediately
  // and NEVER falls through to static assets or the SPA HTML fallback.
  app.use('/api', notFoundHandler);

  // Static Assets & SPA Fallback (when SERVE_STATIC_FRONTEND === 'true' and NODE_ENV === 'production')
  if (env.SERVE_STATIC_FRONTEND === 'true' && env.NODE_ENV === 'production') {
    const defaultDistPath = path.resolve(import.meta.dirname, '../../frontend/dist');
    const frontendDistPath = env.FRONTEND_DIST_PATH ? path.resolve(env.FRONTEND_DIST_PATH) : defaultDistPath;

    app.use(express.static(frontendDistPath, { index: false }));
    app.get('*', (_req: Request, res: Response): void => {
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  }

  // Catch unmatched non-API routes (when static serving is disabled or file does not exist)
  app.use(notFoundHandler);

  // Centralized error boundary
  app.use(errorHandler);

  return app;
}

/**
 * Default application instance.
 */
export const app: Application = createApp();
