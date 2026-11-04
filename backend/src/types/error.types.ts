/**
 * Standard error codes recognized across the SupportIQ public API.
 * Adheres strictly to docs/API_CONTRACTS.md.
 */
export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'RATE_LIMITED'
  | 'USAGE_LIMIT_EXCEEDED'
  | 'SERVICE_UNAVAILABLE'
  | 'GATEWAY_TIMEOUT'
  | 'INTERNAL_ERROR'
  | 'NOT_FOUND';

/**
 * Standardized API error response payload envelope.
 */
export interface ApiErrorEnvelope {
  error: {
    code: ApiErrorCode;
    message: string;
    details: unknown | null;
  };
}

/**
 * Operational application error with HTTP status code and standardized API error code.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details: unknown | null;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details: unknown | null = null
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

