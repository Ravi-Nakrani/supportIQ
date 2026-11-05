import { RunnableConfig } from '@langchain/core/runnables';
import { buildQueryRewritePrompt } from '../../prompts/queryRewrite.prompt.js';
import {
  ILlmChatService,
  queryRewriteSchema,
} from '../../services/rag/generation/types.js';
import { SupportIQGraphState } from '../state.js';
import { calculateRemainingBudget } from '../timeoutHelper.js';

export const REWRITE_QUERY_STANDARD_TIMEOUT_MS = 3500;

export interface RewriteQueryNodeDependencies {
  llmChatService: ILlmChatService;
  masterDeadlineMs?: number | undefined;
}

/**
 * Node: rewriteQuery
 *
 * Reformulates the search query when initial retrieval evidence is insufficient or empty.
 *
 * Defensive Guarantees:
 * 1. Strict Schema Validation: Rewritten query must be trimmed, non-empty, and <= 1000 characters.
 * 2. Unhandled/Invalid Protection: If rewriting produces invalid output, sets status: 'error'.
 *    The downstream retrieveDocuments guard prevents any subsequent retrieval.
 * 3. Bounded Iteration: Unconditionally increments retryCount.
 */
export function createRewriteQueryNode(deps: RewriteQueryNodeDependencies) {
  return async function rewriteQuery(
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
        retryCount: state.retryCount + 1,
        status: 'aborted',
        reason: config.signal.reason
          ? String(config.signal.reason)
          : 'Operation aborted by caller.',
      };
    }

    // 3. Dynamic Timeout Budget Calculation
    const budget = calculateRemainingBudget(
      state,
      REWRITE_QUERY_STANDARD_TIMEOUT_MS,
      deps.masterDeadlineMs
    );

    if (budget.isExpired) {
      return {
        retryCount: state.retryCount + 1,
        status: 'timeout',
        reason: 'Master workflow deadline exceeded before query rewrite.',
      };
    }

    // 4. Build Rewrite Prompt
    const prompt = buildQueryRewritePrompt({
      question: state.question,
      history: state.history,
      assessmentReason: state.evidenceAssessment?.reason,
    });

    // 5. Invoke LLM Query Reformulation
    const rewriteResult = await deps.llmChatService.rewriteQuery(
      prompt.messages,
      {
        timeoutMs: budget.effectiveTimeoutMs,
        signal: config?.signal,
      }
    );

    // 6. Map LLM Failure Outcomes
    const usage = rewriteResult.usage;
    const hasValidUsage = Boolean(usage && typeof usage.totalTokens === 'number');
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const totalTokens = promptTokens + completionTokens;

    if (rewriteResult.status === 'TIMEOUT') {
      return {
        retryCount: state.retryCount + 1,
        status: 'timeout',
        reason: rewriteResult.reason ?? 'Query rewrite timed out.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    if (rewriteResult.status === 'ABORTED') {
      return {
        retryCount: state.retryCount + 1,
        status: 'aborted',
        reason: rewriteResult.reason ?? 'Query rewrite was aborted.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    if (rewriteResult.status !== 'SUCCESS' || !rewriteResult.data) {
      return {
        retryCount: state.retryCount + 1,
        status: 'error',
        reason:
          rewriteResult.reason ??
          'Query rewrite failed to produce structured output.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    // 7. Strict Zod Validation Check (trimmed, non-empty, <= 1000 chars)
    const validated = queryRewriteSchema.safeParse(rewriteResult.data);
    if (!validated.success) {
      return {
        retryCount: state.retryCount + 1,
        status: 'error',
        reason: `Query rewrite produced invalid output: ${validated.error.message}`,
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
      retryCount: state.retryCount + 1,
      currentQuery: validated.data.rewrittenQuery,
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
