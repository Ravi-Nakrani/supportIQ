import { getEncoding } from 'js-tiktoken';

/**
 * Strict verified model-to-encoding mapping.
 * In accordance with Phase 6 guidelines, model encodings are explicitly mapped
 * and never inferred solely from heuristic prefixes.
 */
export const MODEL_ENCODING_MAP: Record<string, 'cl100k_base' | 'o200k_base'> = {
  'text-embedding-3-small': 'cl100k_base',
  'gpt-6-luna': 'o200k_base',
};

// Cached encoder instances
const cl100kEncoder = getEncoding('cl100k_base');
const o200kEncoder = getEncoding('o200k_base');

/**
 * Resolves the tokenizer encoder for a supported model, or throws if unknown (fail closed).
 */
export function getEncoderForModel(model: string) {
  const encoding = MODEL_ENCODING_MAP[model];
  if (!encoding) {
    throw new Error(`[Tokenizer Error] Unknown or unsupported model encoding for "${model}". Failing closed.`);
  }
  return encoding === 'o200k_base' ? o200kEncoder : cl100kEncoder;
}

/**
 * Estimates input tokens for an embedding query using the explicit embedding model.
 */
export function countEmbeddingTokens(query: string, embeddingModel: string): number {
  if (!query) return 0;
  const encoder = getEncoderForModel(embeddingModel);
  return encoder.encode(query.trim()).length;
}

/**
 * Estimates input tokens for a chat completion request, conservatively budgeting for:
 * 1. Text content across all messages
 * 2. Protocol message framing overhead (~4 tokens per message)
 * 3. Structured Outputs JSON schema payload overhead
 * 4. API formatting buffer (+50 tokens)
 *
 * NOTE: This is a conservative local token estimator, not a guarantee of the exact
 * complete provider request count. Retains sufficient headroom to prevent budget breaches.
 */
export function estimateChatRequestTokens(
  messages: Array<{ role: string; content: string }>,
  jsonSchema: object | null,
  model: string
): number {
  const encoder = getEncoderForModel(model);
  let estimatedCount = 0;

  for (const msg of messages) {
    estimatedCount += 4; // protocol framing overhead per message
    estimatedCount += encoder.encode(msg.role).length;
    estimatedCount += encoder.encode(msg.content).length;
  }

  if (jsonSchema) {
    estimatedCount += encoder.encode(JSON.stringify(jsonSchema)).length;
  }

  // Conservative API formatting buffer
  estimatedCount += 50;

  return estimatedCount;
}

