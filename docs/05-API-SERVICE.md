# api-service

Java 21 · Spring Boot 3.3 · spring-data-mongodb · PDFBox 3. Owner: **Marwan**.

The only service the browser talks to and the only writer to MongoDB. It owns
identity, file storage, PDF text extraction, and orchestration of
[`ai-service`](04-AI-SERVICE.md).

Interface shapes are in [03-API-CONTRACT.md](03-API-CONTRACT.md); documents and
indexes are in [02-DATA-MODEL.md](02-DATA-MODEL.md). This document covers the
implementation.

## Layout

```
api-service/
├── src/main/java/com/screener/api/
│   ├── ApiApplication.java
│   ├── config/
│   │   ├── MongoIndexConfig.java     # index creation at startup
│   │   ├── WebConfig.java            # CORS
│   │   └── AiClientConfig.java       # RestClient bean, timeouts
│   ├── security/
│   │   ├── SecurityConfig.java       # SecurityFilterChain
│   │   ├── JwtAuthFilter.java
│   │   ├── JwtService.java           # issue + verify
│   │   └── CurrentUser.java          # @AuthenticationPrincipal resolver
│   ├── controller/
│   │   ├── AuthController.java
│   │   ├── JobController.java
│   │   ├── ResumeController.java
│   │   └── CandidateController.java
│   ├── service/
│   │   ├── AuthService.java
│   │   ├── JobService.java
│   │   ├── ResumeService.java        # upload + parse orchestration
│   │   ├── PdfTextExtractor.java     # PDFBox wrapper
│   │   ├── FileStorageService.java
│   │   ├── ScreeningService.java     # the orchestration flow
│   │   └── AiClient.java             # HTTP to ai-service
│   ├── repository/                   # Mongo repositories
│   ├── model/                        # @Document entities
│   ├── dto/                          # request/response records
│   └── exception/
│       ├── ApiException.java         # carries an ErrorCode
│       ├── ErrorCode.java            # enum, mirrors the contract table
│       └── GlobalExceptionHandler.java
├── src/test/java/com/screener/api/...
├── src/main/resources/application.yml
├── pom.xml
└── Dockerfile
```

Controllers stay thin: validate, delegate, map to DTO. Business logic lives in
`service/`. No repository is ever injected into a controller.

## Prerequisites

Java is not installed on a fresh Mac:

```bash
brew install --cask temurin@21
java -version    # expect 21.x
```

Use the Maven wrapper (`./mvnw`) so we're both on the same Maven version. Commit
the wrapper, not the jar — `.gitignore` already excludes
`.mvn/wrapper/maven-wrapper.jar`.

## Configuration

`application.yml`, with everything environment-overridable. No secret has a
working default.

```yaml
spring:
  application.name: api-service
  data.mongodb.uri: ${MONGODB_URI}
  servlet.multipart:
    max-file-size: ${MAX_UPLOAD_SIZE_MB:5}MB
    max-request-size: 60MB

app:
  jwt:
    secret: ${JWT_SECRET}
    expiry-hours: ${JWT_EXPIRY_HOURS:24}
  ai:
    base-url: ${AI_SERVICE_BASE_URL:http://ai-service:8000}
    service-token: ${SERVICE_TOKEN}
    connect-timeout-ms: 5000
    read-timeout-ms: 60000
  upload:
    dir: ${UPLOAD_DIR:/data/uploads}
    max-files-per-request: ${MAX_FILES_PER_REQUEST:10}
  screening:
    max-resumes: ${MAX_RESUMES_PER_SCREEN:50}
  cors:
    allowed-origins: ${CORS_ALLOWED_ORIGINS:http://localhost:5173}

management.endpoints.web.exposure.include: health
```

`max-request-size: 60MB` is deliberately above 10 × 5 MB, so an oversized single
file is rejected as `PAYLOAD_TOO_LARGE` for *that file* rather than Spring
rejecting the whole multipart request with a container-level error we can't
shape into our envelope.

### Startup validation

