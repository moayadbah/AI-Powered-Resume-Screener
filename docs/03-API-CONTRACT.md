# API contract

**This document is the source of truth.** If the code and this file disagree,
the code is wrong. Machine-readable mirrors live in
[`contracts/api-service.openapi.yaml`](contracts/api-service.openapi.yaml) and
[`contracts/ai-service.openapi.yaml`](contracts/ai-service.openapi.yaml).

## Change protocol

1. Open a PR that changes **this file and the matching OpenAPI file together**.
   A change to one without the other fails CI.
2. Both of us approve it. No exceptions — this is the one file where a
   unilateral change breaks the other person's work silently.
3. Merge, then implement. Never implement first and document after.

If you're mid-task and find something missing from the contract: stop, say so,
and we'll add it. Don't invent a field and hope it lines up.

## Global conventions

| Rule | Value |
|---|---|
| JSON casing | `camelCase`, both directions, both services |
| IDs | 24-char hex strings |
| Timestamps | ISO-8601 UTC with `Z`, e.g. `2026-08-12T09:35:02Z` |
| Scores | `score` is an **integer 0–100**; `semanticScore` / `skillScore` are **doubles 0.0–1.0** |
| Skills | lowercase, trimmed, no duplicates |
| Content type | `application/json` except the upload endpoint (`multipart/form-data`) |
| Pagination | `page` (0-based), `size` (default 20, max 100) |

## Error envelope

Every non-2xx response from **both** services has exactly this shape:

```json
{
  "error": {
    "code": "JOB_NOT_FOUND",
    "message": "No job with id 665f1a2b3c4d5e6f70819201",
    "traceId": "c1a9f4e2b7d34a10",
    "details": null
  }
}
```

`details` is `null` or an object; only validation errors populate it:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed",
    "traceId": "c1a9f4e2b7d34a10",
    "details": { "title": "must be between 3 and 120 characters" }
  }
}
```

`traceId` is generated per request and also logged, so a screenshot from the UI
is enough to find the log line.

### Error codes

| Code | HTTP | Raised by | When |
|---|---|---|---|
| `VALIDATION_FAILED` | 400 | both | Body/query failed validation |
| `MALFORMED_JSON` | 400 | both | Unparseable body |
| `UNAUTHORIZED` | 401 | api | Missing, malformed, or expired JWT |
| `INVALID_CREDENTIALS` | 401 | api | Wrong email or password on login |
| `INVALID_SERVICE_TOKEN` | 401 | ai | Bad or missing `X-Service-Token` |
| `FORBIDDEN` | 403 | api | Authenticated, but the resource belongs to another recruiter |
| `JOB_NOT_FOUND` | 404 | api | |
| `RESUME_NOT_FOUND` | 404 | api | |
| `EMAIL_ALREADY_REGISTERED` | 409 | api | Register with an existing email |
| `PAYLOAD_TOO_LARGE` | 413 | api | A file over `MAX_UPLOAD_SIZE_MB` |
| `UNSUPPORTED_FILE_TYPE` | 415 | api | Not a PDF (checked by magic bytes, not extension) |
| `TOO_MANY_FILES` | 422 | api | More than `MAX_FILES_PER_REQUEST` in one upload |
| `BATCH_TOO_LARGE` | 422 | api | More than `MAX_RESUMES_PER_SCREEN` parsed resumes on a job |
| `NO_SCOREABLE_RESUMES` | 422 | api | Screen requested but no resume has `parseStatus: PARSED` |
| `INTERNAL_ERROR` | 500 | both | Unhandled. Message is generic; details go to the log only. |
| `AI_SERVICE_UNAVAILABLE` | 503 | api | `ai-service` unreachable, or failed after one retry |
| `MODEL_NOT_READY` | 503 | ai | Embedding model still loading |

**Never invent a code outside this table.** Adding one is a contract change.

---

# api-service — `http://localhost:8080`

Public. All routes require `Authorization: Bearer <jwt>` **except**
`/api/auth/register`, `/api/auth/login`, and `/actuator/health`.

## `POST /api/auth/register`

**Request**
```json
{
  "email": "recruiter@example.com",
  "password": "correct-horse-battery",
  "fullName": "Sara Haddad"
}
```
`email` valid format, ≤ 254 chars. `password` 8–128 chars. `fullName` 2–100 chars.

**201**
```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "expiresAt": "2026-08-13T09:14:03Z",
  "user": {
    "id": "665f1a2b3c4d5e6f70819200",
    "email": "recruiter@example.com",
    "fullName": "Sara Haddad",
    "role": "RECRUITER"
  }
}
```

**Errors** 400 `VALIDATION_FAILED` · 409 `EMAIL_ALREADY_REGISTERED`

## `POST /api/auth/login`

