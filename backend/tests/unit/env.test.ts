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
});

