import { z } from 'zod';

export const FrontmatterSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "Frontmatter 'id' is required")
    .regex(/^[a-z0-9-]+$/, "Frontmatter 'id' must be kebab-case (e.g., 'shopease-returns-policy')"),
  title: z
    .string()
    .trim()
    .min(1, "Frontmatter 'title' is required"),
  category: z
    .string()
    .trim()
    .min(1, "Frontmatter 'category' is required"),
  version: z
    .string()
    .trim()
    .regex(/^\d+\.\d+\.\d+$/, "Frontmatter 'version' must follow semver format (e.g. '1.0.0')"),
  effectiveDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Frontmatter 'effectiveDate' must be in 'YYYY-MM-DD' format"),
});

export type DocumentFrontmatter = z.infer<typeof FrontmatterSchema>;

export interface SourceDocument {
  frontmatter: DocumentFrontmatter;
  rawContent: string;
  sourcePath: string;
}

export interface ChunkMetadata {
  sourceId: string;
  sourceTitle: string;
  category: string;
  documentVersion: string;
  effectiveDate: string;
  sectionTitle: string;
  headingHierarchy: string[];
  sourcePath: string;
  chunkIndex: number;
  contentHash: string;
  metadataHash: string;
}

export interface KnowledgeChunk {
  id: string;
  text: string;
  metadata: ChunkMetadata;
}

export interface DocumentManifestSummary {
  sourceId: string;
  sourceTitle: string;
  category: string;
  version: string;
  effectiveDate: string;
  sourcePath: string;
  sectionCount: number;
  totalChunks: number;
}

export interface ManifestData {
  manifestVersion: string;
  generatedAt: string;
  documentCount: number;
  chunkCount: number;
  documents: DocumentManifestSummary[];
  chunks: KnowledgeChunk[];
}

export interface IngestionChangeReport {
  added: KnowledgeChunk[];
  updated: KnowledgeChunk[];
  unchanged: KnowledgeChunk[];
  removed: Array<{ id: string; sourceId: string; sectionTitle: string }>;
  isIdempotent: boolean;
}

export interface IngestionResult {
  manifest: ManifestData;
  report: IngestionChangeReport;
  summary: {
    totalDocuments: number;
    totalChunks: number;
    addedCount: number;
    updatedCount: number;
    unchangedCount: number;
    removedCount: number;
    isIdempotent: boolean;
  };
}

