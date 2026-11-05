# SupportIQ — Architecture Decision Records (ADRs)

**Last Updated:** 2026-11-04  
**Status:** Living Document (Pending User Approval)  

---

## Index of Decisions

- [ADR-001: Pinned Node.js 24.x LTS Runtime Baseline](#adr-001-pinned-nodejs-24x-lts-runtime-baseline)
- [ADR-002: Tailored Dual TypeScript Module Configurations](#adr-002-tailored-dual-typescript-module-configurations)
- [ADR-003: Unified Vitest, Supertest, and React Testing Library Stack](#adr-003-unified-vitest-supertest-and-react-testing-library-stack)
- [ADR-004: Persistent and Concurrency-Safe Global API Cost Protection](#adr-004-persistent-and-concurrency-safe-global-api-cost-protection)
- [ADR-005: LLM Provider Configuration, Deprecation Defense, and Retry Policy](#adr-005-llm-provider-configuration-deprecation-defense-and-retry-policy)
- [ADR-006: Progressive Implementation: Linear RAG before LangGraph](#adr-006-progressive-implementation-linear-rag-before-langgraph)
- [ADR-007: Ephemeral Conversation Context and Zero-Auth Model](#adr-007-ephemeral-conversation-context-and-zero-auth-model)
- [ADR-008: Multi-Tiered Citation Validation, Empirical Groundedness, and Adversarial Testing](#adr-008-multi-tiered-citation-validation-empirical-groundedness-and-adversarial-testing)
- [ADR-009: Curated Synthetic Knowledge Base, Canonical Facts, and Idempotent Ingestion](#adr-009-curated-synthetic-knowledge-base-canonical-facts-and-idempotent-ingestion)
- [ADR-010: Layered Timeout Budgeting and Best-Effort Cancellation](#adr-010-layered-timeout-budgeting-and-best-effort-cancellation)
- [ADR-011: Production Deployment Topologies, Static Serving, and Health Probing](#adr-011-production-deployment-topologies-static-serving-and-health-probing)

---

## ADR-001: Pinned Node.js 24.x LTS Runtime Baseline

* **Status:** Proposed (Under Review)
* **Context:** SupportIQ requires a stable runtime across developer machines and hosting environments. An earlier proposal considered Node.js 18+ or 26.
* **Decision:**
  - Pin the required runtime to **Node.js 24 LTS**.
  - Commit `.nvmrc` containing `24` at the repository root.
  - Set root `package.json` engines field to `"node": ">=24 <25"`.
  - Treat `node -v` and `npm -v` as blocking prerequisites before development begins.
* **Consequences:**
  - Guarantees modern platform capabilities (native fetch, modern crypto, stable ESM).
  - Eliminates drift across environments.
  - Requires developers and CI pipelines to have Node.js 24 LTS active.

---

## ADR-002: Tailored Dual TypeScript Module Configurations

* **Status:** Proposed (Under Review)
* **Context:** The repository is a monorepo containing a Node.js + Express 5 backend and a React + Vite frontend. Enforcing a single module resolution across both runtimes creates synthetic typing workarounds.
* **Decision:**
  - **Backend Workspace (`backend/tsconfig.json`):**
    - `"module": "NodeNext"`
    - `"moduleResolution": "NodeNext"`
    - `"type": "module"` in `backend/package.json`
    - Adhere strictly to native Node.js ESM conventions, including mandatory `.js` file extensions on relative imports.
  - **Frontend Workspace (`frontend/tsconfig.json`):**
    - `"module": "ESNext"`
    - `"moduleResolution": "Bundler"`
    - Adhere to standard Vite conventions (extensionless component imports, modern asset bundling).
* **Consequences:**
  - Backend runs natively in Node.js ESM without transpilation hacks or CJS compatibility shims.
  - Frontend matches modern Vite/Rollup bundling idioms cleanly.
  - Developers must observe explicit `.js` extensions when working in `backend/`.

---

## ADR-003: Unified Vitest, Supertest, and React Testing Library Stack

* **Status:** Proposed (Under Review)
* **Context:** Testing is a core learning and delivery requirement. Using Jest with NodeNext ESM introduces complex transform and mocking hurdles.
* **Decision:**
  - Use **Vitest** as the sole unit/component test runner across both `frontend/` and `backend/`.
  - Use **Supertest** for backend HTTP route and middleware integration testing.
  - Use **`@testing-library/react`**, **`@testing-library/user-event`**, and **`jsdom`** for frontend component and accessibility tests.
  - Remove all alternative test runners (Jest, ts-jest, Mocha) from the project specification.
* **Consequences:**
  - Out-of-the-box native ESM and TypeScript support without separate Babel or ts-jest configurations.
  - Shared configuration patterns between frontend and backend.
  - Fast execution and built-in watcher workflows.

---

## ADR-004: Persistent and Concurrency-Safe Global API Cost Protection

* **Status:** Approved & Implemented (Phase 6)
* **Context:** SupportIQ is a public portfolio application with no visitor login. Exposing an LLM endpoint without persistent cost protection could exhaust the developer's API credits under sudden traffic or malicious abuse. An in-memory circuit breaker resets upon server restart and fails across multiple instances.
* **Decision:**
  - Implement a persistent, MongoDB-backed cost protection service (`MongoUsageTracker`).
  - Store aggregate usage in a `daily_usage` collection keyed by UTC date string (`YYYY-MM-DD`).
  - Use exact integer micro-dollar arithmetic ($\mu\text{USD}$ where $\$1.00 = 1,000,000\ \mu\text{USD}$) to avoid IEEE 754 floating-point inaccuracies.
  - Dynamically calculate worst-case reservation cost at startup from the configured chat model and embedding model pricing ($1,962\ \mu\text{USD}$ for `gpt-6-luna`).
  - Pre-call reservation uses atomic `findOneAndUpdate` with a strict hard-cap condition: `currentRequests + 1 <= limit && currentTokens + reservedTokens <= limit && currentMicroUsd + reservedCost <= limit`.
  - Handle concurrent day-initialization safely via unique index on `dateKey` and `E11000` duplicate key race catch.
  - Preserve reservation `dateKey` across the entire request lifetime and reconcile against that exact date bucket even if clock crosses midnight UTC.
  - Post-call reconciliation releases unused reservation only when every provider call returns complete, verified usage (`isComplete: true`). Incomplete, missing, or aborted usage retains the full reservation.
  - Enforce total tokens invariant across all LangGraph nodes: `totalTokens === embeddingTokens + promptTokens + completionTokens`.
  - **Fail-Closed:** Production startup fails closed if live OpenAI is configured without persistent MongoDB tracking (`MONGODB_URI`). If MongoDB is unreachable or throws an error during pre-call reservation, the chat request is safely rejected with HTTP 503 `SERVICE_UNAVAILABLE`.
  - In-memory tracker (`InMemoryUsageTracker`) is restricted strictly to tests and local development.
  - Never store visitor conversation logs or PII for usage tracking.
* **Consequences & Realistic Limitations:**
  - Provides robust, defense-in-depth protection against runaway credit consumption under concurrent requests and process restarts.
  - Conservative reservation bounds guarantee that concurrent requests cannot exceed the daily budget limit.
  - Adds a low-latency database read/update to the chat request lifecycle.

---

## ADR-005: LLM Provider Configuration, Deprecation Defense, and Retry Policy

* **Status:** Approved & Implemented (Phase 6)
* **Context:** Relying on deprecated model identifiers (e.g. `gpt-4o` or `gpt-4o-mini`) or unconstrained SDK retry defaults risks pipeline failures and latency explosions.
* **Decision:**
  - Supported models are restricted to an explicit pricing allowlist with verified per-token rates (`gpt-6-luna` for chat, `text-embedding-3-small` for embeddings).
  - Explicitly reject deprecated model identifiers (`gpt-4o`, `gpt-4o-mini`) and unknown models at application startup via `assertSupportedModels()`.
  - Embeddings dimensions pinned to `1536` with configuration fingerprinting (`computeEmbeddingFingerprint`).
  - **SDK Retry Policy:** Explicitly configure the OpenAI SDK client with `maxRetries: 0` for the interactive public chat pipeline. In a multi-step LangGraph workflow, automatic exponential retries cause compound latency spikes that breach the master request deadline.
  - Use `js-tiktoken` as a conservative local pre-flight token estimator to enforce per-node input ceilings before calling OpenAI.
  - Decouple the coding model (Gemini 3.8 Flash High used by Antigravity) from the application runtime model (OpenAI). Server secrets are never exposed to the frontend.
* **Consequences:**
  - Prevents hidden retry amplification across the multi-node workflow.
  - Guaranteed fast-failure at startup if misconfigured with obsolete or deprecated models.
  - Preserves alignment between vector index dimensions and embedding outputs.

---

## ADR-006: Progressive Implementation: Linear RAG before LangGraph

* **Status:** Approved & Implemented (Phase 4 / Phase 5)
* **Context:** The developer is learning LLM and RAG application development. Introducing LangGraph state machines, cyclic routing, and multi-node orchestration in a single step obscures foundational RAG mechanics.
* **Decision:**
  - Implement a basic, linear LangChain.js RAG answer pipeline first in **Phase 4** (retrieval $\rightarrow$ prompt formatting $\rightarrow$ model response $\rightarrow$ citation check $\rightarrow$ refusal).
  - Migrate and encapsulate the verified RAG pipeline into a formal LangGraph.js `StateGraph` in **Phase 5** (adding evidence evaluation and a bounded 1-retry query rewrite loop).
* **Consequences:**
  - Ensures foundational RAG concepts (chunking, embeddings, prompt grounding, citation extraction) are thoroughly understood, tested, and verified before introducing stateful graph complexity.
  - Prevents compounding bugs between RAG logic and graph routing.

---

## ADR-007: Ephemeral Conversation Context and Zero-Auth Model

* **Status:** Approved & Implemented (Phase 6)
* **Context:** Visitors must be able to experience the portfolio demo without registration, logins, or connecting databases. Persistent storage of visitor conversations adds GDPR/privacy liabilities and database bloat.
* **Decision:**
  - SupportIQ requires no user authentication or visitor database setup.
  - Conversation history is maintained ephemerally in browser memory or `sessionStorage` and sent with each request.
  - The backend enforces a strict ceiling on conversation history (maximum 6 prior messages, $\le 1000$ characters per message) and validates message roles with Zod (`user` and `assistant` only; rejecting `system` or `developer`).
  - **Untrusted History Discipline:** Client conversation history is explicitly treated as untrusted user input. It must never override system instructions or be treated as verified company policy facts. Policy answers must be derived solely from retrieved knowledge chunks.
  - Visitor conversations are **not** permanently persisted in MongoDB in Version 1.
* **Consequences:**
  - Completely frictionless visitor demo.
  - Zero storage of personal conversational data.
  - Conversation context is lost if session storage is cleared or a new conversation is started.

---

## ADR-008: Multi-Tiered Citation Validation, Empirical Groundedness, and Adversarial Testing

* **Status:** Proposed (Under Review)
* **Context:** LLMs can fabricate citations, hallucinate facts, or be manipulated by adversarial prompts embedded in queries or context. A single validation check cannot address all these vectors.
* **Decision:**
  - Establish a clear technical distinction between four separate verification tiers:
    1. **Citation ID Validation:** The backend programmatically checks that every cited chunk ID strictly belongs to the set of document chunks actually retrieved for that specific request. Fabricated IDs are stripped. If no valid citations remain for a substantive answer, the response is rejected and routed to the insufficient-evidence fallback.
    2. **Exact Excerpt Verification:** Verifies that cited text snippets faithfully correspond to actual substrings or validated sections of the retrieved chunk.
    3. **Semantic Relevance:** Evaluates whether the retrieved chunk content genuinely addresses the user's specific inquiry.
    4. **Answer Groundedness:** Measures whether claims in the synthesized answer are directly substantiated by cited excerpts without adding ungrounded assertions or policy inventions.
  - **Empirical Prompt-Injection Testing:**
    - Citation validation does **not** prevent prompt injection.
    - Defense-in-depth controls are enforced separately: strict system prompt framing, wrapping retrieved documents in explicit non-instructional XML delimiter tags (`<document_context>`), forbidding role adoption, schema-enforced structured outputs, low model temperature (0.0–0.2), and input length sanitization.
    - **No finite test suite guarantees complete prompt-injection prevention.** SupportIQ measures prompt-injection resistance empirically against a defined 35+ test case adversarial benchmark in Phase 9, requiring zero regressions against known jailbreak patterns rather than claiming theoretical absolute immunity.
* **Consequences:**
  - Eliminates fabricated citation links in the public UI.
  - Distinguishes structural verification from semantic accuracy and security hardening.
  - Focuses security validation on measurable, reproducible benchmark evaluations.

---

## ADR-009: Curated Synthetic Knowledge Base, Canonical Facts, and Idempotent Ingestion

* **Status:** Proposed (Under Review)
* **Context:** A customer service assistant requires consistent, realistic documentation to answer queries accurately. Specification documents often cite sample figures (e.g., return windows) that must not contradict the actual knowledge base.
* **Decision:**
  - Author 7 curated, synthetic Markdown policy documents under `backend/knowledge-base/shopease/` (Returns, Shipping, Refunds, Payments, Cancellations, Warranty, Loyalty).
  - **Canonical Truth:** The Markdown documents authored in Phase 2 are the single authoritative source of truth for ShopEase policies. Any examples in early specification drafts or API docs are illustrative and must be synchronized to match the Markdown documents upon their creation.
  - Chunk documents deterministically using LangChain text splitters, computing a stable content hash per chunk.
  - Store metadata (`sourceId`, `sourceTitle`, `sectionTitle`, `chunkIndex`, `contentHash`) alongside the vector.
  - Make the ingestion script repeatable and idempotent: re-running it updates existing chunks or safely rebuilds the dedicated `knowledge_chunks` collection without duplicates.
* **Consequences:**
  - Predictable, deterministic retrieval behavior.
  - Safe for repetitive CI and local development workflows.
  - Canonical policy facts remain centralized in Markdown source documents.

---

## ADR-010: Layered Timeout Budgeting and Best-Effort Cancellation

* **Status:** Proposed (Under Review)
* **Context:** LangGraph workflows may execute sequential retrieval and model calls. Uncontrolled individual timeouts or retries risk exceeding the master HTTP deadline. Furthermore, client disconnects must be handled cleanly.
* **Decision:**
  - Establish a reconciled timeout budget within an overall **25-second HTTP deadline**:
    - Embedding retrieval timeout: 2.5s
    - Vector search query timeout: 2.5s
    - Evidence assessment node: 4.0s
    - Query rewrite node: 3.5s
    - Answer generation node: 6.0s
    - Total worst-case sequential execution in retry path is tightly capped with an early short-circuit fallback if cumulative time exceeds 20s.
  - Configure OpenAI SDK `maxRetries: 1` to prevent cascading retry delays.
  - **Best-Effort Cancellation:** Propagate a master `AbortSignal` to all LangGraph nodes and downstream fetch/OpenAI calls upon client disconnect or deadline expiration.
  - Explicitly document that **cancellation is best-effort**: it halts local processing and socket connections, but if the provider (OpenAI) has already queued or processed tokens, billing for that generation may still occur.
* **Consequences:**
  - Guarantees predictable response latency for public visitors.
  - Prevents zombie requests from consuming backend event loop resources.
  - Acknowledges real-world provider billing mechanics transparently.

---

## ADR-011: Production Deployment Topologies, Static Serving, and Health Probing

* **Status:** Approved & Implemented (Phase 8)
* **Context:** SupportIQ is targeted for a public portfolio deployment. Running the application in production requires clear specifications for hosting topologies, static asset routing, proxy trust, production credential enforcement, and health/readiness probing without incurring cloud provider billing or leaking internal topology.
* **Decision:**
  - **Decoupled Architecture with Optional Unified Serving:**
    - Primary deployment: Vercel/Netlify hosting the React 19 SPA (Edge CDN) + Render/Railway hosting the Express 5 Node.js 24 LTS API backend (single instance).
    - Alternative: Unified container deployment where Express serves compiled `frontend/dist` static assets via `SERVE_STATIC_FRONTEND=true`.
  - **Strict Route Order & API 404 Guard:**
    - Mount API routers first (`/api/health`, `/api/demo`, `/api/chat`).
    - Mount strict API 404 guard immediately after: `app.use('/api', notFoundHandler)`. This guarantees any unmatched `/api/*` request returns a structured JSON 404 and never falls through to static file serving or SPA `index.html`.
    - Mount `express.static` and SPA fallback `* -> index.html` last.
  - **Single Backend Instance Constraint:**
    - The sliding-window rate limiter and concurrency semaphore use process-local memory. The initial deployment topology is strictly constrained to **one active instance**.
  - **Deployment-Specific Proxy Trust (`TRUST_PROXY`):**
    - `TRUST_PROXY` defaults to `false` to prevent client IP spoofing via arbitrary `X-Forwarded-For` headers. It is configured with an explicit hop count (e.g., `1`) only after verifying the hosting reverse proxy chain.
  - **Mandatory Production Credentials & Mock Prohibition:**
    - `NODE_ENV === 'production'` requires both `MONGODB_URI` and `OPENAI_API_KEY`. Missing either terminates the process at startup with exit code 1.
    - Production is strictly prohibited from instantiating mock services (`MockEmbeddingService`, `MockLlmChatService`, `InMemoryVectorStore`, `InMemoryUsageTracker`).
  - **Strengthened Health & Readiness Probes:**
    - `GET /api/health`: Lightweight liveness probe returning HTTP 200 `{ status: "ok" }` with zero database calls.
    - `GET /api/health?ready=true`: Deep readiness probe verifying:
      1. MongoDB Atlas cluster ping.
      2. `supportiq_vector_index` presence, requiring BOTH `status === 'READY'` and `queryable === true`.
      3. Knowledge base data readiness: verifies collection contains all chunk IDs derived from `shopease-manifest.json` (preventing readiness from passing on stale or unrelated records).
      4. Usage tracking collection accessibility (`daily_usage`).
    - Readiness makes zero OpenAI calls and caches results in memory for 15 seconds.
    - Failures return HTTP 503 `{ status: "degraded", ready: false }` without exposing internal credentials, paths, or exception traces.
* **Consequences:**
  - Robust operational safety for public visitors.
  - Transparent disclosure of free-tier cold starts (~1 minute idle sleep on Render).
  - Clean separation between process liveness and external dependency readiness.

