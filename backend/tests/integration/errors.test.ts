import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';

describe('Error Handling Middleware (Integration)', () => {
  const app = createApp();

  it('should return 404 with standardized error envelope for unmatched routes', async () => {
    const response = await request(app).get('/api/unknown-endpoint');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/unknown-endpoint',
        details: null,
      },
    });
  });

  it('should return 400 with standardized envelope on malformed JSON payload', async () => {
    const response = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{ "malformedJson": ');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: 'BAD_REQUEST',
        message: 'Malformed JSON request body.',
        details: null,
      },
    });
  });
});

