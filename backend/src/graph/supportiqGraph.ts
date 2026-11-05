import { StateGraph, START, END } from '@langchain/langgraph';
import { RetrievalService } from '../services/rag/retrieval/retrievalService.js';
import { CitationValidator } from '../services/rag/generation/citationValidator.js';
import {
  DEFAULT_SUGGESTED_QUESTIONS,
  GroundedAnswerRequest,
  GroundedAnswerResult,
  ILlmChatService,
  STANDARD_ABORTED_ANSWER,
  STANDARD_REFUSAL_ANSWER,
  STANDARD_TECHNICAL_ERROR_ANSWER,
  STANDARD_TIMEOUT_ANSWER,
} from '../services/rag/generation/types.js';
import { SupportIQGraphAnnotation } from './state.js';
import { WORKFLOW_MASTER_DEADLINE_MS } from './timeoutHelper.js';
import { createRetrieveDocumentsNode } from './nodes/retrieveDocuments.node.js';
import { createAssessEvidenceNode } from './nodes/assessEvidence.node.js';
import { createRewriteQueryNode } from './nodes/rewriteQuery.node.js';
import { createGenerateAnswerNode } from './nodes/generateAnswer.node.js';
import { createValidateCitationsNode } from './nodes/validateCitations.node.js';
import { returnInsufficientEvidence } from './nodes/returnInsufficientEvidence.node.js';
import {
  routeAfterAssessment,
  routeAfterGeneration,
  routeAfterRewrite,
} from './routes.js';

export interface SupportIQGraphDependencies {
  retrievalService: RetrievalService;
  llmChatService: ILlmChatService;
  citationValidator?: CitationValidator | undefined;
  masterDeadlineMs?: number;
}

export function createSupportIQGraph(deps: SupportIQGraphDependencies) {
  const retrieveDocuments = createRetrieveDocumentsNode({
    retrievalService: deps.retrievalService,
    masterDeadlineMs: deps.masterDeadlineMs,
  });

  const assessEvidence = createAssessEvidenceNode({
    llmChatService: deps.llmChatService,
    masterDeadlineMs: deps.masterDeadlineMs,
  });

  const rewriteQuery = createRewriteQueryNode({
    llmChatService: deps.llmChatService,
    masterDeadlineMs: deps.masterDeadlineMs,
  });

  const generateAnswer = createGenerateAnswerNode({
    llmChatService: deps.llmChatService,
    masterDeadlineMs: deps.masterDeadlineMs,
  });

  const validateCitations = createValidateCitationsNode({
    citationValidator: deps.citationValidator,
  });

  const workflow = new StateGraph(SupportIQGraphAnnotation)
    .addNode('retrieveDocuments', retrieveDocuments)
    .addNode('assessEvidence', assessEvidence)
    .addNode('rewriteQuery', rewriteQuery)
    .addNode('generateAnswer', generateAnswer)
    .addNode('validateCitations', validateCitations)
    .addNode('returnInsufficientEvidence', returnInsufficientEvidence)

    .addEdge(START, 'retrieveDocuments')
    .addEdge('retrieveDocuments', 'assessEvidence')
    .addEdge('validateCitations', END)
    .addEdge('returnInsufficientEvidence', END)

    .addConditionalEdges('assessEvidence', routeAfterAssessment, {
      generateAnswer: 'generateAnswer',
      rewriteQuery: 'rewriteQuery',
      returnInsufficientEvidence: 'returnInsufficientEvidence',
      __end__: END,
    })
    .addConditionalEdges('rewriteQuery', routeAfterRewrite, {
      retrieveDocuments: 'retrieveDocuments',
      __end__: END,
    })
    .addConditionalEdges('generateAnswer', routeAfterGeneration, {
      validateCitations: 'validateCitations',
      returnInsufficientEvidence: 'returnInsufficientEvidence',
      __end__: END,
    });

  return workflow.compile();
}

export class SupportIQGraphService {
  private readonly compiledGraph: ReturnType<typeof createSupportIQGraph>;
  private readonly masterDeadlineMs: number;

  constructor(dependencies: SupportIQGraphDependencies) {
    this.masterDeadlineMs =
      dependencies.masterDeadlineMs ?? WORKFLOW_MASTER_DEADLINE_MS;
    this.compiledGraph = createSupportIQGraph(dependencies);
  }

