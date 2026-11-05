# SupportIQ — Current Repository State

**Last Updated:** 2026-11-05  
**Current Phase:** Phase 8 — Production Readiness, Deployment & Portfolio Verification (COMPLETE & VERIFIED)  
**Next Task:** Phase 9 — RAG Evaluation, Benchmark Dataset & Adversarial Testing (Pending User Instruction)  

---

## 1. Actual Repository Status

| Component | Status | Details |
| :--- | :--- | :--- |
| **Documentation Bootstrap** | **Approved / Complete** | All living documents created under `docs/` and synchronized. |
| **Version Control (Git)** | **Active Monorepo** | Git repository initialized; commits on branch `main`. |
| **Host Runtime** | **Verified** | Verified Node.js `v24.20.0` (Node 24 LTS) and npm `11.19.0`. `.nvmrc` pins version `24`. |
| **Root Workspaces** | **Phase 8 Complete** | Root `package.json` configured with npm workspaces `["backend", "frontend"]`, `package-lock.json`, root lifecycle scripts (`dev`, `build`, `build:all`, `start`, `verify:bundle-security`, `test`, `type-check`, `ingest:knowledge-base`), portfolio showcase `README.md`, root `.env.example`, multi-stage `Dockerfile`, and `.dockerignore`. |
| **Backend Application** | **Phase 1A-8 Complete** | Express 5 ESM factory with strict route mounting precedence (API routes mounted first, explicit API 404 guard `app.use('/api', notFoundHandler)` preventing fallback leakage, optional static serving, centralized error handling). Enforces production startup checks requiring both `MONGODB_URI` and `OPENAI_API_KEY`, supported model validation, and strict prohibition of mock adapters in production. 220/220 backend tests passing. |
| **Frontend Application** | **Phase 7-8 Complete** | React 19, Vite 8 with `/api` dev proxy, Vitest 5.1, jsdom. Interactive chat UI with zero persistent browser storage, typed API client (`chatApi.ts`), `frontend/.env.example` documenting `VITE_API_BASE_URL`. Scanned via dedicated security runner `verify:bundle-security` confirming zero server secrets exist in compiled client bundles. 51/51 frontend tests passing. |
| **Knowledge Base & Ingestion** | **Phase 2 Complete** | 7 curated Markdown documents under `backend/knowledge-base/shopease/` with Zod-validated frontmatter; code-fence-aware heading parser; LangChain `RecursiveCharacterTextSplitter` chunking; SHA-256 content and canonical metadata hashing; atomic manifest writer and 4-category change detector; `shopease-manifest.json` (39 chunks). |
| **Vector Store & Retrieval** | **Phase 3 Complete** | Native MongoDB 7.7.x driver (`MongoAtlasVectorStore`) with `$vectorSearch` aggregation; official OpenAI SDK 7.50.x (`OpenAIEmbeddingService`) implementing `@langchain/core` `EmbeddingsInterface`; self-healing vector sync (`vectorSyncService.ts`) with embedding configuration fingerprinting and metadata-only updates; unified 2.5s master deadline retrieval service (`RetrievalService`) with bounded `topK` (1–10) and `minScore` threshold filtering. |
| **RAG Answer Generation** | **Phase 4 Complete** | Grounded answer service (`RagAnswerService`) with hardened XML escaping (`promptBuilder.ts`), strict OpenAI `json_schema` Structured Outputs (`openAiChatService.ts` defaulting to `gpt-6-luna`), multi-tiered citation validation (`CitationValidator`) without synthetic fallbacks, fast short-circuit on empty retrieval, explicit domain status classification (`answered`, `insufficient_evidence`, `timeout`, `aborted`, `error`), and deterministic in-memory mock (`MockLlmChatService`). |
| **LangGraph Orchestration** | **Phase 5 Complete** | Compiled state graph (`@langchain/langgraph` 1.6.1) orchestrating retrieval, evidence assessment, bounded query rewriting (max 1 retry), answer generation, and citation validation. Initialized with `status: 'pending'` and transitioning to `'answered'` only after validated citations. Enforces master 20s workflow deadline with dynamic node budgeting, early guard against post-failure retrieval, strict Zod schemas, and exception-safe `try/catch/finally` invocation wrapper. |
| **Chat API & Cost Protection** | **Phase 6 Complete** | Public `POST /api/chat` and `GET /api/demo` endpoints; Zod request validation; sliding-window per-IP rate limiter; in-memory semaphore concurrency limiter; persistent atomic MongoDB daily budget hard-cap tracker (`MongoUsageTracker`) enforcing `current + reservation <= limit` with fail-closed safety and preserved reservation `dateKey` reconciliation; integer micro-dollar arithmetic ($\mu\text{USD}$); `js-tiktoken` pre-call token ceiling verification; client disconnect detection via `res.on('close')` with `!res.writableEnded`; total tokens invariant enforcement across graph nodes (`totalTokens === embeddingTokens + promptTokens + completionTokens`). |
| **Health & Readiness Probing** | **Phase 8 Complete** | `GET /api/health` lightweight liveness probe (200 OK); `GET /api/health?ready=true` deep readiness probe verifying MongoDB cluster ping, `supportiq_vector_index` presence (asserting both `status === 'READY'` and `queryable === true`), knowledge-base manifest chunk alignment (`knowledge_chunks` contains all 39 chunks from `shopease-manifest.json`), and `daily_usage` collection accessibility. Zero OpenAI calls made; 15-second in-memory caching. |
| **External Connections** | **Zero Secrets Committed** | Tests run 100% deterministically offline using mocks and in-memory adapters. Vector sync requires explicit `--sync-vectors` flag. Startup validates model support and pricing, actively rejecting deprecated models (`gpt-4o`, `gpt-4o-mini`). In production mode, mock services are strictly prohibited. |
| **Tests & Builds** | **All Verified Passing** | Root commands: `npm test` runs 271 tests across workspaces (100% pass: 220 backend, 51 frontend), `npm run type-check` (0 errors), `npm run build:all` generates production artifacts for both workspaces, `npm run verify:bundle-security` verifies 0 secrets in client bundle. |

