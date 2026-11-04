import { LlmConfig } from '../../../config/llm.config.js';
import { RetrievalService } from '../retrieval/retrievalService.js';
import { buildGroundedPrompt } from '../../../prompts/promptBuilder.js';
import { CitationValidator } from './citationValidator.js';
import {
  DEFAULT_SUGGESTED_QUESTIONS,
  GroundedAnswerRequest,
  GroundedAnswerResult,
  ILlmChatService,
  STANDARD_ABORTED_ANSWER,
  STANDARD_REFUSAL_ANSWER,
  STANDARD_TECHNICAL_ERROR_ANSWER,
  STANDARD_TIMEOUT_ANSWER,
} from './types.js';

export interface RagAnswerServiceDependencies {
  retrievalService: RetrievalService;
  llmChatService: ILlmChatService;
  config: LlmConfig;
  citationValidator?: CitationValidator | undefined;
}

/**
 * End-to-end service orchestrating retrieval, grounded prompt construction,
 * strict structured LLM completion, and programmatic citation validation.
 */
export class RagAnswerService {
  private readonly retrievalService: RetrievalService;
  private readonly llmChatService: ILlmChatService;
  private readonly config: LlmConfig;
  private readonly citationValidator: CitationValidator;

  constructor(dependencies: RagAnswerServiceDependencies) {
    this.retrievalService = dependencies.retrievalService;
    this.llmChatService = dependencies.llmChatService;
    this.config = dependencies.config;
    this.citationValidator = dependencies.citationValidator ?? new CitationValidator();
  }

  /**
   * Generates an evidence-grounded answer for a user question.
   *
   * Accurately distinguishes and reports domain outcomes:
   * - 'answered': Grounded answer synthesized and verified against retrieved chunks.
   * - 'insufficient_evidence': Missing evidence, below threshold, or uncorroborated answer.
   * - 'timeout': Retrieval or LLM generation deadline exceeded.
   * - 'aborted': Cancelled by caller AbortSignal.
   * - 'error': Infrastructure, provider, or validation error.
   */
  async generateAnswer(request: GroundedAnswerRequest): Promise<GroundedAnswerResult> {
    const startTime = Date.now();

    // 1. Immediate pre-flight signal check
    if (request.signal?.aborted) {
      return {
        status: 'aborted',
        answer: STANDARD_ABORTED_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: request.signal.reason
          ? String(request.signal.reason)
          : 'Operation was aborted by caller prior to execution.',
        executionTimeMs: 0,
      };
    }

    // 2. Validate question input
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

    // 3. Step 1: Semantic Retrieval
    const retrievalResult = await this.retrievalService.retrieveChunks(question, {
      topK: request.topK,
      minScore: request.minScore,
      signal: request.signal,
    });

    // 4. Handle Retrieval Failure / Empty Outcomes
    if (retrievalResult.status === 'EMPTY_BELOW_THRESHOLD') {
      // Fast short-circuit: do not call LLM when no relevant evidence exists
      return {
        status: 'insufficient_evidence',
        answer: STANDARD_REFUSAL_ANSWER,
        sources: [],
        suggestedFollowUps: DEFAULT_SUGGESTED_QUESTIONS,
        reason: retrievalResult.reason,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (retrievalResult.status === 'TIMEOUT') {
      return {
        status: 'timeout',
        answer: STANDARD_TIMEOUT_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: retrievalResult.reason,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (retrievalResult.status === 'ABORTED') {
      return {
        status: 'aborted',
        answer: STANDARD_ABORTED_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: retrievalResult.reason,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (retrievalResult.status === 'ERROR') {
      return {
        status: 'error',
        answer: STANDARD_TECHNICAL_ERROR_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: retrievalResult.reason,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 5. Step 2: Build Grounded Prompt with Hardened XML Escaping
    const prompt = buildGroundedPrompt({
      chunks: retrievalResult.chunks,
      question,
      history: request.history,
    });

    // 6. Step 3: LLM Generation
    const llmResult = await this.llmChatService.generateStructuredAnswer(
      prompt.messages,
      {
        signal: request.signal,
        timeoutMs: request.timeoutMs ?? this.config.timeoutMs,
      }
    );

    // 7. Handle LLM Failure / Truncation / Refusal Outcomes
    if (llmResult.status === 'ABORTED') {
      return {
        status: 'aborted',
        answer: STANDARD_ABORTED_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: llmResult.reason,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (llmResult.status === 'TIMEOUT') {
      return {
        status: 'timeout',
        answer: STANDARD_TIMEOUT_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: llmResult.reason,
        executionTimeMs: Date.now() - startTime,
      };
    }

    if (
      llmResult.status === 'TRUNCATED' ||
      llmResult.status === 'REFUSAL' ||
      llmResult.status === 'ERROR' ||
      !llmResult.data
    ) {
      return {
        status: 'error',
        answer: STANDARD_TECHNICAL_ERROR_ANSWER,
        sources: [],
        suggestedFollowUps: [],
        reason: llmResult.reason ?? 'LLM provider failed to generate structured answer.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    const rawData = llmResult.data;

    // 8. If model determined evidence was insufficient
    if (!rawData.hasSufficientEvidence) {
      return {
        status: 'insufficient_evidence',
        answer: STANDARD_REFUSAL_ANSWER,
        sources: [],
        suggestedFollowUps:
          rawData.suggestedFollowUps.length > 0
            ? rawData.suggestedFollowUps
            : DEFAULT_SUGGESTED_QUESTIONS,
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 9. Step 4: Strict Multi-Tiered Citation Validation
    const validation = this.citationValidator.validate(
      rawData.citations,
      retrievalResult.chunks,
      rawData.hasSufficientEvidence,
      { maxCitations: retrievalResult.chunks.length }
    );

    // If answer claimed sufficiency but zero citations survived, reject as ungrounded
    if (validation.isUngrounded || validation.validatedCitations.length === 0) {
      return {
        status: 'insufficient_evidence',
        answer: STANDARD_REFUSAL_ANSWER,
        sources: [],
        suggestedFollowUps: DEFAULT_SUGGESTED_QUESTIONS,
        reason:
          'Model response was flagged as ungrounded: no valid citations survived verification against retrieved chunks.',
        executionTimeMs: Date.now() - startTime,
      };
    }

    // 10. Success: Grounded answer with verified source citations
    return {
      status: 'answered',
      answer: rawData.answer,
      sources: validation.validatedCitations,
      suggestedFollowUps: rawData.suggestedFollowUps,
      executionTimeMs: Date.now() - startTime,
    };
  }
}

