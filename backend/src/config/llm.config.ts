import { Env, env as defaultEnv } from './env.js';

export interface LlmConfig {
  openAiApiKey?: string | undefined;
  chatModel: string;
  temperature: number;
  reasoningEffort: 'none' | 'low' | 'medium' | 'high';
  maxOutputTokens: number;
  timeoutMs: number;
  maxRetries: number;
}

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

