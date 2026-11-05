import { describe, it, expect } from 'vitest';
import { InMemoryUsageTracker } from '../../src/services/usage/inMemoryUsageTracker.js';

describe('Usage Tracker Service (Unit)', () => {
  it('should atomically reserve worst-case budget within daily limits', async () => {
    const tracker = new InMemoryUsageTracker({
      dailyMaxRequests: 10,
      dailyMaxTokens: 100000,
      dailyMaxBudgetMicroUsd: 1000000,
      reservedCostMicroUsd: 2000,
      reservedTokens: 14100,
      reservedRequests: 1,
    });

    const reservation = await tracker.checkAndReserve();
    expect(reservation.allowed).toBe(true);
    expect(reservation.reservedRequests).toBe(1);
    expect(reservation.reservedTokens).toBe(14100);
    expect(reservation.reservedCostMicroUsd).toBe(2000);

    const snapshot = await tracker.getDailyUsage();
    expect(snapshot.requestCount).toBe(1);
    expect(snapshot.totalTokens).toBe(14100);
    expect(snapshot.estimatedCostMicroUsd).toBe(2000);
  });

  it('should enforce hard cap under concurrent reservation race conditions', async () => {
    const tracker = new InMemoryUsageTracker({
      dailyMaxRequests: 10,
      dailyMaxTokens: 500000,
      dailyMaxBudgetMicroUsd: 1000000,
      reservedRequests: 1,
      reservedTokens: 1000,
      reservedCostMicroUsd: 500,
    });

    const attempts = Array.from({ length: 50 }, () => tracker.checkAndReserve());
    const results = await Promise.all(attempts);

    const successful = results.filter((r) => r.allowed);
    const rejected = results.filter((r) => !r.allowed);

    expect(successful.length).toBe(10);
    expect(rejected.length).toBe(40);
    expect(rejected[0]?.reason).toBe('DAILY_REQUESTS_EXCEEDED');

    const snapshot = await tracker.getDailyUsage();
    expect(snapshot.requestCount).toBe(10);
  });

  it('should reconcile against original dateKey across UTC midnight rollover', async () => {
    let simulatedDate = '2026-11-05';
    const tracker = new InMemoryUsageTracker({
      getCurrentDateKey: () => simulatedDate,
      reservedTokens: 14100,
      reservedCostMicroUsd: 2000,
    });

    const reservation = await tracker.checkAndReserve();
    expect(reservation.allowed).toBe(true);
    expect(reservation.dateKey).toBe('2026-11-05');

    simulatedDate = '2026-11-06';

    await tracker.reconcileUsage({
      dateKey: reservation.dateKey,
      reservedTokens: reservation.reservedTokens,
      reservedCostMicroUsd: reservation.reservedCostMicroUsd,
      actualTokens: 2000,
      actualCostMicroUsd: 300,
      isComplete: true,
    });

    const day1Usage = await tracker.getDailyUsage('2026-11-05');
    expect(day1Usage.totalTokens).toBe(2000);
    expect(day1Usage.estimatedCostMicroUsd).toBe(300);

    const day2Usage = await tracker.getDailyUsage('2026-11-06');
    expect(day2Usage.requestCount).toBe(0);
    expect(day2Usage.totalTokens).toBe(0);
  });

  it('should retain full reservation when isComplete is false', async () => {
    const tracker = new InMemoryUsageTracker({
      reservedTokens: 14100,
      reservedCostMicroUsd: 2000,
    });

    const reservation = await tracker.checkAndReserve();

    await tracker.reconcileUsage({
      dateKey: reservation.dateKey,
      reservedTokens: reservation.reservedTokens,
      reservedCostMicroUsd: reservation.reservedCostMicroUsd,
      actualTokens: 500,
      actualCostMicroUsd: 100,
      isComplete: false,
    });

    const snapshot = await tracker.getDailyUsage();
    expect(snapshot.totalTokens).toBe(14100);
    expect(snapshot.estimatedCostMicroUsd).toBe(2000);
  });

  it('should reject reservation when daily token ceiling would be exceeded', async () => {
    const tracker = new InMemoryUsageTracker({
      dailyMaxTokens: 20000,
      reservedTokens: 14100,
    });

    const first = await tracker.checkAndReserve();
    expect(first.allowed).toBe(true);

    const second = await tracker.checkAndReserve();
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('DAILY_TOKENS_EXCEEDED');
  });

  it('should reject reservation when daily budget ceiling would be exceeded', async () => {
    const tracker = new InMemoryUsageTracker({
      dailyMaxBudgetMicroUsd: 3000,
      reservedCostMicroUsd: 2000,
    });

    const first = await tracker.checkAndReserve();
    expect(first.allowed).toBe(true);

    const second = await tracker.checkAndReserve();
    expect(second.allowed).toBe(false);
    expect(second.reason).toBe('DAILY_COST_EXCEEDED');
  });
});

