# Architecture

## Containers

```mermaid
flowchart TB
    R["Recruiter<br/>(browser)"]

    subgraph compose["docker compose"]
        W["web<br/>React 18 + Vite + Chart.js<br/>:5173"]
        A["api-service<br/>Java 21 / Spring Boot 3.3<br/>:8080"]
        M[("mongodb 7<br/>:27017")]
        AI["ai-service<br/>Python 3.11 / FastAPI<br/>:8000"]
        V[["uploads/<br/>bind mount"]]
    end

    O["ollama<br/>llama3.2:3b<br/>host :11434"]

    R -->|HTTPS-less local HTTP| W
    W -->|"REST + JWT"| A
    A -->|"spring-data-mongodb"| M
    A -->|"writes PDFs"| V
    A -->|"REST + X-Service-Token"| AI
    AI -->|"HTTP<br/>host.docker.internal"| O

    style AI fill:#2d3b2d,stroke:#5a7a5a,color:#e8f0e8
    style W fill:#2d3b2d,stroke:#5a7a5a,color:#e8f0e8
    style A fill:#2d3450,stroke:#5a6a9a,color:#e8ecf5
    style M fill:#2d3450,stroke:#5a6a9a,color:#e8ecf5
    style O fill:#3b3428,stroke:#7a6a45,color:#f0ead8
```

Green = Moayad. Blue = Marwan. Amber = runs on the host, not in Compose.

## Boundary rules

These are the rules that keep the two halves from growing into each other.
Breaking one of them is a design change, not a shortcut.

1. **The browser never talks to `ai-service`.** Every request from `web` goes to
   `api-service`. `ai-service` has no user auth, no CORS config, and no route
   published outside the Compose network. If the dashboard needs something the AI
   produces, `api-service` exposes it.

2. **`api-service` is the only writer to MongoDB.** `ai-service` is stateless —
   it takes text in and returns numbers and strings. It holds no database
   connection and doesn't know what a `jobId` means beyond an opaque string it
   echoes back.

3. **`api-service` owns all persistence and identity.** JWT issuing and
   verification, password hashing, file storage, ownership checks.

4. **`ai-service` owns all model behaviour.** Which embedding model, how text is
   chunked, how the score is composed, what the summarization prompt says. If the
   score formula changes, only `ai-service` changes.

5. **Ollama runs on the host.** Docker Desktop on macOS can't pass the GPU
   through to a container, so a containerized Ollama would run on CPU and be
   painfully slow. Containers reach the host daemon at
   `host.docker.internal:11434`.

## Why scoring is deterministic

**The language model is not in the scoring path.** The score comes from
embeddings and cosine similarity — same input, same output, every time. Ollama is
only used afterwards to write the human-readable summary.

We considered asking the model to score directly ("rate this resume 0–100 for
this role"). We rejected it:

- The number wouldn't be reproducible across runs, which makes the ranking
  unstable and the tests impossible to write meaningfully.
- We couldn't explain a score, only ask for a rationalization after the fact.
- Rankings would drift whenever the model was updated, with no version to point at.

So: **embeddings decide the order, the model only narrates it.** If the summary
generation fails or Ollama is down, the score is still returned and the summary
comes back `null` — a degraded but functional result. The reverse is not true;
if scoring fails the whole screening fails.

## Flow 1 — upload and parse

```mermaid
sequenceDiagram
    autonumber
    participant W as web
    participant A as api-service
    participant FS as uploads/
    participant M as mongodb

    W->>A: POST /api/jobs/{id}/resumes (multipart, N files)
    A->>A: verify JWT, check job ownership
    A->>A: validate each file (PDF magic bytes, <= 5 MB, <= 10 files)
    loop each file
        A->>FS: write {jobId}/{resumeId}.pdf
        A->>A: PDFBox extract text
        alt text extracted
            A->>M: insert resume, parseStatus = PARSED
        else empty (scanned / image-only)
            A->>M: insert resume, parseStatus = EMPTY
        else extraction threw
            A->>M: insert resume, parseStatus = FAILED
        end
    end
    A-->>W: 201 { uploaded: [...], failed: [...] }
```

A file that fails to parse still produces a `resumes` document. The recruiter
needs to see "we couldn't read this one", not have it vanish.

## Flow 2 — screening

```mermaid
sequenceDiagram
    autonumber
    participant W as web
    participant A as api-service
    participant M as mongodb
    participant AI as ai-service
    participant O as ollama (host)

    W->>A: POST /api/jobs/{id}/screen
    A->>M: load job + resumes where parseStatus = PARSED
    A->>AI: POST /score { jobDescription, requiredSkills, resumes[] }
    AI->>AI: embed JD, embed resume sections, cosine + skill overlap
    AI-->>A: [{ resumeId, score, semanticScore, skillScore, matchedSkills, missingSkills }]

    loop each scored resume
        A->>AI: POST /summarize { resumeText, jobDescription, matchedSkills, missingSkills }
        AI->>O: generate (temperature 0.2, JSON mode)
        alt ollama responded in time
            O-->>AI: summary JSON
            AI-->>A: { summary, strengths, concerns }
        else timeout / unreachable
            AI-->>A: { summary: null, degraded: true }
        end
    end

    A->>M: upsert screenings (jobId + resumeId), with modelVersion
    A-->>W: 200 { screened, skipped, degraded }
    W->>A: GET /api/jobs/{id}/candidates?sort=score
    A->>M: find, sort score desc
    A-->>W: 200 ranked page
```

Screening is synchronous and capped by `MAX_RESUMES_PER_SCREEN` (default 50).
Above that, `api-service` returns `422 BATCH_TOO_LARGE` rather than hanging the
request. That cap is the thing an async queue removes later.

Re-screening the same job **upserts** on `(jobId, resumeId)` — one screening row
per pair, always the latest. `modelVersion` and `scoredAt` record what produced it.

## Technology choices and why

| Choice | Reason | What we gave up |
|---|---|---|
| Two services, not one | The AI half needs the Python ecosystem; the API half is a better fit for Spring. Splitting them also splits the work cleanly between us. | Network hop, a contract to maintain, more moving parts locally. |
| MongoDB | Resume documents are irregular — variable sections, optional fields, a skills array. Fits a document store without migrations while the shape is still moving. | No joins; `screenings` denormalizes a bit of resume data for the list view. |
| `all-MiniLM-L6-v2` | 384-dim, ~90 MB, runs fine on CPU, good enough for short-text similarity. Fast enough that a 50-resume batch stays inside one request. | Weaker than a larger model on long documents. Section-chunking is partly a workaround for its 256-token window. |
| Local Ollama over a hosted API | No key, no per-call cost, resume text never leaves the machine — which matters given the content. | Setup burden on each laptop, slower, weaker model. |
| Synchronous screening | Far simpler; no queue, no worker, no polling UI. | Hard batch cap and a long-running HTTP request. |

## Ports

| Service | Port | Reachable from browser |
|---|---|---|
| web (Vite dev) | 5173 | yes |
| api-service | 8080 | yes |
| ai-service | 8000 | **no** — Compose network only |
| mongodb | 27017 | no |
| ollama | 11434 (host) | no |

`ai-service` and `mongodb` publish no host ports in the production Compose
profile. They're published in the dev profile so we can curl them directly while
building; see [07-LOCAL-DEV.md](07-LOCAL-DEV.md).
