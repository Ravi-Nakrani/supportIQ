# SupportIQ — Grounded AI Customer Support Assistant

[![Node.js 24 LTS](https://img.shields.io/badge/Node.js-24%20LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express 5 ESM](https://img.shields.io/badge/Express-5%20(Native%20ESM)-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![LangGraph.js](https://img.shields.io/badge/LangGraph.js-1.6-1C3C3C?logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraphjs/)
[![MongoDB Atlas Vector Search](https://img.shields.io/badge/MongoDB%20Atlas-Vector%20Search-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/products/platform/atlas-vector-search)
[![Tests Passing](https://img.shields.io/badge/Tests-271%20Passed%20(100%25)-success)](docs/TESTING_STRATEGY.md)

SupportIQ is a public, zero-friction AI customer support assistant for **ShopEase**, a fictional e-commerce platform. It provides grounded, source-attributed answers to customer inquiries about store policies (returns, refunds, shipping, order cancellations, payments, warranties, and loyalty programs).

This application demonstrates a production-minded Retrieval-Augmented Generation (RAG) architecture built with **Node.js 24 LTS**, **Express 5**, **React 19**, **LangGraph.js**, **LangChain.js**, and **MongoDB Atlas Vector Search**.

---

## Architecture Overview

```mermaid
flowchart TD
    User([Visitor Browser / React 19]) -->|POST /api/chat| Ingress[Ingress Security & Middleware]
    
    subgraph Backend [Express 5 API & Cost Protection]
        Ingress --> RateLimiter[Sliding-Window IP Rate Limiter]
        RateLimiter --> Concurrency[Concurrency Semaphore max: 5]
        Concurrency --> CostGuard[(MongoUsageTracker Hard-Cap)]
        CostGuard -->|Atomic Micro-Dollar Reservation| LangGraphFlow[LangGraph.js StateGraph Workflow]
        
        subgraph Graph [Cyclic LangGraph RAG Workflow]
            LangGraphFlow --> NodeRetrieve[retrieveDocuments]
            NodeRetrieve --> NodeAssess[assessEvidence]
            NodeAssess -->|Sufficient Evidence| NodeGenerate[generateAnswer]
            NodeAssess -->|Insufficient Evidence & retry < 1| NodeRewrite[rewriteQuery]
            NodeRewrite --> NodeRetrieve2[retrieveDocuments (Retry)]
            NodeRetrieve2 --> NodeAssess2[assessEvidence]
            NodeAssess2 -->|Sufficient Evidence| NodeGenerate
            NodeAssess2 -->|Still Insufficient| NodeFallback[returnInsufficientEvidence]
            NodeGenerate --> NodeValidate[validateCitations]
            NodeValidate -->|Verified Excerpts| Done([Answered Response])
            NodeValidate -->|Uncorroborated| NodeFallback
        end
        
        Done --> Reconcile[(Reconcile Actual Token Usage)]
        NodeFallback --> Reconcile
    end
    
    subgraph Data [MongoDB Atlas Cluster]
        NodeRetrieve -.->$vectorSearch[(knowledge_chunks / supportiq_vector_index)]
        CostGuard -.->DailyUsage[(daily_usage / UTC Date Buckets)]
    end
    
    Done -->|JSON 200 OK + Verified Citations| User
    NodeFallback -->|JSON 200 OK Refusal| User
```

---

## Core Engineering Pillars

### 1. Zero-Friction, Ephemeral Public Experience
* **No Authentication or Login:** Recruiters, developers, and visitors can test the system immediately without signing up, providing credentials, or setting up a database.
* **Ephemeral In-Memory Context:** Browser maintains recent messages in React state (bounded to max 6 completed turns). Visitor conversations are **never stored permanently in the database**.
* **Untrusted History Discipline:** Prior conversation turns sent by the client are strictly treated as untrusted user input; the prompt builder isolates history so customer claims can never override system instructions or invent company policy.

### 2. Evidence-First RAG & Multi-Tiered Citation Validation
* **Curated Synthetic Knowledge Base:** 7 Markdown policy documents in `backend/knowledge-base/shopease/` split into 39 chunks with code-fence-aware heading parsing and deterministic SHA-256 metadata hashing.
* **Vector Search:** 1536-dimensional embeddings (`text-embedding-3-small`) queried via native MongoDB `$vectorSearch` with cosine similarity (`supportiq_vector_index`).
* **Strict Multi-Tiered Citation Validator:** Answers claiming policy sufficiency must include valid citations. The validator programmatically verifies that cited IDs exist in the retrieved set and matches cited quotes against actual chunk substrings. Uncorroborated citations are discarded; answers with zero valid citations fail closed to the refusal fallback.
* **Explicit Refusal:** When documentation is missing or insufficient, the assistant cleanly abstains (*"I couldn't find enough information about that in the ShopEase documentation."*) rather than hallucinating rules.

### 3. Stateful LangGraph Orchestration
* **Discrete Single-Purpose Nodes:** `retrieveDocuments`, `assessEvidence`, `rewriteQuery`, `generateAnswer`, `validateCitations`, and `returnInsufficientEvidence`.
* **Bounded Cyclic Routing:** If evidence is initially insufficient, the graph executes at most **one** query rewrite and retrieval retry. No unconstrained agent loops.
* **Layered Timeout Budgeting:** 20-second master workflow timeout with dynamic node budgeting. Sub-call cancellations propagate downstream via `AbortSignal`.

### 4. Persistent Daily Budget Protection (Fail-Closed)
* **Atomic MongoDB Circuit Breaker:** [`MongoUsageTracker`](backend/src/services/usage/mongoUsageTracker.ts) tracks requests, tokens, and integer micro-dollar spend ($\mu\text{USD}$ where $\$1.00 = 1,000,000\ \mu\text{USD}$) in a UTC date-keyed collection (`daily_usage`).
* **Pre-Call Reservation:** Uses atomic `findOneAndUpdate` with a condition ensuring `current + reservation <= limit`. If the daily hard cap is breached, requests are rejected with HTTP 429 `USAGE_LIMIT_EXCEEDED`.
* **Fail-Closed Safety:** If MongoDB is unavailable or times out during reservation, the request is safely rejected with HTTP 503 `SERVICE_UNAVAILABLE`. Production startup fails closed if live OpenAI is configured without MongoDB tracking.
* **Pricing & Deprecation Defense:** Derives reservation costs at startup from an explicit model pricing allowlist (`gpt-6-luna`, `text-embedding-3-small`). Deprecated models (`gpt-4o`, `gpt-4o-mini`) are rejected at startup.

### 5. Ingress Security & Strict Route Precedence
* **Reverse Proxy Trust (`TRUST_PROXY`):** Defaults to `false` to prevent client IP spoofing on public rate limiting. Configured with specific hop counts only when the hosting reverse-proxy topology is verified.
* **Single Backend Instance Invariant:** Rate limiting and concurrency semaphores are process-local; initial deployment topology is strictly bounded to one instance.
* **Route Order Precedence:** Express routes mount API routers first (`/api/*`), followed by an explicit API 404 guard (`app.use('/api', notFoundHandler)`). Unmatched API requests immediately return structured JSON 404 and **never** fall through to static assets or the SPA HTML fallback.

---

## Deployment Architecture & Realistic Tier Limitations

SupportIQ is designed to be deployed as a **low-cost public portfolio demonstration**, balancing zero cloud hosting costs with production-minded engineering safeguards.

### Recommended Decoupled Topology
* **Frontend:** Hosted on **Vercel** or **Netlify** (Free tier). Delivers the compiled React 19 SPA via global edge CDN with automated SSL and instant rollbacks.
* **Backend:** Hosted on **Render** (Free Web Service) or **Railway** / **Fly.io**. Executes the Node.js 24 LTS Express API (single instance) and manages secrets.
* **Database:** **MongoDB Atlas M0** free-tier shared cluster hosting `knowledge_chunks` ($vectorSearch) and `daily_usage`.

### Operational Tier Disclosures & Limitations
1. **Render Free-Tier Cold Starts:** On Render's free tier, the web service spins down after 15 minutes of inactivity. When a new visitor arrives, the initial request incurs a **cold-start delay of approximately one minute (50–60+ seconds)** while the container spins up. Subsequent requests respond in normal latency (2–4 seconds).
2. **Resource Boundaries:** Free Render instances provide 512 MB RAM and 0.1 vCPU. MongoDB Atlas M0 clusters provide 512 MB storage and 500 maximum connections on a shared CPU.
3. **Conditions Requiring Paid Upgrades:** Upgrading to paid infrastructure (e.g. Render Starter at \$7/month + Atlas Flex/Dedicated) is required if:
   - Zero cold-start latency is mandated (eliminating idle sleep).
   - Traffic exceeds single-instance capacity, requiring distributed Redis-backed rate limiting.
   - Private VPC peering is required between API server and database.

---

## Deep Dependency Readiness vs. Liveness Probing

SupportIQ provides distinct health probes for deployment orchestrators:

* **Liveness Probe (`GET /api/health`):**
  - Instant HTTP 200 `{ status: "ok", timestamp, version }`.
  - Zero database or network calls; verifies the Express process is active and accepting connections.
* **Readiness Probe (`GET /api/health?ready=true`):**
  - Verifies live dependency readiness:
    1. **MongoDB Connectivity:** Issues database `ping` command.
    2. **Vector Index Queryability:** Confirms `supportiq_vector_index` exists, is queryable (`queryable === true`), and status is `'READY'`.
    3. **Knowledge Base Alignment:** Confirms `knowledge_chunks` contains all chunk IDs defined in `shopease-manifest.json` (guaranteeing readiness does not pass on stale or unrelated data).
    4. **Usage Tracking:** Verifies `daily_usage` collection accessibility.
  - **Zero OpenAI Calls:** Does not invoke LLMs or consume API credits.
  - **15-Second In-Memory Cache:** Protects the database against connection spikes from frequent monitoring sweeps.
  - **Safe Degradation:** Returns HTTP 503 `{ status: "degraded", ready: false }` without exposing internal cluster URIs, paths, or credentials.

---

## Technology Stack

| Layer | Technology | Details |
| :--- | :--- | :--- |
| **Runtime** | Node.js 24 LTS | Pinned in [`.nvmrc`](.nvmrc), `"engines": ">=24 <25"`. |
| **Monorepo** | npm Workspaces | Root orchestrator linking `backend` and `frontend`. |
| **Backend** | Express 5, TypeScript | Native ESM (`module: NodeNext`), strict type-checking, explicit `.js` import extensions. |
| **Frontend** | React 19, TypeScript, Vite 8 | Modern Bundler ESM, accessible design tokens, zero client-side credentials. |
| **RAG & Orchestration** | LangChain.js & LangGraph.js | Text splitters, OpenAI SDK, cyclic state graph, XML context escaping. |
| **Vector Store** | MongoDB Atlas Vector Search | Native MongoDB 7.7.x driver `$vectorSearch`, cosine metric, 1536 dims. |
| **Testing** | Vitest 5.1, Supertest | 271 automated tests across workspaces with 100% deterministic pass rate offline. |
| **Packaging** | Docker (Alpine) | Multi-stage build on `node:24-alpine`, unprivileged non-root user (`USER node`). |

---

## Getting Started

### 1. Prerequisites
* **Node.js:** `v24.x LTS` (run `node -v` to verify).
* **npm:** `v10.x+` or `v11.x`.
* **Git**

### 2. Installation
Clone the repository and install all workspace dependencies from the root:
```bash
git clone https://github.com/your-username/supportiq.git
cd supportiq
npm install
```

### 3. Local Environment Setup
Copy the template configuration files:
```bash
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
```

*(Note: For offline development and automated testing, default values work out of the box. Mocks and in-memory stores are used automatically when `MONGODB_URI` and `OPENAI_API_KEY` are not set).*

### 4. Running the Local Development Servers
Start both backend API (`http://localhost:4000`) and frontend client (`http://localhost:5173`) concurrently:
```bash
npm run dev
```

---

## MongoDB Atlas Vector Search Setup

To connect SupportIQ to a live MongoDB Atlas cluster:

1. Create a free **M0 cluster** in [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a database named `supportiq`.
3. In the collection `knowledge_chunks`, create an Atlas Vector Search index named `supportiq_vector_index` using the JSON editor:
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
4. Set `MONGODB_URI` and `OPENAI_API_KEY` in `backend/.env`.
5. Run the idempotent ingestion script to synchronize the knowledge base:
   ```bash
   npm run ingest:knowledge-base -- --sync-vectors
   ```

---

## Verification & Quality Commands

All lifecycle and verification commands run from the monorepo root:

| Command | Description |
| :--- | :--- |
| `npm run type-check` | Runs strict TypeScript type-checking across both workspaces. |
| `npm test` | Executes all 271 automated unit and integration tests with Vitest. |
| `npm run build:all` | Compiles production artifacts for backend (`backend/dist`) and frontend (`frontend/dist`). |
| `npm run verify:bundle-security` | Scans freshly built frontend assets to verify zero API keys or server secrets are bundled. |
| `npm start` | Boots the compiled production backend server (`node backend/dist/server.js`). |

---

## Container Packaging (Docker)

SupportIQ includes a multi-stage `Dockerfile` built on `node:24-alpine` that compiles both workspaces and outputs an unprivileged, production-ready container:

```bash
# Build the production image from root context
docker build -t supportiq:latest .

# Run the container
docker run -p 4000:4000 \
  -e NODE_ENV=production \
  -e MONGODB_URI="mongodb+srv://..." \
  -e OPENAI_API_KEY="sk-..." \
  supportiq:latest
```

---

## Fictional Entity & Synthetic Data Notice

SupportIQ is a public portfolio demonstration application. **ShopEase is an entirely fictional e-commerce company.** All policy documentation (returns, refunds, shipping, cancellations, payments, warranties, loyalty rewards), customer scenarios, and timelines are synthetic examples authored solely for evaluation. The assistant is read-only and does not perform live customer account operations, order cancellations, or payment refunds.

---

## Living Documentation Index

Detailed architectural decisions, API contracts, and testing specifications are maintained under [`docs/`](docs/):

* [**System Architecture**](docs/ARCHITECTURE.md) — Responsibility boundaries, timeout budgeting, and hosting topologies.
* [**Architecture Decision Records (ADRs)**](docs/DECISIONS.md) — Formal records (ADR-001 through ADR-011).
* [**API Contracts & Specifications**](docs/API_CONTRACTS.md) — Endpoint schemas, error envelopes, and readiness contracts.
* [**Testing Strategy**](docs/TESTING_STRATEGY.md) — Test pyramid, mock philosophies, and RAG evaluation design.
* [**Atlas Vector Search Guide**](docs/ATLAS_VECTOR_SEARCH.md) — Authoritative index definition and safe dimension migrations.
* [**Current Repository State**](docs/CURRENT_STATE.md) — Verified milestone progress and phase tracking.
