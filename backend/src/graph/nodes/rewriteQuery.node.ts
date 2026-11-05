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

export function createRewriteQueryNode(deps: RewriteQueryNodeDependencies) {
  return async function rewriteQuery(
    state: SupportIQGraphState,
    config?: RunnableConfig
  ): Promise<Partial<SupportIQGraphState>> {
    if (state.status !== 'pending') {
      return state;
    }

    if (config?.signal?.aborted) {
      return {
        retryCount: state.retryCount + 1,
        status: 'aborted',
        reason: config.signal.reason
          ? String(config.signal.reason)
          : 'Operation aborted by caller.',
      };
    }

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

    const prompt = buildQueryRewritePrompt({
      question: state.question,
      history: state.history,
      assessmentReason: state.evidenceAssessment?.reason,
    });

    const rewriteResult = await deps.llmChatService.rewriteQuery(
      prompt.messages,
      {
        timeoutMs: budget.effectiveTimeoutMs,
        signal: config?.signal,
      }
    );

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
