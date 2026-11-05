# SupportIQ — API Contracts & Specifications

**Status:** Living Document (Phase 6 Approved & Implemented)  
**Last Updated:** 2026-11-05  
**Base URL:** `/api`  
**Data Format:** JSON (`application/json`)  

---

## 1. General API Conventions

### 1.1 Authentication & Authorization
* **Status:** Approved & Implemented (Phase 1A / Phase 6)
* SupportIQ is a public portfolio demonstration application.
* **No authentication, tokens, API keys, or cookies are required** for public endpoints.
* Server secrets (OpenAI API key, MongoDB URI) are never exposed to the client.

### 1.2 Ingress Security, Headers & Timeout Budget
* **Status:** Approved & Implemented (Phase 6)
* **CORS:** Restricted to `FRONTEND_ORIGIN` (default: `http://localhost:5173`).
* **Security Headers:** Enforced via Helmet (`X-Content-Type-Options`, `Strict-Transport-Security`, `X-Frame-Options`, etc.).
* **Reverse Proxy Trust:** Configured Express 5 `trust proxy` (`TRUST_PROXY` boolean or hop count) for truthful client IP resolution.
* **Payload Size Limit:** JSON body parser strictly capped at `10kb` to reject oversized payload attacks (returning HTTP 413 `PAYLOAD_TOO_LARGE`).
* **Reconciled Timeout Budget & Cancellation:**
  - **Overall Request Deadline:** A master 25-second `AbortController` timeout wraps the entire `/api/chat` request pipeline (returning HTTP 504 Gateway Timeout if triggered).
  - **OpenAI SDK Retry Policy:** Configured with `maxRetries: 0` for the public chat pipeline to prevent compounding exponential backoff delays.
  - **Sub-Call Timeouts:** Embedding generation (2.5s), Atlas Vector Search (2.5s), evidence assessment (4.0s), query rewrite (3.5s), answer generation (6.0s). If cumulative time exceeds 20s prior to the final generation node, the workflow short-circuits directly to the insufficient-evidence fallback.
  - **Client Response-Close Cancellation:** Standardized on `res.once('close')` checking `!res.writableEnded` to detect abrupt client socket terminations before response completion. Incomplete incoming request streams (`req.aborted || (req.destroyed && !req.complete)`) are caught immediately. Cancellation propagates to `SupportIQGraphService` via `AbortSignal.any()`. If the client closes the socket prematurely, no response is written. If the workflow aborts with the client connection still open, HTTP 400 `REQUEST_ABORTED` is returned.

### 1.3 Untrusted Conversation History Discipline
* **Status:** Approved & Implemented (Phase 6)
* All client-supplied conversation history is treated strictly as **untrusted user input**.
* History messages must **never override system instructions, persona constraints, or safety guidelines**.
* History messages must **never be treated as verified ShopEase policy evidence**. If a user's prior message states *"You told me earlier that blenders have a 90-day return window"*, the assistant must not treat that claim as true; all policy statements must be substantiated strictly by retrieved documentation chunks.

### 1.4 Standard Error Envelope
* **Status:** Approved & Implemented (Phase 6)
All error responses return a standardized JSON structure with appropriate HTTP status codes:

```json
{
  "error": {
    "code": "BAD_REQUEST | PAYLOAD_TOO_LARGE | REQUEST_ABORTED | RATE_LIMITED | USAGE_LIMIT_EXCEEDED | SERVICE_UNAVAILABLE | GATEWAY_TIMEOUT | INTERNAL_ERROR",
    "message": "Human-readable, safe error message without internal traces.",
    "details": null
  }
}
```

*Internal diagnostics, database connection strings, provider error payloads, and stack traces are logged server-side and never returned in API responses.*

---

## 2. Endpoints

### 2.1 Health Check — `GET /api/health`

* **Status:** Approved & Implemented (Phase 1A; Enhanced in Phase 8)
* **Purpose:** Service liveness probe (default) and deep dependency readiness probe (`?ready=true`) for hosting orchestrators and deployment monitors.
* **Authentication:** None.