---

## 2. Inventory of Existing Files

### 2.1 Root Documents
* [`GEMINI.md`](../GEMINI.md) — Permanent workspace engineering rules and invariants.
* [`PROJECT_REQUIREMENTS.md`](../PROJECT_REQUIREMENTS.md) — Authoritative product and technical specification.
* [`ANTIGRAVITY_EXECUTION_PROMPT.md`](../ANTIGRAVITY_EXECUTION_PROMPT.md) — Phased delivery process and quality gates.

### 2.2 Living Documentation (`docs/`)
* [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) — System architecture, responsibility boundaries, and technology matrix.
* [`docs/DECISIONS.md`](./DECISIONS.md) — Architecture Decision Records (ADR-001 through ADR-010).
* [`docs/API_CONTRACTS.md`](./API_CONTRACTS.md) — Endpoint schemas, error envelopes, and request bounds.
* [`docs/TESTING_STRATEGY.md`](./TESTING_STRATEGY.md) — Testing philosophy, Vitest + Supertest + React Testing Library stack, and RAG evaluation metrics.
* [`docs/ATLAS_VECTOR_SEARCH.md`](./ATLAS_VECTOR_SEARCH.md) — Authoritative MongoDB Atlas Vector Search JSON definition, driver cancellation mechanics, and safe dimension migration guide.
* [`docs/CURRENT_STATE.md`](./CURRENT_STATE.md) — Actual verified repository state and next steps.

---

## 3. Architecture Proposals & Status

### 3.1 Core Architecture Proposals
* Runtime pinned strictly to **Node.js 24 LTS** (`.nvmrc` containing `24`, `engines: ">=24 <25"`).
* Backend configured with native Node.js ESM and **Express 5** (`module: NodeNext`, `moduleResolution: NodeNext`, `"type": "module"`, explicit `.js` import extensions). Verified compatible with Node.js 24.
* Frontend configured with Vite ESM (`module: ESNext`, `moduleResolution: Bundler`).
* Unified test runner: **Vitest** across workspaces, **Supertest** for backend HTTP integration tests, and **`@testing-library/react`** + **`@testing-library/user-event`** + **`jsdom`** for frontend component tests.
* Progressive RAG implementation: linear LangChain.js RAG pipeline in Phase 4 prior to LangGraph.js migration in Phase 5.
* Persistent, concurrency-safe global daily usage circuit breaker backed by atomic MongoDB operations with fail-closed safety (defense-in-depth, not claiming absolute immunity).
* Public visitor demo with zero authentication, zero payments, and ephemeral session-only context (max 6 messages).
* Untrusted history discipline: client-supplied conversation history is strictly untrusted input and never treated as verified policy facts or instruction overrides.
* Layered timeout budget and cancellation strategy: 25-second overall deadline, unified 2.5s retrieval deadline (`RETRIEVAL_TIMEOUT_MS`), `maxRetries: 0` for interactive queries, `maxTimeMS` server execution bounding, and AbortSignal propagation.
* Multi-tiered citation validation and evaluation: separating structural ID validation, exact excerpt verification, semantic relevance, answer groundedness, and empirical benchmark evaluation of prompt-injection resistance.
* Canonical knowledge base: the 7 Markdown documents in Phase 2 are the canonical truth; examples in API and architectural documents are illustrative.

