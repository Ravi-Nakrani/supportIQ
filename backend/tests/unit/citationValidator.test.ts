import { describe, it, expect } from 'vitest';
import { CitationValidator } from '../../src/services/rag/generation/citationValidator.js';
import { RetrievedChunk } from '../../src/services/rag/retrieval/types.js';

describe('CitationValidator (Unit)', () => {
  const validator = new CitationValidator();

  const retrievedChunks: RetrievedChunk[] = [
    {
      id: 'shopease-returns-policy#defective-products#1',
      text: 'Opened products that suffer from a manufacturing defect upon arrival may be returned within 30 days for a full refund or direct replacement.',
      sourceId: 'shopease-returns-policy',
      sourceTitle: 'ShopEase Returns Policy',
      sectionTitle: 'Defective Products',
      chunkIndex: 1,
      category: 'Returns & Exchanges',
      score: 0.95,
    },
    {
      id: 'shopease-shipping-policy#standard-delivery#2',
      text: 'Standard domestic delivery typically takes 3 to 5 business days from order dispatch.',
      sourceId: 'shopease-shipping-policy',
      sourceTitle: 'ShopEase Shipping Policy',
      sectionTitle: 'Standard Delivery Estimates',
      chunkIndex: 2,
      category: 'Shipping & Logistics',
      score: 0.91,
    },
  ];

  it('should accept valid citations referencing retrieved chunks and matching text', () => {
    const candidates = [
      {
        chunkId: 'shopease-returns-policy#defective-products#1',
        quote: 'Opened products that suffer from a manufacturing defect upon arrival may be returned within 30 days',
      },
    ];

    const result = validator.validate(candidates, retrievedChunks, true);

    expect(result.validatedCitations.length).toBe(1);
    expect(result.droppedCitations.length).toBe(0);
    expect(result.isUngrounded).toBe(false);
    expect(result.validatedCitations[0]).toEqual({
      id: 'shopease-returns-policy#defective-products#1',
      title: 'ShopEase Returns Policy',
      section: 'Defective Products',
      excerpt:
        'Opened products that suffer from a manufacturing defect upon arrival may be returned within 30 days',
    });
  });

  it('should normalize whitespace differences between quote and chunk text', () => {
    const candidates = [
      {
        chunkId: 'shopease-shipping-policy#standard-delivery#2',
        quote: 'Standard domestic delivery   typically takes\n3 to 5 business days',
      },
    ];

    const result = validator.validate(candidates, retrievedChunks, true);

    expect(result.validatedCitations.length).toBe(1);
    expect(result.validatedCitations[0]?.id).toBe(
      'shopease-shipping-policy#standard-delivery#2'
    );
  });

  it('should strip fabricated chunk IDs not present in the retrieved chunk set', () => {
    const candidates = [
      {
        chunkId: 'shopease-nonexistent-policy#chunk-99',
        quote: 'Fabricated quote from non-existent chunk',
      },
    ];

    const result = validator.validate(candidates, retrievedChunks, true);

    expect(result.validatedCitations.length).toBe(0);
    expect(result.droppedCitations.length).toBe(1);
    expect(result.droppedCitations[0]?.reason).toContain('was not present in the retrieved chunk set');
    expect(result.isUngrounded).toBe(true);
  });

  it('should discard unverifiable excerpts without inventing a replacement', () => {
    const candidates = [
      {
        chunkId: 'shopease-returns-policy#defective-products#1',
        quote: 'Customers can return items for up to 365 days no questions asked.',
      },
    ];

    const result = validator.validate(candidates, retrievedChunks, true);

    expect(result.validatedCitations.length).toBe(0);
    expect(result.droppedCitations.length).toBe(1);
    expect(result.droppedCitations[0]?.reason).toContain('could not be verified within chunk');
    expect(result.isUngrounded).toBe(true);
  });

  it('should deduplicate multiple citations pointing to the exact same chunk ID', () => {
    const candidates = [
      {
        chunkId: 'shopease-returns-policy#defective-products#1',
        quote: 'Opened products that suffer from a manufacturing defect',
      },
      {
        chunkId: 'shopease-returns-policy#defective-products#1',
        quote: 'returned within 30 days for a full refund',
      },
    ];

    const result = validator.validate(candidates, retrievedChunks, true);

    expect(result.validatedCitations.length).toBe(1);
    expect(result.droppedCitations.length).toBe(1);
    expect(result.droppedCitations[0]?.reason).toContain('Duplicate citation');
  });

  it('should bound citations to the maximum allowed limit', () => {
    const candidates = [
      {
        chunkId: 'shopease-returns-policy#defective-products#1',
        quote: 'Opened products that suffer from a manufacturing defect',
      },
      {
        chunkId: 'shopease-shipping-policy#standard-delivery#2',
        quote: 'Standard domestic delivery typically takes 3 to 5 business days',
      },
    ];

    const result = validator.validate(candidates, retrievedChunks, true, {
      maxCitations: 1,
    });

    expect(result.validatedCitations.length).toBe(1);
    expect(result.droppedCitations.length).toBe(1);
    expect(result.droppedCitations[0]?.reason).toContain('Maximum citation limit of 1 reached');
  });

  it('should handle partial validity: keep valid citations and drop invalid citations', () => {
    const candidates = [
      {
        chunkId: 'shopease-returns-policy#defective-products#1',
        quote: 'Opened products that suffer from a manufacturing defect',
      },
      {
        chunkId: 'fake-chunk-id',
        quote: 'Fake quote',
      },
    ];

    const result = validator.validate(candidates, retrievedChunks, true);

    expect(result.validatedCitations.length).toBe(1);
    expect(result.droppedCitations.length).toBe(1);
    expect(result.isUngrounded).toBe(false);
  });

  it('should not mark ungrounded when hasSufficientEvidence is false', () => {
    const result = validator.validate([], retrievedChunks, false);

    expect(result.validatedCitations.length).toBe(0);
    expect(result.isUngrounded).toBe(false);
  });
});

