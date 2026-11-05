import { SupportIQGraphState } from './state.js';

export const WORKFLOW_MASTER_DEADLINE_MS = 20_000;

export interface BudgetCalculationResult {
  isExpired: boolean;
  effectiveTimeoutMs: number;
  remainingMs: number;
}

export function calculateRemainingBudget(
  state: SupportIQGraphState,
  standardTimeoutMs: number,
  masterDeadlineMs = WORKFLOW_MASTER_DEADLINE_MS
): BudgetCalculationResult {
  const elapsedMs = Date.now() - state.startTime;
  const remainingMs = masterDeadlineMs - elapsedMs;

  if (remainingMs <= 0) {
    return {
      isExpired: true,
      effectiveTimeoutMs: 0,
      remainingMs,
    };
  }

  return {
    isExpired: false,
    effectiveTimeoutMs: Math.min(standardTimeoutMs, remainingMs),
    remainingMs,
  };
}
