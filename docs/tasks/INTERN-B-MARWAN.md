# Tasks — Marwan (api-service + infrastructure)

Ordered. Later tasks assume earlier ones are merged. Each task is one branch and
one PR.

**Before starting any task:** read [03-API-CONTRACT.md](../03-API-CONTRACT.md),
[05-API-SERVICE.md](../05-API-SERVICE.md), and
[02-DATA-MODEL.md](../02-DATA-MODEL.md).

Dependency legend: **needs** = must be merged first. **blocks** = someone is
waiting on this.

---

### B1 · Docker Compose skeleton

Everyone's local environment depends on this, so it goes first.

- **Files** `docker-compose.yml`, `mongo-init/01-init.js`
- **Blocks** everyone
- **Read** [07-LOCAL-DEV.md](../07-LOCAL-DEV.md)

**Done when**
- Services defined: `mongodb`, `ai-service`, `api-service`, `web`
- **Only `web` (5173) and `api-service` (8080) publish ports by default.**
  `mongodb` and `ai-service` publish only under `profiles: [dev]`
- Named volume for Mongo data; bind mount for `uploads/`
- `depends_on` with `condition: service_healthy`
- `ai-service` healthcheck has **`start_period: 60s`** — it takes 10–20 s to load
  torch and the model, and a tight healthcheck restart-loops the container
- `extra_hosts: ["host.docker.internal:host-gateway"]` on `ai-service`, with a
  comment saying it's for Linux (Docker Desktop resolves it natively)
- `env_file: .env` everywhere; no secret has a literal default in the compose file

```bash
docker compose config          # validates and shows the resolved file
docker compose up -d mongodb && docker compose ps
```

---

### B2 · Spring Boot skeleton, health, error envelope

- **Files** `pom.xml`, `ApiApplication.java`, `exception/{ApiException,ErrorCode,GlobalExceptionHandler}.java`, `application.yml`, `Dockerfile`, `.mvn/` wrapper
- **Needs** B1
- **Blocks** every other B task
- **Read** [05-API-SERVICE.md](../05-API-SERVICE.md) §Configuration, §Errors

