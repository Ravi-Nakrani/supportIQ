import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngestionPipeline } from '../src/services/rag/ingestion/ingestionPipeline.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const backendRoot = resolve(__dirname, '..');
  const knowledgeBaseDir = resolve(backendRoot, 'knowledge-base', 'shopease');
  const manifestPath = resolve(backendRoot, 'knowledge-base', 'shopease-manifest.json');

  console.log('='.repeat(65));
  console.log('  ShopEase Knowledge Base Ingestion (Phase 2)');
  console.log('='.repeat(65));
  console.log(`Source directory : ${knowledgeBaseDir}`);
  console.log(`Target manifest  : ${manifestPath}\n`);

  const startTime = Date.now();

  try {
    const result = await runIngestionPipeline(knowledgeBaseDir, manifestPath, {
      baseDir: backendRoot,
    });

    const elapsed = Date.now() - startTime;

    console.log('Execution Summary:');
    console.log(`  - Total Documents : ${result.summary.totalDocuments}`);
    console.log(`  - Total Chunks    : ${result.summary.totalChunks}`);
    console.log(`  - Added Chunks    : ${result.summary.addedCount}`);
    console.log(`  - Updated Chunks  : ${result.summary.updatedCount}`);
    console.log(`  - Unchanged Chunks: ${result.summary.unchangedCount}`);
    console.log(`  - Removed Chunks  : ${result.summary.removedCount}`);
    console.log(`  - Idempotent Run  : ${result.summary.isIdempotent ? 'YES (No changes detected)' : 'NO (Manifest updated)'}`);
    console.log(`  - Execution Time  : ${elapsed}ms\n`);

    console.log('Document Breakdown:');
    for (const doc of result.manifest.documents) {
      console.log(`  * [${doc.sourceId}]`);
      console.log(`      Title: "${doc.sourceTitle}" (${doc.category})`);
      console.log(`      Sections: ${doc.sectionCount} | Chunks: ${doc.totalChunks}`);
    }

    console.log('\n' + '='.repeat(65));
    console.log('  Ingestion completed successfully.');
    console.log('='.repeat(65));
  } catch (error) {
    console.error('\n[INGESTION ERROR] Ingestion failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();

