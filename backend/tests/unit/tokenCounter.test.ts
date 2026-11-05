import { describe, it, expect } from 'vitest';
import {
  countEmbeddingTokens,
  estimateChatRequestTokens,
  getEncoderForModel,
} from '../../src/utils/tokenCounter.js';

describe('Token Counter Utility (Unit)', () => {
  it('should count tokens for text-embedding-3-small using cl100k_base', () => {
    const tokens = countEmbeddingTokens('How long does standard shipping take?', 'text-embedding-3-small');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(20);
  });

  it('should return 0 for empty embedding query', () => {
    expect(countEmbeddingTokens('', 'text-embedding-3-small')).toBe(0);
  });

  it('should resolve o200k_base encoder for gpt-6-luna', () => {
    const encoder = getEncoderForModel('gpt-6-luna');
    expect(encoder).toBeDefined();
    const encoded = encoder.encode('ShopEase customer policy');
    expect(encoded.length).toBeGreaterThan(0);
  });

  it('should fail closed when resolving encoder for unknown model', () => {
    expect(() => getEncoderForModel('unknown-model')).toThrow(/Unknown or unsupported model encoding/);
  });

  it('should estimate chat request tokens including role framing and buffer', () => {
    const messages = [
      { role: 'system', content: 'You are SupportIQ.' },
      { role: 'user', content: 'What is your return policy?' },
    ];
    const estimate = estimateChatRequestTokens(messages, null, 'gpt-6-luna');

    // Expected: 2 messages * 4 overhead + role tokens + content tokens + 50 buffer
    expect(estimate).toBeGreaterThan(50);
  });

  it('should account for structured output JSON schema in chat token estimate', () => {
    const messages = [{ role: 'user', content: 'Return policy?' }];
    const schema = {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    };

    const estimateWithSchema = estimateChatRequestTokens(messages, schema, 'gpt-6-luna');
    const estimateWithoutSchema = estimateChatRequestTokens(messages, null, 'gpt-6-luna');

    expect(estimateWithSchema).toBeGreaterThan(estimateWithoutSchema);
  });
});

