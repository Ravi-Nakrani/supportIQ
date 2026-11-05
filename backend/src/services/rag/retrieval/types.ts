/**
 * Standard domain representation of a retrieved document chunk with verified citation metadata.
 */
export interface RetrievedChunk {
  id: string;
  text: string;
  sourceId: string;
  sourceTitle: string;
  sectionTitle: string;
  chunkIndex: number;
  category: string;
  score: number;
}

/**
 * Options supplied to a retrieval request.
 */
export interface RetrievalOptions {
  topK?: number | undefined;
  minScore?: number | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  filter?: Record<string, unknown> | undefined;
}

/**
 * Explicit outcomes of a retrieval operation.
 */
export type RetrievalStatus =
  | 'SUCCESS'
  | 'EMPTY_BELOW_THRESHOLD'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'ERROR';

/**
 * Comprehensive result of a retrieval invocation.
 */
export interface RetrievalResult {
  status: RetrievalStatus;
  chunks: RetrievedChunk[];
  reason?: string;
  executionTimeMs: number;
  usage?: { promptTokens: number; totalTokens: number } | undefined;
}
