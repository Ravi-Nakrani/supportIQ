export type UsageLimitExceededReason =
  | 'DAILY_REQUESTS_EXCEEDED'
  | 'DAILY_TOKENS_EXCEEDED'
  | 'DAILY_COST_EXCEEDED'
  | 'USAGE_TRACKER_ERROR';

export interface UsageReservation {
  allowed: boolean;
  dateKey: string;
  reservedRequests: number;
  reservedTokens: number;
  reservedCostMicroUsd: number;
  reason?: UsageLimitExceededReason | undefined;
}

export interface ReconcileUsageParams {
  dateKey: string;
  reservedTokens: number;
  reservedCostMicroUsd: number;
  actualTokens?: number | undefined;
  actualCostMicroUsd?: number | undefined;
  isComplete: boolean;
}

export interface DailyUsageSnapshot {
  dateKey: string;
  requestCount: number;
  totalTokens: number;
  estimatedCostMicroUsd: number;
}

export interface IUsageTracker {
  checkAndReserve(): Promise<UsageReservation>;

  reconcileUsage(params: ReconcileUsageParams): Promise<void>;

  getDailyUsage(dateKey?: string): Promise<DailyUsageSnapshot>;
}

