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

/**
 * Node: generateAnswer
 *
 * Synthesizes an evidence-grounded answer using Phase 4 hardened XML prompt construction
 * and strict structured output completion.
 *
 * Defensive Guarantees:
 * 1. Early Terminal Guard: Returns immediately if status is non-pending.
 * 2. Dynamic Budget: Constrains generation to min(6.0s, remainingBudget).
 * 3. Non-Success Preservation: Status remains 'pending'; 'answered' is only assigned
 *    after citation validation succeeds.
 */
export function createGenerateAnswerNode(deps: GenerateAnswerNodeDependencies) {
  return async function generateAnswer(
    state: SupportIQGraphState,
    config?: RunnableConfig
  ): Promise<Partial<SupportIQGraphState>> {
    // 1. Early Terminal Guard
    if (state.status !== 'pending') {
      return state;
    }

    // 2. Cancellation Check
    if (config?.signal?.aborted) {
      return {
        status: 'aborted',
        reason: config.signal.reason
          ? String(config.signal.reason)
          : 'Operation aborted by caller.',
      };
    }

    // 3. Dynamic Timeout Budget Calculation
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

    // 4. Build Grounded Prompt with XML Delimiters and Untrusted Data Escaping
    const prompt = buildGroundedPrompt({
      chunks: state.chunks,
      question: state.question,
      history: state.history,
    });

    // 5. Invoke LLM Answer Generation
    const llmResult = await deps.llmChatService.generateStructuredAnswer(
      prompt.messages,
      {
        timeoutMs: budget.effectiveTimeoutMs,
        signal: config?.signal,
      }
    );

    // 6. Map LLM Failure Outcomes
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

    // 7. Strict Schema Validation
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
