# SupportIQ — System Architecture

**Status:** Pending User Approval  
**Last Updated:** 2026-11-04  
**Runtime Baseline:** Node.js 24.x LTS  

---

## 1. System Overview

SupportIQ is a public, zero-friction AI customer support assistant for **ShopEase**, a fictional e-commerce platform. It provides grounded, source-attributed answers to customer inquiries about store policies (returns, refunds, shipping, cancellations, payments, warranties, and loyalty programs).

### Core Principles & Non-Negotiables
- **Public & Zero-Friction:** No authentication, registration, payment, or visitor database connections.
- **Evidence-Grounded RAG:** Answers are synthesized exclusively from retrieved document chunks. The assistant strictly abstains when evidence is insufficient (*"I couldn't find enough information about that in the ShopEase documentation."*).
- **Verified Citations:** Every substantive policy answer provides verifiable source citations (document title, section, excerpt) that are programmatically matched against retrieved chunk IDs.
- **Untrusted Conversation History:** All client-supplied conversation history is treated as untrusted input. It must never override system instructions or serve as verified ShopEase policy evidence. Policy answers must always rely strictly on retrieved documentation.
- **Server-Side Security & Cost Protection:** LLM and database credentials remain strictly server-side. Public traffic is guarded by rate limiting, concurrency semaphores, tightly budgeted timeouts, and persistent daily usage caps.
- **Best-Effort Cancellation:** Client disconnects and timeout triggers propagate `AbortSignal` downstream to cancel in-flight work where supported, though provider billing cannot be guaranteed zero once execution commences.
- **Ephemeral Conversation Context:** Bounded history (maximum 6 messages) is maintained by the client in memory or `sessionStorage` and sent with each request. Visitor conversations are not permanently stored in MongoDB in MVP.
- **Illustrative Specification Examples:** Specific policy terms (e.g. return windows, exclusion lists) referenced in architectural examples are illustrative; the canonical policy facts are established by the Markdown knowledge-base documents created in Phase 2.

---

## 2. High-Level Architecture Diagram