**Request**
```json
{ "email": "recruiter@example.com", "password": "correct-horse-battery" }
```

**200** — identical body to register.

**Errors** 400 `VALIDATION_FAILED` · 401 `INVALID_CREDENTIALS`

> Wrong email and wrong password both return `INVALID_CREDENTIALS` with the same
> message. Don't distinguish them — that leaks which addresses have accounts.

## `GET /api/auth/me`

**200**
```json
{
  "id": "665f1a2b3c4d5e6f70819200",
  "email": "recruiter@example.com",
  "fullName": "Sara Haddad",
  "role": "RECRUITER",
  "createdAt": "2026-08-12T09:14:03Z"
}
```

**Errors** 401 `UNAUTHORIZED`

## `POST /api/jobs`

**Request**
```json
{
  "title": "Backend Engineer (Java)",
  "description": "We're looking for a backend engineer to build and maintain our REST APIs...",
  "requiredSkills": ["Java", "Spring Boot", "MongoDB", "Docker", "REST API"],
  "location": "Amman, Jordan"
}
```
`title` 3–120. `description` 50–20000. `requiredSkills` 0–50 entries, each 1–60
chars — **the server lowercases, trims, and de-duplicates them**, so the response
will not always echo what you sent. `location` optional, ≤ 120.

**201**
```json
{
  "id": "665f1a2b3c4d5e6f70819201",
  "title": "Backend Engineer (Java)",
  "description": "We're looking for a backend engineer...",
  "requiredSkills": ["java", "spring boot", "mongodb", "docker", "rest api"],
  "location": "Amman, Jordan",
  "createdAt": "2026-08-12T09:20:11Z",
  "updatedAt": "2026-08-12T09:20:11Z",
  "resumeCount": 0,
  "screenedCount": 0
}
```

**Errors** 400 `VALIDATION_FAILED` · 401 `UNAUTHORIZED`

## `GET /api/jobs?page=0&size=20`

Only the caller's own jobs, newest first.

