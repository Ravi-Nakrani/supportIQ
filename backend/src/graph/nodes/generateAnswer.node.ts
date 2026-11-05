import { RunnableConfig } from '@langchain/core/runnables';
import { buildGroundedPrompt } from '../../prompts/promptBuilder.js';
import {
  ILlmChatService,
  rawLlmAnswerSchema,
} from '../../services/rag/generation/types.js';
import { SupportIQGraphState } from '../state.js';
import { calculateRemainingBudget } from '../timeoutHelper.js';

export const GENERATE_ANSWER_STANDARD_TIMEOUT_MS = 6000;

export interface GenerateAnswerNodeDependencies {
  llmChatService: ILlmChatService;
  masterDeadlineMs?: number | undefined;
}

export function createGenerateAnswerNode(deps: GenerateAnswerNodeDependencies) {
  return async function generateAnswer(
    state: SupportIQGraphState,
    config?: RunnableConfig
  ): Promise<Partial<SupportIQGraphState>> {
    if (state.status !== 'pending') {
      return state;
    }

    if (config?.signal?.aborted) {
      return {
        status: 'aborted',
        reason: config.signal.reason
          ? String(config.signal.reason)
          : 'Operation aborted by caller.',
      };
    }

    const budget = calculateRemainingBudget(
      state,
      GENERATE_ANSWER_STANDARD_TIMEOUT_MS,
      deps.masterDeadlineMs
    );

    if (budget.isExpired) {
      return {
        status: 'timeout',
        reason: 'Master workflow deadline exceeded before answer generation.',
      };
    }

    const prompt = buildGroundedPrompt({
      chunks: state.chunks,
      question: state.question,
      history: state.history,
    });

    const llmResult = await deps.llmChatService.generateStructuredAnswer(
      prompt.messages,
      {
        timeoutMs: budget.effectiveTimeoutMs,
        signal: config?.signal,
      }
    );

    const usage = llmResult.usage;
    const hasValidUsage = Boolean(usage && typeof usage.totalTokens === 'number');
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const totalTokens = promptTokens + completionTokens;

    if (llmResult.status === 'TIMEOUT') {
      return {
        status: 'timeout',
        reason: llmResult.reason ?? 'Answer generation timed out.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    if (llmResult.status === 'ABORTED') {
      return {
        status: 'aborted',
        reason: llmResult.reason ?? 'Answer generation was aborted.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    if (llmResult.status !== 'SUCCESS' || !llmResult.data) {
      return {
        status: 'error',
        reason:
          llmResult.reason ??
          'LLM provider failed to generate structured answer.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    const validated = rawLlmAnswerSchema.safeParse(llmResult.data);
    if (!validated.success) {
      return {
        status: 'error',
        reason: `Structured answer schema validation failed: ${validated.error.message}`,
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    return {
      rawAnswer: validated.data,
      accumulatedUsage: {
        embeddingTokens: 0,
        promptTokens,
        completionTokens,
        totalTokens,
        isComplete: hasValidUsage,
      },
    };
  };
}
