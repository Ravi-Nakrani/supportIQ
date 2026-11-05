/**
 * SupportIQ — Verified LLM Model Pricing & Worst-Case Token Budgeting.
 *
 * All financial calculations are denominated strictly in integer micro-dollars (μUSD),
 * where:
 *   $1.00 USD = 1,000,000 μUSD
 *
 * This completely avoids floating-point rounding errors across reservations and reconciliation.
 */

export interface ModelPricingEntry {
  version: string;
  inputMicroUsdPer1k: number;
  outputMicroUsdPer1k: number;
  isSupported: boolean;
  deprecatedReason?: string;
}

/**
 * Verified model pricing dictionary.
 * Deprecated or unsupported models are explicitly marked to fail startup if configured.
 */
export const VERIFIED_MODEL_PRICING: Record<string, ModelPricingEntry> = {
  // Official text-embedding-3-small: $0.02 / 1M tokens = 20 μUSD / 1k tokens
  'text-embedding-3-small': {
    version: '2026-11',
    inputMicroUsdPer1k: 20,
    outputMicroUsdPer1k: 0,
    isSupported: true,
  },

  // gpt-6-luna (verified active chat default): $0.10 input / $0.50 output per 1M tokens
  // = 100 μUSD input / 500 μUSD output per 1k tokens
  'gpt-6-luna': {
    version: '2026-11',
    inputMicroUsdPer1k: 100,
    outputMicroUsdPer1k: 500,
    isSupported: true,
  },

  // Explicitly deprecated models rejected at startup
  'gpt-4o': {
    version: 'deprecated',
    inputMicroUsdPer1k: 2500,
    outputMicroUsdPer1k: 10000,
    isSupported: false,
    deprecatedReason: 'Model "gpt-4o" is deprecated and not supported in SupportIQ Phase 6.',
  },
  'gpt-4o-mini': {
    version: 'deprecated',
    inputMicroUsdPer1k: 150,
    outputMicroUsdPer1k: 600,
    isSupported: false,
    deprecatedReason: 'Model "gpt-4o-mini" is deprecated and not supported in SupportIQ Phase 6.',
  },
};

/**
 * Proven worst-case token ceilings across the complete multi-step Phase 5 LangGraph workflow:
 * - Embedding Input: Up to 2 calls (initial + retry query) * 300 max tokens = 600 tokens
 * - Chat Prompts: Assessment 1 (3000) + Rewrite (2200) + Assessment 2 (3000) + Answer (3500) = 11,700 (budgeted: 12,000)
 * - Chat Completions: Assessment 1 (100) + Rewrite (250) + Assessment 2 (100) + Answer (800) = 1,250 (budgeted: 1,500)
 */
export const WORST_CASE_RESERVATION_TOKENS = {
  EMBEDDING_INPUT: 600,
  CHAT_PROMPT: 12000,
  CHAT_COMPLETION: 1500,
  // Strict invariant: TOTAL_BILLABLE_TOKENS = EMBEDDING_INPUT + CHAT_PROMPT + CHAT_COMPLETION
  TOTAL_BILLABLE_TOKENS: 600 + 12000 + 1500, // 14,100 tokens
} as const;

/**
 * Validates that configured chat and embedding models are actively supported with verified pricing.
 * Fails closed immediately if a model is unsupported or deprecated.
 */
export function assertSupportedModels(chatModel: string, embeddingModel: string): void {
  const chatEntry = VERIFIED_MODEL_PRICING[chatModel];
  if (!chatEntry) {
    throw new Error(
      `[CONFIG ERROR] Unsupported chat model "${chatModel}". Must be an actively supported model with verified pricing.`
    );
  }
  if (!chatEntry.isSupported) {
    throw new Error(
      `[CONFIG ERROR] ${chatEntry.deprecatedReason ?? `Chat model "${chatModel}" is deprecated and rejected.`}`
    );
  }

  const embeddingEntry = VERIFIED_MODEL_PRICING[embeddingModel];
  if (!embeddingEntry) {
    throw new Error(
      `[CONFIG ERROR] Unsupported embedding model "${embeddingModel}". Must be an actively supported model with verified pricing.`
    );
  }
  if (!embeddingEntry.isSupported) {
    throw new Error(
      `[CONFIG ERROR] ${embeddingEntry.deprecatedReason ?? `Embedding model "${embeddingModel}" is deprecated and rejected.`}`
    );
  }
}

/**
 * Dynamically computes the conservative worst-case cost reservation in integer micro-dollars (μUSD).
 */
export function calculateWorstCaseReservationCost(
  chatModel: string,
  embeddingModel: string
): number {
  assertSupportedModels(chatModel, embeddingModel);

  const chatPricing = VERIFIED_MODEL_PRICING[chatModel]!;
  const embeddingPricing = VERIFIED_MODEL_PRICING[embeddingModel]!;

  const embeddingCost = Math.ceil(
    (WORST_CASE_RESERVATION_TOKENS.EMBEDDING_INPUT * embeddingPricing.inputMicroUsdPer1k) / 1000
  );
  const promptCost = Math.ceil(
    (WORST_CASE_RESERVATION_TOKENS.CHAT_PROMPT * chatPricing.inputMicroUsdPer1k) / 1000
  );
  const completionCost = Math.ceil(
    (WORST_CASE_RESERVATION_TOKENS.CHAT_COMPLETION * chatPricing.outputMicroUsdPer1k) / 1000
  );

  return embeddingCost + promptCost + completionCost;
}

/**
 * Calculates actual provider execution cost in integer micro-dollars (μUSD).
 */
export function calculateActualCostMicroUsd(
  chatModel: string,
  embeddingModel: string,
  usage: {
    embeddingTokens: number;
    promptTokens: number;
    completionTokens: number;
  }
): number {
  const chatPricing = VERIFIED_MODEL_PRICING[chatModel];
  const embeddingPricing = VERIFIED_MODEL_PRICING[embeddingModel];

  if (!chatPricing || !embeddingPricing) {
    throw new Error(
      `[Pricing Error] Cannot calculate actual cost for unverified models: chat="${chatModel}", embedding="${embeddingModel}"`
    );
  }

  const embeddingCost = Math.ceil((usage.embeddingTokens * embeddingPricing.inputMicroUsdPer1k) / 1000);
  const promptCost = Math.ceil((usage.promptTokens * chatPricing.inputMicroUsdPer1k) / 1000);
  const completionCost = Math.ceil((usage.completionTokens * chatPricing.outputMicroUsdPer1k) / 1000);

  return embeddingCost + promptCost + completionCost;
}

