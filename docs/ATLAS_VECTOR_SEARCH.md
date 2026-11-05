# SupportIQ — MongoDB Atlas Vector Search Specification & Setup Guide

**Status:** Verified for Phase 3  
**Runtime Requirement:** Node.js 24 LTS  
**Driver Target:** Native `mongodb` driver (`~7.7.0`)  
**Index Name:** `supportiq_vector_index`  
**Database:** `supportiq`  
**Collection:** `knowledge_chunks`  

---

## 1. Overview

SupportIQ uses **MongoDB Atlas Vector Search** as its semantic storage and retrieval engine. Markdown knowledge-base chunks authored in Phase 2 are embedded into 1536-dimensional floating point vectors via OpenAI's `text-embedding-3-small` model and stored alongside their rich citation metadata in MongoDB Atlas.

At query time, the backend performs cosine similarity searches using MongoDB Atlas's native `$vectorSearch` aggregation stage.

---

## 2. Atlas Vector Search Index Definition

Create an Atlas Vector Search index on the `knowledge_chunks` collection in the `supportiq` database using the following exact JSON specification:

```json
{
  "fields": [
    {
      "type": "vector",
      "path": "embedding",
      "numDimensions": 1536,
      "similarity": "cosine"
    },
    {
      "type": "filter",
      "path": "metadata.sourceId"
    },
    {
      "type": "filter",
      "path": "metadata.category"
    }
  ]
}
```

### Key Field Mappings:
- **`path: "embedding"`**: Target array of 1536 floats.
- **`numDimensions: 1536`**: Strictly matches the vector output of `text-embedding-3-small`.
- **`similarity: "cosine"`**: Evaluates the directional cosine similarity between the query vector and document embeddings.
- **`metadata.sourceId` & `metadata.category`**: Filter fields indexed for optional scoped retrieval.

---

## 3. Step-by-Step Atlas Setup Instructions

### Option A: Via MongoDB Atlas Web UI
1. Log in to [cloud.mongodb.com](https://cloud.mongodb.com) and navigate to your database cluster.
2. Select the **Atlas Search** tab (or **Search & Vector Search**).
3. Click **Create Search Index**.
4. Choose **Atlas Vector Search (JSON Editor)** and click **Next**.
5. Select the `supportiq` database and `knowledge_chunks` collection.
6. Enter Index Name: `supportiq_vector_index`.
7. Paste the JSON definition from Section 2 into the editor.
8. Click **Create Vector Search Index**.
9. Wait for the index status to transition from `Building` to `Active` (typically 30–90 seconds).

### Option B: Via MongoDB Atlas CLI
```bash
atlas clusters search indexes create \
  --clusterName <YOUR_CLUSTER_NAME> \
  --file docs/ATLAS_VECTOR_SEARCH.md \
  --output json
```

---

## 4. Driver Architecture & Cancellation Mechanics

### 4.1 Native Driver 7.7.x Integration
SupportIQ does not use `@langchain/mongodb` because that package pulls in MongoDB driver 6.x, which is not officially certified for Node.js 24 LTS. Instead, SupportIQ implements a native adapter ([`MongoAtlasVectorStore`](file:///d:/Projects/supportIQ/backend/src/services/rag/vector-store/mongoAtlasVectorStore.ts)) using official native `mongodb` driver `~7.7.0`.

### 4.2 Cancellation Trade-Off: `maxTimeMS` vs `AbortSignal`
MongoDB Driver 7.7 supports passing `AbortSignal` to `collection.aggregate()`, but the official driver documentation notes that this feature is **experimental** and that triggering an abort terminates the query by **closing the active socket connection**.

SupportIQ employs a layered approach:
1. **`maxTimeMS` is the primary, non-destructive server-side execution limit:**
   `retrievalService` calculates the remaining millisecond budget (`deadline - Date.now()`) and passes it as `maxTimeMS` to the aggregation options. The MongoDB Atlas cluster halts query processing if this limit is reached, without closing sockets.
2. **`AbortSignal` provides client-side emergency cancellation:**
   If a client disconnects or the master deadline expires, the signal is triggered. The native driver connection pool automatically manages socket lifecycles, replacing closed sockets transparently.

---

## 5. Safe Embedding Dimension Migration Procedure

The MongoDB Atlas Vector Search index definition requires a fixed dimension count (1536). If `OPENAI_EMBEDDING_MODEL` or `OPENAI_EMBEDDING_DIMENSIONS` are changed, follow this safe migration procedure:

1. **Update Environment:**
   Update `OPENAI_EMBEDDING_MODEL` and `OPENAI_EMBEDDING_DIMENSIONS` in `backend/.env`.
2. **Update Atlas Index Definition:**
   In MongoDB Atlas, edit `supportiq_vector_index` and update `numDimensions` to match the new model. Wait for the index status to return to `Active`.
3. **Execute Recoverable Vector Synchronization:**
   Run:
   ```bash
   npm run ingest:knowledge-base -- --sync-vectors
   ```
   The synchronization engine detects that the stored `embeddingConfig.fingerprint` differs from the new configuration. It automatically re-embeds all 39 chunks with the new model and updates the collection.
4. **Verify Retrieval:**
   Execute a sample query to verify that query vector dimensions match the updated index.

---

## 6. Document Schema in `knowledge_chunks`

Each document stored in `knowledge_chunks` adheres to the following structure:

```json
{
  "_id": "shopease-returns-policy#defective-products#2",
  "text": "Opened products that suffer from a manufacturing defect...",
  "embedding": [0.01234, -0.05678, ...],
  "metadata": {
    "sourceId": "shopease-returns-policy",
    "sourceTitle": "ShopEase Returns Policy",
    "category": "Returns & Exchanges",
    "documentVersion": "1.0.0",
    "effectiveDate": "2026-01-01",
    "sectionTitle": "Defective Products",
    "headingHierarchy": ["ShopEase Returns Policy", "Defective Products"],
    "sourcePath": "knowledge-base/shopease/returns-policy.md",
    "chunkIndex": 2,
    "contentHash": "a1b2c3d4...",
    "metadataHash": "e5f6g7h8..."
  },
  "embeddingConfig": {
    "model": "text-embedding-3-small",
    "dimensions": 1536,
    "fingerprint": "7a9f8b..."
  },
  "createdAt": "2026-11-04T18:00:00.000Z",
  "updatedAt": "2026-11-04T18:00:00.000Z"
}
```