  async execute(request: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    const startTime = Date.now();
    const deadlineMs = request.timeoutMs
      ? Math.min(request.timeoutMs, this.masterDeadlineMs)
      : this.masterDeadlineMs;

    const question = request.question?.trim();
    if (!question) {
      return {
        status: 'error',
        answer: STANDARD_TECHNICAL_ERROR_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: 'User question must be a non-empty string.',
        executionTimeMs: 0,
      };
    }

    const callerSignal = request.signal;
    if (callerSignal?.aborted) {
      return {
        status: 'aborted',
        answer: STANDARD_ABORTED_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: callerSignal.reason
          ? String(callerSignal.reason)
          : 'Operation was aborted by caller prior to execution.',
        executionTimeMs: 0,
      };
    }

    let timer: NodeJS.Timeout | undefined;
    const timeoutController = new AbortController();

    try {
      timer = setTimeout(() => {
        timeoutController.abort('WORKFLOW_MASTER_DEADLINE_EXCEEDED');
      }, deadlineMs);

      const combinedSignal = callerSignal
        ? AbortSignal.any([callerSignal, timeoutController.signal])
        : timeoutController.signal;

      const finalState = await this.compiledGraph.invoke(
        {
          question,
          history: request.history ?? [],
          currentQuery: question,
          topK: request.topK,
          minScore: request.minScore,
          startTime,
        },
        {
          recursionLimit: 10,
          signal: combinedSignal,
        }
      );

      const totalElapsedMs = Date.now() - startTime;
      if (timeoutController.signal.aborted || totalElapsedMs >= deadlineMs || finalState.status === 'timeout') {
        return {
          status: 'timeout',
          answer: STANDARD_TIMEOUT_ANSWER,
          sources: [],
          suggestedFollowUps: [],
          reason: finalState.reason ?? 'Master workflow deadline exceeded (20s).',
          executionTimeMs: totalElapsedMs,
          usage: finalState.accumulatedUsage,
        };
      }

      if (callerSignal?.aborted || finalState.status === 'aborted') {
        return {
          status: 'aborted',
          answer: STANDARD_ABORTED_ANSWER,
          sources: [],
          suggestedFollowUps: [],
          reason: finalState.reason ?? (callerSignal?.reason ? String(callerSignal.reason) : 'Operation aborted by caller.'),
          executionTimeMs: totalElapsedMs,
          usage: finalState.accumulatedUsage,
        };
      }

      if (finalState.status === 'error') {
        return {
          status: 'error',
          answer: STANDARD_TECHNICAL_ERROR_ANSWER,
          sources: [],
          suggestedFollowUps: [],
          reason: finalState.reason ?? 'Internal workflow error occurred.',
          executionTimeMs: totalElapsedMs,
          usage: finalState.accumulatedUsage,
        };
      }

      if (finalState.status === 'insufficient_evidence') {
        return {
          status: 'insufficient_evidence',
          answer: STANDARD_REFUSAL_ANSWER,
          sources: [],
          suggestedFollowUps:
            finalState.suggestedFollowUps && finalState.suggestedFollowUps.length > 0
              ? finalState.suggestedFollowUps
              : DEFAULT_SUGGESTED_QUESTIONS,
          reason: finalState.reason,
          executionTimeMs: totalElapsedMs,
          usage: finalState.accumulatedUsage,
        };
      }

      if (finalState.status === 'answered') {
        return {
          status: 'answered',
          answer: finalState.answer,
          sources: finalState.sources,
          suggestedFollowUps: finalState.suggestedFollowUps,
          executionTimeMs: totalElapsedMs,
          usage: finalState.accumulatedUsage,
        };
      }

      return {
        status: 'error',
        answer: STANDARD_TECHNICAL_ERROR_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: `Graph completed in unexpected non-terminal state: "${finalState.status}".`,
        executionTimeMs: totalElapsedMs,
        usage: finalState.accumulatedUsage,
      };
    } catch (err: unknown) {
      const totalElapsedMs = Date.now() - startTime;

      if (timeoutController.signal.aborted || totalElapsedMs >= deadlineMs) {
        return {
          status: 'timeout',
          answer: STANDARD_TIMEOUT_ANSWER,
          sources: [],
          suggestedFollowUps: [],
          reason: 'Master workflow deadline exceeded (20s).',
          executionTimeMs: totalElapsedMs,
        };
      }

      if (callerSignal?.aborted) {
        return {
          status: 'aborted',
          answer: STANDARD_ABORTED_ANSWER,
          sources: [],
          suggestedFollowUps: [],
          reason: callerSignal.reason ? String(callerSignal.reason) : 'Operation aborted by caller.',
          executionTimeMs: totalElapsedMs,
        };
      }

      return {
        status: 'error',
        answer: STANDARD_TECHNICAL_ERROR_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: err instanceof Error ? err.message : String(err),
        executionTimeMs: totalElapsedMs,
      };
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
