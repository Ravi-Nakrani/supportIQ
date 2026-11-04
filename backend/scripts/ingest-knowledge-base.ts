import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runIngestionPipeline } from '../src/services/rag/ingestion/ingestionPipeline.js';
import { syncVectors } from '../src/services/rag/ingestion/vectorSyncService.js';
import {
  getVectorConfig,
  assertMongoConfig,
  assertOpenAIConfig,
} from '../src/config/vector.config.js';
import { MongoAtlasVectorStore } from '../src/services/rag/vector-store/mongoAtlasVectorStore.js';
import { OpenAIEmbeddingService } from '../src/services/rag/embeddings/openaiEmbeddingService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main(): Promise<void> {
  const backendRoot = resolve(__dirname, '..');
  const knowledgeBaseDir = resolve(backendRoot, 'knowledge-base', 'shopease');
  const manifestPath = resolve(backendRoot, 'knowledge-base', 'shopease-manifest.json');

  const args = process.argv.slice(2);
  const syncVectorsRequested = args.includes('--sync-vectors') || args.includes('-s');

  console.log('='.repeat(65));
  console.log('  ShopEase Knowledge Base Ingestion & Vector Sync (Phase 3)');
  console.log('='.repeat(65));
  console.log(`Source directory : ${knowledgeBaseDir}`);
  console.log(`Target manifest  : ${manifestPath}`);
  console.log(`Sync Vectors     : ${syncVectorsRequested ? 'ENABLED (--sync-vectors)' : 'DISABLED (Manifest update only)'}\n`);

  const startTime = Date.now();

  try {
    // 1. Run file-to-manifest pipeline
    const result = await runIngestionPipeline(knowledgeBaseDir, manifestPath, {
      baseDir: backendRoot,
    });

    const elapsed = Date.now() - startTime;

    console.log('Manifest Pipeline Summary:');
    console.log(`  - Total Documents : ${result.summary.totalDocuments}`);
    console.log(`  - Total Chunks    : ${result.summary.totalChunks}`);
    console.log(`  - Added Chunks    : ${result.summary.addedCount}`);
    console.log(`  - Updated Chunks  : ${result.summary.updatedCount}`);
    console.log(`  - Unchanged Chunks: ${result.summary.unchangedCount}`);
    console.log(`  - Removed Chunks  : ${result.summary.removedCount}`);
    console.log(`  - Manifest Status : ${result.summary.isIdempotent ? 'UNCHANGED (No file mutations)' : 'UPDATED'}`);
    console.log(`  - Pipeline Time   : ${elapsed}ms\n`);

    // 2. Vector Sync (Strictly opt-in via --sync-vectors)
    if (!syncVectorsRequested) {
      console.log('-----------------------------------------------------------------');
      console.log('Notice: Vector sync was not requested.');
      console.log('To synchronize vectors with MongoDB Atlas, run:');
      console.log('  npm run ingest:knowledge-base -- --sync-vectors');
      console.log('-----------------------------------------------------------------');
    } else {
      console.log('-----------------------------------------------------------------');
      console.log('Executing Vector Synchronization with MongoDB Atlas...');
      console.log('-----------------------------------------------------------------');

      const config = getVectorConfig();
      assertMongoConfig(config);
      assertOpenAIConfig(config);

      const vectorStore = new MongoAtlasVectorStore({ config });
      const embeddingService = new OpenAIEmbeddingService({ config });

      try {
        console.log(`Model: ${config.embeddingModel} (${config.embeddingDimensions} dims)`);
        console.log(`Target Collection: ${config.dbName}.${config.collectionName}`);

        const syncStartTime = Date.now();
        const syncReport = await syncVectors(
          result.manifest.chunks,
          vectorStore,
          embeddingService
        );
        const syncElapsed = Date.now() - syncStartTime;

        console.log('\nVector Sync Summary:');
        console.log(`  - Total Manifest Chunks : ${syncReport.totalManifestChunks}`);
        console.log(`  - Newly Embedded/Added  : ${syncReport.added}`);
        console.log(`  - Re-Embedded (Outdated): ${syncReport.reEmbedded}`);
        console.log(`  - Metadata-Only Updated : ${syncReport.metadataUpdated} (0 embedding calls)`);
        console.log(`  - Stale Vectors Deleted : ${syncReport.staleDeleted}`);
        console.log(`  - Unchanged Chunks      : ${syncReport.unchanged}`);
        console.log(`  - Fully Synchronized    : ${syncReport.isFullySynced ? 'YES' : 'NO'}`);
        console.log(`  - Sync Time             : ${syncElapsed}ms`);
      } finally {
        await vectorStore.close();
      }
    }

    console.log('\n' + '='.repeat(65));
    console.log('  Execution completed successfully.');
    console.log('='.repeat(65));
  } catch (error) {
    console.error('\n[INGESTION ERROR] Ingestion failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
