import { Env, env as defaultEnv } from './env.js';

/**
 * Validated LLM and answer generation configuration structure.
 */
export interface LlmConfig {
  openAiApiKey?: string | undefined;
  chatModel: string;
  temperature: number;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

/**
 * Resolves the LLM configuration from the validated environment.
 *
 * @param activeEnv Validated application environment (defaults to singleton `env`).
 * @returns Immutable LlmConfig object.
 */
export function getLlmConfig(activeEnv: Env = defaultEnv): Readonly<LlmConfig> {
  return Object.freeze({
    openAiApiKey: activeEnv.OPENAI_API_KEY,
    chatModel: activeEnv.OPENAI_CHAT_MODEL,
    temperature: activeEnv.LLM_TEMPERATURE,
    reasoningEffort: activeEnv.LLM_REASONING_EFFORT,
    maxOutputTokens: activeEnv.LLM_MAX_OUTPUT_TOKENS,
    timeoutMs: activeEnv.LLM_TIMEOUT_MS,
    maxRetries: activeEnv.LLM_MAX_RETRIES,
  });
}

/**
 * Asserts that the OpenAI API key is configured for live LLM operations.
 * Throws a descriptive configuration error if missing.
 */
export function assertLlmConfig(
  config: LlmConfig
): asserts config is LlmConfig & { openAiApiKey: string } {
  if (!config.openAiApiKey) {
    throw new Error(
      '[CONFIG ERROR] Missing required OPENAI_API_KEY. ' +
        'Please configure OPENAI_API_KEY in your environment or .env file before performing live LLM generation.'
    );
  }
}

