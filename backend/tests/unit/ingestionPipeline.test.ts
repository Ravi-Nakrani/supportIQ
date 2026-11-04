import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runIngestionPipeline } from '../../src/services/rag/ingestion/ingestionPipeline.js';

describe('Ingestion Pipeline (Integration / Unit)', () => {
  let testDir: string;
  let kbDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    testDir = join(
      tmpdir(),
      `supportiq-pipeline-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    kbDir = join(testDir, 'knowledge-base', 'shopease');
    manifestPath = join(testDir, 'knowledge-base', 'shopease-manifest.json');

    await mkdir(kbDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('should run end-to-end ingestion and write the canonical manifest', async () => {
    const doc1 = `---
id: shopease-returns-policy
title: ShopEase Returns Policy
category: Returns
version: 1.0.0
effectiveDate: 2026-01-01
---

# ShopEase Returns Policy

## Overview
Returns are accepted within 30 days of delivery.

## Defective Items
Defective items receive immediate full refund or replacement.`;

    const doc2 = `---
id: shopease-shipping-policy
title: ShopEase Shipping Policy
category: Shipping
version: 1.0.0
effectiveDate: 2026-01-01
---

# ShopEase Shipping Policy

## Standard Delivery
Standard shipping takes 3 to 5 business days.`;

    await writeFile(join(kbDir, 'returns-policy.md'), doc1, 'utf8');
    await writeFile(join(kbDir, 'shipping-policy.md'), doc2, 'utf8');

    // First execution
    const firstRun = await runIngestionPipeline(kbDir, manifestPath);

    expect(firstRun.summary.totalDocuments).toBe(2);
    expect(firstRun.summary.totalChunks).toBe(3);
    expect(firstRun.summary.addedCount).toBe(3);
    expect(firstRun.summary.isIdempotent).toBe(false);

    // Verify chunk ID structure and global uniqueness
    const chunkIds = firstRun.manifest.chunks.map((c) => c.id);
    expect(new Set(chunkIds).size).toBe(3);
    expect(chunkIds).toContain('shopease-returns-policy#overview#0');
    expect(chunkIds).toContain('shopease-returns-policy#defective-items#1');
    expect(chunkIds).toContain('shopease-shipping-policy#standard-delivery#0');

    // Second execution against identical content must be strictly idempotent
    const secondRun = await runIngestionPipeline(kbDir, manifestPath);

    expect(secondRun.summary.isIdempotent).toBe(true);
    expect(secondRun.summary.addedCount).toBe(0);
    expect(secondRun.summary.updatedCount).toBe(0);
    expect(secondRun.summary.unchangedCount).toBe(3);
    expect(secondRun.summary.removedCount).toBe(0);

    // generatedAt timestamp must be preserved unchanged
    expect(secondRun.manifest.generatedAt).toBe(firstRun.manifest.generatedAt);
  });

  it('should detect duplicate source IDs across distinct files and fail fast', async () => {
    const doc1 = `---
id: duplicate-policy-id
title: Policy A
category: General
version: 1.0.0
effectiveDate: 2026-01-01
---
# Content A`;

    const doc2 = `---
id: duplicate-policy-id
title: Policy B
category: General
version: 1.0.0
effectiveDate: 2026-01-01
---
# Content B`;

    await writeFile(join(kbDir, 'policy-a.md'), doc1, 'utf8');
    await writeFile(join(kbDir, 'policy-b.md'), doc2, 'utf8');

    await expect(runIngestionPipeline(kbDir, manifestPath)).rejects.toThrowError(
      /Duplicate source ID "duplicate-policy-id" detected/
    );
  });

  it('should detect when a document is modified and track it as updated', async () => {
    const doc = `---
id: shopease-returns-policy
title: ShopEase Returns Policy
category: Returns
version: 1.0.0
effectiveDate: 2026-01-01
---

## Overview
Original content text.`;

    await writeFile(join(kbDir, 'returns.md'), doc, 'utf8');
    await runIngestionPipeline(kbDir, manifestPath);

    // Modify the content
    const modifiedDoc = doc.replace('Original content text.', 'Altered content text.');
    await writeFile(join(kbDir, 'returns.md'), modifiedDoc, 'utf8');

    const rerun = await runIngestionPipeline(kbDir, manifestPath);

    expect(rerun.summary.updatedCount).toBe(1);
    expect(rerun.summary.unchangedCount).toBe(0);
    expect(rerun.summary.isIdempotent).toBe(false);
  });
});

