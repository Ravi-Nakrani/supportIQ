import { describe, it, expect } from 'vitest';
import {
  assertSupportedModels,
  calculateActualCostMicroUsd,
  calculateWorstCaseReservationCost,
  VERIFIED_MODEL_PRICING,
  WORST_CASE_RESERVATION_TOKENS,
} from '../../src/config/llmPricing.js';

describe('Model Pricing & Budgeting (Unit)', () => {
  it('should verify pricing configuration for gpt-6-luna and text-embedding-3-small', () => {
    expect(VERIFIED_MODEL_PRICING['text-embedding-3-small']?.inputMicroUsdPer1k).toBe(20);
    expect(VERIFIED_MODEL_PRICING['gpt-6-luna']?.inputMicroUsdPer1k).toBe(100);
    expect(VERIFIED_MODEL_PRICING['gpt-6-luna']?.outputMicroUsdPer1k).toBe(500);
  });

  it('should calculate exact worst-case reservation cost for default models', () => {
    const cost = calculateWorstCaseReservationCost('gpt-6-luna', 'text-embedding-3-small');
    expect(cost).toBe(1962);
  });

  it('should verify total billable reservation tokens invariant', () => {
    expect(WORST_CASE_RESERVATION_TOKENS.TOTAL_BILLABLE_TOKENS).toBe(
      WORST_CASE_RESERVATION_TOKENS.EMBEDDING_INPUT +
        WORST_CASE_RESERVATION_TOKENS.CHAT_PROMPT +
        WORST_CASE_RESERVATION_TOKENS.CHAT_COMPLETION
    );
    expect(WORST_CASE_RESERVATION_TOKENS.TOTAL_BILLABLE_TOKENS).toBe(14100);
  });

  it('should reject deprecated models at startup', () => {
    expect(() => assertSupportedModels('gpt-4o', 'text-embedding-3-small')).toThrow(/deprecated/);
    expect(() => assertSupportedModels('gpt-4o-mini', 'text-embedding-3-small')).toThrow(/deprecated/);
  });

  it('should reject unknown models at startup', () => {
    expect(() => assertSupportedModels('claude-3-opus', 'text-embedding-3-small')).toThrow(/Unsupported chat model/);
  });

  it('should calculate actual cost accurately in integer micro-dollars', () => {
    const cost = calculateActualCostMicroUsd('gpt-6-luna', 'text-embedding-3-small', {
      embeddingTokens: 100, // 100 * 20 / 1000 = 2
      promptTokens: 1000,   // 1000 * 100 / 1000 = 100
      completionTokens: 200, // 200 * 500 / 1000 = 100
    });
    expect(cost).toBe(202);
  });
});

