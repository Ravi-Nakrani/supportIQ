import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

describe('GET /api/health (Integration)', () => {
  const app = createApp();

  it('should return 200 OK with the exact health contract', async () => {
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);

    expect(response.body).toEqual({
      status: 'ok',
      version: '1.0.0',
      timestamp: expect.any(String),
    });

    const parsedTimestamp = Date.parse(response.body.timestamp as string);
    expect(Number.isNaN(parsedTimestamp)).toBe(false);
  });

  it('should enforce security headers via Helmet', async () => {
    const response = await request(app).get('/api/health');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(response.headers['x-download-options']).toBe('noopen');
  });

  it('should return CORS header matching configured FRONTEND_ORIGIN without credentials', async () => {
    const response = await request(app)
      .get('/api/health')
      .set('Origin', env.FRONTEND_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(env.FRONTEND_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

