import { readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { mkdir } from 'node:fs/promises';
import {
  DocumentManifestSummary,
  IngestionChangeReport,
  KnowledgeChunk,
  ManifestData,
  SourceDocument,
} from './types.js';

export const MANIFEST_VERSION = '1.0.0';

/**
 * Reads and parses existing manifest from disk. Returns null if file does not exist.
 *
 * @param manifestPath File path to the manifest JSON file.
 * @returns Parsed ManifestData or null if file not present.
 */
export async function readExistingManifest(manifestPath: string): Promise<ManifestData | null> {
  try {
    const raw = await readFile(manifestPath, 'utf8');
    const parsed = JSON.parse(raw) as ManifestData;
    return parsed;
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: string }).code === 'ENOENT'
    ) {
      return null;
    }
    throw new Error(
      `[Manifest Error] Failed to read or parse existing manifest at "${manifestPath}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Compares current generated chunks against previous manifest state.
 *
 * Accurately categorizes into:
 * 1. added: New chunk IDs.
 * 2. updated: Chunks with altered contentHash OR altered metadataHash (metadata-only changes).
 * 3. unchanged: Identical chunk ID, contentHash, and metadataHash.
 * 4. removed: Stale chunk IDs from previous manifest that no longer exist.
 *
 * @param newChunks Newly generated knowledge chunks.
 * @param existingManifest Prior manifest from disk, or null.
 * @returns Categorized IngestionChangeReport.
 */
export function compareChunksWithManifest(
  newChunks: KnowledgeChunk[],
  existingManifest: ManifestData | null
): IngestionChangeReport {
  if (!existingManifest) {
    return {
      added: [...newChunks],
      updated: [],
      unchanged: [],
      removed: [],
      isIdempotent: false,
    };
  }

  const existingMap = new Map<string, KnowledgeChunk>(
    existingManifest.chunks.map((c) => [c.id, c])
  );
  const newMap = new Map<string, KnowledgeChunk>(
    newChunks.map((c) => [c.id, c])
  );

  const added: KnowledgeChunk[] = [];
  const updated: KnowledgeChunk[] = [];
  const unchanged: KnowledgeChunk[] = [];
  const removed: Array<{ id: string; sourceId: string; sectionTitle: string }> = [];

  // Check new chunks against existing manifest
  for (const chunk of newChunks) {
    const existing = existingMap.get(chunk.id);
    if (!existing) {
      added.push(chunk);
    } else {
      const contentChanged = existing.metadata.contentHash !== chunk.metadata.contentHash;
      const metadataChanged = existing.metadata.metadataHash !== chunk.metadata.metadataHash;

      if (contentChanged || metadataChanged) {
        updated.push(chunk);
      } else {
        unchanged.push(chunk);
      }
    }
  }

  // Check for removed/stale chunks
  for (const [id, existingChunk] of existingMap.entries()) {
    if (!newMap.has(id)) {
      removed.push({
        id,
        sourceId: existingChunk.metadata.sourceId,
        sectionTitle: existingChunk.metadata.sectionTitle,
      });
    }
  }

  const isIdempotent = added.length === 0 && updated.length === 0 && removed.length === 0;

  return {
    added,
    updated,
    unchanged,
    removed,
    isIdempotent,
  };
}

/**
 * Constructs canonical DocumentManifestSummary records for the manifest.
 */
export function buildDocumentSummaries(
  documents: SourceDocument[],
  chunks: KnowledgeChunk[]
): DocumentManifestSummary[] {
  const chunksPerSource = new Map<string, KnowledgeChunk[]>();
  for (const chunk of chunks) {
    const existing = chunksPerSource.get(chunk.metadata.sourceId) ?? [];
    existing.push(chunk);
    chunksPerSource.set(chunk.metadata.sourceId, existing);
  }

  return documents.map((doc) => {
    const docChunks = chunksPerSource.get(doc.frontmatter.id) ?? [];
    const uniqueSections = new Set(docChunks.map((c) => c.metadata.sectionTitle));

    return {
      sourceId: doc.frontmatter.id,
      sourceTitle: doc.frontmatter.title,
      category: doc.frontmatter.category,
      version: doc.frontmatter.version,
      effectiveDate: doc.frontmatter.effectiveDate,
      sourcePath: doc.sourcePath,
      sectionCount: uniqueSections.size,
      totalChunks: docChunks.length,
    };
  });
}

/**
 * Writes the manifest to disk atomically using a temporary file swap.
 *
 * If report.isIdempotent is true and an existing manifest is present:
 * - Skips disk mutation completely to preserve file timestamps and idempotency.
 * - Returns existing manifest.
 *
 * If changes are detected:
 * - Writes to `${manifestPath}.tmp`.
 * - Replaces `${manifestPath}` via atomic rename.
 *
 * @param manifestPath Target manifest file path.
 * @param documents Source documents loaded from disk.
 * @param chunks Generated knowledge chunks.
 * @param report Change report from compareChunksWithManifest.
 * @param existingManifest Existing manifest data if available.
 * @returns The persisted canonical ManifestData.
 */
export async function writeManifestAtomically(
  manifestPath: string,
  documents: SourceDocument[],
  chunks: KnowledgeChunk[],
  report: IngestionChangeReport,
  existingManifest: ManifestData | null
): Promise<ManifestData> {
  // If no changes exist and we have a valid previous manifest, preserve it unchanged
  if (report.isIdempotent && existingManifest !== null) {
    return existingManifest;
  }

  const documentSummaries = buildDocumentSummaries(documents, chunks);
  const now = new Date().toISOString();

  const manifestData: ManifestData = {
    manifestVersion: MANIFEST_VERSION,
    generatedAt: now,
    documentCount: documents.length,
    chunkCount: chunks.length,
    documents: documentSummaries,
    chunks, // Prunes stale chunks by only including current chunks
  };

  const tempPath = `${manifestPath}.tmp`;
  const serialized = JSON.stringify(manifestData, null, 2) + '\n';

  // Ensure target directory exists
  await mkdir(dirname(manifestPath), { recursive: true });

  try {
    await writeFile(tempPath, serialized, 'utf8');
    await rename(tempPath, manifestPath);
  } catch (error) {
    // Clean up temporary file on failure
    await unlink(tempPath).catch(() => {});
    throw new Error(
      `[Manifest Error] Failed to atomically write manifest to "${manifestPath}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }

  return manifestData;
}

