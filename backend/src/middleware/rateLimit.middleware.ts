import { Request, Response, NextFunction, RequestHandler } from 'express';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string | undefined;
}

interface ClientRequestRecord {
  timestamps: number[];
}

/**
 * Creates an in-memory sliding window IP rate limiting middleware.
 *
 * Operational Note:
 * This rate limiter is process-local. In horizontally scaled deployments,
 * rate limits apply per container/worker process.
 */
export function createRateLimiter(options: RateLimitOptions): RequestHandler {
  const windowMs = options.windowMs;
  const maxRequests = options.maxRequests;
  const clientStore = new Map<string, ClientRequestRecord>();

  // Periodic cleanup of stale client IP entries (every 60s)
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of clientStore.entries()) {
      record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);
      if (record.timestamps.length === 0) {
        clientStore.delete(ip);
      }
    }
  }, 60000);

  // Unref timer so it doesn't prevent Node process termination
  cleanupTimer.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // Resolve client IP (Express req.ip respects configured trust proxy)
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();

    let record = clientStore.get(clientIp);
    if (!record) {
      record = { timestamps: [] };
      clientStore.set(clientIp, record);
    }

    // Filter out timestamps outside the sliding window
    record.timestamps = record.timestamps.filter((ts) => now - ts < windowMs);

    const currentCount = record.timestamps.length;
    const remaining = Math.max(0, maxRequests - currentCount - 1);
    const oldestTimestamp = record.timestamps[0] ?? now;
    const resetTimeSeconds = Math.ceil((oldestTimestamp + windowMs - now) / 1000);

    // Standard rate limit headers
    res.setHeader('RateLimit-Limit', maxRequests);
    res.setHeader('RateLimit-Remaining', remaining);
    res.setHeader('RateLimit-Reset', resetTimeSeconds);

    if (currentCount >= maxRequests) {
      res.setHeader('Retry-After', resetTimeSeconds);
      res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message:
            options.message ??
            'Too many requests. Please wait a few minutes before trying again.',
        },
      });
      return;
    }

    // Record request timestamp
    record.timestamps.push(now);
    next();
  };
}

