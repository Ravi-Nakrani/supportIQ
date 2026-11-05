import { Collection, Db, MongoClient, Document } from 'mongodb';
import { VectorConfig, assertMongoConfig } from '../../../config/vector.config.js';
import {
  IVectorStore,
  StoredChunkSignature,
  VectorDocument,
  VectorSearchOptions,
  VectorSearchResult,
} from './types.js';
import { ChunkMetadata } from '../ingestion/types.js';

export interface MongoAtlasVectorStoreOptions {
  config: VectorConfig;
  client?: MongoClient;
}

interface MongoVectorDoc extends Document {
  _id: string;
  text: string;
  embedding: number[];
  metadata: ChunkMetadata;
  embeddingConfig: {
    model: string;
    dimensions: number;
    fingerprint: string;
  };
  createdAt?: Date;
  updatedAt?: Date;
  score?: number;
}

export class MongoAtlasVectorStore implements IVectorStore {
  private readonly config: VectorConfig;
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<MongoVectorDoc> | null = null;
  private isExternalClient = false;

  constructor(options: MongoAtlasVectorStoreOptions) {
    this.config = options.config;
    if (options.client) {
      this.client = options.client;
      this.isExternalClient = true;
    }
  }

  private async getCollection(): Promise<Collection<MongoVectorDoc>> {
    if (this.collection) {
      return this.collection;
    }

    if (!this.client) {
      assertMongoConfig(this.config);
      this.client = new MongoClient(this.config.mongoUri, {
        appName: 'supportiq-backend',
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
      });
      await this.client.connect();
    }

    this.db = this.client.db(this.config.dbName);
    this.collection = this.db.collection<MongoVectorDoc>(this.config.collectionName);
    return this.collection;
  }

  async search(
    queryVector: number[],
    options: VectorSearchOptions
  ): Promise<VectorSearchResult[]> {
    if (queryVector.length !== this.config.embeddingDimensions) {
      throw new Error(
        `[Vector Store Error] Query vector dimensions (${queryVector.length}) ` +
          `do not match configured dimensions (${this.config.embeddingDimensions}).`
      );
    }

    const collection = await this.getCollection();
    const topK = Math.max(1, Math.min(10, options.topK));
    const numCandidates = Math.max(topK * 10, 20);

    const vectorSearchStage: Record<string, unknown> = {
      index: this.config.indexName,
      path: 'embedding',
      queryVector,
      numCandidates,
      limit: topK,
    };

    if (options.filter && Object.keys(options.filter).length > 0) {
      vectorSearchStage.filter = options.filter;
    }

    const pipeline: Document[] = [
      {
        $vectorSearch: vectorSearchStage,
      },
      {
        $project: {
          _id: 1,
          text: 1,
          metadata: 1,
          embeddingConfig: 1,
          score: { $meta: 'vectorSearchScore' },
        },
      },
    ];

    try {
      const aggregateOptions: { maxTimeMS?: number; signal?: AbortSignal } = {};
      if (options.maxTimeMs !== undefined) {
        aggregateOptions.maxTimeMS = options.maxTimeMs;
      }
      if (options.signal !== undefined) {
        aggregateOptions.signal = options.signal;
      }

      const cursor = collection.aggregate<MongoVectorDoc>(pipeline, aggregateOptions);

      const docs = await cursor.toArray();

      const results: VectorSearchResult[] = [];
      const minScore = options.minScore ?? 0.0;

      for (const doc of docs) {
        const score = typeof doc.score === 'number' ? doc.score : 0.0;
        if (score >= minScore) {
          results.push({
            id: doc._id,
            text: doc.text,
            metadata: doc.metadata,
            score,
          });
        }
      }

      return results;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes('index not found') || message.includes('Query vector dimensions')) {
        throw new Error(
          `[Atlas Search Error] Vector index failure on "${this.config.indexName}": ${message}. ` +
            'Please verify index name and 1536 dimension definition in docs/ATLAS_VECTOR_SEARCH.md.'
        );
      }
      throw err;
    }
  }

  async getStoredSignatures(): Promise<StoredChunkSignature[]> {
    const collection = await this.getCollection();
    const docs = await collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            'metadata.contentHash': 1,
            'metadata.metadataHash': 1,
            'embeddingConfig.model': 1,
            'embeddingConfig.dimensions': 1,
            'embeddingConfig.fingerprint': 1,
          },
        }
      )
      .toArray();

    return docs.map((doc) => ({
      id: doc._id,
      contentHash: doc.metadata?.contentHash ?? '',
      metadataHash: doc.metadata?.metadataHash ?? '',
      embeddingConfig: {
        model: doc.embeddingConfig?.model ?? '',
        dimensions: doc.embeddingConfig?.dimensions ?? 0,
        fingerprint: doc.embeddingConfig?.fingerprint ?? '',
      },
    }));
  }

  async bulkUpsert(
    chunks: VectorDocument[]
  ): Promise<{ upsertedCount: number; modifiedCount: number }> {
    if (chunks.length === 0) {
      return { upsertedCount: 0, modifiedCount: 0 };
    }

    const collection = await this.getCollection();
    const now = new Date();

    const operations = chunks.map((chunk) => ({
      updateOne: {
        filter: { _id: chunk.id },
        update: {
          $set: {
            text: chunk.text,
            embedding: chunk.embedding,
            metadata: chunk.metadata,
            embeddingConfig: chunk.embeddingConfig,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    }));

    const result = await collection.bulkWrite(operations, { ordered: false });
    return {
      upsertedCount: result.upsertedCount,
      modifiedCount: result.modifiedCount,
    };
  }

  async updateMetadataBatch(
    updates: Array<{ id: string; metadata: ChunkMetadata }>
  ): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    const collection = await this.getCollection();
    const now = new Date();

    const operations = updates.map((update) => ({
      updateOne: {
        filter: { _id: update.id },
        update: {
          $set: {
            metadata: update.metadata,
            updatedAt: now,
          },
        },
      },
    }));

    const result = await collection.bulkWrite(operations, { ordered: false });
    return result.modifiedCount;
  }

  async deleteByIds(ids: string[]): Promise<number> {
    if (ids.length === 0) {
      return 0;
    }

    const collection = await this.getCollection();
    const result = await collection.deleteMany({ _id: { $in: ids } });
    return result.deletedCount;
  }

  async ping(): Promise<boolean> {
    try {
      const collection = await this.getCollection();
      await collection.db.command({ ping: 1 });
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.client && !this.isExternalClient) {
      await this.client.close();
      this.client = null;
      this.collection = null;
      this.db = null;
    }
  }
}
