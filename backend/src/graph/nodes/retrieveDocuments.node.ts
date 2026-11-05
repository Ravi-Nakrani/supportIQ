import { RunnableConfig } from '@langchain/core/runnables';
import { RetrievalService } from '../../services/rag/retrieval/retrievalService.js';
import { SupportIQGraphState } from '../state.js';
import { calculateRemainingBudget } from '../timeoutHelper.js';

export const RETRIEVAL_NODE_STANDARD_TIMEOUT_MS = 2500;

export interface RetrieveDocumentsNodeDependencies {
  retrievalService: RetrievalService;
  masterDeadlineMs?: number | undefined;
}

/**
 * Node: retrieveDocuments
 *
 * Executes vector search against the ShopEase knowledge base using the current active query.
 *
 * Defensive Guarantees:
 * 1. Early Guard: If state.status !== 'pending' (e.g. prior rewrite failed/aborted),
 *    returns immediately without performing any retrieval or external service call.
 * 2. True Deadline Enforcement: Dynamically budgets the timeout to min(2.5s, remainingBudget).
 * 3. Signal Propagation: Respects caller cancellation via RunnableConfig.signal.
 */
export function createRetrieveDocumentsNode(deps: RetrieveDocumentsNodeDependencies) {
  return async function retrieveDocuments(
    state: SupportIQGraphState,
    config?: RunnableConfig
  ): Promise<Partial<SupportIQGraphState>> {
    // 1. Early Terminal Guard: do not perform retrieval if status is already non-pending
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
      RETRIEVAL_NODE_STANDARD_TIMEOUT_MS,
      deps.masterDeadlineMs
    );

    if (budget.isExpired) {
      return {
        status: 'timeout',
        reason: 'Master workflow deadline exceeded before retrieval.',
      };
    }

    // 4. Determine Active Query
    const query = (state.currentQuery || state.question || '').trim();
    if (!query) {
      return {
        status: 'error',
        reason: 'Search query is empty.',
      };
    }

    // 5. Invoke Retrieval Service
    const retrievalResult = await deps.retrievalService.retrieveChunks(query, {
      topK: state.topK,
      minScore: state.minScore,
      timeoutMs: budget.effectiveTimeoutMs,
      signal: config?.signal,
    });

    // 6. Map Outcomes
    const usage = retrievalResult.usage;
    const hasValidUsage = Boolean(usage && typeof usage.promptTokens === 'number');
    const embeddingTokens = usage?.promptTokens ?? 0;

    if (retrievalResult.status === 'TIMEOUT') {
      return {
        status: 'timeout',
        reason: retrievalResult.reason ?? 'Retrieval timed out.',
        accumulatedUsage: {
          embeddingTokens,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: embeddingTokens,
          isComplete: false,
        },
      };
    }

    if (retrievalResult.status === 'ABORTED') {
      return {
        status: 'aborted',
        reason: retrievalResult.reason ?? 'Retrieval was aborted.',
        accumulatedUsage: {
          embeddingTokens,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: embeddingTokens,
          isComplete: false,
        },
      };
    }

    if (retrievalResult.status === 'ERROR') {
      return {
        status: 'error',
        reason: retrievalResult.reason ?? 'Retrieval encountered an error.',
        accumulatedUsage: {
          embeddingTokens,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: embeddingTokens,
          isComplete: false,
        },
      };
    }

    if (retrievalResult.status === 'EMPTY_BELOW_THRESHOLD') {
      return {
        chunks: [],
        accumulatedUsage: {
          embeddingTokens,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: embeddingTokens,
          isComplete: hasValidUsage,
        },
      };
    }

    return {
      chunks: retrievalResult.chunks,
      accumulatedUsage: {
        embeddingTokens,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: embeddingTokens,
        isComplete: hasValidUsage,
      },
    };
  };
}
