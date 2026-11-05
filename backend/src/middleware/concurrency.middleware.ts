import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface ConcurrencyOptions {
  limit: number;
}

export function createConcurrencyLimiter(options: ConcurrencyOptions): {
  middleware: RequestHandler;
  getActiveCount: () => number;
} {
  let activeCount = 0;
  const limit = options.limit;

  const middleware: RequestHandler = (
    _req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    if (activeCount >= limit) {
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message:
            'The assistant service is currently handling maximum concurrent requests. Please try again shortly.',
        },
      });
      return;
    }

    activeCount++;

    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeCount = Math.max(0, activeCount - 1);
      }
    };

    res.once('finish', release);
    res.once('close', release);

    next();
  };

  return {
    middleware,
    getActiveCount: () => activeCount,
  };
}

