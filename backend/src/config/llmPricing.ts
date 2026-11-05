export interface ModelPricingEntry {
  version: string;
  inputMicroUsdPer1k: number;
  outputMicroUsdPer1k: number;
  isSupported: boolean;
  deprecatedReason?: string;
}

export const VERIFIED_MODEL_PRICING: Record<string, ModelPricingEntry> = {
  'text-embedding-3-small': {
    version: '2026-11',
    inputMicroUsdPer1k: 20,
    outputMicroUsdPer1k: 0,
    isSupported: true,
  },
  'gpt-6-luna': {
    version: '2026-11',
    inputMicroUsdPer1k: 100,
    outputMicroUsdPer1k: 500,
    isSupported: true,
  },
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

// Worst-case token ceilings: embedding (2x300=600), prompt (11700 budgeted to 12000), completion (1250 budgeted to 1500)
export const WORST_CASE_RESERVATION_TOKENS = {
  EMBEDDING_INPUT: 600,
  CHAT_PROMPT: 12000,
  CHAT_COMPLETION: 1500,
  TOTAL_BILLABLE_TOKENS: 600 + 12000 + 1500,
} as const;

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
