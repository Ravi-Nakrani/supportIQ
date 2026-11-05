import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import type { IReadinessChecker } from '../../src/services/health/readinessChecker.js';

describe('GET /api/health (Integration)', () => {
  it('should return 200 OK for standard liveness probe without running readiness checks', async () => {
    const mockReadinessChecker: IReadinessChecker = {
      checkReadiness: vi.fn(),
    };
    const app = createApp({ readinessChecker: mockReadinessChecker });

    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      status: 'ok',
      version: '1.0.0',
      timestamp: expect.any(String),
    });
    expect(mockReadinessChecker.checkReadiness).not.toHaveBeenCalled();
  });

  it('should return 200 OK for readiness probe when dependencies are healthy', async () => {
    const mockReadinessChecker: IReadinessChecker = {
      checkReadiness: vi.fn().mockResolvedValue({
        ready: true,
        status: 'ok',
        timestamp: '2026-11-05T12:00:00.000Z',
        version: '1.0.0',
      }),
    };
    const app = createApp({ readinessChecker: mockReadinessChecker });

    const response = await request(app).get('/api/health?ready=true');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      ready: true,
      timestamp: '2026-11-05T12:00:00.000Z',
      version: '1.0.0',
    });
    expect(mockReadinessChecker.checkReadiness).toHaveBeenCalledTimes(1);
  });

  it('should return 503 Service Unavailable for readiness probe when dependencies are degraded', async () => {
    const mockReadinessChecker: IReadinessChecker = {
      checkReadiness: vi.fn().mockResolvedValue({
        ready: false,
        status: 'degraded',
        timestamp: '2026-11-05T12:00:00.000Z',
        version: '1.0.0',
        reason: 'MongoDB Atlas vector index is BUILDING, not READY',
      }),
    };
    const app = createApp({ readinessChecker: mockReadinessChecker });

    const response = await request(app).get('/api/health?ready=true');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'degraded',
      ready: false,
      timestamp: '2026-11-05T12:00:00.000Z',
      version: '1.0.0',
    });
    // Ensure internal reason is NOT leaked to public client
    expect((response.body as any).reason).toBeUndefined();
    expect((response.body as any).details).toBeUndefined();
  });

  it('should enforce security headers via Helmet', async () => {
    const app = createApp();
    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-download-options']).toBe('noopen');
  });

  it('should return CORS header matching configured FRONTEND_ORIGIN without credentials', async () => {
    const app = createApp();
    const response = await request(app)
      .get('/api/health')
      .set('Origin', env.FRONTEND_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(env.FRONTEND_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('should ensure any unhandled /api/* route returns a structured JSON 404 and never falls through', async () => {
    const app = createApp();
    const response = await request(app).get('/api/unhandled-endpoint');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/unhandled-endpoint',
        details: null,
      },
    });
  });
});
