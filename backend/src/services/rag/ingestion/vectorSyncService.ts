import { IEmbeddingService } from '../embeddings/types.js';
import { IVectorStore, VectorDocument } from '../vector-store/types.js';
import { ChunkMetadata, KnowledgeChunk } from './types.js';

export interface VectorSyncOptions {
  batchSize?: number;
}

export interface VectorSyncReport {
  totalManifestChunks: number;
  added: number;
  reEmbedded: number;
  metadataUpdated: number;
  staleDeleted: number;
  unchanged: number;
  isFullySynced: boolean;
}

export interface SyncPlan {
  toEmbed: KnowledgeChunk[];
  toUpdateMetadata: Array<{ id: string; metadata: ChunkMetadata }>;
  toDeleteIds: string[];
  unchangedCount: number;
  isAdded: Set<string>;
  isReEmbedded: Set<string>;
}

export function planVectorSync(
  manifestChunks: KnowledgeChunk[],
  storedSignatures: Array<{
    id: string;
    contentHash: string;
    metadataHash: string;
    embeddingConfig?: { fingerprint: string };
  }>,
  currentFingerprint: string
): SyncPlan {
  const storedMap = new Map(storedSignatures.map((s) => [s.id, s]));
  const manifestMap = new Map(manifestChunks.map((c) => [c.id, c]));

  const toEmbed: KnowledgeChunk[] = [];
  const toUpdateMetadata: Array<{ id: string; metadata: ChunkMetadata }> = [];
  const isAdded = new Set<string>();
  const isReEmbedded = new Set<string>();
  let unchangedCount = 0;

  for (const chunk of manifestChunks) {
    const stored = storedMap.get(chunk.id);

    if (!stored) {
      toEmbed.push(chunk);
      isAdded.add(chunk.id);
      continue;
    }

    const storedFingerprint = stored.embeddingConfig?.fingerprint ?? '';
    const fingerprintMismatch = storedFingerprint !== currentFingerprint;
    const contentMismatch = stored.contentHash !== chunk.metadata.contentHash;

    if (contentMismatch || fingerprintMismatch) {
      toEmbed.push(chunk);
      isReEmbedded.add(chunk.id);
    } else if (stored.metadataHash !== chunk.metadata.metadataHash) {
      toUpdateMetadata.push({ id: chunk.id, metadata: chunk.metadata });
    } else {
      unchangedCount++;
    }
  }

  const toDeleteIds: string[] = [];
  for (const stored of storedSignatures) {
    if (!manifestMap.has(stored.id)) {
      toDeleteIds.push(stored.id);
    }
  }

  return {
    toEmbed,
    toUpdateMetadata,
    toDeleteIds,
    unchangedCount,
    isAdded,
    isReEmbedded,
  };
}

export async function syncVectors(
  manifestChunks: KnowledgeChunk[],
  vectorStore: IVectorStore,
  embeddingService: IEmbeddingService,
  options: VectorSyncOptions = {}
): Promise<VectorSyncReport> {
  const batchSize = Math.max(1, Math.min(50, options.batchSize ?? 20));
  const currentFingerprint = embeddingService.getConfigFingerprint();

  const storedSignatures = await vectorStore.getStoredSignatures();

  const plan = planVectorSync(manifestChunks, storedSignatures, currentFingerprint);

  let addedCount = 0;
  let reEmbeddedCount = 0;

  for (let i = 0; i < plan.toEmbed.length; i += batchSize) {
    const chunkBatch = plan.toEmbed.slice(i, i + batchSize);
    const textBatch = chunkBatch.map((c) => c.text);

    const embeddings = await embeddingService.embedDocuments(textBatch, {
      maxRetries: 2,
    });

    const docsToUpsert: VectorDocument[] = chunkBatch.map((chunk, idx) => ({
      id: chunk.id,
      text: chunk.text,
      embedding: embeddings[idx]!,
      metadata: chunk.metadata,
      embeddingConfig: {
        model: embeddingService.getModelName(),
        dimensions: embeddingService.getDimensions(),
        fingerprint: currentFingerprint,
      },
    }));

    await vectorStore.bulkUpsert(docsToUpsert);

    for (const chunk of chunkBatch) {
      if (plan.isAdded.has(chunk.id)) {
        addedCount++;
      } else if (plan.isReEmbedded.has(chunk.id)) {
        reEmbeddedCount++;
      }
    }
  }

  let metadataUpdatedCount = 0;
  if (plan.toUpdateMetadata.length > 0) {
    metadataUpdatedCount = await vectorStore.updateMetadataBatch(plan.toUpdateMetadata);
  }

  let staleDeletedCount = 0;
  if (plan.toDeleteIds.length > 0) {
    staleDeletedCount = await vectorStore.deleteByIds(plan.toDeleteIds);
  }

  const isFullySynced =
    addedCount === 0 &&
    reEmbeddedCount === 0 &&
    metadataUpdatedCount === 0 &&
    staleDeletedCount === 0;

  return {
    totalManifestChunks: manifestChunks.length,
    added: addedCount,
    reEmbedded: reEmbeddedCount,
    metadataUpdated: metadataUpdatedCount,
    staleDeleted: staleDeletedCount,
    unchanged: plan.unchangedCount,
    isFullySynced,
  };
}

