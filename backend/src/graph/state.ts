import { Annotation } from '@langchain/langgraph';
import { RetrievedChunk } from '../services/rag/retrieval/types.js';
import {
  ConversationMessage,
  EvidenceAssessment,
  GraphExecutionStatus,
  RawLlmAnswer,
  SourceCitation,
  WorkflowUsageMetrics,
} from '../services/rag/generation/types.js';

export const SupportIQGraphAnnotation = Annotation.Root({
  question: Annotation<string>(),
  history: Annotation<ConversationMessage[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  topK: Annotation<number | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  minScore: Annotation<number | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),

  currentQuery: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  retryCount: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  chunks: Annotation<RetrievedChunk[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  evidenceAssessment: Annotation<EvidenceAssessment | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  rawAnswer: Annotation<RawLlmAnswer | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),

  status: Annotation<GraphExecutionStatus>({
    reducer: (_prev, next) => next,
    default: () => 'pending',
  }),
  answer: Annotation<string>({
    reducer: (_prev, next) => next,
    default: () => '',
  }),
  sources: Annotation<SourceCitation[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  suggestedFollowUps: Annotation<string[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  reason: Annotation<string | undefined>({
    reducer: (_prev, next) => next,
    default: () => undefined,
  }),
  startTime: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => Date.now(),
  }),
  executionTimeMs: Annotation<number>({
    reducer: (_prev, next) => next,
    default: () => 0,
  }),
  accumulatedUsage: Annotation<WorkflowUsageMetrics>({
    reducer: (current, update) => {
      const embeddingTokens = current.embeddingTokens + update.embeddingTokens;
      const promptTokens = current.promptTokens + update.promptTokens;
      const completionTokens = current.completionTokens + update.completionTokens;
      return {
        embeddingTokens,
        promptTokens,
        completionTokens,
        totalTokens: embeddingTokens + promptTokens + completionTokens,
        isComplete: current.isComplete && update.isComplete,
      };
    },
    default: () => ({
      embeddingTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      isComplete: true,
    }),
  }),
});

export type SupportIQGraphState = typeof SupportIQGraphAnnotation.State;