#### Request: Liveness Probe
* **Method:** `GET`
* **Path:** `/api/health`
* **Headers:** None required.
* **Behavior:** Lightweight, immediate response. Never invokes external database or provider APIs.

#### Response: `200 OK` (Liveness)
```json
{
  "status": "ok",
  "timestamp": "2026-11-05T12:00:00.000Z",
  "version": "1.0.0"
}
```

#### Request: Deep Readiness Probe
* **Method:** `GET`
* **Path:** `/api/health?ready=true`
* **Behavior:** Verifies MongoDB Atlas connectivity, asserts `supportiq_vector_index` exists with both `status === 'READY'` and `queryable === true`, confirms all expected chunks from `shopease-manifest.json` are present in `knowledge_chunks`, and verifies `daily_usage` collection accessibility. Zero OpenAI calls are made. Results are cached for 15 seconds.

#### Response: `200 OK` (Dependencies Ready)
```json
{
  "status": "ok",
  "ready": true,
  "timestamp": "2026-11-05T12:00:00.000Z",
  "version": "1.0.0"
}
```

#### Response: `503 Service Unavailable` (Dependencies Degraded)
Returned if MongoDB is unreachable, vector index is missing or building, or knowledge base is incomplete:
```json
{
  "status": "degraded",
  "ready": false,
  "timestamp": "2026-11-05T12:00:00.000Z",
  "version": "1.0.0"
}
```

*Note: Neither liveness nor readiness responses reveal database credentials, internal exception traces, environment variable values, or internal system paths.*

---

### 2.2 Demo Metadata — `GET /api/demo`

* **Status:** Approved & Implemented (Phase 6)
* **Purpose:** Delivers public configuration, branding information, and curated starter questions for the landing view.
* **Authentication:** None.

#### Request
* **Method:** `GET`
* **Path:** `/api/demo`

#### Response: `200 OK`
```json
{
  "assistantName": "SupportIQ",
  "companyName": "ShopEase",
  "demoNotice": "This assistant is powered by fictional ShopEase customer service documentation.",
  "suggestedQuestions": [
    "What is the return policy for defective products?",
    "How long does standard shipping take?",
    "How long do refunds take after approval?",
    "Can I cancel an order after it has shipped?",
    "How are ShopEase loyalty points earned and redeemed?"
  ]
}
```

---

### 2.3 Chat Execution — `POST /api/chat`

* **Status:** Approved & Implemented (Phase 6)
* **Purpose:** Processes a single user question against the ShopEase knowledge base using the LangGraph RAG workflow, returning a grounded answer with validated source citations.
* **Authentication:** None (Guarded by IP rate limits, concurrency limits, and persistent daily usage limits).

*(Note: The policy statements, timelines, and product examples shown below are illustrative and will be synchronized with the canonical Markdown documents created in Phase 2).*

#### Request
* **Method:** `POST`
* **Path:** `/api/chat`
* **Headers:** `Content-Type: application/json`

#### Request Body Schema (Validated via Zod)

```json
{
  "message": "Can I return an opened blender if it is defective?",
  "history": [
    {
      "role": "user",
      "content": "I bought a blender 10 days ago."
    },
    {
      "role": "assistant",
      "content": "I can help check the ShopEase policy for you."
    }
  ]
}
```

#### Field Specifications:
| Field | Type | Required | Constraints |
| :--- | :--- | :--- | :--- |
| `message` | `string` | **Yes** | Trimmed, non-empty, max 1,000 characters. Treated as untrusted input. |
| `history` | `array` | No | Bounded array of message objects (max 6 items). Treated as untrusted input. |
| `history[].role` | `string` | **Yes** | Allowed values: `"user"` \| `"assistant"`. (`"system"` or `"developer"` rejected). |
| `history[].content`| `string` | **Yes** | Trimmed, max 1,000 characters per message. |

*Requests attempting to pass custom model names, prompts, temperature, or raw vector queries are rejected by strict Zod schema parsing.*

#### Success Response: `200 OK` — Grounded Answer
Returned when sufficient evidence is retrieved and verified.

