# SupportIQ — Testing & Evaluation Strategy

**Status:** Pending User Approval  
**Last Updated:** 2026-11-04  
**Primary Framework:** Vitest (Frontend & Backend), Supertest (Backend HTTP), React Testing Library (Frontend)  

---

## 1. Testing Philosophy

Testing is a core discipline of SupportIQ. Because the developer is learning automated testing and LLM engineering, the test suite must adhere to these foundational principles:

1. **Deterministic & Fast by Default:** Standard automated tests (`npm test`) must run locally and in CI without requiring an active internet connection, live MongoDB Atlas cluster, or paid OpenAI API credits.
2. **Mock External Providers:** All LLM completions, embeddings, and vector store operations are mocked in unit and integration test suites using typed stubs and in-memory adapters.
3. **Strict Separation of CI and Live Evaluation:** Live LLM evaluations that consume provider credits or write to Atlas are isolated into dedicated, opt-in evaluation scripts that require explicit developer execution.
4. **No Test Weakening:** Tests must not be weakened, deleted, or loosened to force a green suite. If an expected behavior changes, the reason must be documented and approved.

---

## 2. Test Architecture & Framework Selection

| Layer | Runner / Library | Purpose |
| :--- | :--- | :--- |
| **Backend Unit Testing** | **Vitest 5.1** (with Vite 6+ peer dependency) | Fast, native ESM unit test runner for business logic, schemas, and graph nodes (verified on Node.js 24 LTS). |
| **Backend HTTP Testing** | **Vitest 5.1 + Supertest** | Black-box HTTP integration testing of Express 5 routes, middleware, timeouts, and error paths. |
| **Frontend Component Testing**| **Vitest 5.1 + `@testing-library/react` + `@testing-library/user-event` + `jsdom`** | Verifying user interactions, accessibility, citation views, and rendering states in a simulated DOM. |
| **RAG Evaluation Suite** | **Custom Runner + Vitest 5.1** | Automated benchmark measuring retrieval accuracy, citation validity, excerpt accuracy, groundedness, and empirical prompt-injection defense across a 35+ question dataset. |

---

## 3. Backend Test Coverage Plan

### 3.1 Unit Tests (`backend/tests/unit/`)
* **Environment Validation (`env.test.ts`):** Verifies Zod fails fast on missing required variables, invalid port numbers, or malformed CORS origins.
* **Knowledge Base Chunking (`chunker.test.ts`):** Tests Markdown parsing, chunk size and overlap bounds, metadata preservation (`sourceId`, `sectionTitle`, `chunkIndex`), and deterministic SHA-256 content hashing.
* **Citation Validation (`citationValidator.test.ts`):** Asserts that candidate citations missing from retrieved chunk sets are stripped, and that answers with zero valid citations trigger the ungrounded fallback.
* **Persistent Usage Tracker (`usageTracker.test.ts`):** Tests the atomic reservation logic, UTC day rollover, daily spend limit calculation, and fail-closed behavior using an in-memory database mock.
* **Timeout, Retries & Cancellation (`timeout.test.ts`):**
  - Verifies that the OpenAI client configures `maxRetries: 1`.
  - Verifies that sub-call timeouts enforce budgets (2.5s retrieval, 3.5–6s LLM nodes).
  - Verifies that `AbortSignal` triggering terminates pending pipeline execution cleanly.
* **LangGraph State Transitions (`graph.test.ts`):** Evaluates conditional edge routing:
  - Sufficient evidence $\rightarrow$ `generateAnswer`
  - Weak evidence $\rightarrow$ `rewriteQuery` $\rightarrow$ `retrieveAgain`
  - Strict bound: maximum 1 query rewrite cycle
  - Cumulative execution guard (>20s triggers fallback directly)
  - Failed retry $\rightarrow$ `returnInsufficientEvidence`

### 3.2 HTTP Integration Tests (`backend/tests/integration/`)
Using Supertest against the configured Express 5 application factory:
* **`health.test.ts`:** Verifies `GET /api/health` returns `200 OK` with `{ status: "ok" }`.
* **`demo.test.ts`:** Verifies `GET /api/demo` returns suggested prompts and branding metadata.
* **`chat.test.ts`:**
  - Valid question returns `200 OK` with grounded answer and valid citation array.
  - Question with missing documentation returns `200 OK` with `insufficient_evidence` status.
  - Overlong question (>1,000 chars) returns `400 Bad Request`.
  - Malformed history object returns `400 Bad Request`.
  - Untrusted history handling: client-supplied policy claims in history do not leak into answers.
  - IP rate-limit violation returns `429 Too Many Requests`.
  - Daily spend budget exhaustion returns `429 Too Many Requests`.
  - Database outage during reservation returns `503 Service Unavailable` (fail-closed check).
  - Timeout trigger returns `504 Gateway Timeout`.

