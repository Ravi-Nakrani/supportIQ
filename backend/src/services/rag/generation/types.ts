import { z } from 'zod';

/**
 * Standard customer-facing refusal string returned when evidence is insufficient or ungrounded.
 */
export const STANDARD_REFUSAL_ANSWER =
  "I couldn't find enough information about that in the ShopEase documentation.";

/**
 * Safe generic response strings for technical failures.
 * Keeps internal provider/database error details out of user-facing responses.
 */
export const STANDARD_TECHNICAL_ERROR_ANSWER =
  'An error occurred while processing your request. Please try again shortly.';

export const STANDARD_TIMEOUT_ANSWER =
  'The request timed out while retrieving policy information. Please try again.';

export const STANDARD_ABORTED_ANSWER =
  'The request was cancelled.';

/**
 * Standard suggested starter follow-ups offered when no policy evidence is found.
 */
export const DEFAULT_SUGGESTED_QUESTIONS = [
  'What is the return policy for defective products?',
  'How long does standard shipping take?',
  'How long do refunds take after approval?',
];

/**
 * Single source citation pointing back to a verified retrieved chunk.
 */
export interface SourceCitation {
  id: string;
  title: string;
  section: string;
  excerpt: string;
}

/**
 * Candidate citation schema returned directly by the LLM.
 */
export const rawLlmCitationSchema = z.object({
  chunkId: z.string().describe(
    'Exact chunk id from <document_context> that directly supports this claim, e.g. "shopease-returns-policy#defective-products#1".'
  ),
  quote: z.string().describe(
    'A verbatim excerpt from the chunk text that corroborates the claim.'
  ),
});

export type RawLlmCitation = z.infer<typeof rawLlmCitationSchema>;

/**
 * Strict Structured Output schema enforced via OpenAI json_schema.
 */
export const rawLlmAnswerSchema = z.object({
  answer: z.string().describe(
    'A clear, factual response to the user question based strictly on the provided document context. If evidence is insufficient, provide the standard refusal.'
  ),
  hasSufficientEvidence: z.boolean().describe(
    'True if the provided document context contains enough facts to answer the question accurately; false if the context lacks necessary information or is out-of-domain.'
  ),
  citations: z.array(rawLlmCitationSchema).describe(
    'List of citations supporting the answer. Must be empty if hasSufficientEvidence is false.'
  ),
  suggestedFollowUps: z.array(z.string()).max(3).describe(
    '0 to 3 relevant follow-up questions a ShopEase customer might ask based on this policy (empty if evidence is insufficient).'
  ),
});

export type RawLlmAnswer = z.infer<typeof rawLlmAnswerSchema>;

/**
 * Conversation history message representation.
 */
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Request payload to the RAG answer service.
 */
export interface GroundedAnswerRequest {
  question: string;
  history?: ConversationMessage[] | undefined;
  topK?: number | undefined;
  minScore?: number | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * Explicit domain outcomes of RAG answer generation.
 */
export type GroundedAnswerStatus =
  | 'answered'
  | 'insufficient_evidence'
  | 'timeout'
  | 'aborted'
  | 'error';

/**
 * Execution status inside the LangGraph workflow.
 * Initialized strictly to 'pending' to distinguish an active/unprocessed graph
 * from a verified 'answered' terminal result.
 */
export type GraphExecutionStatus =
  | 'pending'
  | 'answered'
  | 'insufficient_evidence'
  | 'timeout'
  | 'aborted'
  | 'error';

/**
 * Strict schema for evidence sufficiency assessment.
 */
export const evidenceAssessmentSchema = z.object({
  isSufficient: z.boolean().describe(
    'True if retrieved chunks contain sufficient evidence to answer the user question accurately; false if insufficient or out-of-domain.'
  ),
  reason: z.string().describe(
    'Concise diagnostic explanation of sufficiency or gap.'
  ),
});

export type EvidenceAssessment = z.infer<typeof evidenceAssessmentSchema>;

/**
 * Strict schema for query reformulation.
 * Requires trimmed, non-empty query up to 1,000 characters (aligned with retrieval limits).
 */
export const queryRewriteSchema = z.object({
  rewrittenQuery: z
    .string()
    .trim()
    .min(1, 'Rewritten query must not be empty')
    .max(1000, 'Rewritten query must not exceed 1000 characters')
    .describe(
      'Targeted search query resolving pronouns or coreferences from history, max 1000 characters.'
    ),
  reason: z.string().describe(
    'Concise justification for the rewrite.'
  ),
});

export type QueryRewriteResult = z.infer<typeof queryRewriteSchema>;

/**
 * Token usage report for a single LLM provider call.
 */
export interface LlmCallUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * Workflow-wide aggregate usage metrics across all nodes.
 *
 * Invariant:
 *   totalTokens === embeddingTokens + promptTokens + completionTokens
 */
export interface WorkflowUsageMetrics {
  embeddingTokens: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  isComplete: boolean;
}

/**
 * Typed domain response from the RAG answer service.
 */
export interface GroundedAnswerResult {
  status: GroundedAnswerStatus;
  answer: string;
  sources: SourceCitation[];
  suggestedFollowUps: string[];
  reason?: string | undefined;
  executionTimeMs: number;
  usage?: WorkflowUsageMetrics | undefined;
}

/**
 * Options for LLM chat invocations.
 */
export interface LlmChatRequestOptions {
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  maxRetries?: number | undefined;
  maxCompletionTokens?: number | undefined;
}

/**
 * Explicit outcomes of an LLM chat invocation.
 */
export type LlmChatStatus =
  | 'SUCCESS'
  | 'TRUNCATED'
  | 'REFUSAL'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'ERROR';

/**
 * Raw execution result returned by ILlmChatService for answer generation.
 */
export interface LlmChatExecutionResult {
  status: LlmChatStatus;
  data?: RawLlmAnswer | undefined;
  finishReason?: string | undefined;
  reason?: string | undefined;
  rawRefusal?: string | undefined;
  usage?: LlmCallUsage | undefined;
}

/**
 * Execution result for evidence assessment.
 */
export interface LlmAssessmentExecutionResult {
  status: LlmChatStatus;
  data?: EvidenceAssessment | undefined;
  reason?: string | undefined;
  usage?: LlmCallUsage | undefined;
}

/**
 * Execution result for query rewriting.
 */
export interface LlmRewriteExecutionResult {
  status: LlmChatStatus;
  data?: QueryRewriteResult | undefined;
  reason?: string | undefined;
  usage?: LlmCallUsage | undefined;
}

/**
 * Interface decoupling the application from specific LLM provider implementations.
 */
export interface ILlmChatService {
  generateStructuredAnswer(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmChatExecutionResult>;

  assessEvidence(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmAssessmentExecutionResult>;

  rewriteQuery(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    options?: LlmChatRequestOptions
  ): Promise<LlmRewriteExecutionResult>;
}