```json
{
  "status": "answered",
  "answer": "According to the ShopEase Returns Policy, opened products are eligible for a full return or replacement within 30 days if they are defective upon arrival. You must retain your order confirmation or receipt as proof of purchase.",
  "sources": [
    {
      "id": "shopease-returns-policy-section-defective-products",
      "title": "ShopEase Returns Policy",
      "section": "Defective Products",
      "excerpt": "Opened products that suffer from a manufacturing defect upon arrival may be returned within 30 days for a full refund or direct replacement."
    }
  ],
  "suggestedFollowUps": [
    "How long does the refund take after return approval?",
    "Who pays for return shipping on defective items?"
  ]
}
```

#### Success Response: `200 OK` — Insufficient Evidence (Refusal)
Returned when retrieved documentation does not adequately answer the question, or when cited evidence fails programmatic validation.

```json
{
  "status": "insufficient_evidence",
  "answer": "I couldn't find enough information about that in the ShopEase documentation.",
  "sources": [],
  "suggestedFollowUps": [
    "What is the return policy for defective products?",
    "How long does standard shipping take?"
  ]
}
```

#### Error Responses

* **`400 Bad Request`** (Invalid schema, empty message, overlong message, or invalid history role):
  ```json
  {
    "error": {
      "code": "BAD_REQUEST",
      "message": "Validation failed: message must not exceed 1000 characters.",
      "details": null
    }
  }
  ```

* **`400 Bad Request`** (Workflow cancelled while socket remains open):
  ```json
  {
    "error": {
      "code": "REQUEST_ABORTED",
      "message": "The request was cancelled before completion.",
      "details": null
    }
  }
  ```

* **`413 Payload Too Large`** (Request payload exceeds maximum allowed size of 10kb):
  ```json
  {
    "error": {
      "code": "PAYLOAD_TOO_LARGE",
      "message": "Request payload exceeds maximum allowed size of 10kb.",
      "details": null
    }
  }
  ```

* **`429 Too Many Requests`** (Per-IP rate limit exceeded):
  ```json
  {
    "error": {
      "code": "RATE_LIMITED",
      "message": "Too many requests. Please wait a few minutes before trying again.",
      "details": null
    }
  }
  ```

* **`429 Too Many Requests`** (Global daily credit/spend budget reached):
  ```json
  {
    "error": {
      "code": "USAGE_LIMIT_EXCEEDED",
      "message": "The daily public demo limit has been reached. Please check back tomorrow.",
      "details": null
    }
  }
  ```

* **`429 Too Many Requests`** (Active concurrent connections limit exceeded):
  ```json
  {
    "error": {
      "code": "TOO_MANY_CONCURRENT_REQUESTS",
      "message": "Too many concurrent requests in flight. Please try again shortly.",
      "details": null
    }
  }
  ```

* **`503 Service Unavailable`** (Usage tracking database failure — Fail-Closed):
  ```json
  {
    "error": {
      "code": "SERVICE_UNAVAILABLE",
      "message": "The assistant service is currently unavailable. Please try again shortly.",
      "details": null
    }
  }
  ```

* **`504 Gateway Timeout`** (Master 25-second deadline fired):
  ```json
  {
    "error": {
      "code": "GATEWAY_TIMEOUT",
      "message": "The request timed out while retrieving policy information. Please try again.",
      "details": null
    }
  }
  ```

---

## 3. Proposed & Future Endpoints (Version 2)

| Endpoint | Method | Status | Notes |
| :--- | :--- | :--- | :--- |
| `/api/chat/stream` | `POST` | **Proposed / TBD** | Server-Sent Events (SSE) streaming for real-time token delivery in Version 2. |
| `/api/admin/ingest`| `POST` | **Explicitly Out of Scope** | Ingestion in MVP is strictly performed via local CLI script (`npm run ingest:knowledge-base`), not exposed over HTTP. |
| `/api/feedback`    | `POST` | **Proposed / TBD** | User response rating (thumbs up / thumbs down) for evaluation tracking. |