```
+-----------------------------------------------------------------------------------------------+
|                                        VISITOR BROWSER                                        |
|  +-----------------------------------------------------------------------------------------+  |
|  | React 19 + TypeScript Frontend (Vite)                                                   |  |
|  | Module Resolution: module=ESNext, moduleResolution=Bundler                              |  |
|  | - Public chat UI, suggestion chips, message thread, loading skeletons                   |  |
|  | - Ephemeral session context (sessionStorage, max 6 messages)                            |  |
|  | - Source citation viewer drawer / popover                                               |  |
|  | - Zero secrets, zero direct LLM or database connections                                 |  |
|  +-----------------------------------------------------------------------------------------+  |
+-----------------------------------------------|-----------------------------------------------+
                                                | HTTP POST /api/chat
                                                v
+-----------------------------------------------------------------------------------------------+
|                        NODE.JS 24 LTS + EXPRESS 5 BACKEND (PORT 4000)                         |
|                        Module Resolution: module=NodeNext, moduleResolution=NodeNext (ESM)    |
|                                                                                               |
|  [Ingress Protection & Middleware]                                                            |
|  - Helmet security headers & CORS restricted to FRONTEND_ORIGIN                               |
|  - Per-IP rate limiting (express-rate-limit)                                                  |
|  - Overall request deadline guard (25s AbortController) & JSON body limit (10kb)              |
|  - Zod payload validation (question length <= 1000 chars, history length <= 6)                |
|  - Untrusted history sanitization (messages cannot override system rules or policy data)     |
|                                                                                               |
|  [Persistent Cost Guard & Circuit Breaker (Phase 6)]                                          |
|  - Concurrency Limiter: Semaphore bounding simultaneous active LLM calls                      |
|  - Persistent Usage Tracker (MongoDB daily_usage collection, UTC date keyed):                 |
|      1. Atomic pre-call reservation (requests, estimated tokens) -> Fail-Closed on breach   |
|      2. Enforces DAILY_MAX_REQUESTS, DAILY_MAX_TOKENS, DAILY_MAX_ESTIMATED_COST_USD           |
|      3. Atomic post-call reconciliation against actual provider token usage                   |
|                                                                                               |
|  [Chat Application Service & LangGraph Workflow (Phase 4 & Phase 5)]                          |
|  - Reconciled timeout budget: total deadline 25s, OpenAI SDK maxRetries=1                     |
|  - Individual sub-call timeouts: Embeddings (2.5s), Atlas Search (2.5s), LLM nodes (3.5-6s)  |
|  - Best-effort cancellation propagation via AbortSignal                                       |
|  - Strict ceiling: maximum 4 LLM calls in retry branch (2 in happy path)                      |
|  - LangGraph StateGraph (Annotation.Root schema):                                             |
|      1. retrieveDocuments (Atlas Vector Search via LangChain)                                 |
|      2. assessEvidence (Structured LLM check: SUFFICIENT vs INSUFFICIENT)                     |
|         - If sufficient -> generateAnswer                                                     |
|         - If weak       -> rewriteQuery -> retrieveAgain -> assessEvidenceAgain              |
|                            (Strictly bounded to 1 retry)                                      |
|         - If still weak -> returnInsufficientEvidence                                         |
|      3. generateAnswer (Grounded prompt, context-bounded)                                     |
|      4. validateCitations (ID cross-check + excerpt verification)                             |
|                                                                                               |
|  [Data & Model Providers (Phase 3 & Phase 4)]                                                 |
|  - Chat model: Configurable via OPENAI_CHAT_MODEL                                             |
|  - Embedding model: Configurable via OPENAI_EMBEDDING_MODEL (text-embedding-3-small, 1536 dims)|
|  - Vector Store: MongoDB Atlas Vector Search (@langchain/mongodb)                             |
+-----------------------------------------------|-----------------------------------------------+
                                                | Queries & Atomic Counter Updates
                                                v
+-----------------------------------------------------------------------------------------------+
|                                     MONGODB ATLAS CLUSTER                                     |
|  - Database: supportiq                                                                        |
|  - Collection: knowledge_chunks (Knowledge base vectors, supportiq_vector_index)              |
|  - Collection: daily_usage (UTC-keyed atomic usage documents: requests, tokens, spend)        |
+-----------------------------------------------------------------------------------------------+
```

---

## 3. Technology Stack & Workspace Structure

### 3.1 Technology Matrix

| Layer | Technology | Version / Configuration | Purpose |
| :--- | :--- | :--- | :--- |
| **Runtime** | Node.js | `24.x LTS` (`.nvmrc`, `engines: ">=24 <25"`) | Execution runtime across frontend build and backend server. |
| **Monorepo** | npm workspaces | Root `package.json` | Orchestrates `frontend` and `backend` workspaces. |
| **Frontend** | React 19, TypeScript, Vite | `module: ESNext`, `moduleResolution: Bundler` | Presentation UI, state management, citation viewer. |
| **Backend** | Express 5, TypeScript, Node.js | `module: NodeNext`, `moduleResolution: NodeNext`, `"type": "module"` | API gateway, rate limiting, RAG execution, cost protection. Verified compatible with Node.js 24. |
| **Testing** | Vitest 5.1, Supertest, React Testing Library | Vitest 5.1.x (with Vite 6+ peer dependency; verified compatible with Node.js 24 LTS), Supertest (backend HTTP), `@testing-library/react`, `@testing-library/user-event`, `jsdom` (frontend) | Deterministic unit, component, and HTTP integration testing. |
| **Validation** | Zod | Modern stable (v3.x) | Runtime schema validation at all system and API boundaries. |
| **RAG Building Blocks** | LangChain.js | `@langchain/core`, `@langchain/openai`, `@langchain/mongodb`, `@langchain/textsplitters` | Text chunking, vector embeddings, prompt templates, MongoDB vector search. |
| **Orchestration** | LangGraph.js | `@langchain/langgraph` | Cyclic state graph with bounded query rewrite and citation validation. |
| **Vector Database** | MongoDB Atlas | Free M0+ cluster, Atlas Vector Search | Persistent vector store for fictional ShopEase policy chunks. |
| **Persistent Usage** | MongoDB | `daily_usage` collection in `supportiq` | Concurrency-safe atomic tracking of daily requests, tokens, and spend. |
| **LLM Provider** | OpenAI API | Configurable via `OPENAI_CHAT_MODEL` and `OPENAI_EMBEDDING_MODEL` | Grounded chat completion and 1536-dim vector embeddings. Explicitly configured with `maxRetries: 1`. |

