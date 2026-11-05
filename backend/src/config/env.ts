import dotenv from 'dotenv';
import { z } from 'zod';
import { assertSupportedModels } from './llmPricing.js';

dotenv.config();

export const NODE_ENVS = ['development', 'test', 'production'] as const;

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

  MONGODB_URI: z.string().trim().min(1, 'MONGODB_URI must not be empty').optional(),
  MONGODB_DB_NAME: z.string().trim().min(1).default('supportiq'),
  MONGODB_VECTOR_COLLECTION: z.string().trim().min(1).default('knowledge_chunks'),
  MONGODB_VECTOR_INDEX_NAME: z.string().trim().min(1).default('supportiq_vector_index'),

  OPENAI_API_KEY: z.string().trim().min(1, 'OPENAI_API_KEY must not be empty').optional(),
  OPENAI_EMBEDDING_MODEL: z.string().trim().min(1).default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIMENSIONS: z.coerce
    .number()
    .int('OPENAI_EMBEDDING_DIMENSIONS must be an integer')
    .positive('OPENAI_EMBEDDING_DIMENSIONS must be positive')
    .default(1536),

  RETRIEVAL_DEFAULT_TOP_K: z.coerce
    .number()
    .int('RETRIEVAL_DEFAULT_TOP_K must be an integer')
    .min(1, 'RETRIEVAL_DEFAULT_TOP_K must be at least 1')
    .max(10, 'RETRIEVAL_DEFAULT_TOP_K must be at most 10')
    .default(4),
  RETRIEVAL_MIN_SCORE: z.coerce
    .number()
    .min(0, 'RETRIEVAL_MIN_SCORE must be at least 0.0')
    .max(1, 'RETRIEVAL_MIN_SCORE must be at most 1.0')
    .default(0.65),
  RETRIEVAL_TIMEOUT_MS: z.coerce
    .number()
    .int('RETRIEVAL_TIMEOUT_MS must be an integer')
    .min(100, 'RETRIEVAL_TIMEOUT_MS must be at least 100ms')
    .max(60000, 'RETRIEVAL_TIMEOUT_MS must be at most 60000ms')
    .default(2500),

  OPENAI_CHAT_MODEL: z.string().trim().min(1, 'OPENAI_CHAT_MODEL must not be empty').default('gpt-6-luna'),
  LLM_TEMPERATURE: z.coerce
    .number()
    .min(0, 'LLM_TEMPERATURE must be at least 0.0')
    .max(1, 'LLM_TEMPERATURE must be at most 1.0')
    .default(0.0),
  LLM_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('none'),
  LLM_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int('LLM_MAX_OUTPUT_TOKENS must be an integer')
    .min(50, 'LLM_MAX_OUTPUT_TOKENS must be at least 50')
    .max(4000, 'LLM_MAX_OUTPUT_TOKENS must be at most 4000')
    .default(800),
  LLM_TIMEOUT_MS: z.coerce
    .number()
    .int('LLM_TIMEOUT_MS must be an integer')
    .min(1000, 'LLM_TIMEOUT_MS must be at least 1000ms')
    .max(30000, 'LLM_TIMEOUT_MS must be at most 30000ms')
    .default(6000),
  LLM_MAX_RETRIES: z.coerce
    .number()
    .int('LLM_MAX_RETRIES must be an integer')
    .min(0, 'LLM_MAX_RETRIES must be at least 0')
    .max(3, 'LLM_MAX_RETRIES must be at most 3')
    .default(1),

  MAX_MESSAGE_CHARS: z.coerce
    .number()
    .int('MAX_MESSAGE_CHARS must be an integer')
    .min(10, 'MAX_MESSAGE_CHARS must be at least 10')
    .max(10000, 'MAX_MESSAGE_CHARS must be at most 10000')
    .default(1000),
  MAX_HISTORY_MESSAGES: z.coerce
    .number()
    .int('MAX_HISTORY_MESSAGES must be an integer')
    .min(0, 'MAX_HISTORY_MESSAGES must be at least 0')
    .max(50, 'MAX_HISTORY_MESSAGES must be at most 50')
    .default(6),
  RATE_LIMIT_WINDOW_MS: z.coerce
    .number()
    .int('RATE_LIMIT_WINDOW_MS must be an integer')
    .min(1000, 'RATE_LIMIT_WINDOW_MS must be at least 1000ms')
    .max(3600000, 'RATE_LIMIT_WINDOW_MS must be at most 3600000ms')
    .default(600000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce
    .number()
    .int('RATE_LIMIT_MAX_REQUESTS must be an integer')
    .min(1, 'RATE_LIMIT_MAX_REQUESTS must be at least 1')
    .max(1000, 'RATE_LIMIT_MAX_REQUESTS must be at most 1000')
    .default(10),

  DAILY_MAX_REQUESTS: z.coerce
    .number()
    .int('DAILY_MAX_REQUESTS must be an integer')
    .min(1, 'DAILY_MAX_REQUESTS must be at least 1')
    .default(200),
  DAILY_MAX_TOKENS: z.coerce
    .number()
    .int('DAILY_MAX_TOKENS must be an integer')
    .min(1000, 'DAILY_MAX_TOKENS must be at least 1000')
    .default(200000),
  DAILY_MAX_BUDGET_MICRO_USD: z.coerce
    .number()
    .int('DAILY_MAX_BUDGET_MICRO_USD must be an integer')
    .min(10000, 'DAILY_MAX_BUDGET_MICRO_USD must be at least 10000 μUSD ($0.01)')
    .default(5000000),
  CHAT_CONCURRENCY_LIMIT: z.coerce
    .number()
    .int('CHAT_CONCURRENCY_LIMIT must be an integer')
    .min(1, 'CHAT_CONCURRENCY_LIMIT must be at least 1')
    .max(50, 'CHAT_CONCURRENCY_LIMIT must be at most 50')
    .default(5),
  MONGODB_USAGE_COLLECTION: z.string().trim().min(1).default('daily_usage'),
  TRUST_PROXY: z.string().trim().default('false'),
  SERVE_STATIC_FRONTEND: z.enum(['true', 'false']).default('false'),
  FRONTEND_DIST_PATH: z.string().trim().optional(),
});

export type Env = z.infer<typeof envSchema>;

export interface ValidateEnvOptions {
  exitOnError?: boolean;
}

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

  try {
    assertSupportedModels(result.data.OPENAI_CHAT_MODEL, result.data.OPENAI_EMBEDDING_MODEL);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    if (options.exitOnError) {
      process.exit(1);
    }
    throw new Error(message);
  }

  return Object.freeze(result.data);
}

export const env: Env = validateEnv(process.env);