---

## 4. Frontend Test Coverage Plan (`frontend/tests/`)

Using Vitest with `@testing-library/react`, `@testing-library/user-event`, and `jsdom`:

* **Chat Shell & Input:**
  - Verify send button is disabled when input is empty or request is in-flight.
  - Verify character count bounds (input capped at 1,000 chars).
  - Verify Enter submits question and Shift+Enter inserts newline.
* **Message Thread & State:**
  - Verify distinct styling between user questions and assistant answers.
  - Verify loading skeleton displays while waiting for API response.
  - Verify error banner displays on 400, 429, 500, and 504 status codes with retry action.
* **Citation Drawer / Popover:**
  - Verify source pills display document title and section heading.
  - Verify clicking a citation pill opens the excerpt drawer displaying the verified chunk text.
  - Verify answers with `insufficient_evidence` display no source pills.
* **Session Reset:**
  - Verify clicking "New Conversation" clears active messages and reset ephemeral context.

---

## 5. RAG Evaluation Suite (Phase 9)

### 5.1 Dataset Composition (`backend/tests/evaluation/dataset.json`)
A curated, version-controlled benchmark containing at least 35 test cases:
1. **Answerable Questions (20 cases):** Straightforward and nuanced ShopEase policy questions with expected source IDs and section titles.
2. **Unanswerable Questions (10 cases):** Out-of-domain questions, competitor inquiries, or policies not in ShopEase documentation (e.g. store physical locations, driver phone numbers).
3. **Ambiguous & Follow-Up Questions (5 cases):** Questions requiring prior conversational context (e.g. *"How long does the refund take?"* following a return query).
4. **Adversarial / Injection Questions (5 cases):** Prompts attempting to force policy fabrication, role changes, or system prompt leaks.

### 5.2 Multi-Tiered Evaluation Metrics
* **Retrieval Hit Rate (%):** Percentage of answerable test cases where the ground-truth document chunk is present in the top-$k$ retrieved chunks.
* **Citation ID Validity (%):** Structural check ensuring that 100% of generated citations match IDs present in the retrieved chunk result set.
* **Exact Excerpt Verification (%):** Structural check confirming that cited excerpts accurately represent text within the retrieved chunk.
* **Citation Relevance:** Semantic evaluation verifying that the cited content directly answers the visitor's specific question rather than being tangentially related.
* **Answer Groundedness / Factuality (%):** Measurement confirming that every substantive factual claim in the generated answer is directly corroborated by cited documentation, with zero policy hallucinations.
* **Prompt Injection Resistance (%):** Measured pass rate against the defined adversarial test suite (verifying that jailbreak patterns, instruction-override attempts, and role hijacking fail safely).  
  *Note: While achieving 100% resistance on the defined adversarial benchmark dataset is a required quality gate, no finite test suite guarantees complete prompt-injection prevention. The evaluation measures empirical robustness against known attack vectors.*
* **Refusal Precision (%):** Accuracy of abstaining (*"I couldn't find enough information..."*) on unanswerable and out-of-domain questions without guessing.
* **Cost & Latency Tracking:** Measured duration (ms) and total token consumption per query.

### 5.3 Live vs. Mocked Evaluation
* **Deterministic Evaluation:** Evaluates retrieval parser, citation validator, and graph state routing using recorded mock fixtures.
* **Opt-In Live Evaluation Runner (`npm run evaluate:rag`):**
  - Requires live `OPENAI_API_KEY` and MongoDB Atlas connection.
  - Prints expected token cost estimate before running.
  - Generates a timestamped markdown report in `docs/evaluations/` detailing metric scores and failed cases.

---

## 6. Verification Commands & Phase Quality Gates

Every phase must pass its specific verification checks before being marked complete.

### Phase 1A Verification Commands (Backend-Specific)
Prior to root workspace configuration in Phase 1C, verification commands are executed against the backend workspace:

```bash
# Type integrity check for backend
npm --prefix backend run type-check

# Run automated Vitest test suite for backend
npm --prefix backend test

# Production build verification for backend
npm --prefix backend run build
```

### Monorepo Workspaces Verification Commands (Phase 1C Onward)
Once root npm workspaces are established in Phase 1C:

```bash
# Type integrity check across workspaces
npm run type-check

# Run automated Vitest test suite across workspaces
npm test

# Run code style and lint checks
npm run lint

# Production build verification across workspaces
npm run build
```

*A phase is only accepted when all applicable checks execute with zero errors, and the results are reported accurately.*