### 3.2 Proposed Items (Version 2)
* Response streaming via Server-Sent Events (`/api/chat/stream`).
* PDF document ingestion in addition to Markdown.
* LangSmith observability tracing.
* Reranking model layer.

### 3.3 Open / TBD Decisions
* Default OpenAI chat model identifier (to be selected from active, cost-efficient models during Phase 4 implementation).
* Production deployment hosting target (to be finalized in Phase 10).

---

## 4. Completed Phase: Phase 1A — Backend Foundation (VERIFIED)

Phase 1A has been completely implemented and verified across all 7 tasks:
- **Task 1A.1:** Git repository initialized; root `.gitignore` (strict `.env` exclusion, `.env.example` allowed) and `.nvmrc` (pinned to Node 24).
- **Task 1A.2:** Backend `package.json` (`"type": "module"`, `engines: ">=24 <25"`) and `tsconfig.json` (`NodeNext` strict ESM).
- **Task 1A.3:** Centralized Zod environment validation (`backend/src/config/env.ts`) and safe `backend/.env.example`.
- **Task 1A.4:** Decoupled Express 5 application factory (`backend/src/app.ts`) with Helmet, non-credentialed CORS restricted to `FRONTEND_ORIGIN`, JSON 10kb body limit, request logging, and centralized error handling (`backend/src/middleware/error.middleware.ts`).
- **Task 1A.5:** `GET /api/health` endpoint and HTTP server entry point (`backend/src/server.ts`) with graceful shutdown (`SIGTERM`, `SIGINT`).
- **Task 1A.6:** Vitest 5.1 + Supertest setup; 15 deterministic unit and HTTP integration tests passing with 100% success rate.
- **Task 1A.7:** Full verification executed (`type-check`, `test`, `build`, smoke test), state synchronized, zero secrets committed.

---

## 5. Completed Phase: Phase 1B — Frontend Foundation (VERIFIED)

Phase 1B has been completely implemented and verified:
- **Application Scaffold:** Vite 8 + React 19 + TypeScript (`module: ESNext`, `moduleResolution: Bundler`) established in `frontend/`.
- **Design Tokens & Styling:** Authoritative CSS custom properties defined in `frontend/src/styles/tokens.css` and base reset in `frontend/src/styles/index.css` supporting calm, accessible SaaS theme.
- **Accessible App Shell & Primitives:** Responsive `AppShell` with semantic landmark elements (`<header role="banner">`, `<main role="main">`, `<footer role="contentinfo">`).
- **Header & Hero Components:** `Header` displaying SupportIQ brand, ShopEase demo badge, and no-login indicator; `PlaceholderHero` presenting architecture pillars, sample policy questions, and Phase 1B milestone indicator.
- **Testing Infrastructure:** Vitest 5.1 + React Testing Library + jsdom; 6 deterministic component tests passing with 100% success rate.
- **Build & Zero Secrets:** Verified `npm --prefix frontend run build` produces optimized static assets (`dist/`); audited to confirm zero server secrets or credentials exist in the bundle.

---

## 6. Completed Phase: Phase 1C — Monorepo Integration (VERIFIED)

Phase 1C has been completely implemented and verified:
- **npm Workspaces:** Created root `package.json` and generated root `package-lock.json` linking `backend` and `frontend` workspaces.
- **Root Development Scripts:** Configured `concurrently` (`npm run dev`) to run backend (`port 4000`) and frontend (`port 5173`) simultaneously. Added individual target runners `dev:backend` and `dev:frontend`.
- **Root Verification Commands:** Configured `npm test` (running both Vitest test suites), `npm run type-check` (verifying TypeScript across both workspaces), and `npm run build` (compiling production artifacts for both workspaces).
- **Root Documentation & Templates:** Authored root `README.md` covering prerequisites, local installation, workspace scripts, and architecture overview. Created root `.env.example` template with documented defaults.
- **Rules Preservation:** Preserved `GEMINI.md` as the permanent workspace engineering specification.

---

## 7. Completed Phase: Phase 2 — ShopEase Sample Knowledge Base & Ingestion (VERIFIED)