**200**
```json
{
  "content": [
    {
      "id": "665f1a2b3c4d5e6f70819201",
      "title": "Backend Engineer (Java)",
      "location": "Amman, Jordan",
      "requiredSkills": ["java", "spring boot", "mongodb", "docker", "rest api"],
      "createdAt": "2026-08-12T09:20:11Z",
      "resumeCount": 12,
      "screenedCount": 11
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

The list item omits `description` (it's long and unused in the list). The detail
endpoint includes it.

## `GET /api/jobs/{id}`

**200** — same shape as the `POST /api/jobs` 201 response, plus:
```json
{
  "resumeCount": 12,
  "screenedCount": 11,
  "unreadableCount": 1,
  "lastScreenedAt": "2026-08-12T09:35:02Z"
}
```
`lastScreenedAt` is `null` if never screened.

**Errors** 401 `UNAUTHORIZED` · 403 `FORBIDDEN` · 404 `JOB_NOT_FOUND`

## `POST /api/jobs/{id}/resumes`

`multipart/form-data`, field name **`files`**, repeated.

Limits: ≤ 10 files per request, ≤ 5 MB each, PDF only. Type is checked by the
`%PDF-` magic bytes — a renamed `.docx` is rejected with `UNSUPPORTED_FILE_TYPE`.

Parsing happens inline. A file that can't be parsed is still stored and still
returned in `uploaded`, with its `parseStatus` — only files rejected *before*
storage appear in `rejected`.

**201**
```json
{
  "uploaded": [
    {
      "id": "665f1a2b3c4d5e6f70819210",
      "candidateName": "Omar Khalil",
      "originalFilename": "Omar_Khalil_CV.pdf",
      "parseStatus": "PARSED",
      "pageCount": 2,
      "sizeBytes": 184320,
      "uploadedAt": "2026-08-12T09:31:47Z"
    },
    {
      "id": "665f1a2b3c4d5e6f70819211",
      "candidateName": "scanned_cv",
      "originalFilename": "scanned_cv.pdf",
      "parseStatus": "EMPTY",
      "pageCount": 1,
      "sizeBytes": 902144,
      "uploadedAt": "2026-08-12T09:31:48Z"
    }
  ],
  "rejected": [
    { "filename": "notes.docx", "reason": "UNSUPPORTED_FILE_TYPE" }
  ]
}
```

A request where *every* file is rejected still returns **201** with an empty
`uploaded` array. It's a completed request that accepted nothing, not a failure.

**Errors** 401 · 403 · 404 `JOB_NOT_FOUND` · 413 `PAYLOAD_TOO_LARGE` · 422 `TOO_MANY_FILES`

## `POST /api/jobs/{id}/screen`

No request body. Scores every resume on the job with `parseStatus: PARSED`,
including ones already scored (results are upserted).

**Synchronous.** Budget roughly 1–2 s per resume when summaries are on, so a
50-resume batch can take over a minute. Clients must set a generous timeout —
the dashboard uses 180 s.

**200**
```json
{
  "jobId": "665f1a2b3c4d5e6f70819201",
  "screened": 11,
  "skipped": 1,
  "summariesDegraded": 0,
  "modelVersion": "all-MiniLM-L6-v2@c9745ed",
  "durationMs": 14320,
  "screenedAt": "2026-08-12T09:35:02Z"
}
```

`skipped` counts resumes not in `PARSED` state. `summariesDegraded` counts
resumes that got a score but no summary because Ollama didn't answer — the
request still succeeds. **Scoring failure fails the whole request; summary
failure never does.**

**Errors** 401 · 403 · 404 `JOB_NOT_FOUND` · 422 `NO_SCOREABLE_RESUMES` ·
422 `BATCH_TOO_LARGE` · 503 `AI_SERVICE_UNAVAILABLE`

## `GET /api/jobs/{id}/candidates?sort=score&order=desc&page=0&size=20`

The ranked list. `sort` ∈ `score` | `name` | `uploadedAt` (default `score`).
`order` ∈ `asc` | `desc` (default `desc`).

Includes resumes that were never screened, with `screening: null`, so the UI can
show "uploaded, not yet screened" without a second request. Unscreened rows sort
last regardless of `order`.

**200**
```json
{
  "content": [
    {
      "resumeId": "665f1a2b3c4d5e6f70819210",
      "candidateName": "Omar Khalil",
      "candidateEmail": "omar.khalil@example.com",
      "originalFilename": "Omar_Khalil_CV.pdf",
      "parseStatus": "PARSED",
      "uploadedAt": "2026-08-12T09:31:47Z",
      "screening": {
        "score": 82,
        "semanticScore": 0.7913,
        "skillScore": 0.8,
        "matchedSkills": ["java", "spring boot", "mongodb", "docker"],
        "missingSkills": ["rest api"],
        "summaryDegraded": false,
        "scoredAt": "2026-08-12T09:35:02Z"
      }
    },
    {
      "resumeId": "665f1a2b3c4d5e6f70819211",
      "candidateName": "scanned_cv",
      "candidateEmail": null,
      "originalFilename": "scanned_cv.pdf",
      "parseStatus": "EMPTY",
      "uploadedAt": "2026-08-12T09:31:48Z",
      "screening": null
    }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 12,
  "totalPages": 1
}
```

The list item deliberately omits `summary`, `strengths`, and `concerns` — the
prose only appears on the detail view. Keeps the ranked page small.

**Errors** 401 · 403 · 404 `JOB_NOT_FOUND`

## `GET /api/candidates/{resumeId}`

Full detail, including the prose.

**200**
```json
{
  "resumeId": "665f1a2b3c4d5e6f70819210",
  "jobId": "665f1a2b3c4d5e6f70819201",
  "jobTitle": "Backend Engineer (Java)",
  "candidateName": "Omar Khalil",
  "candidateEmail": "omar.khalil@example.com",
  "originalFilename": "Omar_Khalil_CV.pdf",
  "parseStatus": "PARSED",
  "pageCount": 2,
  "uploadedAt": "2026-08-12T09:31:47Z",
  "screening": {
    "score": 82,
    "semanticScore": 0.7913,
    "skillScore": 0.8,
    "matchedSkills": ["java", "spring boot", "mongodb", "docker"],
    "missingSkills": ["rest api"],
    "summary": "Strong Java backend background with four years on Spring Boot services...",
    "strengths": ["4 years Spring Boot in production", "Owns containerized deploys"],
    "concerns": ["No explicit API design ownership"],
    "summaryDegraded": false,
    "modelVersion": "all-MiniLM-L6-v2@c9745ed",
    "promptVersion": "v1",
    "weights": { "semantic": 0.7, "skill": 0.3 },
    "scoredAt": "2026-08-12T09:35:02Z"
  }
}
```

`screening` is `null` when the resume hasn't been screened. `parsedText` is
**not** returned — the UI has no view for it and it's the largest field we store.

**Errors** 401 · 403 · 404 `RESUME_NOT_FOUND`

## `GET /actuator/health`

Unauthenticated. Spring Boot Actuator default shape.

```json
{ "status": "UP" }
```

Used by the Compose healthcheck and by CI. Must not require a database
connection to return a response — it reports Mongo as a component, it doesn't
crash without it.

---

# ai-service — `http://ai-service:8000`

**Internal only.** Not published to the host in the production Compose profile,
no CORS, no user auth. Every route except `/health` requires the shared secret:

```
X-Service-Token: <SERVICE_TOKEN>
```

Missing or wrong → **401 `INVALID_SERVICE_TOKEN`**.

## `POST /score`

Deterministic. The same request body always produces the same numbers for a
given `modelVersion` and weights.

**Request**
```json
{
  "jobDescription": "We're looking for a backend engineer to build and maintain our REST APIs...",
  "requiredSkills": ["java", "spring boot", "mongodb", "docker", "rest api"],
  "resumes": [
    { "resumeId": "665f1a2b3c4d5e6f70819210", "text": "Omar Khalil\nBackend Engineer\n\nEXPERIENCE\n..." },
    { "resumeId": "665f1a2b3c4d5e6f70819212", "text": "Lina Nasser\nData Analyst\n..." }
  ]
}
```

`jobDescription` 50–20000 chars. `resumes` 1–50 entries; each `text` 1–100000
chars. `resumeId` is opaque — `ai-service` only echoes it back.

**200** — results in the **same order as the request**, one per input.
```json
{
  "results": [
    {
      "resumeId": "665f1a2b3c4d5e6f70819210",
      "score": 82,
      "semanticScore": 0.7913,
      "skillScore": 0.8,
      "matchedSkills": ["java", "spring boot", "mongodb", "docker"],
      "missingSkills": ["rest api"]
    },
    {
      "resumeId": "665f1a2b3c4d5e6f70819212",
      "score": 34,
      "semanticScore": 0.4102,
      "skillScore": 0.2,
      "matchedSkills": ["mongodb"],
      "missingSkills": ["java", "spring boot", "docker", "rest api"]
    }
  ],
  "modelVersion": "all-MiniLM-L6-v2@c9745ed",
  "weights": { "semantic": 0.7, "skill": 0.3 },
  "durationMs": 842
}
```

**Errors** 400 `VALIDATION_FAILED` · 401 `INVALID_SERVICE_TOKEN` ·
503 `MODEL_NOT_READY` · 500 `INTERNAL_ERROR`

> One malformed resume must not fail the batch. If a single text can't be
> embedded, return it with `score: 0` and empty skill arrays rather than 500-ing
> the whole call.

## `POST /summarize`

Not deterministic, and not on the scoring path. **A failure here is expected and
handled** — it returns 200 with nulls, it does not raise.

**Request**
```json
{
  "resumeId": "665f1a2b3c4d5e6f70819210",
  "resumeText": "Omar Khalil\nBackend Engineer\n...",
  "jobDescription": "We're looking for a backend engineer...",
  "matchedSkills": ["java", "spring boot", "mongodb", "docker"],
  "missingSkills": ["rest api"]
}
```

**200 — success**
```json
{
  "resumeId": "665f1a2b3c4d5e6f70819210",
  "summary": "Strong Java backend background with four years on Spring Boot services and hands-on MongoDB work...",
  "strengths": ["4 years Spring Boot in production", "Owns containerized deploys"],
  "concerns": ["No explicit API design ownership"],
  "degraded": false,
  "promptVersion": "v1",
  "model": "llama3.2:3b"
}
```

**200 — degraded** (Ollama unreachable, timed out, or returned unparseable JSON)
```json
{
  "resumeId": "665f1a2b3c4d5e6f70819210",
  "summary": null,
  "strengths": null,
  "concerns": null,
  "degraded": true,
  "degradedReason": "ollama_timeout",
  "promptVersion": "v1",
  "model": "llama3.2:3b"
}
```

`degradedReason` ∈ `ollama_unreachable` | `ollama_timeout` | `invalid_json` |
`disabled` (`SUMMARY_ENABLED=false`).

`summary` ≤ 600 chars, `strengths` / `concerns` ≤ 3 items of ≤ 120 chars each —
enforced by `ai-service`, so `api-service` and the UI can size for it.

**Errors** 400 `VALIDATION_FAILED` · 401 `INVALID_SERVICE_TOKEN`

## `GET /health`

Unauthenticated.
```json
{ "status": "ok", "modelLoaded": true, "ollamaReachable": true }
```

`status` is `ok` when the embedding model is loaded. **`ollamaReachable: false`
does not make it unhealthy** — summaries degrade, scoring still works. Compose
must not restart the container over it.

## `GET /model-info`

Requires the service token.
```json
{
  "embeddingModel": "sentence-transformers/all-MiniLM-L6-v2",
  "embeddingRevision": "c9745ed1d9f207416be6d2e6f8de32d1f16199bf",
  "modelVersion": "all-MiniLM-L6-v2@c9745ed",
  "dimensions": 384,
  "maxSequenceLength": 256,
  "ollamaModel": "llama3.2:3b",
  "promptVersion": "v1",
  "weights": { "semantic": 0.7, "skill": 0.3 }
}
```

`api-service` calls this once at startup and logs it, so every run records what
produced its scores.
