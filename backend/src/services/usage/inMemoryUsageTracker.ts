import {
  DailyUsageSnapshot,
  IUsageTracker,
  ReconcileUsageParams,
  UsageReservation,
} from './types.js';

export interface InMemoryUsageTrackerOptions {
  dailyMaxRequests?: number | undefined;
  dailyMaxTokens?: number | undefined;
  dailyMaxBudgetMicroUsd?: number | undefined;
  reservedCostMicroUsd?: number | undefined;
  reservedTokens?: number | undefined;
  reservedRequests?: number | undefined;
  getCurrentDateKey?: (() => string) | undefined;
}

/**
 * Deterministic in-memory usage tracker for offline unit/integration testing and local development.
 * Simulates the atomic conditional reservation, UTC rollover, and preserved dateKey reconciliation.
 */
export class InMemoryUsageTracker implements IUsageTracker {
  private readonly dailyMaxRequests: number;
  private readonly dailyMaxTokens: number;
  private readonly dailyMaxBudgetMicroUsd: number;
  private readonly reservedCostMicroUsd: number;
  private readonly reservedTokens: number;
  private readonly reservedRequests: number;
  private readonly getCurrentDateKey: () => string;

  private records = new Map<string, DailyUsageSnapshot>();

  constructor(options: InMemoryUsageTrackerOptions = {}) {
    this.dailyMaxRequests = options.dailyMaxRequests ?? 200;
    this.dailyMaxTokens = options.dailyMaxTokens ?? 200000;
    this.dailyMaxBudgetMicroUsd = options.dailyMaxBudgetMicroUsd ?? 5000000;
    this.reservedCostMicroUsd = options.reservedCostMicroUsd ?? 1962;
    this.reservedTokens = options.reservedTokens ?? 14100;
    this.reservedRequests = options.reservedRequests ?? 1;
    this.getCurrentDateKey =
      options.getCurrentDateKey ?? (() => new Date().toISOString().slice(0, 10));
  }

  private getOrCreateRecord(dateKey: string): DailyUsageSnapshot {
    let record = this.records.get(dateKey);
    if (!record) {
      record = {
        dateKey,
        requestCount: 0,
        totalTokens: 0,
        estimatedCostMicroUsd: 0,
      };
      this.records.set(dateKey, record);
    }
    return record;
  }

  async checkAndReserve(): Promise<UsageReservation> {
    const dateKey = this.getCurrentDateKey();
    const record = this.getOrCreateRecord(dateKey);

    // Hard-cap condition: current usage + reservation <= limit
    if (record.requestCount + this.reservedRequests > this.dailyMaxRequests) {
      return {
        allowed: false,
        dateKey,
        reservedRequests: 0,
        reservedTokens: 0,
        reservedCostMicroUsd: 0,
        reason: 'DAILY_REQUESTS_EXCEEDED',
      };
    }

    if (record.totalTokens + this.reservedTokens > this.dailyMaxTokens) {
      return {
        allowed: false,
        dateKey,
        reservedRequests: 0,
        reservedTokens: 0,
        reservedCostMicroUsd: 0,
        reason: 'DAILY_TOKENS_EXCEEDED',
      };
    }

    if (record.estimatedCostMicroUsd + this.reservedCostMicroUsd > this.dailyMaxBudgetMicroUsd) {
      return {
        allowed: false,
        dateKey,
        reservedRequests: 0,
        reservedTokens: 0,
        reservedCostMicroUsd: 0,
        reason: 'DAILY_COST_EXCEEDED',
      };
    }

    // Atomic reservation increment
    record.requestCount += this.reservedRequests;
    record.totalTokens += this.reservedTokens;
    record.estimatedCostMicroUsd += this.reservedCostMicroUsd;

    return {
      allowed: true,
      dateKey,
      reservedRequests: this.reservedRequests,
      reservedTokens: this.reservedTokens,
      reservedCostMicroUsd: this.reservedCostMicroUsd,
    };
  }

  async reconcileUsage(params: ReconcileUsageParams): Promise<void> {
    const record = this.records.get(params.dateKey);
    if (!record) return;

    // Fail closed on unverified/incomplete usage: retain the reservation in full
    if (
      !params.isComplete ||
      params.actualTokens === undefined ||
      params.actualCostMicroUsd === undefined
    ) {
      return;
    }

    // Release unneeded reserved tokens and cost (deltas are non-positive)
    const deltaTokens = Math.min(0, params.actualTokens - params.reservedTokens);
    const deltaCost = Math.min(0, params.actualCostMicroUsd - params.reservedCostMicroUsd);

    record.totalTokens = Math.max(0, record.totalTokens + deltaTokens);
    record.estimatedCostMicroUsd = Math.max(0, record.estimatedCostMicroUsd + deltaCost);
  }

  async getDailyUsage(dateKey?: string): Promise<DailyUsageSnapshot> {
    const key = dateKey ?? this.getCurrentDateKey();
    const record = this.records.get(key);
    if (!record) {
      return {
        dateKey: key,
        requestCount: 0,
        totalTokens: 0,
        estimatedCostMicroUsd: 0,
      };
    }
    return { ...record };
  }

  reset(): void {
    this.records.clear();
  }
}

