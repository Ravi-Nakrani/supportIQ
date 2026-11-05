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

export function createAssessEvidenceNode(deps: AssessEvidenceNodeDependencies) {
  return async function assessEvidence(
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

    if (!state.chunks || state.chunks.length === 0) {
      return {
        evidenceAssessment: {
          isSufficient: false,
          reason: 'Initial retrieval yielded 0 chunks meeting similarity threshold.',
        },
      };
    }

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

    const prompt = buildEvidenceAssessmentPrompt({
      question: state.question,
      chunks: state.chunks,
    });

    const assessmentResult = await deps.llmChatService.assessEvidence(
      prompt.messages,
      {
        timeoutMs: budget.effectiveTimeoutMs,
        signal: config?.signal,
      }
    );

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
