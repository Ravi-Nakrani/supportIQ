import { describe, it, expect } from 'vitest';
import { validateEnv } from '../../src/config/env.js';

describe('Environment Configuration Validation (Unit)', () => {
  it('should resolve default values when provided an empty environment', () => {
    const config = validateEnv({}, { exitOnError: false });

    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(4000);
    expect(config.FRONTEND_ORIGIN).toBe('http://localhost:5173');
  });

  it('should coerce string PORT into an integer', () => {
    const config = validateEnv({ PORT: '5050' }, { exitOnError: false });

    expect(config.PORT).toBe(5050);
    expect(typeof config.PORT).toBe('number');
  });

  it('should accept valid production configurations', () => {
    const config = validateEnv(
      {
        NODE_ENV: 'production',
        PORT: '8080',
        FRONTEND_ORIGIN: 'https://supportiq.shopease.com',
      },
      { exitOnError: false }
    );

    expect(config.NODE_ENV).toBe('production');
    expect(config.PORT).toBe(8080);
    expect(config.FRONTEND_ORIGIN).toBe('https://supportiq.shopease.com');
  });

  it('should accept test NODE_ENV', () => {
    const config = validateEnv({ NODE_ENV: 'test' }, { exitOnError: false });

    expect(config.NODE_ENV).toBe('test');
  });

  it('should reject PORT values below 1024', () => {
    expect(() => validateEnv({ PORT: '80' }, { exitOnError: false })).toThrow(
      /PORT must be at least 1024/
    );
  });

  it('should reject PORT values above 65535', () => {
    expect(() => validateEnv({ PORT: '70000' }, { exitOnError: false })).toThrow(
      /PORT must be at most 65535/
    );
  });

  it('should reject non-integer PORT values', () => {
    expect(() => validateEnv({ PORT: '3000.5' }, { exitOnError: false })).toThrow(
      /PORT must be an integer/
    );
  });

  it('should reject malformed FRONTEND_ORIGIN URLs', () => {
    expect(() =>
      validateEnv({ FRONTEND_ORIGIN: 'not-a-valid-url' }, { exitOnError: false })
    ).toThrow(/FRONTEND_ORIGIN must be a valid URL/);
  });

  it('should reject unsupported NODE_ENV values', () => {
    expect(() => validateEnv({ NODE_ENV: 'staging' }, { exitOnError: false })).toThrow(
      /Invalid environment configuration/
    );
  });

  it('should return a frozen, immutable configuration object', () => {
    const config = validateEnv({}, { exitOnError: false });

    expect(Object.isFrozen(config)).toBe(true);
  });

  describe('Phase 4 LLM Configuration (Unit)', () => {
    it('should resolve default Phase 4 LLM configuration values', () => {
      const config = validateEnv({}, { exitOnError: false });

      expect(config.OPENAI_CHAT_MODEL).toBe('gpt-6-luna');
      expect(config.LLM_TEMPERATURE).toBe(0.0);
      expect(config.LLM_REASONING_EFFORT).toBe('none');
      expect(config.LLM_MAX_OUTPUT_TOKENS).toBe(800);
      expect(config.LLM_TIMEOUT_MS).toBe(6000);
      expect(config.LLM_MAX_RETRIES).toBe(1);
    });

    it('should accept valid custom Phase 4 LLM values', () => {
      const config = validateEnv(
        {
          OPENAI_CHAT_MODEL: 'custom-model-id',
          LLM_TEMPERATURE: '0.5',
          LLM_REASONING_EFFORT: 'low',
          LLM_MAX_OUTPUT_TOKENS: '1200',
          LLM_TIMEOUT_MS: '8000',
          LLM_MAX_RETRIES: '2',
        },
        { exitOnError: false }
      );

      expect(config.OPENAI_CHAT_MODEL).toBe('custom-model-id');
      expect(config.LLM_TEMPERATURE).toBe(0.5);
      expect(config.LLM_REASONING_EFFORT).toBe('low');
      expect(config.LLM_MAX_OUTPUT_TOKENS).toBe(1200);
      expect(config.LLM_TIMEOUT_MS).toBe(8000);
      expect(config.LLM_MAX_RETRIES).toBe(2);
    });

    it('should reject invalid LLM_TEMPERATURE values outside 0 to 1', () => {
      expect(() =>
        validateEnv({ LLM_TEMPERATURE: '1.5' }, { exitOnError: false })
      ).toThrow(/LLM_TEMPERATURE must be at most 1.0/);

      expect(() =>
        validateEnv({ LLM_TEMPERATURE: '-0.1' }, { exitOnError: false })
      ).toThrow(/LLM_TEMPERATURE must be at least 0.0/);
    });

    it('should reject invalid LLM_REASONING_EFFORT values', () => {
      expect(() =>
        validateEnv({ LLM_REASONING_EFFORT: 'extreme' }, { exitOnError: false })
      ).toThrow(/Invalid option/);
    });

    it('should reject LLM_MAX_OUTPUT_TOKENS below 50 or above 4000', () => {
      expect(() =>
        validateEnv({ LLM_MAX_OUTPUT_TOKENS: '20' }, { exitOnError: false })
      ).toThrow(/LLM_MAX_OUTPUT_TOKENS must be at least 50/);

      expect(() =>
        validateEnv({ LLM_MAX_OUTPUT_TOKENS: '5000' }, { exitOnError: false })
      ).toThrow(/LLM_MAX_OUTPUT_TOKENS must be at most 4000/);
    });

    it('should reject LLM_TIMEOUT_MS below 1000ms or above 30000ms', () => {
      expect(() =>
        validateEnv({ LLM_TIMEOUT_MS: '500' }, { exitOnError: false })
      ).toThrow(/LLM_TIMEOUT_MS must be at least 1000ms/);

      expect(() =>
        validateEnv({ LLM_TIMEOUT_MS: '40000' }, { exitOnError: false })
      ).toThrow(/LLM_TIMEOUT_MS must be at most 30000ms/);
    });
  });
});

