import { describe, it, expect } from 'vitest';
import { zodResponseFormat } from 'openai/helpers/zod';
import { rawLlmAnswerSchema } from '../../src/services/rag/generation/types.js';
import { MockLlmChatService } from '../../src/services/rag/generation/mockLlmChatService.js';
import { OpenAiChatService } from '../../src/services/rag/generation/openAiChatService.js';

describe('LLM Chat Service & Structured Outputs (Unit)', () => {
  describe('OpenAI json_schema Generation', () => {
    it('should generate strict JSON Schema with required properties, additionalProperties: false, and maxItems: 3', () => {
      const responseFormat = zodResponseFormat(rawLlmAnswerSchema, 'grounded_answer');

      expect(responseFormat.type).toBe('json_schema');
      expect(responseFormat.json_schema.name).toBe('grounded_answer');
      expect(responseFormat.json_schema.strict).toBe(true);

      const schema = responseFormat.json_schema.schema as Record<string, unknown>;
      expect(schema.type).toBe('object');
      expect(schema.additionalProperties).toBe(false);

      const required = schema.required as string[];
      expect(required).toContain('answer');
      expect(required).toContain('hasSufficientEvidence');
      expect(required).toContain('citations');
      expect(required).toContain('suggestedFollowUps');

      const properties = schema.properties as Record<string, any>;
      expect(properties.suggestedFollowUps.type).toBe('array');
      expect(properties.suggestedFollowUps.maxItems).toBe(3);

      expect(properties.citations.type).toBe('array');
      expect(properties.citations.items.type).toBe('object');
      expect(properties.citations.items.additionalProperties).toBe(false);
      expect(properties.citations.items.required).toContain('chunkId');
      expect(properties.citations.items.required).toContain('quote');
    });
  });

  describe('MockLlmChatService', () => {
    it('should return enqueued FIFO responses', async () => {
      const mock = new MockLlmChatService();
      mock.enqueueSuccess({
        answer: 'This is a test response.',
        hasSufficientEvidence: true,
        citations: [{ chunkId: 'chunk-1', quote: 'test quote' }],
        suggestedFollowUps: ['Follow up 1?'],
      });

      const result = await mock.generateStructuredAnswer([
        { role: 'user', content: 'Hello' },
      ]);

      expect(result.status).toBe('SUCCESS');
      expect(result.data?.answer).toBe('This is a test response.');
      expect(mock.invocationCount).toBe(1);
      expect(mock.lastMessages?.[0]?.content).toBe('Hello');
    });

    it('should handle simulated truncation (finish_reason: length)', async () => {
      const mock = new MockLlmChatService();
      mock.enqueueResponse({
        status: 'TRUNCATED',
        finishReason: 'length',
        reason: 'Generation exceeded max_completion_tokens (800) and was truncated.',
      });

      const result = await mock.generateStructuredAnswer([
        { role: 'user', content: 'Long question' },
      ]);

      expect(result.status).toBe('TRUNCATED');
      expect(result.finishReason).toBe('length');
      expect(result.reason).toContain('truncated');
    });

    it('should handle simulated provider refusal', async () => {
      const mock = new MockLlmChatService();
      mock.enqueueResponse({
        status: 'REFUSAL',
        finishReason: 'refusal',
        rawRefusal: 'Content policy violation',
        reason: 'The LLM provider refused to process the request.',
      });

      const result = await mock.generateStructuredAnswer([
        { role: 'user', content: 'Refused prompt' },
      ]);

      expect(result.status).toBe('REFUSAL');
      expect(result.rawRefusal).toBe('Content policy violation');
    });

    it('should handle abort signal when already aborted', async () => {
      const mock = new MockLlmChatService();
      const controller = new AbortController();
      controller.abort(new Error('User cancelled'));

      const result = await mock.generateStructuredAnswer(
        [{ role: 'user', content: 'Prompt' }],
        { signal: controller.signal }
      );

      expect(result.status).toBe('ABORTED');
      expect(result.reason).toContain('User cancelled');
    });
  });

  describe('OpenAiChatService Configuration Assertions', () => {
    it('should throw configuration error if openAiApiKey is missing and no client is provided', () => {
      expect(() => {
        new OpenAiChatService({
          config: {
            openAiApiKey: undefined,
            chatModel: 'gpt-6-luna',
            temperature: 0.0,
            reasoningEffort: 'none',
            maxOutputTokens: 800,
            timeoutMs: 6000,
            maxRetries: 1,
          },
        });
      }).toThrow(/Missing required OPENAI_API_KEY/);
    });
  });
});

