import express, { type Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { requestLogger } from './middleware/logger.middleware.js';
import { notFoundHandler, errorHandler } from './middleware/error.middleware.js';
import { healthRouter } from './routes/health.routes.js';

/**
 * Express 5 application factory.
 * Decoupled from HTTP listener to allow deterministic Supertest integration testing.
 */
export function createApp(): Application {
  const app: Application = express();

  // Ingress security headers
  app.use(helmet());

  // CORS restricted strictly to the configured FRONTEND_ORIGIN (non-credentialed)
  app.use(
    cors({
      origin: env.FRONTEND_ORIGIN,
    })
  );

  // Payload protection: strictly cap JSON bodies at 10kb
  app.use(express.json({ limit: '10kb' }));

  // Request latency and access logging
  app.use(requestLogger);

  // API Routes
  app.use('/api/health', healthRouter);

  // Catch unmatched routes (404 Not Found)
  app.use(notFoundHandler);

  // Centralized error boundary
  app.use(errorHandler);

  return app;
}

/**
 * Default application instance.
 */
export const app: Application = createApp();

