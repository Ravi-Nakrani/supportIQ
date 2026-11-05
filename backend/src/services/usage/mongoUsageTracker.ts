import { Collection, Db, MongoClient, Document } from 'mongodb';
import {
  DailyUsageSnapshot,
  IUsageTracker,
  ReconcileUsageParams,
  UsageReservation,
} from './types.js';

export interface MongoUsageTrackerOptions {
  client: MongoClient;
  dbName: string;
  collectionName?: string | undefined;
  dailyMaxRequests: number;
  dailyMaxTokens: number;
  dailyMaxBudgetMicroUsd: number;
  reservedCostMicroUsd: number;
  reservedTokens: number;
  reservedRequests?: number | undefined;
}

interface MongoUsageDoc extends Document {
  _id: string; // UTC date string "YYYY-MM-DD"
  requestCount: number;
  totalTokens: number;
  estimatedCostMicroUsd: number;
  createdAt: Date;
  updatedAt?: Date;
}

/**
 * Production MongoDB-backed persistent usage tracker.
 * Enforces atomic hard-cap reservations against the daily_usage collection with fail-closed safety.
 */
export class MongoUsageTracker implements IUsageTracker {
  private readonly client: MongoClient;
  private readonly dbName: string;
  private readonly collectionName: string;
  private readonly dailyMaxRequests: number;
  private readonly dailyMaxTokens: number;
  private readonly dailyMaxBudgetMicroUsd: number;
  private readonly reservedCostMicroUsd: number;
  private readonly reservedTokens: number;
  private readonly reservedRequests: number;

  private collection: Collection<MongoUsageDoc> | null = null;

  constructor(options: MongoUsageTrackerOptions) {
    this.client = options.client;
    this.dbName = options.dbName;
    this.collectionName = options.collectionName ?? 'daily_usage';
    this.dailyMaxRequests = options.dailyMaxRequests;
    this.dailyMaxTokens = options.dailyMaxTokens;
    this.dailyMaxBudgetMicroUsd = options.dailyMaxBudgetMicroUsd;
    this.reservedCostMicroUsd = options.reservedCostMicroUsd;
    this.reservedTokens = options.reservedTokens;
    this.reservedRequests = options.reservedRequests ?? 1;
  }

  private getCollection(): Collection<MongoUsageDoc> {
    if (!this.collection) {
      const db: Db = this.client.db(this.dbName);
      this.collection = db.collection<MongoUsageDoc>(this.collectionName);
    }
    return this.collection;
  }

  async checkAndReserve(): Promise<UsageReservation> {
    const dateKey = new Date().toISOString().slice(0, 10);
    const col = this.getCollection();

    // 1. Idempotently initialize daily document, handling concurrent duplicate-key race (E11000)
    try {
      await col.updateOne(
        { _id: dateKey },
        {
          $setOnInsert: {
            requestCount: 0,
            totalTokens: 0,
            estimatedCostMicroUsd: 0,
            createdAt: new Date(),
          },
        },
        { upsert: true }
      );
    } catch (err: unknown) {
      // If code is 11000 (duplicate key error), another concurrent request already initialized the day
      if ((err as { code?: number })?.code !== 11000) {
        throw new Error(
          `[Usage Tracker Error] Failed to initialize daily usage document: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // 2. Atomic reservation: strictly verify current usage + reservation <= configured limit
    const res = await col.findOneAndUpdate(
      {
        _id: dateKey,
        requestCount: { $lte: this.dailyMaxRequests - this.reservedRequests },
        totalTokens: { $lte: this.dailyMaxTokens - this.reservedTokens },
        estimatedCostMicroUsd: { $lte: this.dailyMaxBudgetMicroUsd - this.reservedCostMicroUsd },
      },
      {
        $inc: {
          requestCount: this.reservedRequests,
          totalTokens: this.reservedTokens,
          estimatedCostMicroUsd: this.reservedCostMicroUsd,
        },
        $set: { updatedAt: new Date() },
      },
      { returnDocument: 'after' }
    );

    if (!res) {
      // Ceiling was reached; inspect current document to classify specific limit breach
      const currentDoc = await col.findOne({ _id: dateKey });
      let reason: 'DAILY_REQUESTS_EXCEEDED' | 'DAILY_TOKENS_EXCEEDED' | 'DAILY_COST_EXCEEDED' =
        'DAILY_COST_EXCEEDED';

      if (currentDoc) {
        if (currentDoc.requestCount + this.reservedRequests > this.dailyMaxRequests) {
          reason = 'DAILY_REQUESTS_EXCEEDED';
        } else if (currentDoc.totalTokens + this.reservedTokens > this.dailyMaxTokens) {
          reason = 'DAILY_TOKENS_EXCEEDED';
        }
      }

      return {
        allowed: false,
        dateKey,
        reservedRequests: 0,
        reservedTokens: 0,
        reservedCostMicroUsd: 0,
        reason,
      };
    }

    return {
      allowed: true,
      dateKey,
      reservedRequests: this.reservedRequests,
      reservedTokens: this.reservedTokens,
      reservedCostMicroUsd: this.reservedCostMicroUsd,
    };
  }

  async reconcileUsage(params: ReconcileUsageParams): Promise<void> {
    // Fail closed on unverified/incomplete usage: retain the reservation in full
    if (
      !params.isComplete ||
      params.actualTokens === undefined ||
      params.actualCostMicroUsd === undefined
    ) {
      return;
    }

    const deltaTokens = Math.min(0, params.actualTokens - params.reservedTokens);
    const deltaCost = Math.min(0, params.actualCostMicroUsd - params.reservedCostMicroUsd);

    if (deltaTokens === 0 && deltaCost === 0) {
      return;
    }

    const col = this.getCollection();
    // Reconcile against the original preserved reservation dateKey!
    await col.updateOne(
      { _id: params.dateKey },
      {
        $inc: {
          totalTokens: deltaTokens,
          estimatedCostMicroUsd: deltaCost,
        },
        $set: { updatedAt: new Date() },
      }
    );
  }

  async getDailyUsage(dateKey?: string): Promise<DailyUsageSnapshot> {
    const key = dateKey ?? new Date().toISOString().slice(0, 10);
    const col = this.getCollection();
    const doc = await col.findOne({ _id: key });

    if (!doc) {
      return {
        dateKey: key,
        requestCount: 0,
        totalTokens: 0,
        estimatedCostMicroUsd: 0,
      };
    }

    return {
      dateKey: key,
      requestCount: doc.requestCount,
      totalTokens: doc.totalTokens,
      estimatedCostMicroUsd: doc.estimatedCostMicroUsd,
    };
  }
}

