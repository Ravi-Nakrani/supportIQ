import { createHash } from 'node:crypto';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { MarkdownSection } from './markdownHeadingParser.js';
import { slugify } from './slugify.js';
import { ChunkMetadata, DocumentFrontmatter, KnowledgeChunk } from './types.js';

export interface SplitterOptions {
  chunkSize?: number;
  chunkOverlap?: number;
}

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_CHUNK_OVERLAP = 120;

export function computeMetadataHash(
  meta: Omit<ChunkMetadata, 'contentHash' | 'metadataHash'>
): string {
  const canonicalPayload = {
    category: meta.category,
    chunkIndex: meta.chunkIndex,
    documentVersion: meta.documentVersion,
    effectiveDate: meta.effectiveDate,
    headingHierarchy: meta.headingHierarchy,
    sectionTitle: meta.sectionTitle,
    sourceId: meta.sourceId,
    sourcePath: meta.sourcePath,
    sourceTitle: meta.sourceTitle,
  };

  return createHash('sha256')
    .update(JSON.stringify(canonicalPayload), 'utf8')
    .digest('hex');
}

export function computeContentHash(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

export async function splitSectionsToChunks(
  frontmatter: DocumentFrontmatter,
  sections: MarkdownSection[],
  sourcePath: string,
  options: SplitterOptions = {}
): Promise<KnowledgeChunk[]> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunkOverlap = options.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP;

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n', '\n', '. ', ' ', ''],
  });

  const chunks: KnowledgeChunk[] = [];
  let documentWideChunkIndex = 0;

  for (const section of sections) {
    const rawContent = section.content.trim();
    if (!rawContent) {
      continue;
    }

    let subChunkTexts: string[];
    if (rawContent.length <= chunkSize) {
      subChunkTexts = [rawContent];
    } else {
      subChunkTexts = await splitter.splitText(rawContent);
    }

    const sectionSlug = slugify(section.sectionTitle);

    for (const chunkText of subChunkTexts) {
      const cleanText = chunkText.trim();
      if (!cleanText) {
        continue;
      }

      const chunkIndex = documentWideChunkIndex++;
      const id = `${frontmatter.id}#${sectionSlug}#${chunkIndex}`;
      const contentHash = computeContentHash(cleanText);

      const metadataWithoutHashes: Omit<ChunkMetadata, 'contentHash' | 'metadataHash'> = {
        sourceId: frontmatter.id,
        sourceTitle: frontmatter.title,
        category: frontmatter.category,
        documentVersion: frontmatter.version,
        effectiveDate: frontmatter.effectiveDate,
        sectionTitle: section.sectionTitle,
        headingHierarchy: section.headingHierarchy,
        sourcePath,
        chunkIndex,
      };

      const metadataHash = computeMetadataHash(metadataWithoutHashes);

      const metadata: ChunkMetadata = {
        ...metadataWithoutHashes,
        contentHash,
        metadataHash,
      };

      chunks.push({
        id,
        text: cleanText,
        metadata,
      });
    }
  }

  return chunks;
}

