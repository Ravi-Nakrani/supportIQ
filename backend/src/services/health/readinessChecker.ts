import type { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import { readExistingManifest } from '../rag/ingestion/manifestService.js';

export interface ReadinessResult {
  ready: boolean;
  status: 'ok' | 'degraded';
  timestamp: string;
  version: string;
  reason?: string | undefined;
}

export interface IReadinessChecker {
  checkReadiness(): Promise<ReadinessResult>;
}

export interface MongoReadinessCheckerOptions {
  client?: MongoClient | undefined;
  dbName: string;
  vectorCollectionName: string;
  vectorIndexName: string;
  usageCollectionName: string;
  manifestPath?: string | undefined;
  cacheTtlMs?: number | undefined;
}

/**
 * Validates deep runtime dependency readiness for SupportIQ.
 *
 * Checks:
 * 1. MongoDB Atlas connectivity via ping.
 * 2. Vector search index presence on the vector collection, requiring BOTH
 *    `status === 'READY'` and `queryable === true`.
 * 3. Knowledge base data integrity: verifies all expected chunk IDs derived from
 *    the canonical manifest exist in the vector collection.
 * 4. Usage tracking collection accessibility.
 *
 * Invariant: Never invokes OpenAI models or incurs API credit expenditure.
 * Caches readiness results for 15 seconds to prevent database load spikes.
 */
export class MongoReadinessChecker implements IReadinessChecker {
  private readonly client: MongoClient | undefined;
  private readonly dbName: string;
  private readonly vectorCollectionName: string;
  private readonly vectorIndexName: string;
  private readonly usageCollectionName: string;
  private readonly manifestPath: string;
  private readonly cacheTtlMs: number;

  private cachedResult: ReadinessResult | null = null;
  private cachedAt = 0;

  constructor(options: MongoReadinessCheckerOptions) {
    this.client = options.client;
    this.dbName = options.dbName;
    this.vectorCollectionName = options.vectorCollectionName;
    this.vectorIndexName = options.vectorIndexName;
    this.usageCollectionName = options.usageCollectionName;
    this.manifestPath =
      options.manifestPath ??
      fileURLToPath(new URL('../../../knowledge-base/shopease-manifest.json', import.meta.url));
    this.cacheTtlMs = options.cacheTtlMs ?? 15000;
  }

  async checkReadiness(): Promise<ReadinessResult> {
    const now = Date.now();
    if (this.cachedResult && now - this.cachedAt < this.cacheTtlMs) {
      return {
        ...this.cachedResult,
        timestamp: new Date().toISOString(),
      };
    }

    const version = '1.0.0';

    if (!this.client) {
      const result: ReadinessResult = {
        ready: false,
        status: 'degraded',
        timestamp: new Date().toISOString(),
        version,
        reason: 'MongoDB client is not connected',
      };
      this.cachedResult = result;
      this.cachedAt = now;
      return result;
    }

    try {
      const db = this.client.db(this.dbName);

      // 1. Verify MongoDB cluster connectivity
      await db.command({ ping: 1 });

      // 2. Verify supportiq_vector_index exists, status === 'READY' and queryable === true
      const vectorCollection = db.collection<{ _id: string }>(this.vectorCollectionName);
      let targetIndex: { name?: string; status?: string; queryable?: boolean } | undefined;

      try {
        const cursor = vectorCollection.listSearchIndexes(this.vectorIndexName);
        const indexes = await cursor.toArray();
        targetIndex = indexes.find((idx) => idx.name === this.vectorIndexName);
      } catch (indexErr) {
        const result: ReadinessResult = {
          ready: false,
          status: 'degraded',
          timestamp: new Date().toISOString(),
          version,
          reason: `Failed to query Vector Search indexes: ${indexErr instanceof Error ? indexErr.message : String(indexErr)}`,
        };
        this.cachedResult = result;
        this.cachedAt = now;
        return result;
      }

      if (!targetIndex) {
        const result: ReadinessResult = {
          ready: false,
          status: 'degraded',
          timestamp: new Date().toISOString(),
          version,
          reason: `Vector Search index "${this.vectorIndexName}" not found on collection "${this.vectorCollectionName}"`,
        };
        this.cachedResult = result;
        this.cachedAt = now;
        return result;
      }

      if (targetIndex.status !== 'READY' || targetIndex.queryable !== true) {
        const result: ReadinessResult = {
          ready: false,
          status: 'degraded',
          timestamp: new Date().toISOString(),
          version,
          reason: `Vector Search index "${this.vectorIndexName}" is not ready (status="${targetIndex.status}", queryable=${targetIndex.queryable})`,
        };
        this.cachedResult = result;
        this.cachedAt = now;
        return result;
      }

      // 3. Derive expected knowledge base data from manifest and verify collection contents
      const manifest = await readExistingManifest(this.manifestPath);
      if (!manifest || !manifest.chunks || manifest.chunks.length === 0) {
        const result: ReadinessResult = {
          ready: false,
          status: 'degraded',
          timestamp: new Date().toISOString(),
          version,
          reason: `Knowledge base manifest could not be read or is empty at "${this.manifestPath}"`,
        };
        this.cachedResult = result;
        this.cachedAt = now;
        return result;
      }

      const expectedChunkIds = manifest.chunks.map((c) => c.id);
      const matchingCount = await vectorCollection.countDocuments({
        _id: { $in: expectedChunkIds },
      });

      if (matchingCount < expectedChunkIds.length) {
        const result: ReadinessResult = {
          ready: false,
          status: 'degraded',
          timestamp: new Date().toISOString(),
          version,
          reason: `Knowledge base collection incomplete: found ${matchingCount} of ${expectedChunkIds.length} expected manifest chunks`,
        };
        this.cachedResult = result;
        this.cachedAt = now;
        return result;
      }

      // 4. Verify daily_usage collection accessibility
      const usageCollection = db.collection(this.usageCollectionName);
      await usageCollection.findOne({}, { projection: { _id: 1 } });

      const result: ReadinessResult = {
        ready: true,
        status: 'ok',
        timestamp: new Date().toISOString(),
        version,
      };
      this.cachedResult = result;
      this.cachedAt = now;
      return result;
    } catch (err) {
      const result: ReadinessResult = {
        ready: false,
        status: 'degraded',
        timestamp: new Date().toISOString(),
        version,
        reason: `Readiness check exception: ${err instanceof Error ? err.message : String(err)}`,
      };
      this.cachedResult = result;
      this.cachedAt = now;
      return result;
    }
  }
}
