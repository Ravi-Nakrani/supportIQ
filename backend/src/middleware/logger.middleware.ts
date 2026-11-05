import type { Request, Response, NextFunction } from 'express';

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = performance.now();

  res.on('finish', () => {
    const elapsedMs = (performance.now() - startTime).toFixed(2);
    const { method, originalUrl } = req;
    const { statusCode } = res;

    const sanitizedPath = originalUrl.split('?')[0] ?? originalUrl;

    console.log(`[HTTP] ${method} ${sanitizedPath} ${statusCode} - ${elapsedMs}ms`);
  });

  next();
}
