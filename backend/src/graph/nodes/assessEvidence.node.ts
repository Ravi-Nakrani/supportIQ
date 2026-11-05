import { RunnableConfig } from '@langchain/core/runnables';
import { buildEvidenceAssessmentPrompt } from '../../prompts/evidenceAssessment.prompt.js';
import {
  evidenceAssessmentSchema,
  ILlmChatService,
} from '../../services/rag/generation/types.js';
import { SupportIQGraphState } from '../state.js';
import { calculateRemainingBudget } from '../timeoutHelper.js';

export const ASSESS_EVIDENCE_STANDARD_TIMEOUT_MS = 4000;

export interface AssessEvidenceNodeDependencies {
  llmChatService: ILlmChatService;
  masterDeadlineMs?: number | undefined;
}

/**
 * Node: assessEvidence
 *
 * Evaluates whether retrieved document chunks contain sufficient factual evidence
 * to answer the customer's question.
 *
 * Defensive Guarantees:
 * 1. Fast Short-Circuit: If state.chunks is empty, skips the LLM call entirely
 *    and sets isSufficient: false immediately.
 * 2. Strict Zod Validation: Validates structured assessment data before updating state.
 * 3. Dynamic Budget: Limits LLM execution to min(4.0s, remainingBudget).
 */
export function createAssessEvidenceNode(deps: AssessEvidenceNodeDependencies) {
  return async function assessEvidence(
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

    // 3. Fast Short-Circuit on Empty Chunks (Zero LLM Tokens / Latency)
    if (!state.chunks || state.chunks.length === 0) {
      return {
        evidenceAssessment: {
          isSufficient: false,
          reason: 'Initial retrieval yielded 0 chunks meeting similarity threshold.',
        },
      };
    }

    // 4. Dynamic Timeout Budget Calculation
    const budget = calculateRemainingBudget(
      state,
      ASSESS_EVIDENCE_STANDARD_TIMEOUT_MS,
      deps.masterDeadlineMs
    );

    if (budget.isExpired) {
      return {
        status: 'timeout',
        reason: 'Master workflow deadline exceeded before evidence assessment.',
      };
    }

    // 5. Build Assessment Prompt
    const prompt = buildEvidenceAssessmentPrompt({
      question: state.question,
      chunks: state.chunks,
    });

    // 6. Invoke LLM Assessment
    const assessmentResult = await deps.llmChatService.assessEvidence(
      prompt.messages,
      {
        timeoutMs: budget.effectiveTimeoutMs,
        signal: config?.signal,
      }
    );

    // 7. Map LLM Failure Outcomes
    const usage = assessmentResult.usage;
    const hasValidUsage = Boolean(usage && typeof usage.totalTokens === 'number');
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const totalTokens = promptTokens + completionTokens;

    if (assessmentResult.status === 'TIMEOUT') {
      return {
        status: 'timeout',
        reason: assessmentResult.reason ?? 'Evidence assessment timed out.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    if (assessmentResult.status === 'ABORTED') {
      return {
        status: 'aborted',
        reason: assessmentResult.reason ?? 'Evidence assessment was aborted.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    if (assessmentResult.status !== 'SUCCESS' || !assessmentResult.data) {
      return {
        status: 'error',
        reason:
          assessmentResult.reason ??
          'Evidence assessment failed to produce structured output.',
        accumulatedUsage: {
          embeddingTokens: 0,
          promptTokens,
          completionTokens,
          totalTokens,
          isComplete: false,
        },
      };
    }

    // 8. Strict Zod Validation Check
    const validated = evidenceAssessmentSchema.safeParse(assessmentResult.data);
    if (!validated.success) {
      return {
        status: 'error',
        reason: `Evidence assessment produced malformed data: ${validated.error.message}`,
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
      evidenceAssessment: validated.data,
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
