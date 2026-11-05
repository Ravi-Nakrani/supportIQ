import { z } from 'zod';
import OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { LlmConfig, assertLlmConfig } from '../../../config/llm.config.js';
import { estimateChatRequestTokens } from '../../../utils/tokenCounter.js';
import {
  evidenceAssessmentSchema,
  ILlmChatService,
  LlmAssessmentExecutionResult,
  LlmCallUsage,
  LlmChatExecutionResult,
  LlmChatRequestOptions,
  LlmChatStatus,
  LlmRewriteExecutionResult,
  queryRewriteSchema,
  rawLlmAnswerSchema,
} from './types.js';

export interface OpenAiChatServiceOptions {
  config: LlmConfig;
  client?: OpenAI | undefined;
}

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

  private async executeStructuredCall<T>(
    schema: z.ZodType<T>,
    schemaName: string,
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions,
    maxInputTokens?: number
  ): Promise<{
    status: LlmChatStatus;
    data?: T | undefined;
    finishReason?: string | undefined;
    reason?: string | undefined;
    rawRefusal?: string | undefined;
    usage?: LlmCallUsage | undefined;
  }> {
    const timeoutMs = options?.timeoutMs ?? this.config.timeoutMs;
    const maxRetries = options?.maxRetries ?? 0;
    const maxCompletionTokens =
      options?.maxCompletionTokens ?? this.config.maxOutputTokens;

    if (maxInputTokens) {
      const estimatedInputTokens = estimateChatRequestTokens(messages, null, this.config.chatModel);
      if (estimatedInputTokens > maxInputTokens) {
        return {
          status: 'ERROR',
          reason: `Prompt input token estimate exceeds ceiling of ${maxInputTokens} (estimated: ${estimatedInputTokens}).`,
        };
      }
    }

    const requestPayload: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: this.config.chatModel,
      messages,
      max_completion_tokens: maxCompletionTokens,
      response_format: zodResponseFormat(schema, schemaName),
    };

    if (this.config.reasoningEffort === 'none') {
      requestPayload.reasoning_effort = 'none';
      requestPayload.temperature = this.config.temperature;
    } else {
      requestPayload.reasoning_effort = this.config.reasoningEffort;
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

      const usage: LlmCallUsage | undefined = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined;

      const choice = response.choices?.[0];
      if (!choice) {
        return {
          status: 'ERROR',
          reason: 'OpenAI returned an empty response with no choices.',
          usage,
        };
      }

      if (choice.message.refusal) {
        return {
          status: 'REFUSAL',
          finishReason: choice.finish_reason ?? undefined,
          rawRefusal: choice.message.refusal,
          reason: 'The LLM provider refused to process the request.',
          usage,
        };
      }

      if (choice.finish_reason === 'length') {
        return {
          status: 'TRUNCATED',
          finishReason: choice.finish_reason,
          reason: `Generation exceeded max_completion_tokens (${maxCompletionTokens}) and was truncated.`,
          usage,
        };
      }

      if (choice.finish_reason === 'content_filter') {
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: 'LLM provider output was blocked by content filtering.',
          usage,
        };
      }

      const content = choice.message.content;
      if (!content || content.trim().length === 0) {
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: 'LLM provider returned empty message content.',
          usage,
        };
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(content);
      } catch (parseErr) {
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: `Failed to parse structured JSON from model: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`,
          usage,
        };
      }

      const validated = schema.safeParse(parsedJson);
      if (!validated.success) {
        const issues = validated.error.issues
          .map((i) => `${i.path.join('.')}: ${i.message}`)
          .join(', ');
        return {
          status: 'ERROR',
          finishReason: choice.finish_reason,
          reason: `Structured output validation failed: ${issues}`,
          usage,
        };
      }

      return {
        status: 'SUCCESS',
        data: validated.data,
        finishReason: choice.finish_reason,
        usage,
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

  async generateStructuredAnswer(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmChatExecutionResult> {
    return this.executeStructuredCall(
      rawLlmAnswerSchema,
      'grounded_answer',
      messages,
      {
        ...options,
        maxCompletionTokens: options?.maxCompletionTokens ?? this.config.maxOutputTokens,
      },
      3500
    );
  }

  async assessEvidence(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmAssessmentExecutionResult> {
    return this.executeStructuredCall(
      evidenceAssessmentSchema,
      'evidence_assessment',
      messages,
      {
        ...options,
        maxCompletionTokens: options?.maxCompletionTokens ?? 100,
      },
      3000
    );
  }

  async rewriteQuery(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmRewriteExecutionResult> {
    return this.executeStructuredCall(
      queryRewriteSchema,
      'query_rewrite',
      messages,
      {
        ...options,
        maxCompletionTokens: options?.maxCompletionTokens ?? 250,
      },
      2200
    );
  }
}