Fail fast, in an `@PostConstruct` or an `ApplicationRunner`:

1. `JWT_SECRET` is set, at least 32 characters, and **not** the placeholder from
   `.env.example`. Refuse to start otherwise. A service that boots with a known
   signing key is worse than one that doesn't boot.
2. `SERVICE_TOKEN` is set.
3. The upload directory exists and is writable.
4. Call `GET /model-info` on `ai-service` and log the result. Don't fail startup
   if it's down — it may still be loading — but log clearly, because "why are
   scores different today" starts here.

## Security

Stateless JWT. No sessions, no CSRF (there's no cookie to forge).

```java
http
  .csrf(csrf -> csrf.disable())
  .cors(Customizer.withDefaults())
  .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
  .authorizeHttpRequests(auth -> auth
      .requestMatchers("/api/auth/register", "/api/auth/login", "/actuator/health").permitAll()
      .anyRequest().authenticated())
  .addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
  .exceptionHandling(e -> e
      .authenticationEntryPoint(restAuthEntryPoint)   // 401 in our envelope
      .accessDeniedHandler(restAccessDeniedHandler)); // 403 in our envelope
```

The entry point and denied handler matter: Spring Security's defaults return an
HTML error page or an empty body, which breaks the frontend's error parsing. Both
must emit the envelope from the contract.

### Tokens

- HS256, `JWT_SECRET` from the environment.
- Claims: `sub` = user id, `email`, `role`, `iat`, `exp`.
- 24-hour expiry. No refresh token in v1 — a known limitation, not an oversight.
- `JwtAuthFilter` reads `Authorization: Bearer <token>`, verifies signature and
  expiry, and populates the `SecurityContext`. A malformed or expired token is
  **401 `UNAUTHORIZED`**, never a 500.
- Never log a token, not even truncated.

### Passwords

BCrypt, strength 10. `passwordHash` is never in a DTO — the compiler should
enforce this, so map entities to records explicitly rather than serializing
entities.

Login returns the same `INVALID_CREDENTIALS` for unknown email and wrong
password. Run the BCrypt comparison even when the user doesn't exist (against a
dummy hash) so response timing doesn't reveal which addresses are registered.

### Ownership

Every job-scoped route checks `job.createdBy().equals(currentUser.id())` before
touching anything, and returns **403 `FORBIDDEN`** — not 404 — when it fails. Do
this in the service layer, not the controller, so it can't be skipped by a new
endpoint.

This is the single most likely security bug in this codebase: a recruiter reading
another recruiter's candidates by guessing an ObjectId. There's a test for it.

## Upload and parsing

`POST /api/jobs/{id}/resumes`, `multipart/form-data`, field `files`.

Per file, in order:

1. **Count check** — over `max-files-per-request` → 422 `TOO_MANY_FILES` for the
   whole request.
2. **Size check** — over the limit → skip, add to `rejected`.
3. **Type check by magic bytes.** Read the first 5 bytes and require `%PDF-`.
   Do not trust the filename or the browser's `Content-Type`; both are
   attacker-controlled. Fails → `rejected` with `UNSUPPORTED_FILE_TYPE`.
4. **Generate the resume id first**, then write to
   `{uploadDir}/{jobId}/{resumeId}.pdf`. Never use the uploaded filename as a
   path component — that's a path-traversal hole. `originalFilename` is stored as
   data only.
5. **Extract text** (below).
6. **Insert the `resumes` document** with the resulting `parseStatus`.

A file that stores but fails to parse still gets a document and still appears in
`uploaded`. Only pre-storage rejections go in `rejected`.

### PDFBox

```java
try (PDDocument doc = Loader.loadPDF(bytes)) {
    if (doc.isEncrypted()) { /* FAILED */ }
    PDFTextStripper stripper = new PDFTextStripper();
    stripper.setSortByPosition(true);
    stripper.setEndPage(Math.min(doc.getNumberOfPages(), MAX_PAGES));
    String text = stripper.getText(doc);
    ...
}
```

