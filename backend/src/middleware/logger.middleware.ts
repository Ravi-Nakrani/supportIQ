import type { Request, Response, NextFunction } from 'express';

/**
 * Lightweight structured request logger.
 * Logs method, path, response status, and elapsed duration in milliseconds.
 * Never logs request bodies, sensitive headers, or internal credentials.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = performance.now();

  res.on('finish', () => {
    const elapsedMs = (performance.now() - startTime).toFixed(2);
    const { method, originalUrl } = req;
    const { statusCode } = res;

    // Sanitize path to avoid logging sensitive query parameter values
    const sanitizedPath = originalUrl.split('?')[0] ?? originalUrl;

    console.log(`[HTTP] ${method} ${sanitizedPath} ${statusCode} - ${elapsedMs}ms`);
  });

  next();
}

