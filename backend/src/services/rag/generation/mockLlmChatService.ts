import {
  ILlmChatService,
  LlmChatExecutionResult,
  LlmChatRequestOptions,
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
  private defaultResponder?: MockLlmResponder | undefined;
  public invocationCount = 0;
  public lastMessages?: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> | undefined;
  public lastOptions?: LlmChatRequestOptions | undefined;

  /**
   * Enqueues a pre-configured execution result.
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
   * Sets a fallback responder called when the queue is exhausted.
   */
  setDefaultResponder(responder: MockLlmResponder): void {
    this.defaultResponder = responder;
  }

  /**
   * Clears all queued responses and call history.
   */
  reset(): void {
    this.responseQueue = [];
    this.defaultResponder = undefined;
    this.invocationCount = 0;
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
}

