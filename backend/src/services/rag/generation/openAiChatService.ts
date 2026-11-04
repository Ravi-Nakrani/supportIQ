import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { LlmConfig, assertLlmConfig } from '../../../config/llm.config.js';
import {
  ILlmChatService,
  LlmChatExecutionResult,
  LlmChatRequestOptions,
  rawLlmAnswerSchema,
} from './types.js';

export interface OpenAiChatServiceOptions {
  config: LlmConfig;
  client?: OpenAI | undefined;
}

/**
 * Production LLM chat service utilizing the official OpenAI SDK.
 * Uses strict JSON Schema Structured Outputs and handles provider refusals, truncations, and timeouts.
 */
export class OpenAiChatService implements ILlmChatService {
  private readonly config: LlmConfig;
  private readonly client: OpenAI;

  constructor(options: OpenAiChatServiceOptions) {
    this.config = options.config;

    if (options.client) {
      this.client = options.client;
    } else {
      assertLlmConfig(this.config);
      this.client = new OpenAI({
        apiKey: this.config.openAiApiKey,
      });
    }
  }

  /**
   * Generates a structured response strictly conforming to rawLlmAnswerSchema.
   */
  async generateStructuredAnswer(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmChatExecutionResult> {
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const maxRetries = options?.maxRetries ?? this.config.maxRetries;
    const maxCompletionTokens =
      options?.maxCompletionTokens ?? this.config.maxOutputTokens;

    // Build Chat Completion params
    const requestPayload: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: this.config.chatModel,
      messages,
      max_completion_tokens: maxCompletionTokens,
      response_format: zodResponseFormat(rawLlmAnswerSchema, 'grounded_answer'),
    };

    // Configure reasoning effort and temperature
    if (this.config.reasoningEffort === 'none') {
      requestPayload.reasoning_effort = 'none';
      requestPayload.temperature = this.config.temperature;
    } else {
      requestPayload.reasoning_effort = this.config.reasoningEffort;
      // When reasoning_effort is enabled, temperature must be omitted
    }

    const requestOptions: OpenAI.RequestOptions = {
      maxRetries,
      timeout: timeoutMs,
    };
    if (options?.signal) {
      requestOptions.signal = options.signal;
    }

    try {
      const response = await this.client.chat.completions.create(
        requestPayload,
        requestOptions
      );

      const choice = response.choices?.[0];
      if (!choice) {
        return {
          status: 'ERROR',
          reason: 'OpenAI returned an empty response with no choices.',
        };
      }

      // Check provider refusal
      if (choice.message.refusal) {
        return {
          status: 'REFUSAL',
          finishReason: choice.finish_reason ?? undefined,
          rawRefusal: choice.message.refusal,
          reason: 'The LLM provider refused to process the request.',
        };
      }

      // Check token limit truncation
      if (choice.finish_reason === 'length') {
        return {
          status: 'TRUNCATED',
          finishReason: choice.finish_reason,
          reason: `Generation exceeded max_completion_tokens (${maxCompletionTokens}) and was truncated.`,
        };
      }

      // Check content filter
      if (choice.finish_reason === 'content_filter') {
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: 'LLM provider output was blocked by content filtering.',
        };
      }

      // Check content presence
      const content = choice.message.content;
      if (!content || content.trim().length === 0) {
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: 'LLM provider returned empty message content.',
        };
      }

      // Parse and validate strictly against Zod schema
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch (parseErr) {
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: `Failed to parse structured JSON from model: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
        };
      }

      const validated = rawLlmAnswerSchema.safeParse(parsedJson);
      if (!validated.success) {
        const issues = validated.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ');
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: `Structured output validation failed: ${issues}`,
        };
      }

      return {
        status: 'SUCCESS',
        data: validated.data,
        finishReason: choice.finish_reason,
      };
    } catch (err: unknown) {
      if (options?.signal?.aborted) {
        return {
          status: 'ABORTED',
          reason: options.signal.reason
            ? String(options.signal.reason)
            : 'Operation aborted by caller.',
        };
      }

      if (err instanceof OpenAI.APIConnectionTimeoutError) {
        return {
          status: 'TIMEOUT',
          reason: `LLM request timed out after ${timeoutMs}ms.`,
        };
      }

      return {
        status: 'ERROR',
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
