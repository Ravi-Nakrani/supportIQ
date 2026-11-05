/**
 * SupportIQ — Usage Tracking Domain Types & Interfaces.
 */

export type UsageLimitExceededReason =
  | 'DAILY_REQUESTS_EXCEEDED'
  | 'DAILY_TOKENS_EXCEEDED'
  | 'DAILY_COST_EXCEEDED'
  | 'USAGE_TRACKER_ERROR';

/**
 * Result of an atomic pre-call budget reservation.
 */
export interface UsageReservation {
  allowed: boolean;
  dateKey: string; // UTC date string "YYYY-MM-DD"
  reservedRequests: number;
  reservedTokens: number;
  reservedCostMicroUsd: number;
  reason?: UsageLimitExceededReason | undefined;
}

/**
 * Parameters for post-call reconciliation against the exact reservation date bucket.
 */
export interface ReconcileUsageParams {
  dateKey: string;
  reservedTokens: number;
  reservedCostMicroUsd: number;
  actualTokens?: number | undefined;
  actualCostMicroUsd?: number | undefined;
  isComplete: boolean;
}

/**
 * Snapshot of stored usage for a single UTC day.
 */
export interface DailyUsageSnapshot {
  dateKey: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostMicroUsd: number;
}

/**
 * Common interface for persistent and in-memory usage tracking.
 */
export interface IUsageTracker {
  /**
   * Atomically checks daily limits and reserves budget for an upcoming chat request.
   */
  checkAndReserve(): Promise<UsageReservation>;

  /**
   * Reconciles actual provider usage against the reserved date bucket.
   * Unused budget is released ONLY if isComplete is true.
   */
  reconcileUsage(params: ReconcileUsageParams): Promise<void>;

  /**
   * Retrieves usage metrics for a specific UTC date (defaults to today).
   */
  getDailyUsage(dateKey?: string): Promise<DailyUsageSnapshot>;
}

