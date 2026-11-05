import { describe, it, expect, vi } from 'vitest';
import { createRateLimiter } from '../../src/middleware/rateLimit.middleware.js';
import type { Request, Response, NextFunction } from 'express';

describe('Rate Limiter Middleware (Unit)', () => {
  function createMockContext(ip: string = '127.0.0.1') {
    const req = {
      ip,
      socket: { remoteAddress: ip },
    } as unknown as Request;

    const headers: Record<string, unknown> = {};
    let statusCode = 200;
    let jsonBody: unknown = null;

    const res = {
      setHeader: vi.fn((k: string, v: unknown) => {
        headers[k] = v;
      }),
      status: vi.fn((code: number) => {
        statusCode = code;
        return res;
      }),
      json: vi.fn((body: unknown) => {
        jsonBody = body;
        return res;
      }),
    } as unknown as Response;

    const next: NextFunction = vi.fn();

    return { req, res, next, headers, getStatus: () => statusCode, getJson: () => jsonBody };
  }

  it('should allow requests below the configured rate limit', () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      maxRequests: 5,
    });

    const ctx = createMockContext('1.2.3.4');
    limiter(ctx.req, ctx.res, ctx.next);

    expect(ctx.next).toHaveBeenCalled();
    expect(ctx.headers['RateLimit-Limit']).toBe(5);
    expect(ctx.headers['RateLimit-Remaining']).toBe(4);
  });

  it('should block requests exceeding the configured limit with 429 RATE_LIMITED', () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      maxRequests: 2,
    });

    const ctx1 = createMockContext('1.2.3.4');
    limiter(ctx1.req, ctx1.res, ctx1.next);
    expect(ctx1.next).toHaveBeenCalled();

    const ctx2 = createMockContext('1.2.3.4');
    limiter(ctx2.req, ctx2.res, ctx2.next);
    expect(ctx2.next).toHaveBeenCalled();

    const ctx3 = createMockContext('1.2.3.4');
    limiter(ctx3.req, ctx3.res, ctx3.next);

    expect(ctx3.next).not.toHaveBeenCalled();
    expect(ctx3.getStatus()).toBe(429);
    expect(ctx3.getJson()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please wait a few minutes before trying again.',
      },
    });
  });

  it('should isolate limits across different client IP addresses', () => {
    const limiter = createRateLimiter({
      windowMs: 60000,
      maxRequests: 1,
    });

    const ctx1 = createMockContext('10.0.0.1');
    limiter(ctx1.req, ctx1.res, ctx1.next);
    expect(ctx1.next).toHaveBeenCalled();

    const ctx2 = createMockContext('10.0.0.2');
    limiter(ctx2.req, ctx2.res, ctx2.next);
    expect(ctx2.next).toHaveBeenCalled();
  });
});