### 3.2 Monorepo Layout

```text
supportiq/
├── .nvmrc                          # Pinned Node.js 24
├── .gitignore
├── GEMINI.md                       # Permanent repository rules
├── PROJECT_REQUIREMENTS.md         # Source of truth specification
├── ANTIGRAVITY_EXECUTION_PROMPT.md # Phased engineering workflow
├── package.json                    # Root npm workspace manifest
├── docs/                           # Living project documentation
│   ├── ARCHITECTURE.md
│   ├── DECISIONS.md
│   ├── API_CONTRACTS.md
│   ├── TESTING_STRATEGY.md
│   └── CURRENT_STATE.md
├── frontend/                       # React + TypeScript client
│   ├── package.json
│   ├── tsconfig.json               # module: ESNext, moduleResolution: Bundler
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── src/
└── backend/                        # Node.js + Express API & RAG pipeline
    ├── package.json                # "type": "module"
    ├── tsconfig.json               # module: NodeNext, moduleResolution: NodeNext
    ├── vitest.config.ts
    ├── .env.example
    ├── knowledge-base/shopease/    # 7 curated Markdown policy documents (canonical source of truth)
    ├── scripts/                    # Ingestion & evaluation runners
    ├── src/
    │   ├── app.ts                  # Express application factory
    │   ├── server.ts               # HTTP bootstrap & graceful shutdown
    │   ├── config/                 # Zod environment validation
    │   ├── middleware/             # Rate limiting, logger, error handling
    │   ├── routes/                 # Express API routes
    │   ├── services/               # Chat, RAG, usage tracker, LLM wrappers
    │   ├── graph/                  # LangGraph workflow, nodes, and state
    │   ├── prompts/                # Dedicated prompt templates
    │   └── types/                  # Internal TypeScript contracts
    └── tests/                      # Unit, integration, and evaluation suites
```

---

## 4. Subsystem Details & Responsibility Boundaries

### 4.1 Frontend Responsibility
- Render public chat view, suggested policy questions, message list, loading skeletons, and error messages.
- Manage temporary conversation state in memory and optionally `sessionStorage`.
- Render verified source citations below assistant answers and provide an interactive excerpt viewer.
- Never make direct calls to OpenAI or MongoDB; never contain server secrets.

