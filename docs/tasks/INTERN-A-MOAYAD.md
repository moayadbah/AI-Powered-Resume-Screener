# Tasks — Moayad (ai-service + web)

Ordered. Later tasks assume earlier ones are merged. Each task is one branch and
one PR.

**Before starting any task:** read [03-API-CONTRACT.md](../03-API-CONTRACT.md)
and the service doc — [04-AI-SERVICE.md](../04-AI-SERVICE.md) for A1–A8,
[06-WEB-DASHBOARD.md](../06-WEB-DASHBOARD.md) for A9–A13.

Dependency legend: **needs** = must be merged first. **blocks** = someone is
waiting on this.

---

## Part 1 — ai-service

### A1 · Service skeleton

FastAPI app that starts, answers `/health`, rejects a bad service token, and
returns the shared error envelope.

- **Files** `app/main.py`, `app/config.py`, `app/auth.py`, `app/errors.py`, `app/routers/ops.py`, `pyproject.toml`, `requirements.txt`, `requirements-dev.txt`
- **Read** [04-AI-SERVICE.md](../04-AI-SERVICE.md) §Configuration, §Errors
- **Blocks** everything else in this list

**Done when**
- `GET /health` → 200 `{"status": "ok"|"loading", "modelLoaded": …, "ollamaReachable": …}`
- Any authed route without `X-Service-Token`, or with a wrong one → 401 `INVALID_SERVICE_TOKEN` in the envelope
- Startup fails loudly if `SERVICE_TOKEN` is unset, or if the weights don't sum to 1.0
- Config is read once into a settings object — no `os.getenv` outside `config.py`
- `ruff check .` clean

```bash
uvicorn app.main:app --port 8000 &
curl -s localhost:8000/health | jq
curl -si localhost:8000/model-info | head -1        # expect 401
```

---

### A2 · Embedding model loading

Load the model once at startup; serve 503 until it's ready.

- **Files** `app/services/embeddings.py`, `app/main.py` (lifespan)
- **Needs** A1
- **Read** [04-AI-SERVICE.md](../04-AI-SERVICE.md) §Model loading

**Done when**
- Model loads in the lifespan handler — not at import time (import-time loading breaks test collection)
- Pinned `revision`, `device="cpu"` explicit
- Requests before ready → 503 `MODEL_NOT_READY`, never a 500 or a hang
- `/health` reports `modelLoaded` truthfully
- `encode()` wrapper takes a list and returns normalized vectors in one batched call

```bash
curl -s localhost:8000/health | jq .modelLoaded    # true once warm
```

---

### A3 · Resume sectioning

Split resume text into embeddable chunks.

- **Files** `app/services/sectioning.py`, `tests/test_sectioning.py`
- **Needs** A1
- **Read** [04-AI-SERVICE.md](../04-AI-SERVICE.md) §2 Section the resume

**Done when**
- Splits on the heading list from the doc, case-insensitive, at line starts
- Text before the first heading → a `header` section
- No headings → ~180-word chunks with ~30-word overlap
- Long sections chunked the same way; chunks under 20 words dropped; 30 chunks max
- Tests cover: headings present, no headings, very short input (`minimal.txt`), heading-only input
- **A resume must never produce zero chunks** — the short-input case is the one that breaks this

```bash
pytest tests/test_sectioning.py -q
```

---

### A4 · Skill matching

Match a job's required skills against resume text.

- **Files** `app/services/skills.py`, `tests/test_skills.py`
- **Needs** A1
- **Read** [04-AI-SERVICE.md](../04-AI-SERVICE.md) §5 Skill score

**Done when**
- **Word-boundary matching.** `"r"` does not match inside `"experience"`, `"go"` not inside `"algorithm"` — there is a test for exactly this
- Multi-word skills match as phrases with flexible whitespace
- Punctuation-bearing skills work: `c++`, `c#`, `.net`, `node.js` (regex-escaped)
- Alias table resolves both directions
- Empty `requiredSkills` → `skillScore` 0.0, no divide-by-zero
- `matched ∪ missing == requiredSkills`, always

```bash
pytest tests/test_skills.py -q
```

---

### A5 · `POST /score`

