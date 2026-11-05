import { describe, expect, it } from 'vitest';
import { MarkdownSection } from '../../src/services/rag/ingestion/markdownHeadingParser.js';
import {
  computeContentHash,
  computeMetadataHash,
  splitSectionsToChunks,
} from '../../src/services/rag/ingestion/markdownSplitter.js';
import { DocumentFrontmatter } from '../../src/services/rag/ingestion/types.js';

describe('Markdown Splitter (Unit)', () => {
  const mockFrontmatter: DocumentFrontmatter = {
    id: 'shopease-returns-policy',
    title: 'ShopEase Returns Policy',
    category: 'Returns',
    version: '1.0.0',
    effectiveDate: '2026-01-01',
  };

  it('should leave small sections within chunk size as single chunks', async () => {
    const sections: MarkdownSection[] = [
      {
        headingHierarchy: ['ShopEase Returns Policy', 'Overview'],
        sectionTitle: 'Overview',
        content: 'This is a brief overview within 800 characters.',
      },
    ];

    const chunks = await splitSectionsToChunks(
      mockFrontmatter,
      sections,
      'knowledge-base/shopease/returns-policy.md',
      { chunkSize: 800, chunkOverlap: 120 }
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.id).toBe('shopease-returns-policy#overview#0');
    expect(chunks[0]?.metadata.chunkIndex).toBe(0);
    expect(chunks[0]?.metadata.sectionTitle).toBe('Overview');
  });

  it('should split oversized sections using LangChain RecursiveCharacterTextSplitter', async () => {
    const longParagraph =
      'ShopEase customer return policy guarantees that all customers have access to simple, fair returns. '.repeat(
        15
      );

    const sections: MarkdownSection[] = [
      {
        headingHierarchy: ['ShopEase Returns Policy', 'Detailed Terms'],
        sectionTitle: 'Detailed Terms',
        content: longParagraph,
      },
    ];

    const chunks = await splitSectionsToChunks(
      mockFrontmatter,
      sections,
      'returns-policy.md',
      { chunkSize: 500, chunkOverlap: 50 }
    );

    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]?.metadata.sectionTitle).toBe('Detailed Terms');
      expect(chunks[i]?.metadata.headingHierarchy).toEqual([
        'ShopEase Returns Policy',
        'Detailed Terms',
      ]);
      expect(chunks[i]?.metadata.chunkIndex).toBe(i);
      expect(chunks[i]?.id).toBe(`shopease-returns-policy#detailed-terms#${i}`);
    }
  });

  it('should maintain a document-wide sequential chunkIndex across distinct sections', async () => {
    const sections: MarkdownSection[] = [
      {
        headingHierarchy: ['Title', 'Section One'],
        sectionTitle: 'Section One',
        content: 'Content for section one.',
      },
      {
        headingHierarchy: ['Title', 'Section Two'],
        sectionTitle: 'Section Two',
        content: 'Content for section two.',
      },
      {
        headingHierarchy: ['Title', 'Section Three'],
        sectionTitle: 'Section Three',
        content: 'Content for section three.',
      },
    ];

    const chunks = await splitSectionsToChunks(mockFrontmatter, sections, 'doc.md');

    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.metadata.chunkIndex).toBe(0);
    expect(chunks[1]?.metadata.chunkIndex).toBe(1);
    expect(chunks[2]?.metadata.chunkIndex).toBe(2);

    expect(chunks[0]?.id).toBe('shopease-returns-policy#section-one#0');
    expect(chunks[1]?.id).toBe('shopease-returns-policy#section-two#1');
    expect(chunks[2]?.id).toBe('shopease-returns-policy#section-three#2');
  });

  it('should guarantee chunk ID uniqueness even when section titles are repeated', async () => {
    const sections: MarkdownSection[] = [
      {
        headingHierarchy: ['Title', 'Overview'],
        sectionTitle: 'Overview',
        content: 'First overview section.',
      },
      {
        headingHierarchy: ['Title', 'Overview'],
        sectionTitle: 'Overview',
        content: 'Second overview section with repeated heading.',
      },
    ];

    const chunks = await splitSectionsToChunks(mockFrontmatter, sections, 'doc.md');

    expect(chunks).toHaveLength(2);
    expect(chunks[0]?.id).toBe('shopease-returns-policy#overview#0');
    expect(chunks[1]?.id).toBe('shopease-returns-policy#overview#1');
    expect(chunks[0]?.id).not.toBe(chunks[1]?.id);

    const idSet = new Set(chunks.map((c) => c.id));
    expect(idSet.size).toBe(chunks.length);
  });

  it('should compute deterministic contentHash invariant across CRLF and LF', () => {
    const textLf = 'Policy statement on returns.\nSecond line.';
    const textCrlf = 'Policy statement on returns.\r\nSecond line.';

    const hashLf = computeContentHash(textLf);
    const hashCrlf = computeContentHash(textCrlf);

    expect(hashLf).toBe(hashCrlf);
    expect(hashLf).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should compute deterministic metadataHash using canonical sorted key serialization', () => {
    const metaA = {
      sourceId: 'shopease-returns-policy',
      sourceTitle: 'ShopEase Returns Policy',
      category: 'Returns',
      documentVersion: '1.0.0',
      effectiveDate: '2026-01-01',
      sectionTitle: 'Overview',
      headingHierarchy: ['ShopEase Returns Policy', 'Overview'],
      sourcePath: 'returns.md',
      chunkIndex: 0,
    };

    const metaB = {
      chunkIndex: 0,
      sourceTitle: 'ShopEase Returns Policy',
      category: 'Returns',
      sourcePath: 'returns.md',
      sourceId: 'shopease-returns-policy',
      headingHierarchy: ['ShopEase Returns Policy', 'Overview'],
      sectionTitle: 'Overview',
      effectiveDate: '2026-01-01',
      documentVersion: '1.0.0',
    };

    const hashA = computeMetadataHash(metaA);
    const hashB = computeMetadataHash(metaB);

    expect(hashA).toBe(hashB);
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should detect metadata-only changes by producing a different metadataHash', () => {
    const baseMeta = {
      sourceId: 'shopease-returns-policy',
      sourceTitle: 'ShopEase Returns Policy',
      category: 'Returns',
      documentVersion: '1.0.0',
      effectiveDate: '2026-01-01',
      sectionTitle: 'Overview',
      headingHierarchy: ['ShopEase Returns Policy', 'Overview'],
      sourcePath: 'returns.md',
      chunkIndex: 0,
    };

    const updatedCategoryMeta = {
      ...baseMeta,
      category: 'Returns & Exchanges', // modified metadata attribute
    };

    const hashBase = computeMetadataHash(baseMeta);
    const hashUpdated = computeMetadataHash(updatedCategoryMeta);

    expect(hashBase).not.toBe(hashUpdated);
  });
});