### 4.2 Backend API & Security Layer
- Enforce Helmet headers and restrict CORS to `FRONTEND_ORIGIN`.
- Apply per-IP rate limiting (`RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`).
- Parse and validate incoming requests with Zod (`message` length $\le$ 1,000 characters; `history` bounded to 6 messages).
- **Untrusted History Discipline:** Sanitize client history. The backend instructs model prompts that prior turns are conversational context only and must never be treated as authoritative ShopEase policy or system instructions.
- **Reconciled Timeout Budget & Cancellation Strategy:**
  - **Overall Request Deadline:** A master 25-second `AbortController` timeout covers the entire `/api/chat` request pipeline (returning HTTP 504 Gateway Timeout if triggered).
  - **OpenAI SDK Retry Policy:** The provider client is explicitly configured with `maxRetries: 1` (down from default 2). In a multi-step real-time pipeline, excessive automatic retries with exponential backoff inflate latency and cause cascading deadline failures.
  - **Granular Sub-Call Timeouts:**
    - Embedding generation: timeout **2.5s** (typical: 200–500ms).
    - Atlas vector search: timeout **2.5s** (typical: 100–300ms).
    - `assessEvidence` node: timeout **4.0s** (fast, constrained structured JSON).
    - `rewriteQuery` node: timeout **3.5s** (short query string).
    - `generateAnswer` node: timeout **6.0s** (grounded answer synthesis).
  - **Budget Reconciliations:**
    - **Happy Path:** 1 retrieval (max 5s) + 1 assessment (max 4s) + 1 answer generation (max 6s) + network/middleware overhead (max 2s) = **$\approx$ 17s worst-case limit** (typical: 4–7s), well inside the 25s deadline.
    - **Worst-Case Retry Path:** Retrieval 1 (5s) + Assess 1 (4s) + Rewrite (3.5s) + Retrieval 2 (5s) + Assess 2 (4s) + Generate (6s) theoretically sums to 27.5s under concurrent worst-case timeouts. However, with `maxRetries: 1` and fast failure on earlier stages, the master 25s deadline cleanly halts processing. If cumulative time exceeds 20s prior to the final generation node, the pipeline short-circuits directly to the insufficient-evidence fallback, guaranteeing a clean response within 25s.
  - **Best-Effort Cancellation:** The master `AbortSignal` is propagated to LangGraph nodes and downstream fetch/OpenAI calls. If the client disconnects or the 25-second deadline fires, an abort signal is immediately dispatched. **Cancellation is best-effort:** while it stops local processing and closes sockets, downstream provider work that has already been dispatched to OpenAI may still be processed or billed.
- Map internal errors to safe, generic JSON responses without leaking internal prompts, stack traces, or credentials.

### 4.3 Persistent Cost Guard & Circuit Breaker
- Ingress requests execute an atomic `findOneAndUpdate` against MongoDB `daily_usage` (keyed by UTC date `YYYY-MM-DD`).
- Validates that daily request count, token consumption, and estimated spend are within configured ceilings (`DAILY_MAX_REQUESTS`, `DAILY_MAX_TOKENS`, `DAILY_MAX_ESTIMATED_COST_USD`).
- Enforces bounded concurrent LLM calls via an active request semaphore.
- Post-call atomic reconciliation synchronizes actual provider-reported token usage.
- **Fail-Closed:** If MongoDB is unreachable, the guard fails closed and rejects public chat requests safely, preventing unmetered billing.
- Isolated behind an interface (`IUsageTracker`) so tests execute against an in-memory mock without live database requirements.

### 4.4 Ingestion & Vector Retrieval Pipeline
- Curated Markdown documents under `backend/knowledge-base/shopease/` represent the sole factual truth.
- Text splitting uses LangChain text splitters with stable chunk hashing and preserved metadata (`sourceId`, `sourceTitle`, `sectionTitle`, `chunkIndex`, `contentHash`).
- Chunks and embeddings (1536-dim via `OPENAI_EMBEDDING_MODEL`) are stored in MongoDB collection `knowledge_chunks`.
- Ingestion is idempotent: repeatable without creating uncontrolled duplicates.
- Retrieval queries use cosine similarity via `@langchain/mongodb` bounded by a strict `top-k` (default: 4–5 chunks).

### 4.5 LangGraph.js Orchestration Flow
Orchestrated via a compiled `StateGraph` using modern `Annotation.Root`:
1. `retrieveDocuments`: Fetch top-$k$ candidate chunks from Atlas Vector Search.
2. `assessEvidence`: LLM structured evaluation assessing whether retrieved chunks contain sufficient evidence.
3. *Conditional Edge:*
   - If sufficient $\rightarrow$ advance to `generateAnswer`.
   - If insufficient $\rightarrow$ advance to `rewriteQuery` (strictly bounded to $\le 1$ retry).
4. `rewriteQuery`: Reformulate query incorporating permissible conversation history.
5. `retrieveAgain`: Execute second vector retrieval with rewritten query.
6. `assessEvidenceAgain`: Final evaluation of candidate evidence.
7. *Conditional Edge:*
   - If sufficient $\rightarrow$ advance to `generateAnswer`.
   - If still insufficient $\rightarrow$ advance to `returnInsufficientEvidence`.
