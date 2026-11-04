import { loadKnowledgeBaseDocuments } from './documentLoader.js';
import {
  compareChunksWithManifest,
  readExistingManifest,
  writeManifestAtomically,
} from './manifestService.js';
import { parseMarkdownHeadings } from './markdownHeadingParser.js';
import { splitSectionsToChunks, SplitterOptions } from './markdownSplitter.js';
import { IngestionResult, KnowledgeChunk } from './types.js';

export interface IngestionPipelineOptions extends SplitterOptions {
  baseDir?: string;
  dryRun?: boolean;
}

/**
 * Master ingestion pipeline for the ShopEase knowledge base.
 *
 * Sequence:
 * 1. Loads and validates all markdown files in target directory.
 * 2. Parses section headings with code-fence awareness.
 * 3. Splits oversized sections with LangChain RecursiveCharacterTextSplitter.
 * 4. Preserves document-wide sequential chunkIndex and computes canonical metadata hashes.
 * 5. Asserts global chunk ID uniqueness across all documents.
 * 6. Compares with existing manifest (categorizing added, updated, unchanged, removed).
 * 7. Atomically updates canonical manifest file (unless dryRun).
 * 8. Returns comprehensive IngestionResult.
 *
 * @param knowledgeBaseDir Path to directory containing source .md policy documents.
 * @param manifestPath Path to target shopease-manifest.json file.
 * @param options Splitter configuration, baseDir, dryRun flag.
 * @returns Fully populated IngestionResult.
 */
export async function runIngestionPipeline(
  knowledgeBaseDir: string,
  manifestPath: string,
  options: IngestionPipelineOptions = {}
): Promise<IngestionResult> {
  // Step 1: Load documents & validate frontmatter
  const documents = await loadKnowledgeBaseDocuments(knowledgeBaseDir, options.baseDir);

  // Step 2 & 3: Parse headings and split sections into chunks
  const allChunks: KnowledgeChunk[] = [];

  for (const doc of documents) {
    const sections = parseMarkdownHeadings(doc.rawContent, doc.frontmatter.title);
    const docChunks = await splitSectionsToChunks(
      doc.frontmatter,
      sections,
      doc.sourcePath,
      options
    );
    allChunks.push(...docChunks);
  }

  // Step 4: Verify global chunk ID uniqueness across all documents
  const seenIds = new Set<string>();
  for (const chunk of allChunks) {
    if (seenIds.has(chunk.id)) {
      throw new Error(
        `[Ingestion Error] Duplicate chunk ID detected: "${chunk.id}". Chunk IDs must be globally unique.`
      );
    }
    seenIds.add(chunk.id);
  }

  // Step 5: Read existing manifest
  const existingManifest = await readExistingManifest(manifestPath);

  // Step 6: Categorize changes
  const report = compareChunksWithManifest(allChunks, existingManifest);

  // Step 7: Persist manifest atomically (unless dryRun is enabled)
  let manifest = existingManifest;
  if (!options.dryRun) {
    manifest = await writeManifestAtomically(
      manifestPath,
      documents,
      allChunks,
      report,
      existingManifest
    );
  } else if (!manifest) {
    // In dry-run without an existing manifest, mock the manifest object for output
    manifest = {
      manifestVersion: '1.0.0',
      generatedAt: new Date().toISOString(),
      documentCount: documents.length,
      chunkCount: allChunks.length,
      documents: [],
      chunks: allChunks,
    };
  }

  return {
    manifest: manifest!,
    report,
    summary: {
      totalDocuments: documents.length,
      totalChunks: allChunks.length,
      addedCount: report.added.length,
      updatedCount: report.updated.length,
      unchangedCount: report.unchanged.length,
      removedCount: report.removed.length,
      isIdempotent: report.isIdempotent,
    },
  };
}

