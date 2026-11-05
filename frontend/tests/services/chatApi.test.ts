import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getDemoMetadata,
  sendChatMessage,
  checkBackendReadiness,
  ApiClientError,
} from '../../src/services/chatApi.js';
import type { ChatRequest, ChatResponse, DemoMetadataResponse } from '../../src/types/chat.js';

describe('chatApi Service (Frontend)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('getDemoMetadata', () => {
    it('should successfully fetch and return demo metadata', async () => {
      const mockData: DemoMetadataResponse = {
        assistantName: 'SupportIQ',
        companyName: 'ShopEase',
        demoNotice: 'Synthetic documentation notice',
        suggestedQuestions: ['Question 1', 'Question 2'],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockData,
      } as unknown as Response);

      const result = await getDemoMetadata();
      expect(result).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/demo', expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }));
    });

    it('should parse structured error envelope when request fails', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message: 'Database unavailable.',
          },
        }),
      } as unknown as Response);

      await expect(getDemoMetadata()).rejects.toThrow(ApiClientError);
      try {
        await getDemoMetadata();
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.statusCode).toBe(503);
        expect(apiErr.code).toBe('SERVICE_UNAVAILABLE');
        expect(apiErr.message).toBe('Database unavailable.');
      }
    });

    it('should rethrow AbortError when aborted', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(getDemoMetadata()).rejects.toThrow('The operation was aborted');
    });

    it('should throw NETWORK_ERROR on unexpected network failure', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(getDemoMetadata()).rejects.toThrow(ApiClientError);
      try {
        await getDemoMetadata();
      } catch (err) {
        const apiErr = err as ApiClientError;
        expect(apiErr.code).toBe('NETWORK_ERROR');
        expect(apiErr.statusCode).toBe(0);
      }
    });
  });

  describe('sendChatMessage', () => {
    const request: ChatRequest = {
      message: 'Can I return an item?',
      history: [{ role: 'user', content: 'Hello' }],
    };

    it('should send POST request with JSON payload and return answered response', async () => {
      const mockResponse: ChatResponse = {
        status: 'answered',
        answer: 'You can return it within 30 days.',
        sources: [
          {
            id: 'shopease-returns-policy#defective-products#1',
            title: 'ShopEase Returns Policy',
            section: 'Defective Products',
            excerpt: 'Returned within 30 days for a full refund.',
          },
        ],
        suggestedFollowUps: ['How long does refund take?'],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as unknown as Response);

      const result = await sendChatMessage(request);
      expect(result).toEqual(mockResponse);
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(request),
        signal: undefined,
      });
    });

    it('should handle insufficient_evidence response correctly', async () => {
      const mockResponse: ChatResponse = {
        status: 'insufficient_evidence',
        answer: 'I could not find enough documentation.',
        sources: [],
        suggestedFollowUps: ['What is the return window?'],
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      } as unknown as Response);

      const result = await sendChatMessage(request);
      expect(result.status).toBe('insufficient_evidence');
      expect(result.sources).toEqual([]);
    });

    it('should parse 400 REQUEST_ABORTED error envelope', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: 'REQUEST_ABORTED',
            message: 'The request was cancelled before completion.',
          },
        }),
      } as unknown as Response);

      try {
        await sendChatMessage(request);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.statusCode).toBe(400);
        expect(apiErr.code).toBe('REQUEST_ABORTED');
        expect(apiErr.message).toBe('The request was cancelled before completion.');
      }
    });

    it('should parse 429 RATE_LIMITED and USAGE_LIMIT_EXCEEDED envelopes', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            code: 'USAGE_LIMIT_EXCEEDED',
            message: 'Daily public limit reached.',
          },
        }),
      } as unknown as Response);

      try {
        await sendChatMessage(request);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.statusCode).toBe(429);
        expect(apiErr.code).toBe('USAGE_LIMIT_EXCEEDED');
      }
    });

    it('should parse 503 SERVICE_UNAVAILABLE from concurrency saturation', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            code: 'SERVICE_UNAVAILABLE',
            message:
              'The assistant service is currently handling maximum concurrent requests. Please try again shortly.',
          },
        }),
      } as unknown as Response);

      try {
        await sendChatMessage(request);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.statusCode).toBe(503);
        expect(apiErr.code).toBe('SERVICE_UNAVAILABLE');
      }
    });

    it('should parse 504 GATEWAY_TIMEOUT error envelope', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 504,
        json: async () => ({
          error: {
            code: 'GATEWAY_TIMEOUT',
            message: 'The request timed out while retrieving policy information.',
          },
        }),
      } as unknown as Response);

      try {
        await sendChatMessage(request);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.statusCode).toBe(504);
        expect(apiErr.code).toBe('GATEWAY_TIMEOUT');
      }
    });

    it('should fallback gracefully when error body is not valid JSON', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON at position 0');
        },
      } as unknown as Response);

      try {
        await sendChatMessage(request);
        expect.unreachable('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ApiClientError);
        const apiErr = err as ApiClientError;
        expect(apiErr.statusCode).toBe(502);
        expect(apiErr.code).toBe('INTERNAL_ERROR');
      }
    });

    it('should rethrow AbortError when signal is aborted', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';

      globalThis.fetch = vi.fn().mockRejectedValue(abortError);

      await expect(sendChatMessage(request)).rejects.toThrow('The operation was aborted');
    });
  });

  describe('checkBackendReadiness', () => {
    it('should return true when health probe returns 200 and ready is true', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ status: 'ok', ready: true }),
      } as unknown as Response);

      const isReady = await checkBackendReadiness();
      expect(isReady).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/health?ready=true', expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
      }));
    });

    it('should return false when health probe returns 503 degraded', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ status: 'degraded', ready: false }),
      } as unknown as Response);

      const isReady = await checkBackendReadiness();
      expect(isReady).toBe(false);
    });

    it('should return false when health probe encounters network exception', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      const isReady = await checkBackendReadiness();
      expect(isReady).toBe(false);
    });
  });
});
