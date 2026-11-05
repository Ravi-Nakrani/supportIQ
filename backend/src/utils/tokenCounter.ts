import { getEncoding } from 'js-tiktoken';

export const MODEL_ENCODING_MAP: Record<string, 'cl100k_base' | 'o200k_base'> = {
  'text-embedding-3-small': 'cl100k_base',
  'gpt-6-luna': 'o200k_base',
};

const cl100kEncoder = getEncoding('cl100k_base');
const o200kEncoder = getEncoding('o200k_base');

export function getEncoderForModel(model: string) {
  const encoding = MODEL_ENCODING_MAP[model];
  if (!encoding) {
    throw new Error(`[Tokenizer Error] Unknown or unsupported model encoding for "${model}". Failing closed.`);
  }
  return encoding === 'o200k_base' ? o200kEncoder : cl100kEncoder;
}

export function countEmbeddingTokens(query: string, embeddingModel: string): number {
  if (!query) return 0;
  const encoder = getEncoderForModel(embeddingModel);
  return encoder.encode(query.trim()).length;
}

export function estimateChatRequestTokens(
  messages: Array<{ role: string; content: string }>,
  jsonSchema: object | null,
  model: string
): number {
  const encoder = getEncoderForModel(model);
  let estimatedCount = 0;

  for (const msg of messages) {
    estimatedCount += 4;
    estimatedCount += encoder.encode(msg.role).length;
    estimatedCount += encoder.encode(msg.content).length;
  }

  if (jsonSchema) {
    estimatedCount += encoder.encode(JSON.stringify(jsonSchema)).length;
  }

  estimatedCount += 50;

  return estimatedCount;
}