Compose the pieces into the scoring endpoint. **The critical path of the whole project.**

- **Files** `app/services/scoring.py`, `app/routers/scoring.py`, `app/models/schemas.py`, `tests/test_scoring.py`, `tests/test_api.py`
- **Needs** A2, A3, A4
- **Blocks** **Marwan's B9** — tell him when it's merged
- **Read** [04-AI-SERVICE.md](../04-AI-SERVICE.md) §Scoring, [03-API-CONTRACT.md](../03-API-CONTRACT.md) §POST /score

**Done when**
- Request/response match the contract exactly, including `camelCase` aliases on the Pydantic models
- Results come back **in request order**, one per input
- `score = round(100 * (0.7*semantic + 0.3*skill))`, integer, clamped 0–100
- Semantic score is **max-pooled** over chunks, clamped to ≥ 0
- JD embedded once per request; all chunks encoded in one batched call
- One unembeddable resume → that resume scores 0, **batch still returns 200**
- Tests assert **ordering and bands, never exact floats** ([08-TESTING.md](../08-TESTING.md))
- A determinism test: same input twice → identical output

```bash
pytest -q
curl -s -X POST localhost:8000/score -H 'X-Service-Token: dev-token' \
  -H 'Content-Type: application/json' -d @docs/fixtures/score-request.json | jq
# strong-backend must rank above unrelated-designer
```

---

### A6 · `GET /model-info`

- **Files** `app/routers/ops.py`
- **Needs** A2
- **Read** [03-API-CONTRACT.md](../03-API-CONTRACT.md) §GET /model-info

**Done when** it returns the real loaded model, revision, dimensions, and the
active weights — not hardcoded strings. `modelVersion` matches what `/score`
reports.

---

### A7 · `POST /summarize`

Ollama summarization with graceful degradation.

- **Files** `app/services/summarizer.py`, `app/routers/summarize.py`, `tests/test_summarizer.py`
- **Needs** A1
- **Read** [04-AI-SERVICE.md](../04-AI-SERVICE.md) §Summarization

**Done when**
- Prompt is a module constant with `PROMPT_VERSION = "v1"`, including the instruction not to infer personal characteristics
- `temperature: 0.2`, `format: "json"`, `stream: false`, `num_predict: 300`; resume text truncated to ~4000 chars
- **Every failure returns 200 with nulls and a `degradedReason`** — `ollama_unreachable`, `ollama_timeout`, `invalid_json`, `disabled`. This endpoint never raises
- Handles the model wrapping JSON in prose or a code fence (strip, take the outermost `{...}`, one retry on `invalid_json`)
- Length caps enforced **in code** after parsing: summary ≤ 600 chars, ≤ 3 strengths, ≤ 3 concerns
- Tests stub Ollama with `respx` and cover every degradation branch. **No test hits a real model.**

```bash
pytest tests/test_summarizer.py -q
OLLAMA_BASE_URL=http://127.0.0.1:1 curl -s -X POST localhost:8000/summarize \
  -H 'X-Service-Token: dev-token' -H 'Content-Type: application/json' \
  -d @docs/fixtures/summarize-request.json | jq
# expect 200, degraded: true, degradedReason: "ollama_unreachable"
```

---

### A8 · Dockerfile

- **Files** `ai-service/Dockerfile`, `ai-service/.dockerignore`
- **Needs** A5, A7
- **Blocks** Marwan's full Compose stack
- **Read** [04-AI-SERVICE.md](../04-AI-SERVICE.md) §Dockerfile

**Done when**
- Two-stage, `python:3.11-slim`
- **CPU-only torch index URL.** Verify by asking torch directly, not by image
  size — ~2.1 GB is normal for the correct CPU build
- Embedding model **baked in at build time**; `HF_HUB_OFFLINE=1` in the runtime stage
- Container answers `/health` with `modelLoaded: true` on `--network none`
- Runs as a non-root user
- Single uvicorn worker

```bash
docker build -t ai-service ./ai-service
docker run --rm ai-service python -c "import torch; print(torch.__version__, torch.version.cuda)"
# want: 2.2.2+cpu None

docker run -d --rm --name t --network none -e SERVICE_TOKEN=x ai-service
sleep 25 && docker exec t python -c "import urllib.request;print(urllib.request.urlopen('http://localhost:8000/health').read().decode())"
docker exec t whoami   # appuser, not root
docker stop t
```