- **PDFBox 3** — the API moved from `PDDocument.load()` to `Loader.loadPDF()`.
  Most examples online are for 2.x and won't compile.
- `setSortByPosition(true)` — without it, multi-column resumes (very common in
  designed templates) come out with columns interleaved into nonsense.
- Cap at 20 pages. Anything longer is a portfolio, and we don't need page 40.
- **Status mapping:**

  | Outcome | `parseStatus` |
  |---|---|
  | Non-blank text after trimming | `PARSED` |
  | Loads fine, text is blank/whitespace | `EMPTY` (scanned or image-only) |
  | Encrypted, corrupt, or `IOException` | `FAILED`, with `parseError` |

- `EMPTY` is a normal outcome, not an error. A large fraction of real resumes are
  design-tool exports with no text layer. The recruiter sees "we couldn't read
  this" — it is never silently dropped.
- Extraction is CPU-bound and blocking. Fine at this scale, but it's why the
  upload endpoint can take a few seconds for 10 files.

### Name and email extraction

Best-effort, cheap:

- `candidateName`: first non-empty line of extracted text, trimmed, if it's under
  60 chars and has no `@` or digits. Otherwise the filename without its
  extension. It will be wrong sometimes; the UI lets it be edited later.
- `candidateEmail`: first regex match for an email address, else `null`.

Don't grow this into a parser. If it needs to be right, that's a different
feature.

## Orchestration

`ScreeningService` — the flow that makes this an orchestration API rather than a
CRUD app.

```
load job (+ ownership check)
load resumes where parseStatus = PARSED
  none        -> 422 NO_SCOREABLE_RESUMES
  over cap    -> 422 BATCH_TOO_LARGE
POST /score to ai-service   (one call, whole batch)
  failure     -> 503 AI_SERVICE_UNAVAILABLE, nothing written
for each result:
  POST /summarize           (one call per resume, failures tolerated)
upsert screenings on (jobId, resumeId)
return counts
```

Points that matter:

- **Scoring is one call for the batch**, not one per resume. Batched embedding is
  where the speed comes from; a loop here throws that away.
- **Summarization is one call per resume**, because each needs its own prose.
  This is the slow part.
- **Nothing is written until scoring succeeds.** A partial screen is worse than
  none — the ranking would silently mix old and new results.
- Summaries that come back `degraded` are stored with `summary: null` and
  `summaryDegraded: true`. The request still returns 200.

### `AiClient`

