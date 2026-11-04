import { app } from './app.js';
import { env } from './config/env.js';

/**
 * Starts the HTTP server listener and configures lifecycle listeners.
 */
const server = app.listen(env.PORT, () => {
  console.log(`[SERVER] SupportIQ API server listening on port ${env.PORT} in '${env.NODE_ENV}' mode`);
  console.log(`[SERVER] Health check ready at http://localhost:${env.PORT}/api/health`);
});

/**
 * Handles graceful process termination.
 */
function handleShutdown(signal: string): void {
  console.log(`[SERVER] Received ${signal}. Closing HTTP listener gracefully...`);

  server.close((err) => {
    if (err) {
      console.error('[SERVER] Error while closing HTTP server:', err);
      process.exit(1);
    }
    console.log('[SERVER] HTTP server closed cleanly. Exiting process.');
    process.exit(0);
  });

  // Force close if connections fail to drain within 10 seconds
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

