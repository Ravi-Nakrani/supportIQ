import {
  EvidenceAssessment,
  ILlmChatService,
  LlmAssessmentExecutionResult,
  LlmChatExecutionResult,
  LlmChatRequestOptions,
  LlmRewriteExecutionResult,
  QueryRewriteResult,
  RawLlmAnswer,
} from './types.js';

export interface MockLlmResponder {
  (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmChatExecutionResult> | LlmChatExecutionResult;
}

/**
 * Deterministic in-memory LLM chat service for offline testing.
 * Supports scripted FIFO responses, programmatic responders, and simulated failure states.
 */
export class MockLlmChatService implements ILlmChatService {
  private responseQueue: LlmChatExecutionResult[] = [];
  private assessmentQueue: LlmAssessmentExecutionResult[] = [];
  private rewriteQueue: LlmRewriteExecutionResult[] = [];

  private defaultResponder?: MockLlmResponder | undefined;
  public invocationCount = 0;
  public assessmentInvocationCount = 0;
  public rewriteInvocationCount = 0;

  public lastMessages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | undefined;
  public lastOptions?: LlmChatRequestOptions | undefined;

  /**
   * Enqueues a pre-configured execution result for answer generation.
   */
  enqueueResponse(result: LlmChatExecutionResult): void {
    this.responseQueue.push(result);
  }

  /**
   * Enqueues a successful structured answer response.
   */
  enqueueSuccess(data: RawLlmAnswer): void {
    this.enqueueResponse({
      status: 'SUCCESS',
      data,
      finishReason: 'stop',
    });
  }

  /**
   * Enqueues a pre-configured execution result for evidence assessment.
   */
  enqueueAssessmentResponse(result: LlmAssessmentExecutionResult): void {
    this.assessmentQueue.push(result);
  }

  /**
   * Enqueues a successful evidence assessment response.
   */
  enqueueAssessmentSuccess(data: EvidenceAssessment): void {
    this.enqueueAssessmentResponse({
      status: 'SUCCESS',
      data,
    });
  }

  /**
   * Enqueues a pre-configured execution result for query rewriting.
   */
  enqueueRewriteResponse(result: LlmRewriteExecutionResult): void {
    this.rewriteQueue.push(result);
  }

  /**
   * Enqueues a successful query rewrite response.
   */
  enqueueRewriteSuccess(data: QueryRewriteResult): void {
    this.enqueueRewriteResponse({
      status: 'SUCCESS',
      data,
    });
  }

  /**
   * Sets a fallback responder called when the answer queue is exhausted.
   */
  setDefaultResponder(responder: MockLlmResponder): void {
    this.defaultResponder = responder;
  }

  /**
   * Clears all queued responses and call history.
   */
  reset(): void {
    this.responseQueue = [];
    this.assessmentQueue = [];
    this.rewriteQueue = [];
    this.defaultResponder = undefined;
    this.invocationCount = 0;
    this.assessmentInvocationCount = 0;
    this.rewriteInvocationCount = 0;
    this.lastMessages = undefined;
    this.lastOptions = undefined;
  }

  async generateStructuredAnswer(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmChatExecutionResult> {
    this.invocationCount++;
    this.lastMessages = messages;
    this.lastOptions = options;

    if (options?.signal?.aborted) {
      return {
        status: 'ABORTED',
        reason: options.signal.reason
          ? String(options.signal.reason)
          : 'Operation aborted by caller.',
      };
    }

    if (this.responseQueue.length > 0) {
      const nextResponse = this.responseQueue.shift()!;
      return nextResponse;
    }

    if (this.defaultResponder) {
      return await this.defaultResponder(messages, options);
    }

    // Default safe refusal response if queue is empty
    return {
      status: 'SUCCESS',
      data: {
        answer: "I couldn't find enough information about that in the ShopEase documentation.",
        hasSufficientEvidence: false,
        citations: [],
        suggestedFollowUps: [],
      },
      finishReason: 'stop',
    };
  }

  async assessEvidence(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmAssessmentExecutionResult> {
    this.assessmentInvocationCount++;
    this.lastMessages = messages;
    this.lastOptions = options;

    if (options?.signal?.aborted) {
      return {
        status: 'ABORTED',
        reason: options.signal.reason
          ? String(options.signal.reason)
          : 'Operation aborted by caller.',
      };
    }

    if (this.assessmentQueue.length > 0) {
      return this.assessmentQueue.shift()!;
    }

    // Default assessment: sufficient evidence
    return {
      status: 'SUCCESS',
      data: {
        isSufficient: true,
        reason: 'Default mock assessment evaluated evidence as sufficient.',
      },
    };
  }

  async rewriteQuery(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmRewriteExecutionResult> {
    this.rewriteInvocationCount++;
    this.lastMessages = messages;
    this.lastOptions = options;

    if (options?.signal?.aborted) {
      return {
        status: 'ABORTED',
        reason: options.signal.reason
          ? String(options.signal.reason)
          : 'Operation aborted by caller.',
      };
    }

    if (this.rewriteQueue.length > 0) {
      return this.rewriteQueue.shift()!;
    }

    // Default rewrite: returns original message query
    return {
      status: 'SUCCESS',
      data: {
        rewrittenQuery: 'ShopEase return policy',
        reason: 'Default mock query reformulation.',
      },
    };
  }
}