**Done when**
- Boot 3.3, Java 21, `./mvnw` wrapper committed (not the jar)
- `GET /actuator/health` → 200, **and still responds when Mongo is down** (reports the component, doesn't crash)
- `ErrorCode` enum mirrors the contract's table exactly
- `GlobalExceptionHandler` produces the envelope for validation errors, malformed JSON, upload-size failures, and unhandled exceptions
- `traceId` generated per request, put in the MDC so it's on every log line, returned in the envelope
- Unhandled exceptions log the trace but return a generic message — no paths or driver internals over the wire
- Startup refuses to run with an unset or placeholder `JWT_SECRET`

```bash
./mvnw -B verify
./mvnw spring-boot:run &
curl -s localhost:8080/actuator/health | jq
curl -s localhost:8080/api/jobs | jq     # 401 in our envelope, not Spring's HTML
```

---

### B3 · User model, register, login

- **Files** `model/User.java`, `repository/UserRepository.java`, `security/JwtService.java`, `service/AuthService.java`, `controller/AuthController.java`, `dto/*`
- **Needs** B2
- **Read** [05-API-SERVICE.md](../05-API-SERVICE.md) §Security, [02-DATA-MODEL.md](../02-DATA-MODEL.md) §users

**Done when**
- Register and login match the contract, returning `{token, expiresAt, user}`
- BCrypt strength 10; email lowercased on write; unique index on `email`
- **`passwordHash` never appears in any response** — map entities to DTO records explicitly, don't serialize entities
- Duplicate email → 409 `EMAIL_ALREADY_REGISTERED`
- Wrong email and wrong password both return the **same** `INVALID_CREDENTIALS`, and the BCrypt comparison runs even for an unknown user (against a dummy hash) so timing doesn't leak which addresses exist
- JWT is HS256 with `sub`, `email`, `role`, `iat`, `exp`; 24 h expiry
- **No token is ever logged**, not even truncated

---

### B4 · Auth filter and `/me`

- **Files** `security/{SecurityConfig,JwtAuthFilter,CurrentUser}.java`
- **Needs** B3
- **Blocks** every authenticated endpoint

**Done when**
- Stateless chain, CSRF off, `/api/auth/**` and `/actuator/health` public, everything else authenticated
- **Custom `authenticationEntryPoint` and `accessDeniedHandler` emit our envelope.** Spring's defaults return HTML or an empty body and break the frontend's error parsing — this is the step most likely to be skipped
- Expired or malformed token → 401 `UNAUTHORIZED`, never 500
- `GET /api/auth/me` returns the current user
- Tests: valid, expired, malformed, and missing token

---

### B5 · Jobs

- **Files** `model/Job.java`, `repository/JobRepository.java`, `service/JobService.java`, `controller/JobController.java`
- **Needs** B4
- **Read** [03-API-CONTRACT.md](../03-API-CONTRACT.md) §jobs

**Done when**
- Create, list (paginated, own jobs only, newest first), and detail
- `requiredSkills` **normalized on write** — lowercased, trimmed, de-duplicated. The response won't echo what was sent, and that's documented
- Validation matches the contract: title 3–120, description 50–20000, ≤ 50 skills
- List projection omits `description`; detail includes it plus the counts
- **Ownership enforced in the service layer, returning 403 not 404** — put it in the service so a future endpoint can't skip it
- Test: recruiter A gets 403 on recruiter B's job

---

### B6 · Upload and storage

- **Files** `service/FileStorageService.java`, `controller/ResumeController.java`, `model/Resume.java`
- **Needs** B5
- **Read** [05-API-SERVICE.md](../05-API-SERVICE.md) §Upload and parsing

**Done when**
- `multipart/form-data`, field `files`, ≤ 10 files, ≤ 5 MB each
- **Type checked by `%PDF-` magic bytes**, not by filename or `Content-Type` — both are attacker-controlled. Test with a `.docx` renamed to `.pdf`
- **Resume id generated first**, file written to `{uploadDir}/{jobId}/{resumeId}.pdf`. The uploaded filename is **never** a path component — `originalFilename` is stored as data only. Test with `../../etc/passwd.pdf`
- SHA-256 `contentHash` stored
- Response splits `uploaded` and `rejected` per the contract; a request where everything is rejected still returns **201** with an empty `uploaded` array

---

### B7 · PDF text extraction

- **Files** `service/PdfTextExtractor.java`, `src/test/resources/pdfs/*`
- **Needs** B6
- **Read** [05-API-SERVICE.md](../05-API-SERVICE.md) §PDFBox

**Done when**
- **PDFBox 3** — `Loader.loadPDF()`, not `PDDocument.load()`. Most examples online are 2.x and won't compile
- `setSortByPosition(true)` — without it, multi-column resume templates come out interleaved into nonsense
- Page cap at 20
- All three branches produce a stored document: `PARSED`, `EMPTY` (scanned/image-only), `FAILED` (encrypted/corrupt, with `parseError`)
- **A file that can't be parsed is never dropped.** The recruiter has to be able to see it
- Best-effort `candidateName` and `candidateEmail` extraction per the doc
- Test fixtures: one normal text PDF, one scanned, one corrupt

---

### B8 · `AiClient`

- **Files** `service/AiClient.java`, `config/AiClientConfig.java`, WireMock test setup
- **Needs** B2
- **Read** [05-API-SERVICE.md](../05-API-SERVICE.md) §AiClient

You can build and test this entirely against WireMock — **you do not need
Moayad's A5 finished**. Copy the stub bodies from the contract examples, don't
write them from memory.

**Done when**
- Spring `RestClient` (not `RestTemplate`, not `WebClient`), 5 s connect / 60 s read
- `X-Service-Token` on every call
- **One retry on 5xx or connection failure, `/score` only.** Don't retry `/summarize` — it already degrades, and retrying doubles the slowest path
- No retry on 4xx
- Second failure → `AiServiceException` → 503 `AI_SERVICE_UNAVAILABLE`
- WireMock tests: success, 500-then-success, 500-twice, connection refused, timeout

---

### B9 · Screening orchestration

The task that makes this an orchestration API rather than CRUD.

- **Files** `service/ScreeningService.java`, `model/Screening.java`, `repository/ScreeningRepository.java`
- **Needs** B7, B8, and **Moayad's A5** for real integration (WireMock until then)
- **Read** [05-API-SERVICE.md](../05-API-SERVICE.md) §Orchestration

**Done when**
- Flow matches the doc: load job → load `PARSED` resumes → one batched `/score` call → per-resume `/summarize` → upsert
- **Scoring is one call for the whole batch.** A loop here throws away the batched-embedding speedup that makes this fast
- **Nothing is written until scoring succeeds.** A partial screen silently mixes old and new results into one ranking — worse than no screen
- Degraded summaries stored with `summary: null`, `summaryDegraded: true`; the request still returns 200
- Zero parsed resumes → 422 `NO_SCOREABLE_RESUMES`, `ai-service` never called
- Over `MAX_RESUMES_PER_SCREEN` → 422 `BATCH_TOO_LARGE`, `ai-service` never called
- **Upsert on `(jobId, resumeId)`** using the unique index — never delete-then-insert (a crash between the two loses results)
- `modelVersion`, `promptVersion`, `weights`, `scoredAt` recorded on every screening
- Test: screen twice, assert exactly one screening document with the newer `scoredAt`

---

### B10 · Ranked candidates

- **Files** `controller/CandidateController.java`, `service/` query
- **Needs** B9
- **Read** [03-API-CONTRACT.md](../03-API-CONTRACT.md) §GET /api/jobs/{id}/candidates

**Done when**
- Paginated, `sort` ∈ `score|name|uploadedAt`, `order` ∈ `asc|desc`
- **Includes unscreened resumes with `screening: null`**, always sorting last regardless of `order` — the UI needs one request, not two
- List projection omits `summary`, `strengths`, `concerns`
- Backed by the `{jobId: 1, score: -1}` index
- **No N+1.** One aggregation with `$lookup`, or two queries joined in the service. Never one query per row

---

### B11 · Candidate detail

- **Files** `controller/CandidateController.java`
- **Needs** B10

**Done when** it returns the full screening including prose; `screening` is
`null` for an unscreened resume; **`parsedText` is not returned** (largest field
we store, no view for it); 403 for another recruiter's candidate.

---

### B12 · Indexes and integration tests

- **Files** `config/MongoIndexConfig.java`, `src/test/java/.../*IntegrationTest.java`
- **Needs** B11
- **Read** [02-DATA-MODEL.md](../02-DATA-MODEL.md) §Indexes, [08-TESTING.md](../08-TESTING.md)

**Done when**
- All six indexes created at startup. Spring Boot 3 disables auto-index-creation by default, so this is a real step, not a no-op
- Testcontainers Mongo 7, real database — the upsert behaviour is a database guarantee, and mocking the repository would test nothing
- The must-have cases from [08-TESTING.md](../08-TESTING.md) are covered, especially:
  - **Recruiter A cannot read recruiter B's job, resumes, or candidates (403)** — the most likely real security bug in this codebase
  - Re-screening upserts rather than duplicating
  - Renamed `.docx` rejected by magic bytes
  - Path-traversal filename lands safely under the job directory
  - Scanned and corrupt PDFs still create documents
  - No password hash in any serialized response

```bash
./mvnw -B verify        # needs a running Docker daemon
```

---

### B13 · Seed script

- **Files** `scripts/seed.sh`
- **Needs** B12
- **Read** [07-LOCAL-DEV.md](../07-LOCAL-DEV.md) §Seed data

**Done when** it registers `demo@example.com`, creates the "Backend Engineer"
job, uploads the fixtures, runs a screen, prints the ranked result — and is
idempotent on a re-run.

---

## Integration

Once B9 and A5 are both merged, sit down with Moayad and run the whole stack
against `./scripts/seed.sh`. Expect mismatches — every one is a place the
contract was ambiguous, so fix [03-API-CONTRACT.md](../03-API-CONTRACT.md) too,
not just the code.