---

## Part 2 — web

You do **not** need Marwan's API finished. Build against MSW using the example
responses in [03-API-CONTRACT.md](../03-API-CONTRACT.md), then switch over.

### A9 · App skeleton, API client, auth

- **Files** `web/` scaffold, `src/api/client.ts`, `src/api/types.ts`, `src/auth/*`, `src/pages/LoginPage.tsx`, `src/App.tsx`
- **Read** [06-WEB-DASHBOARD.md](../06-WEB-DASHBOARD.md) §API client, §Screens

**Done when**
- Vite + TS `strict` + React Router + TanStack Query wired up
- `src/api/types.ts` **generated** from the OpenAPI spec via `npm run gen:types` and committed — not hand-written
- `client.ts` is the only place `fetch` is called; attaches the bearer token; parses the error envelope into a typed `ApiError`
- **401 → clear token, redirect to `/login`.** The 24h expiry makes this a daily occurrence
- Non-JSON error responses still produce an `ApiError`
- 30 s default timeout via `AbortController`
- `RequireAuth` guards routes and preserves the attempted path
- Login shows one message for `INVALID_CREDENTIALS` — don't split it into "no such user" / "wrong password"

```bash
cd web && npm run lint && npx tsc --noEmit && npm run test
```

---

### A10 · Job list and creation

- **Files** `src/pages/JobListPage.tsx`, `src/api/queries.ts`
- **Needs** A9

**Done when** list and create both work, required skills use a chip input, and
**loading / empty / error states all render** — empty says "No jobs yet — create
one to start screening", not a blank page.

---

### A11 · Job detail — upload and candidate table

The main screen.

- **Files** `src/pages/JobDetailPage.tsx`, `src/components/{UploadDropzone,CandidateTable,ScoreBadge,SkillChips}.tsx`
- **Needs** A10
- **Read** [06-WEB-DASHBOARD.md](../06-WEB-DASHBOARD.md) §Candidate table, §UI states

**Done when**
- Drag-and-drop **plus** a real `<input type="file">` — keyboard-reachable, not drag-only
- Client-side PDF/size check before upload (courtesy; the server still enforces)
- Table renders **all four row states**: screened, unscreened, `EMPTY`, `FAILED`. Unreadable rows stay visible with an explanation — never hidden
- Sorting goes through the server's `sort`/`order` params
- Screen button: disabled while running, **180 s timeout**, honest progress text (no fake percentage), toast on completion with `screened` / `skipped` / degraded counts
- `NO_SCOREABLE_RESUMES` → "None of the uploaded files had readable text"
- `ScoreBadge` shows the number and a text label, never colour alone, no pass/fail red-green

---

### A12 · Charts

- **Files** `src/components/charts/*`
- **Needs** A11
- **Read** [06-WEB-DASHBOARD.md](../06-WEB-DASHBOARD.md) §Charts

**Done when**
- Three charts: score distribution (10-point buckets), top 10 horizontal bar, skill coverage radar (capped at 8 axes)
- All read from the already-loaded candidates data — no new endpoints
- `maintainAspectRatio: false` inside a fixed-height container, or Chart.js grows unbounded in flex
- Clicking a bar in the top-10 chart opens that candidate
- `aria-hidden` on the canvases with a caption pointing at the table as the text alternative
- Tests assert the **data passed to the chart**, not the rendered canvas

---

### A13 · Candidate detail

- **Files** `src/pages/CandidateDetailPage.tsx`
- **Needs** A11

**Done when** score, breakdown, skill chips, summary, strengths and concerns all
render — and when `summaryDegraded` is true, the score shows normally with the
note "Summary unavailable — scoring was not affected." That last clause is the
point: a blank summary must not cast doubt on the number beside it.

---

## Integration

Once A5 and B9 are both merged, sit down with Marwan and run the whole stack
against `./scripts/seed.sh`. Expect mismatches — every one is a place the
contract was ambiguous, so fix [03-API-CONTRACT.md](../03-API-CONTRACT.md) too,
not just the code.
