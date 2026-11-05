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

export interface RetrievalOptions {
  topK?: number | undefined;
  minScore?: number | undefined;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | undefined;
  filter?: Record<string, unknown> | undefined;
}

export type RetrievalStatus =
  | 'SUCCESS'
  | 'EMPTY_BELOW_THRESHOLD'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'ERROR';

export interface RetrievalResult {
  status: RetrievalStatus;
  chunks: RetrievedChunk[];
  reason?: string;
  executionTimeMs: number;
  usage?: { promptTokens: number; totalTokens: number } | undefined;
}
