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

  enqueueResponse(result: LlmChatExecutionResult): void {
    this.responseQueue.push(result);
  }

  enqueueSuccess(data: RawLlmAnswer): void {
    this.enqueueResponse({
      status: 'SUCCESS',
      data,
      finishReason: 'stop',
    });
  }

  enqueueAssessmentResponse(result: LlmAssessmentExecutionResult): void {
    this.assessmentQueue.push(result);
  }

  enqueueAssessmentSuccess(data: EvidenceAssessment): void {
    this.enqueueAssessmentResponse({
      status: 'SUCCESS',
      data,
    });
  }

  enqueueRewriteResponse(result: LlmRewriteExecutionResult): void {
    this.rewriteQueue.push(result);
  }

  enqueueRewriteSuccess(data: QueryRewriteResult): void {
    this.enqueueRewriteResponse({
      status: 'SUCCESS',
      data,
    });
  }

  setDefaultResponder(responder: MockLlmResponder): void {
    this.defaultResponder = responder;
  }

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
      if (nextResponse.status === 'SUCCESS' && !nextResponse.usage) {
        nextResponse.usage = { promptTokens: 50, completionTokens: 50, totalTokens: 100 };
      }
      return nextResponse;
    }

    if (this.defaultResponder) {
      return await this.defaultResponder(messages, options);
    }

    return {
      status: 'SUCCESS',
      data: {
        answer: "I couldn't find enough information about that in the ShopEase documentation.",
        hasSufficientEvidence: false,
        citations: [],
        suggestedFollowUps: [],
      },
      finishReason: 'stop',
      usage: { promptTokens: 50, completionTokens: 50, totalTokens: 100 },
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
      const nextAssessment = this.assessmentQueue.shift()!;
      if (nextAssessment.status === 'SUCCESS' && !nextAssessment.usage) {
        nextAssessment.usage = { promptTokens: 40, completionTokens: 10, totalTokens: 50 };
      }
      return nextAssessment;
    }

    return {
      status: 'SUCCESS',
      data: {
        isSufficient: true,
        reason: 'Default mock assessment evaluated evidence as sufficient.',
      },
      usage: { promptTokens: 40, completionTokens: 10, totalTokens: 50 },
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
      const nextRewrite = this.rewriteQueue.shift()!;
      if (nextRewrite.status === 'SUCCESS' && !nextRewrite.usage) {
        nextRewrite.usage = { promptTokens: 30, completionTokens: 15, totalTokens: 45 };
      }
      return nextRewrite;
    }

    return {
      status: 'SUCCESS',
      data: {
        rewrittenQuery: 'ShopEase return policy',
        reason: 'Default mock query reformulation.',
      },
      usage: { promptTokens: 30, completionTokens: 15, totalTokens: 45 },
    };
  }
}