Phase 2 has been completely implemented and verified:
- **Canonical Knowledge Base:** Authored 7 curated synthetic Markdown documents under `backend/knowledge-base/shopease/` (`returns-policy.md`, `shipping-policy.md`, `refunds-policy.md`, `payments-policy.md`, `order-cancellation-policy.md`, `product-warranty.md`, `loyalty-program.md`).
- **Zod Frontmatter Validation:** Strict key-value frontmatter parser (`frontmatterParser.ts`) validating `id`, `title`, `category`, `version`, and `effectiveDate`.
- **Code-Fence-Aware Heading Parser:** Implemented `markdownHeadingParser.ts` capturing H1, H2, and H3 hierarchies while strictly honoring code-fence markers.
- **LangChain Recursive Text Splitting:** Implemented `markdownSplitter.ts` using `@langchain/textsplitters` (`RecursiveCharacterTextSplitter`, 800 chars, 120 overlap).
- **Deterministic Hashing:** SHA-256 `contentHash` and canonical `metadataHash`.
- **Atomic Manifest & 4-Category Change Detection:** `manifestService.ts` categorizes `added`, `updated`, `unchanged`, and `removed` chunks. Persisted to `backend/knowledge-base/shopease-manifest.json` (39 chunks).
- **CLI Runner:** Script `npm run ingest:knowledge-base` runs cleanly from root and backend, reporting 39 chunks across 7 documents. Idempotent re-runs verify zero duplicates.

---

## 8. Completed Phase: Phase 3 — Embedding and Vector Retrieval (VERIFIED)

Phase 3 has been completely implemented and verified across Tasks 3.1 through 3.9:
- **Certified Dependencies:** Pinned `mongodb: ~7.7.0` (officially certified on Node.js 24 LTS) and `openai: ~7.50.0`. Excluded `@langchain/mongodb` and `@langchain/openai` to avoid uncertified driver 6.x dependencies and duplicate driver instances.
- **Configuration & Fingerprinting:** Centralized Zod validation (`vector.config.ts`) supporting `MONGODB_URI`, `OPENAI_API_KEY`, `RETRIEVAL_MIN_SCORE` (`0.65`), `RETRIEVAL_TIMEOUT_MS` (`2500`), and `computeEmbeddingFingerprint()` (SHA-256 hash of `model:dimensions`).
- **OpenAI SDK Embedding Service:** Implemented `OpenAIEmbeddingService` directly using official `openai` SDK while implementing `EmbeddingsInterface` from `@langchain/core/embeddings.js`. Supports per-request `timeoutMs`, `signal`, and retry policies (`maxRetries: 0` for interactive queries; `maxRetries: 2` for batch ingestion). Preserves exact input index mapping using response `item.index`.
- **Native MongoDB Vector Store:** Implemented `MongoAtlasVectorStore` using native `MongoClient` v7.7.x and `$vectorSearch` aggregation pipeline. Strict immutable `_id` upsert semantics (filter: `{ _id: chunk.id }`, `$set` omits `_id`). Provides dedicated `updateMetadataBatch()` for zero-cost metadata-only updates, and passes `maxTimeMS` and `signal` to collection aggregation.
- **In-Memory Test Vector Store:** Implemented `InMemoryVectorStore` computing exact cosine ranking, score filtering, and signal cancellation for 100% offline, deterministic automated testing.
- **Recoverable Vector Sync:** Implemented `vectorSyncService.ts` comparing manifest chunks against remote `StoredChunkSignature` records. Automatically detects missing, outdated (content or fingerprint change), metadata-only, and stale chunks. Self-healing on partial failures; strictly requires `--sync-vectors` CLI flag.
- **Retrieval Service:** Implemented `RetrievalService` with a master deadline timer (`setTimeout` linked to `AbortController`), distinct `TIMEOUT` vs `ABORTED` classification, post-search deadline verification (late results never returned as `SUCCESS`), runtime `topK` bounding (1–10), and `minScore` threshold filtering.
- **Documentation:** Authored [`docs/ATLAS_VECTOR_SEARCH.md`](./ATLAS_VECTOR_SEARCH.md) covering exact JSON index definition, driver cancellation trade-offs, and safe dimension migration guide.
- **Test Suite:** 30 new unit tests added (79 backend tests total; 85 tests total across monorepo). 100% passing.

---

## 9. Completed Phase: Phase 4 — Basic LangChain RAG Answer Service (VERIFIED)

