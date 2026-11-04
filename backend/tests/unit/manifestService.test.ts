import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  compareChunksWithManifest,
  writeManifestAtomically,
} from '../../src/services/rag/ingestion/manifestService.js';
import {
  KnowledgeChunk,
  ManifestData,
  SourceDocument,
} from '../../src/services/rag/ingestion/types.js';

describe('Manifest Service (Unit)', () => {
  function createSampleChunk(
    id: string,
    text: string,
    category: string = 'Returns'
  ): KnowledgeChunk {
    return {
      id,
      text,
      metadata: {
        sourceId: 'shopease-returns-policy',
        sourceTitle: 'ShopEase Returns Policy',
        category,
        documentVersion: '1.0.0',
        effectiveDate: '2026-01-01',
        sectionTitle: 'Overview',
        headingHierarchy: ['ShopEase Returns Policy', 'Overview'],
        sourcePath: 'returns.md',
        chunkIndex: 0,
        contentHash: `hash-${text}`,
        metadataHash: `meta-${category}`,
      },
    };
  }

  describe('compareChunksWithManifest', () => {
    it('should classify all chunks as added when existing manifest is null', () => {
      const chunk1 = createSampleChunk('chunk-1', 'Text 1');
      const chunk2 = createSampleChunk('chunk-2', 'Text 2');

      const report = compareChunksWithManifest([chunk1, chunk2], null);

      expect(report.added).toHaveLength(2);
      expect(report.updated).toHaveLength(0);
      expect(report.unchanged).toHaveLength(0);
      expect(report.removed).toHaveLength(0);
      expect(report.isIdempotent).toBe(false);
    });

    it('should report isIdempotent true when incoming chunks are identical to manifest', () => {
      const chunk1 = createSampleChunk('chunk-1', 'Text 1');
      const chunk2 = createSampleChunk('chunk-2', 'Text 2');

      const existingManifest: ManifestData = {
        manifestVersion: '1.0.0',
        generatedAt: '2026-01-01T00:00:00.000Z',
        documentCount: 1,
        chunkCount: 2,
        documents: [],
        chunks: [chunk1, chunk2],
      };

      const report = compareChunksWithManifest([chunk1, chunk2], existingManifest);

      expect(report.added).toHaveLength(0);
      expect(report.updated).toHaveLength(0);
      expect(report.unchanged).toHaveLength(2);
      expect(report.removed).toHaveLength(0);
      expect(report.isIdempotent).toBe(true);
    });

    it('should categorize chunks with modified contentHash as updated', () => {
      const originalChunk = createSampleChunk('chunk-1', 'Original Text');
      const modifiedChunk = createSampleChunk('chunk-1', 'Altered Text'); // content changed

      const existingManifest: ManifestData = {
        manifestVersion: '1.0.0',
        generatedAt: '2026-01-01T00:00:00.000Z',
        documentCount: 1,
        chunkCount: 1,
        documents: [],
        chunks: [originalChunk],
      };

      const report = compareChunksWithManifest([modifiedChunk], existingManifest);

      expect(report.added).toHaveLength(0);
      expect(report.updated).toHaveLength(1);
      expect(report.unchanged).toHaveLength(0);
      expect(report.removed).toHaveLength(0);
      expect(report.isIdempotent).toBe(false);
    });

    it('should detect metadata-only changes even when contentHash is identical', () => {
      const originalChunk = createSampleChunk('chunk-1', 'Same Text', 'Returns');
      const metadataUpdatedChunk = createSampleChunk('chunk-1', 'Same Text', 'Returns & Exchanges');

      // Ensure content hashes match but metadata hashes differ
      expect(originalChunk.metadata.contentHash).toBe(metadataUpdatedChunk.metadata.contentHash);
      expect(originalChunk.metadata.metadataHash).not.toBe(
        metadataUpdatedChunk.metadata.metadataHash
      );

      const existingManifest: ManifestData = {
        manifestVersion: '1.0.0',
        generatedAt: '2026-01-01T00:00:00.000Z',
        documentCount: 1,
        chunkCount: 1,
        documents: [],
        chunks: [originalChunk],
      };

      const report = compareChunksWithManifest([metadataUpdatedChunk], existingManifest);

      expect(report.updated).toHaveLength(1);
      expect(report.unchanged).toHaveLength(0);
      expect(report.isIdempotent).toBe(false);
    });

    it('should accurately detect removed chunks from the previous manifest', () => {
      const activeChunk = createSampleChunk('chunk-1', 'Active Text');
      const staleChunk = createSampleChunk('chunk-2', 'Stale Text');

      const existingManifest: ManifestData = {
        manifestVersion: '1.0.0',
        generatedAt: '2026-01-01T00:00:00.000Z',
        documentCount: 1,
        chunkCount: 2,
        documents: [],
        chunks: [activeChunk, staleChunk],
      };

      // Only chunk-1 is presented in new run
      const report = compareChunksWithManifest([activeChunk], existingManifest);

      expect(report.unchanged).toHaveLength(1);
      expect(report.removed).toHaveLength(1);
      expect(report.removed[0]?.id).toBe('chunk-2');
      expect(report.isIdempotent).toBe(false);
    });
  });

  describe('writeManifestAtomically', () => {
    it('should preserve existing manifest without rewriting when isIdempotent is true', async () => {
      const tempManifestPath = join(
        tmpdir(),
        `supportiq-test-manifest-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
      );

      const existingManifest: ManifestData = {
        manifestVersion: '1.0.0',
        generatedAt: '2026-01-01T12:00:00.000Z',
        documentCount: 1,
        chunkCount: 1,
        documents: [],
        chunks: [createSampleChunk('chunk-1', 'Text')],
      };

      await writeFile(tempManifestPath, JSON.stringify(existingManifest), 'utf8');

      const report = {
        added: [],
        updated: [],
        unchanged: existingManifest.chunks,
        removed: [],
        isIdempotent: true,
      };

      const result = await writeManifestAtomically(
        tempManifestPath,
        [],
        existingManifest.chunks,
        report,
        existingManifest
      );

      // Must retain exact previous generatedAt
      expect(result.generatedAt).toBe('2026-01-01T12:00:00.000Z');

      await rm(tempManifestPath, { force: true });
    });

    it('should atomically write new manifest and prune removed chunks', async () => {
      const tempManifestPath = join(
        tmpdir(),
        `supportiq-test-atomic-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
      );

      const chunkActive = createSampleChunk('chunk-active', 'Active text');
      const dummyDoc: SourceDocument = {
        frontmatter: {
          id: 'shopease-returns-policy',
          title: 'ShopEase Returns Policy',
          category: 'Returns',
          version: '1.0.0',
          effectiveDate: '2026-01-01',
        },
        rawContent: 'Text',
        sourcePath: 'returns.md',
      };

      const report = {
        added: [chunkActive],
        updated: [],
        unchanged: [],
        removed: [{ id: 'stale-chunk', sourceId: 'shopease-returns-policy', sectionTitle: 'Old' }],
        isIdempotent: false,
      };

      const result = await writeManifestAtomically(
        tempManifestPath,
        [dummyDoc],
        [chunkActive],
        report,
        null
      );

      expect(result.chunkCount).toBe(1);
      expect(result.chunks[0]?.id).toBe('chunk-active');

      const writtenFileContent = await readFile(tempManifestPath, 'utf8');
      const parsedFromFile = JSON.parse(writtenFileContent) as ManifestData;

      expect(parsedFromFile.chunks).toHaveLength(1);
      expect(parsedFromFile.chunks[0]?.id).toBe('chunk-active');

      await rm(tempManifestPath, { force: true });
    });
  });
});

