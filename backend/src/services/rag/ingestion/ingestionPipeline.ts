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

export async function runIngestionPipeline(
  knowledgeBaseDir: string,
  manifestPath: string,
  options: IngestionPipelineOptions = {}
): Promise<IngestionResult> {
  const documents = await loadKnowledgeBaseDocuments(knowledgeBaseDir, options.baseDir);

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

  const seenIds = new Set<string>();
  for (const chunk of allChunks) {
    if (seenIds.has(chunk.id)) {
      throw new Error(
        `[Ingestion Error] Duplicate chunk ID detected: "${chunk.id}". Chunk IDs must be globally unique.`
      );
    }
    seenIds.add(chunk.id);
  }

  const existingManifest = await readExistingManifest(manifestPath);

  const report = compareChunksWithManifest(allChunks, existingManifest);

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

