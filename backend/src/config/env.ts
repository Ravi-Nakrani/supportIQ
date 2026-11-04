import dotenv from 'dotenv';
import { z } from 'zod';

// Load variables from .env file into process.env if present
dotenv.config();

/**
 * Valid environment stages for the backend runtime.
 */
export const NODE_ENVS = ['development', 'test', 'production'] as const;

/**
 * Zod schema validating backend environment variables.
 * In Phase 1A, only core server runtime variables are required.
 * Additional integrations (MongoDB, OpenAI) will be added in their respective phases.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  PORT: z.coerce
    .number()
    .int('PORT must be an integer')
    .min(1024, 'PORT must be at least 1024')
    .max(65535, 'PORT must be at most 65535')
    .default(4000),
  FRONTEND_ORIGIN: z
    .string()
    .url('FRONTEND_ORIGIN must be a valid URL')
    .default('http://localhost:5173'),
});

export type Env = z.infer<typeof envSchema>;

export interface ValidateEnvOptions {
  exitOnError?: boolean;
}

/**
 * Validates environment variables against envSchema.
 * Formats validation issues clearly without leaking sensitive values.
 */
export function validateEnv(
  rawEnv: Record<string, string | undefined> = process.env,
  options: ValidateEnvOptions = { exitOnError: true }
): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => ` - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(`[CONFIG ERROR] Invalid environment configuration:\n${errorDetails}`);

    if (options.exitOnError) {
      process.exit(1);
    }

    throw new Error(`Invalid environment configuration:\n${errorDetails}`);
  }

  return Object.freeze(result.data);
}

/**
 * Active application environment configuration.
 * Validated at startup; immutable throughout runtime.
 */
export const env: Env = validateEnv(process.env);
