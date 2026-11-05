/**
 * SupportIQ Frontend API & Chat Types
 * Aligned strictly with docs/API_CONTRACTS.md and backend Phase 6 schemas.
 */

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: HistoryMessage[];
}

export interface CitationSource {
  id: string;
  title: string;
  section: string;
  excerpt: string;
}

export interface ChatAnsweredResponse {
  status: 'answered';
  answer: string;
  sources: CitationSource[];
  suggestedFollowUps?: string[];
}

export interface ChatInsufficientEvidenceResponse {
  status: 'insufficient_evidence';
  answer: string;
  sources: [];
  suggestedFollowUps?: string[];
}

export type ChatResponse = ChatAnsweredResponse | ChatInsufficientEvidenceResponse;

export interface DemoMetadataResponse {
  assistantName: string;
  companyName: string;
  demoNotice: string;
  suggestedQuestions: string[];
}

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'PAYLOAD_TOO_LARGE'
  | 'REQUEST_ABORTED'
  | 'RATE_LIMITED'
  | 'USAGE_LIMIT_EXCEEDED'
  | 'SERVICE_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  status?: 'answered' | 'insufficient_evidence';
  sources?: CitationSource[];
  suggestedFollowUps?: string[];
  isError?: boolean;
  isPending?: boolean;
}