Phase 4 has been completely implemented and verified across Tasks 4.1 through 4.6:
- **Centralized LLM Configuration:** Validated `OPENAI_CHAT_MODEL` (default: `'gpt-6-luna'`), `LLM_TEMPERATURE` (`0.0`), `LLM_REASONING_EFFORT` (`'none'`), `LLM_MAX_OUTPUT_TOKENS` (`800`), `LLM_TIMEOUT_MS` (`6000`), and `LLM_MAX_RETRIES` (`1`) via Zod in `env.ts` and `llm.config.ts`.
- **Hardened XML Prompt Construction:** Implemented `promptBuilder.ts` with XML special character escaping (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&apos;`) for chunk text, metadata attributes, conversation history, and user queries. Neutralizes simulated closing tag injection attempts (e.g. `</chunk></document_context>`).
- **Strict Structured Outputs:** `OpenAiChatService` passes `zodResponseFormat(rawLlmAnswerSchema, 'grounded_answer')` with `strict: true`, all properties in `required`, `additionalProperties: false`, and `maxItems: 3` on follow-ups. Uses modern `max_completion_tokens: 800`.
- **Incomplete Response & Truncation Handling:** Explicitly inspects `finish_reason` and safely rejects outputs truncated by `max_completion_tokens` (`finish_reason: "length"`), empty content, and provider refusals as typed errors rather than invalid JSON crashes.
- **Strict Multi-Tiered Citation Validator:** `CitationValidator` validates citation ID presence in retrieved chunks and verifies normalized quote substring matches in chunk text. Discards uncorroborated citations without synthetic 160-character fallbacks. Rejects answers claiming sufficiency with zero valid citations as ungrounded.
- **Explicit Domain Result Classification:** `RagAnswerService` distinctly returns `'answered'`, `'insufficient_evidence'`, `'timeout'`, `'aborted'`, and `'error'`. Infrastructure, database, or LLM timeouts/errors are never masked as customer policy refusals. Fast short-circuit on empty retrieval (`EMPTY_BELOW_THRESHOLD`) bypasses LLM generation.
- **Deterministic Offline Testing:** 38 new unit tests added across `env.test.ts`, `promptBuilder.test.ts`, `citationValidator.test.ts`, `llmChatService.test.ts`, and `ragAnswerService.test.ts`. 117 backend tests total; 123 tests total across monorepo (100% passing offline without paid API credits).

---

## 10. Completed Phase: Phase 5 — LangGraph Workflow Orchestration (VERIFIED)

Phase 5 has been completely implemented and verified:
- **Certified Dependency:** Added `@langchain/langgraph: ^1.6.1` to `backend/package.json`, verified compatible with `@langchain/core: ^1.3.4` and Node.js 24 LTS.
- **Typed Graph State & Non-Success Initialization:** Authored `state.ts` using modern `Annotation.Root`. State initializes strictly with `status: 'pending'`, transitioning to `'answered'` only after successful generation and citation validation. Kept `signal` out of state, passing it through LangGraph's invocation configuration.
- **Strict Zod Structured Validation Schemas:**
  - `evidenceAssessmentSchema`: Validates boolean `isSufficient` and concise diagnostic string `reason`.
  - `queryRewriteSchema`: Validates `rewrittenQuery` (trimmed, non-empty, and strictly $\le 1000$ characters aligned with retrieval limits) and `reason`.
- **Discrete Workflow Nodes with Early Terminal Guards:**
  - `retrieveDocumentsNode`: Checks `state.status !== 'pending'` at entry to immediately bypass retrieval if previous nodes timed out, aborted, or failed.
  - `assessEvidenceNode`: Fast short-circuit skips LLM call completely when retrieved chunks are empty (0 tokens, 0ms). Evaluates candidate chunks with LLM using `evidenceAssessment.prompt.ts` under a 4.0s dynamic budget.
  - `rewriteQueryNode`: Reformulates inquiry via `queryRewrite.prompt.ts` under a 3.5s dynamic budget and increments `retryCount`. Invalid or empty outputs safely transition to `status: 'error'`, preventing further retrieval.
  - `generateAnswerNode`: Synthesizes answer using Phase 4 XML prompt framing and OpenAI Structured Outputs under a 6.0s dynamic budget. Preserves `pending` status.
  - `validateCitationsNode`: Programmatically validates citation IDs and quote substrings via `CitationValidator`. Assigns `status: 'answered'` upon verification, or flags ungrounded responses to `status: 'insufficient_evidence'`.
  - `returnInsufficientEvidenceNode`: Returns standard refusal answer with suggested starter questions.
- **Controlled Conditional Routing & Bounded Cycle:**
  - `routeAfterAssessment`: Routes to `generateAnswer` on sufficient evidence; routes to `rewriteQuery` on weak or empty evidence if `retryCount < 1`; routes to `returnInsufficientEvidence` if `retryCount >= 1`.
  - `routeAfterRewrite`: Routes to `retrieveDocuments` if state remains pending; halts to `__end__` on errors.
  - `routeAfterGeneration`: Routes to `validateCitations` if evidence was claimed; routes to `returnInsufficientEvidence` on refusal.
- **Master 20-Second Workflow Deadline & Rejection Handling:**
  - Wrapped `graph.invoke()` inside `SupportIQGraphService.execute()` with full `try / catch / finally`.
  - Master deadline timer (20.0s) and caller signal combined via native `AbortSignal.any()`.
  - Dynamically budgets each node to $\min(\text{standardTimeout}, \text{remainingBudget})$.
  - Catches invocation cancellations/rejections and distinguishes master timeout (`status: 'timeout'`), caller cancellation (`status: 'aborted'`), and unexpected errors (`status: 'error'`).
  - Unconditionally clears timers in `finally`.
  - Master deadline expiration is strictly mapped to `status: 'timeout'` and never converted into `insufficient_evidence`.
  - Post-invoke deadline check verifies the master deadline did not elapse during/after invocation.
  - Defensive terminal guard ensures only `status === 'answered'` is returned as success; unexpected non-terminal states return a safe internal error.
- **Deterministic Offline Testing:** 43 new unit tests added across `graphState.test.ts`, `graphNodes.test.ts`, `graphRouting.test.ts`, `graphDeadline.test.ts`, `graphSchemaValidation.test.ts`, and `supportiqGraph.test.ts`. 160 backend tests passing; 166 tests total across monorepo (100% passing offline without paid API credits).

---

## 11. Completed Phase: Phase 6 — Backend Chat API & Persistent Cost Protection (VERIFIED)

Phase 6 has been completely implemented and verified across all components:
- **Verified Dependency:** Added `js-tiktoken: ^1.0.21` directly to `backend/package.json` for conservative local pre-flight token estimation across OpenAI models (`o200k_base` and `cl100k_base`).
- **Startup Model Deprecation Defense & Pricing Dictionary:**
  - Implemented `backend/src/config/llmPricing.ts` with integer micro-dollar arithmetic ($\mu\text{USD}$ where $\$1.00 = 1,000,000\ \mu\text{USD}$).
  - Strictly allowlisted actively supported models (`gpt-6-luna` chat, `text-embedding-3-small` embedding).
  - Explicitly rejects deprecated models (`gpt-4o`, `gpt-4o-mini`) and unknown identifiers at application startup via `assertSupportedModels`.
  - Mathematically derives worst-case reservation cost at startup ($1,962\ \mu\text{USD}$ for `gpt-6-luna` under 14,100 billable token ceilings).
- **Persistent Atomic MongoDB Daily Usage Hard-Cap Tracker:**
  - Implemented `MongoUsageTracker` backed by MongoDB `daily_usage` collection with UTC date keys (`YYYY-MM-DD`).
  - Pre-call reservation uses atomic `findOneAndUpdate` with hard condition: `currentRequests + 1 <= limit && currentTokens + reservedTokens <= limit && currentMicroUsd + reservedCost <= limit`.
  - Safely handles concurrent day-initialization via unique `dateKey` index and `E11000` duplicate key race catch.
  - Preserves reservation `dateKey` across the entire request lifetime, reconciling against that exact date bucket even if clock crosses midnight UTC.
  - Fail-Closed: any database timeout, outage, or missing configuration immediately aborts the reservation and returns HTTP 503 `SERVICE_UNAVAILABLE`. Production startup fails closed if live OpenAI is configured without persistent MongoDB tracking.
  - In-memory tracker (`InMemoryUsageTracker`) restricted strictly to tests and local development.
- **Client Cancellation & Response Close Detection:**
  - Standardized on `res.once('close')` checking `!res.writableEnded` to detect abrupt client socket terminations before response completion.
  - Accounts for incomplete incoming request streams (`req.aborted || (req.destroyed && !req.complete)`).
  - Propagates cancellation directly into `SupportIQGraphService` via `AbortSignal.any()`.
  - Ensures no response is written after socket closure.
  - Distinguishes closed-socket disconnects (silent exit) from open-socket workflow aborts (HTTP 400 `REQUEST_ABORTED`).
- **Ingress Protections & Middlewares:**
  - Configured Express 5 `trust proxy` in `app.ts` for truthful client IP resolution.
  - Standardized 10kb body parser with structured error envelope mappings: HTTP 400 for malformed JSON and HTTP 413 for `PAYLOAD_TOO_LARGE`.
  - Sliding-window in-memory IP rate limiter (`rateLimit.middleware.ts`) returning HTTP 429 `RATE_LIMITED` with standard `RateLimit-*` and `Retry-After` headers.
  - Concurrency limiter (`concurrency.middleware.ts`) bounding simultaneous active executions with HTTP 429 `TOO_MANY_CONCURRENT_REQUESTS`.
- **Zod Request Validation & Public Endpoints:**
  - `POST /api/chat`: Validated via `chatRequestSchema` (message $\le 1000$ chars, history $\le 6$ messages with strict `user` / `assistant` role enum, `.strict()` rejection of unrecognized fields).
  - `GET /api/demo`: Serves public branding metadata and 5 curated starter questions synchronized with the ShopEase knowledge base.
- **Usage Aggregation Invariant Across LangGraph Nodes:**
  - Strictly enforced invariant across all graph nodes and the additive reducer: `totalTokens === embeddingTokens + promptTokens + completionTokens`.
  - `retrieveDocumentsNode` captures embedding usage and increments `embeddingTokens` and `totalTokens`.
  - `assessEvidenceNode`, `rewriteQueryNode`, and `generateAnswerNode` increment `promptTokens`, `completionTokens`, and `totalTokens`.
  - Complete, valid usage is required to release unused reservations; partial, aborted, or missing usage retains the reservation.
- **Deterministic Offline Testing:** 49 new unit and HTTP integration tests added across `tokenCounter.test.ts`, `pricing.test.ts`, `usageTracker.test.ts`, `rateLimiter.test.ts`, `chatValidator.test.ts`, `demo.test.ts`, and `chat.test.ts`. 209 backend tests passing; 215 tests total across monorepo (100% passing offline).

---

## 12. Completed Phase: Phase 7 — Public Frontend Experience & API Integration (VERIFIED)

Phase 7 has been completely implemented and verified across all components:
- **Centralized Typed API Client (`chatApi.ts`):** Strictly mirrors `docs/API_CONTRACTS.md` schemas for `GET /api/demo` and `POST /api/chat`. Handles standardized error envelopes (`BAD_REQUEST`, `PAYLOAD_TOO_LARGE`, `REQUEST_ABORTED`, `RATE_LIMITED`, `USAGE_LIMIT_EXCEEDED`, `SERVICE_UNAVAILABLE`, `GATEWAY_TIMEOUT`, `INTERNAL_ERROR`), mapping HTTP 503 from backend concurrency saturation to `SERVICE_UNAVAILABLE`. Provides graceful fallback to static ShopEase starter questions.
- **In-Memory State & Conversation-Generation Guards (`useChat.ts`):**
  - Conversation messages maintained strictly in React memory (`useState`); zero browser storage (`localStorage` / `sessionStorage` excluded). Page refresh starts a clean conversation.
  - History filtering discipline: constructs `history` using only completed, non-error turns; excludes current question (passed as `message`); filters eligible messages first, then takes latest 6.
  - Reset protection: clicking "New Chat" increments `conversationGenerationRef`, aborts in-flight fetch via `activeControllerRef`, and ignores late resolutions or rejections from older conversations.
  - Guarded `finally` cleanup: verifies both conversation generation and controller identity before clearing loading state, ensuring old requests cannot clear a newer request's loading state.
  - Distinguishes browser-side `AbortError` (silently ignored) from backend HTTP 400 `REQUEST_ABORTED` (presents user-friendly cancellation message).
- **Accessible Chat UI Primitives:**
  - `WelcomeHero.tsx`: Introduces ShopEase assistant, architecture pillars, synthetic policy disclaimer, and starter question chips.
  - `ChatInput.tsx`: Auto-resizing textarea with 1,000 character limit counter, Enter to send, Shift+Enter for newline, and accessible aria attributes.
  - `MessageBubble.tsx`: Distinct user styling; assistant card surface with avatar, status badges ("Documentation Insufficient" for refusals), verified citation pills, and follow-up question chips.
  - `MessageList.tsx`: Semantic `role="log"` with `aria-live="polite"` and safe `scrollIntoView` auto-scroll.
  - `CitationPill.tsx` & `CitationModal.tsx`: Accessible dialog (`role="dialog"`, `aria-modal="true"`) displaying document title, section, chunk ID badge, and verified excerpt; dismissable via Escape key, close button, or backdrop click.
  - `SuggestedQuestions.tsx` & `ErrorBanner.tsx`: Actionable error presentation with retry handlers.
  - `Header.tsx` & `Footer.tsx`: Enhanced header with "New Chat" button; updated footer explicitly stating *"No conversation history stored"*.
- **Development Proxy (`vite.config.ts`):** Reverse proxy routes `/api` directly to `http://localhost:4000` for frictionless local development.
- **Deterministic Offline Testing:** 45 new frontend tests added across `chatApi.test.ts`, `useChat.test.ts`, `ChatInput.test.tsx`, `MessageBubble.test.tsx`, `CitationModal.test.tsx`, `WelcomeHero.test.tsx`, and `ChatIntegration.test.tsx`. 51 frontend tests passing; 260 tests total across monorepo (100% passing offline).

---

## 13. Completed Phase: Phase 8 — Production Readiness, Deployment & Portfolio Verification (VERIFIED)

Phase 8 has been completely implemented and verified:
- **Strict Production Startup Safeguards:** Enforced in `backend/src/server.ts` that `NODE_ENV === 'production'` requires both `MONGODB_URI` and `OPENAI_API_KEY`. Fails fast if absent. Startup validates model support via `assertSupportedModels()`. Strictly prohibits mock adapters (`MockEmbeddingService`, `MockLlmChatService`, `InMemoryVectorStore`, `InMemoryUsageTracker`) in production.
- **Enhanced Liveness & Cached Readiness Probing:**
  - `GET /api/health` functions as a lightweight liveness probe (200 OK) without database calls.
  - `GET /api/health?ready=true` executes a deep readiness probe: verifies MongoDB cluster ping, asserts `supportiq_vector_index` exists and is both `status === 'READY'` and `queryable === true`, confirms `knowledge_chunks` contains all 39 chunks derived from `shopease-manifest.json` (preventing readiness from passing on stale or unrelated data), and verifies `daily_usage` collection accessibility.
  - Zero OpenAI calls are made during readiness checks. Results are cached in memory for 15 seconds. Returns HTTP 503 `status: 'degraded'` on failure without leaking credentials or internal paths.
- **Deployment-Specific Proxy Trust & Route Precedence:**
  - `TRUST_PROXY` defaults to `false` in `env.ts` to prevent client IP spoofing on public rate limiting.
  - Rate limiting and concurrency semaphores are documented as process-local, strictly bounding initial deployment topology to a single backend instance.
  - Route order precedence in Express mounts API routes first (`/api/*`), followed immediately by an explicit API 404 guard (`app.use('/api', notFoundHandler)`). Unmatched API requests immediately return structured JSON 404 and never fall through to static assets or SPA HTML.
  - When `SERVE_STATIC_FRONTEND=true` in `NODE_ENV=production`, Express serves static assets from `frontend/dist` and handles SPA client routing via `GET * -> index.html`.
- **Reproducible Multi-Stage Dockerfile & Packaging:**
  - Authored multi-stage `Dockerfile` (Node.js 24 LTS Alpine) handling workspace manifests, reproducible `npm ci`, and unprivileged non-root execution (`USER node`). Created `.dockerignore`.
  - Added backend production start script (`"start": "node dist/server.js"`) and root lifecycle scripts (`build:all`, `start`, `verify:bundle-security`).
- **Dedicated Bundle Security Verification:**
  - Implemented standalone scanner `scripts/verify-bundle-security.js` executed via `npm run verify:bundle-security`. Recursively scans freshly built `frontend/dist` assets against regex signatures for API keys (`sk-...`), MongoDB URIs, and private environment keys.
  - Verified 0 secrets in the 1347 KB client bundle.
- **Comprehensive Portfolio Showcase Documentation:**
  - Overhauled root `README.md` with complete architecture diagrams, LangGraph state machine deep dive, micro-dollar budget guard explanations, synthetic ShopEase policy disclaimers, honest hosting tier notes (transparently disclosing Render free tier ~1 minute cold starts after 15 min inactivity), Atlas Vector Search setup instructions, and reproduction guide.
  - Created `frontend/.env.example` documenting `VITE_API_BASE_URL`.
- **Deterministic Offline Testing:** 11 new tests added across `readinessChecker.test.ts`, `health.test.ts`, and `staticServing.test.ts`. 220 backend tests passing; 271 tests total across monorepo (100% passing offline).

---

## 14. Next Phase: Phase 9 — RAG Evaluation, Benchmark Dataset & Adversarial Testing (Pending User Instruction)

**Proposed Scope for Phase 9:**
- Construct version-controlled evaluation dataset (`backend/tests/evaluation/dataset.json`) with at least 35 test cases (20 answerable policy queries with ground truth chunk IDs, 10 unanswerable out-of-domain questions, 5 ambiguous/follow-up questions, 5 adversarial prompt-injection probes).
- Implement automated evaluation runner (`npm run evaluate:rag`) calculating retrieval hit rate, citation ID validity, excerpt accuracy, answer groundedness, refusal precision, latency, and token consumption.
- Empirical prompt-injection benchmark verifying XML delimiter boundary defense and zero rule overrides against known jailbreak patterns.
- Keep live LLM evaluation opt-in and separate from standard deterministic CI test runs.
