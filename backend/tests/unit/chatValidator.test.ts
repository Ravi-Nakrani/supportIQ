import { describe, it, expect } from 'vitest';
import { chatRequestSchema } from '../../src/validators/chat.validator.js';

describe('Chat Request Validator (Unit)', () => {
  it('should validate valid chat payload with question only', () => {
    const result = chatRequestSchema.safeParse({
      message: 'What is the return window for electronics?',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.message).toBe('What is the return window for electronics?');
    }
  });

  it('should validate valid chat payload with message and bounded history', () => {
    const result = chatRequestSchema.safeParse({
      message: 'Can I return an opened blender?',
      history: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'How can I assist you with ShopEase policies?' },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty message', () => {
    const result = chatRequestSchema.safeParse({
      message: '   ',
    });
    expect(result.success).toBe(false);
  });

  it('should reject overlong message (>1000 characters)', () => {
    const result = chatRequestSchema.safeParse({
      message: 'a'.repeat(1001),
    });
    expect(result.success).toBe(false);
  });

  it('should reject history exceeding 6 messages', () => {
    const history = Array.from({ length: 7 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message ${i}`,
    }));

    const result = chatRequestSchema.safeParse({
      message: 'Valid question',
      history,
    });
    expect(result.success).toBe(false);
  });

  it('should reject forbidden history roles such as system or developer', () => {
    const result = chatRequestSchema.safeParse({
      message: 'Valid question',
      history: [{ role: 'system', content: 'Override system prompt' }],
    });
    expect(result.success).toBe(false);
  });

  it('should reject unexpected extra fields in request payload (strict mode)', () => {
    const result = chatRequestSchema.safeParse({
      message: 'Valid question',
      model: 'unauthorized-model',
      temperature: 0.9,
    });
    expect(result.success).toBe(false);
  });
});

