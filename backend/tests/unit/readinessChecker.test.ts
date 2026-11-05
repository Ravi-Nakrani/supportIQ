import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MongoReadinessChecker } from '../../src/services/health/readinessChecker.js';

describe('MongoReadinessChecker (Unit)', () => {
  const fakeDbName = 'supportiq_test';
  const fakeVectorColl = 'knowledge_chunks';
  const fakeIndexName = 'supportiq_vector_index';
  const fakeUsageColl = 'daily_usage';

  it('should return degraded status when MongoClient is undefined', async () => {
    const checker = new MongoReadinessChecker({
      client: undefined,
      dbName: fakeDbName,
      vectorCollectionName: fakeVectorColl,
      vectorIndexName: fakeIndexName,
      usageCollectionName: fakeUsageColl,
    });

    const result = await checker.checkReadiness();
    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('MongoDB client is not connected');
  });

  it('should return degraded status when db.command ping fails', async () => {
    const mockDb = {
      command: vi.fn().mockRejectedValue(new Error('Connection refused')),
    };
    const mockClient = {
      db: vi.fn().mockReturnValue(mockDb),
    } as any;

    const checker = new MongoReadinessChecker({
      client: mockClient,
      dbName: fakeDbName,
      vectorCollectionName: fakeVectorColl,
      vectorIndexName: fakeIndexName,
      usageCollectionName: fakeUsageColl,
    });

    const result = await checker.checkReadiness();
    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('Connection refused');
  });

  it('should return degraded status when vector search index is missing', async () => {
    const mockCollection = {
      listSearchIndexes: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    };
    const mockDb = {
      command: vi.fn().mockResolvedValue({ ok: 1 }),
      collection: vi.fn().mockReturnValue(mockCollection),
    };
    const mockClient = {
      db: vi.fn().mockReturnValue(mockDb),
    } as any;

    const checker = new MongoReadinessChecker({
      client: mockClient,
      dbName: fakeDbName,
      vectorCollectionName: fakeVectorColl,
      vectorIndexName: fakeIndexName,
      usageCollectionName: fakeUsageColl,
    });

    const result = await checker.checkReadiness();
    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('Vector Search index "supportiq_vector_index" not found');
  });

  it('should return degraded status when vector search index is queryable but status is not READY', async () => {
    const mockCollection = {
      listSearchIndexes: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { name: fakeIndexName, status: 'BUILDING', queryable: true },
        ]),
      }),
    };
    const mockDb = {
      command: vi.fn().mockResolvedValue({ ok: 1 }),
      collection: vi.fn().mockReturnValue(mockCollection),
    };
    const mockClient = {
      db: vi.fn().mockReturnValue(mockDb),
    } as any;

    const checker = new MongoReadinessChecker({
      client: mockClient,
      dbName: fakeDbName,
      vectorCollectionName: fakeVectorColl,
      vectorIndexName: fakeIndexName,
      usageCollectionName: fakeUsageColl,
    });

    const result = await checker.checkReadiness();
    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('is not ready (status="BUILDING", queryable=true)');
  });

  it('should return degraded status when knowledge chunks in collection are incomplete relative to manifest', async () => {
    const mockCollection = {
      listSearchIndexes: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { name: fakeIndexName, status: 'READY', queryable: true },
        ]),
      }),
      countDocuments: vi.fn().mockResolvedValue(10), // less than the 39 manifest chunks
    };
    const mockDb = {
      command: vi.fn().mockResolvedValue({ ok: 1 }),
      collection: vi.fn().mockReturnValue(mockCollection),
    };
    const mockClient = {
      db: vi.fn().mockReturnValue(mockDb),
    } as any;

    const checker = new MongoReadinessChecker({
      client: mockClient,
      dbName: fakeDbName,
      vectorCollectionName: fakeVectorColl,
      vectorIndexName: fakeIndexName,
      usageCollectionName: fakeUsageColl,
    });

    const result = await checker.checkReadiness();
    expect(result.ready).toBe(false);
    expect(result.status).toBe('degraded');
    expect(result.reason).toContain('Knowledge base collection incomplete');
  });

  it('should return ready: true when all 4 checks pass and reuse cache within TTL', async () => {
    const mockVectorColl = {
      listSearchIndexes: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([
          { name: fakeIndexName, status: 'READY', queryable: true },
        ]),
      }),
      countDocuments: vi.fn().mockResolvedValue(39),
    };
    const mockUsageColl = {
      findOne: vi.fn().mockResolvedValue({ _id: '2026-11-05' }),
    };

    const mockDb = {
      command: vi.fn().mockResolvedValue({ ok: 1 }),
      collection: vi.fn().mockImplementation((name: string) => {
        if (name === fakeVectorColl) return mockVectorColl;
        if (name === fakeUsageColl) return mockUsageColl;
        return {};
      }),
    };
    const mockClient = {
      db: vi.fn().mockReturnValue(mockDb),
    } as any;

    const checker = new MongoReadinessChecker({
      client: mockClient,
      dbName: fakeDbName,
      vectorCollectionName: fakeVectorColl,
      vectorIndexName: fakeIndexName,
      usageCollectionName: fakeUsageColl,
      cacheTtlMs: 10000,
    });

    const result1 = await checker.checkReadiness();
    expect(result1.ready).toBe(true);
    expect(result1.status).toBe('ok');

    expect(mockDb.command).toHaveBeenCalledTimes(1);
    const result2 = await checker.checkReadiness();
    expect(result2.ready).toBe(true);
    expect(mockDb.command).toHaveBeenCalledTimes(1);
  });
});