8. `generateAnswer`: Synthesize grounded response adhering strictly to supplied context.
9. `validateCitations`: Verify cited chunk IDs against the actual retrieval result set. Reject fabricated citations. If zero valid citations remain on a substantive policy answer, trigger fallback.

---

### 4.6 Production Deployment, Ingress Precedence & Health Probing
- **Decoupled Portfolio Hosting:** Frontend deployed to edge static hosting (Vercel/Netlify); single backend instance deployed to persistent Node.js 24 hosting (Render/Railway).
- **Process-Local Abuse Controls:** Rate limiting and concurrency semaphores maintain in-memory state; initial architecture strictly enforces a single backend instance.
- **Route Precedence & Strict API 404 Guard:** Express routes mount API routers first (`/api/*`), followed immediately by an explicit API 404 guard (`app.use('/api', notFoundHandler)`). Unmatched `/api/*` routes immediately return JSON 404 and never fall through to static assets or the SPA fallback.
- **Unified Container Serving:** When `SERVE_STATIC_FRONTEND=true` in `NODE_ENV=production`, Express serves static assets from `frontend/dist` and handles SPA client routing via `GET * -> index.html`.
- **Liveness vs. Readiness Probes:**
  - `GET /api/health`: Lightweight liveness probe returning 200 OK without database overhead.
  - `GET /api/health?ready=true`: Deep readiness probe verifying MongoDB cluster ping, `supportiq_vector_index` presence (`status === 'READY'` and `queryable === true`), manifest chunk alignment, and `daily_usage` collection accessibility. Zero OpenAI calls; 15-second in-memory result caching.

---

## 5. Implementation Roadmap

The delivery sequence follows the delivery milestones:

1. **Phase 0 — Repository Discovery and Architecture Plan** *(Complete & Approved)*
2. **Phase 1A — Backend Foundation ONLY** *(Complete & Approved)*
3. **Phase 1B — Frontend Foundation ONLY** *(Complete & Approved)*
4. **Phase 1C — Monorepo Integration** *(Complete & Approved)*
5. **Phase 2 — ShopEase Sample Knowledge Base and Ingestion** *(Complete & Approved)*
6. **Phase 3 — Embedding and Vector Retrieval** *(Complete & Approved)*
7. **Phase 4 — Basic LangChain RAG Answer Service** *(Complete & Approved)*
8. **Phase 5 — LangGraph Workflow** *(Complete & Approved)*
9. **Phase 6 — Backend Chat API & Persistent Cost Protection** *(Complete & Approved)*
10. **Phase 7 — Public Frontend Experience & API Integration** *(Complete & Approved)*
11. **Phase 8 — Production Readiness, Deployment & Portfolio Verification** *(Complete & Verified)*
12. **Phase 9 — RAG Evaluation, Benchmark Dataset & Adversarial Testing** *(Next Milestone)*
13. **Phase 10 — Final Production Release Documentation** *(Future Milestone)*

---

## 6. Architecture Status & Decision Classifications

- **Approved & Implemented:** Node.js 24 LTS; pure ESM backend with Express 5 (`NodeNext`); Vite frontend (`Bundler`); Vitest + Supertest + React Testing Library; linear RAG before LangGraph; MongoDB Atlas Vector Search (1536 dims); persistent atomic usage cost protection in MongoDB; fail-closed guard; ephemeral conversation history (max 6 messages); reconciled 25s timeout budget with `maxRetries: 0`; best-effort cancellation; refusal on insufficient evidence; multi-tiered citation verification; strict route mounting precedence with API 404 guard; liveness vs deep cached readiness probing; multi-stage Docker containerization; dedicated bundle security verification.
- **Proposed (for Version 2):** Response streaming via SSE / chunked transfer; PDF document ingestion; LangSmith tracing; reranking layer.
- **Open / TBD:** Target cloud host account credentials and final custom domain URLs for public deployment.
