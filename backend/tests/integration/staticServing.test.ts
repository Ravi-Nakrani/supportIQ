import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import path from 'node:path';
import fs from 'node:fs';
import { createApp } from '../../src/app.js';
import * as envModule from '../../src/config/env.js';

describe('Production Static Serving & Route Order (Integration)', () => {
  it('should ensure unmatched /api/* routes always return JSON 404 and never fall through to static or HTML', async () => {
    const app = createApp();

    const response = await request(app).get('/api/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /api/does-not-exist',
        details: null,
      },
    });
  });

  it('should return 404 JSON for non-API routes when static serving is disabled', async () => {
    const app = createApp();

    const response = await request(app).get('/some-page');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toMatch(/application\/json/);
    expect(response.body).toEqual({
      error: {
        code: 'NOT_FOUND',
        message: 'Cannot GET /some-page',
        details: null,
      },
    });
  });
});

