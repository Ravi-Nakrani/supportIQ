import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';

describe('GET /api/demo (Integration)', () => {
  const app = createApp();

  it('should return 200 OK with branding metadata and suggested questions', async () => {
    const response = await request(app).get('/api/demo');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/application\/json/);

    expect(response.body).toEqual({
      assistantName: 'SupportIQ',
      companyName: 'ShopEase',
      demoNotice: expect.stringContaining('ShopEase customer service documentation'),
      suggestedQuestions: expect.arrayContaining([
        expect.stringContaining('return policy'),
        expect.stringContaining('shipping'),
      ]),
    });

    expect(response.body.suggestedQuestions.length).toBe(5);
  });

  it('should enforce security headers via Helmet on demo route', async () => {
    const response = await request(app).get('/api/demo');

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('should return CORS header matching configured FRONTEND_ORIGIN without credentials', async () => {
    const response = await request(app)
      .get('/api/demo')
      .set('Origin', env.FRONTEND_ORIGIN);

    expect(response.headers['access-control-allow-origin']).toBe(env.FRONTEND_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });
});

