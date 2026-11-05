import { Request, Response } from 'express';

export const DEMO_METADATA = {
  assistantName: 'SupportIQ',
  companyName: 'ShopEase',
  demoNotice: 'This assistant is powered by fictional ShopEase customer service documentation.',
  suggestedQuestions: [
    'What is the return policy for defective products?',
    'How long does standard shipping take?',
    'How long do refunds take after approval?',
    'Can I cancel an order after it has shipped?',
    'How are ShopEase loyalty points earned and redeemed?',
  ],
};

/**
 * Serves public branding and curated starter questions for the landing page.
 */
export function getDemoMetadata(_req: Request, res: Response): void {
  res.status(200).json(DEMO_METADATA);
}