Spring `RestClient` (not `RestTemplate`, deprecated for new code; not `WebClient`,
we don't need reactive here).

- 5 s connect, 60 s read.
- `X-Service-Token` on every request, from config.
- **One retry on 5xx or connection failure, for `/score` only.** Don't retry
  `/summarize` — it already degrades gracefully, and retrying doubles the slowest
  path in the system.
- Retry with a short backoff (~500 ms). A second failure → `AiServiceException`
  → 503 `AI_SERVICE_UNAVAILABLE`.
- Do not retry 4xx. A 400 from `ai-service` means we sent something wrong;
  sending it again won't help.

### The batch cap

`MAX_RESUMES_PER_SCREEN` (default 50) exists because this is synchronous. At
~1–2 s per resume for summarization, 50 resumes is already over a minute of
held-open HTTP request. Above the cap we return 422 rather than let the request
die at a proxy timeout with no explanation.

Removing this cap means adding an async job queue — that's the v2 item, and the
cap is the marker for it.

## Errors

`GlobalExceptionHandler` (`@RestControllerAdvice`) produces the envelope for
everything. Controllers never build error bodies.

| Exception | → |
|---|---|
| `ApiException` (carries an `ErrorCode`) | its code + status |
| `MethodArgumentNotValidException` | 400 `VALIDATION_FAILED`, field errors in `details` |
| `HttpMessageNotReadableException` | 400 `MALFORMED_JSON` |
| `MaxUploadSizeExceededException` | 413 `PAYLOAD_TOO_LARGE` |
| `AiServiceException` | 503 `AI_SERVICE_UNAVAILABLE` |
| anything else | 500 `INTERNAL_ERROR`, generic message, full trace to the log |

`ErrorCode` is an enum whose values mirror the contract table exactly. Adding a
value is a contract change.

`traceId`: generate per request in a filter, put it in the MDC so it appears on
every log line, and return it in the envelope. A user screenshot then points
straight at the log.

Never put an exception message from Mongo or PDFBox into a 500 response — those
leak paths and driver internals.

## MongoDB

- Entities are `@Document` records in `model/`, with `@Indexed` where it's simple
  and explicit index creation in `MongoIndexConfig` for the compound ones. Index
  definitions are in [02-DATA-MODEL.md](02-DATA-MODEL.md).
- Create indexes at startup so a fresh volume is always correct. Spring Boot 3
  disables auto-index-creation by default — this is a real step, not a no-op.
- The ranked query is `find({jobId}).sort({score: -1})`, backed by
  `{jobId: 1, score: -1}`. That index is the reason the list stays fast.
- Screenings are **upserted** on `(jobId, resumeId)` — the unique index enforces
  it. Use `ReplaceOptions().upsert(true)` or a bulk upsert, never
  delete-then-insert (a crash between the two loses results).
- The candidates endpoint needs resumes with and without screenings. An
  aggregation with `$lookup` from `resumes` to `screenings` is the clean way; two
  queries joined in the service is acceptable and easier to read. Either is fine —
  just don't do one query per row.

## CORS

Only `web` needs it. Allow the origins from `CORS_ALLOWED_ORIGINS`, methods
`GET, POST, OPTIONS`, headers `Authorization, Content-Type`, and do **not** set
`allowCredentials` — the token is in a header, not a cookie.

`ai-service` needs no CORS config at all. If you find yourself adding it there,
something is calling it from the browser and the boundary is broken.

## Dockerfile

```dockerfile
FROM maven:3.9-eclipse-temurin-21 AS builder
WORKDIR /build
COPY pom.xml .
RUN mvn -B dependency:go-offline          # cached layer, skipped unless pom changes
COPY src ./src
RUN mvn -B clean package -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /build/target/*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
```

`-DskipTests` in the image build is intentional: tests need Testcontainers, which
needs a Docker daemon we don't have inside the build. CI runs `mvn verify`
separately — see [09-CI.md](09-CI.md).

## Local run

Mongo in Compose, the service natively for fast restarts:

```bash
docker compose up -d mongodb ai-service

cd api-service
export MONGODB_URI='mongodb://screener:change-me-locally@localhost:27017/screener?authSource=admin'
export JWT_SECRET="$(openssl rand -base64 48)"
export SERVICE_TOKEN=dev-token
export AI_SERVICE_BASE_URL=http://localhost:8000
export UPLOAD_DIR=./uploads
./mvnw spring-boot:run
```

Note `localhost` rather than the Compose service names — you're outside the
Compose network now. This requires the dev profile, which publishes Mongo's and
ai-service's ports; see [07-LOCAL-DEV.md](07-LOCAL-DEV.md).

Smoke test:

```bash
curl -s localhost:8080/actuator/health

TOKEN=$(curl -s -X POST localhost:8080/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"me@example.com","password":"devpassword","fullName":"Test User"}' \
  | jq -r .token)

curl -s -X POST localhost:8080/api/jobs \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"title":"Backend Engineer","description":"We need a backend engineer with strong Java and Spring Boot experience building REST APIs and working with MongoDB in production systems.","requiredSkills":["Java","Spring Boot","MongoDB"]}' | jq
```

## TODO

- [ ] Job deletion + cascade (resumes, screenings, upload directory). Cascade
      order is written down in [02-DATA-MODEL.md](02-DATA-MODEL.md); the endpoint
      isn't built yet.
- [ ] Decide `$lookup` aggregation vs. two queries for the candidates endpoint
      once we see how it reads.
