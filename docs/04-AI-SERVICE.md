# ai-service

Python 3.11 · FastAPI · sentence-transformers · Ollama. Owner: **Moayad**.

Scoring and summarization only. No database, no user auth, no CORS. Everything
it knows arrives in the request body. See
[01-ARCHITECTURE.md](01-ARCHITECTURE.md) for why the boundary is drawn there,
and [03-API-CONTRACT.md](03-API-CONTRACT.md) for the exact request/response
shapes — this document explains the *inside*, not the interface.

## Layout

```
ai-service/
├── app/
│   ├── main.py              # FastAPI app, lifespan, exception handlers
│   ├── config.py            # Settings (pydantic-settings), read once at startup
│   ├── auth.py              # X-Service-Token dependency
│   ├── routers/
│   │   ├── scoring.py       # POST /score
│   │   ├── summarize.py     # POST /summarize
│   │   └── ops.py           # GET /health, GET /model-info
│   ├── services/
│   │   ├── embeddings.py    # model loading, encode(), cosine
│   │   ├── sectioning.py    # resume text -> sections
│   │   ├── skills.py        # skill matching
│   │   ├── scoring.py       # composes the final score
│   │   └── summarizer.py    # Ollama client + prompt
│   ├── models/
│   │   └── schemas.py       # Pydantic v2 request/response models
│   └── errors.py            # error envelope + exception types
├── tests/
│   ├── conftest.py
│   ├── test_scoring.py
│   ├── test_sectioning.py
│   ├── test_skills.py
│   ├── test_summarizer.py
│   └── test_api.py
├── Dockerfile
├── pyproject.toml
├── requirements.txt
└── requirements-dev.txt
```

## Why Python 3.11 and not newer

Pin **3.11** in the Dockerfile and in your local venv. `torch` and
`sentence-transformers` wheels lag new Python releases by months — on 3.13/3.14
pip falls back to building from source, which either takes forever or fails
outright. This isn't a preference, it's the difference between `pip install`
working and not.

```bash
# local venv, if you have pyenv
pyenv install 3.11.9 && pyenv local 3.11.9
python -m venv .venv && source .venv/bin/activate
```

## Configuration

`app/config.py`, pydantic-settings, read from the environment once at startup.
No `os.getenv` scattered through the code.

| Setting | Env var | Default | Notes |
|---|---|---|---|
| `service_token` | `SERVICE_TOKEN` | — | Required. Startup fails if unset. |
| `embedding_model` | `EMBEDDING_MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | |
| `embedding_revision` | `EMBEDDING_MODEL_REVISION` | `1110a241...` | Pinned commit hash, not a branch. |
| `semantic_weight` | `SEMANTIC_WEIGHT` | `0.7` | |
| `skill_weight` | `SKILL_WEIGHT` | `0.3` | Must sum to 1.0 with the above — validated at startup. |
| `ollama_base_url` | `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | `localhost` when running natively. |
| `ollama_model` | `OLLAMA_MODEL` | `llama3.2:3b` | |
| `ollama_timeout_seconds` | `OLLAMA_TIMEOUT_SECONDS` | `60` | |
| `summary_enabled` | `SUMMARY_ENABLED` | `true` | `false` short-circuits to `degradedReason: disabled`. Useful in tests and demos. |

Weights that don't sum to 1.0 must raise at startup, not silently produce
scores above 100.

### About the pinned revision

`EMBEDDING_MODEL_REVISION` is a commit hash on the Hugging Face repo, not a
branch name. Pinning it means the model can't change under us — an unpinned
`main` would shift every score in the database with no version to point at.

The value in `.env.example` was current when it was written. Re-derive it, or
check it's still what you think it is, with:

```bash
curl -s https://huggingface.co/api/models/sentence-transformers/all-MiniLM-L6-v2 | jq -r .sha
```

If you deliberately move to a newer revision, bump it in `.env.example` and the
Dockerfile together, and expect existing `screenings` rows to have a stale
`modelVersion` — that's the whole point of storing it.

## Scoring

This is the core of the service. Written out step by step because it must not be
re-derived differently in a later session.

### 1. Normalize

Applied identically to the job description and every resume:

- Unicode NFKC normalization.
- Collapse runs of whitespace to a single space, but **keep newlines** — section
  detection depends on them.
- Strip zero-width and control characters (PDF extraction leaves these behind).
- Lowercase **only for skill matching**, not for embedding. The model was
  trained on cased text.

### 2. Section the resume

`all-MiniLM-L6-v2` truncates at 256 word-pieces — roughly 200 words. A two-page
resume is far longer, so embedding it whole throws most of it away. Splitting is
not an optimization here, it's what makes the score mean anything.

Split on common resume headings, case-insensitive, at line starts:

```
experience | work experience | employment | professional experience
education | academic background
skills | technical skills | core competencies
projects | personal projects
certifications | licenses
summary | profile | objective | about
publications | awards | achievements | languages | interests
```

Rules:

- Text before the first recognized heading becomes a section named `header`
  (this is where the name and contact details live).
- No headings found → fall back to fixed-size chunks of ~180 words with ~30
  words of overlap. Plenty of resumes are formatted as prose.
- Sections over ~180 words are chunked the same way; a long `experience` section
  becomes several chunks.
- Sections under 20 words are **merged into the next section**, not dropped. A
  lone `SKILLS` heading is noise in the max-pool, but a two-line `EDUCATION`
  block is not — for a career-changer it's the entire signal, and the `header`
  block is where the candidate's name lives. Nothing is discarded.
- Cap at 30 chunks per resume. Beyond that we're in "someone pasted a
  dissertation" territory.

### 3. Embed

Encode the job description once per request, not once per resume. Encode all
resume chunks in a single batched `model.encode()` call with
`normalize_embeddings=True`. Batching is the difference between a 50-resume
screen taking ~1 s and taking ~30 s.

Because vectors are normalized, cosine similarity is a dot product.

### 4. Semantic score

```python
sims = chunk_embeddings @ jd_embedding      # cosine, since both are normalized
semantic_score = float(sims.max())          # best-matching chunk wins
```

**Max-pool, not mean.** A candidate with a strong experience section and a long
irrelevant hobbies section should not be punished for the hobbies. Mean-pooling
rewards short resumes and dilutes real matches.

Clamp to `[0, 1]` — cosine can return small negatives, and a negative score
would be nonsense to display.

> Per-section weighting (experience worth more than education) is the obvious
> next step. It's deliberately out of scope for v1 — see the follow-ups in
> [00-PROJECT-BRIEF.md](00-PROJECT-BRIEF.md).

### 5. Skill score

Literal matching against the job's `requiredSkills`, on the lowercased full
resume text:

- Match on **word boundaries**, not substrings. Naive `in` matching finds "r" in
  "experience" and "go" in "algorithm" — this is the single most common way this
  feature goes wrong.
- Multi-word skills ("spring boot", "machine learning") match as a phrase, with
  flexible whitespace.
- A small alias table handles the obvious equivalents:

  ```python
  ALIASES = {
      "javascript": ["js", "ecmascript"],
      "typescript": ["ts"],
      "postgresql": ["postgres"],
      "kubernetes": ["k8s"],
      "amazon web services": ["aws"],
      "continuous integration": ["ci"],
      "natural language processing": ["nlp"],
      "spring boot": ["springboot"],
      "node.js": ["nodejs", "node js"],
      "c#": ["csharp", "c sharp"],
  }
  ```

  Aliases resolve in both directions. Keep it small and obvious — an
  ever-growing table is a sign this should be embedding-based instead.
- Punctuation-bearing skills (`c++`, `c#`, `.net`) need escaping in the regex.
  There's a test for this because it will break otherwise.

```python
skill_score = len(matched) / len(required_skills) if required_skills else 0.0
```

**Known limitation, measured on the fixtures.** Literal matching has no notion of
proficiency. `partial-backend.txt` says "Java (learning)" and "Spring Boot
(learning)" and still scores `skillScore: 1.00` — identical to a candidate with
four years of it. The semantic score is what actually separates them (0.58 vs
0.70 on `backend-engineer`), which is a large part of why it carries 70% of the
weight.

Don't try to fix this with negative-keyword rules ("ignore if preceded by
learning"). That's an arms race against phrasing. If proficiency needs to
matter, it belongs in the embedding side or in per-section weighting.

Empty `requiredSkills` → `skillScore` 0.0, and the final score is 70% of the
semantic score at most. That's intended: a job with no listed skills gets a
purely semantic ranking, and the recruiter sees lower absolute numbers.

### 6. Compose

```python
final = round(100 * (semantic_weight * semantic_score + skill_weight * skill_score))
```

Integer 0–100. `semanticScore` and `skillScore` are also returned, rounded to 4
decimals, so the UI can show why a score is what it is.

### Failure inside a batch

One bad resume must not fail the whole request. Wrap the per-resume work; on
failure return that resume with `score: 0`, `semanticScore: 0.0`,
`skillScore: 0.0`, empty `matchedSkills`, all of `requiredSkills` in
`missingSkills`, and log a warning with the `resumeId`. The other 49 results are
still worth returning.

## Model loading

Load once at startup in the FastAPI **lifespan** handler, not per request, and
not at import time (import-time loading breaks test collection).

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model = SentenceTransformer(
        settings.embedding_model,
        revision=settings.embedding_revision,
        device="cpu",
    )
    yield
```

Requests arriving before the model is ready get **503 `MODEL_NOT_READY`**, never
a 500 and never a hang.

The model is **baked into the image at build time** (see the Dockerfile section)
so containers don't reach out to Hugging Face on boot. A container that
downloads 90 MB on every start is a container that fails in a demo with bad wifi.

`device="cpu"` is explicit. Docker Desktop on macOS has no GPU passthrough, and
letting it auto-detect produces different behaviour inside and outside the
container.

## Summarization

The only part that talks to Ollama, and the only part allowed to fail softly.

- HTTP to `{ollama_base_url}/api/generate`, `stream: false`, `format: "json"`.
- `temperature: 0.2` — low, because we want description rather than invention.
- `num_predict: 300` caps the response so a rambling model can't blow the timeout.
- Truncate `resumeText` to the first ~4000 characters before sending. The whole
  resume doesn't fit usefully in a 3B model's attention, and long inputs are what
  make generation slow.

### Prompt

Stored as a module-level constant in `summarizer.py` with `PROMPT_VERSION = "v1"`.
**Changing the text means bumping the version**, because `promptVersion` is
recorded on every screening and it's how we explain why last week's summaries
read differently.

```
You are helping a recruiter review a candidate. Be factual and concise.
Only use information present in the resume. Do not speculate about the
candidate's background, and do not infer anything about age, gender,
nationality, or personal circumstances.

JOB DESCRIPTION:
{job_description}

SKILLS THE CANDIDATE HAS: {matched_skills}
SKILLS NOT FOUND IN THE RESUME: {missing_skills}

RESUME:
{resume_text}

Respond with JSON only, matching this shape exactly:
{
  "summary": "<2-3 sentences on how this candidate's experience relates to the role>",
  "strengths": ["<short phrase>", "..."],
  "concerns": ["<short phrase>", "..."]
}

Rules:
- summary: at most 600 characters.
- strengths: at most 3 items, each at most 120 characters.
- concerns: at most 3 items, each at most 120 characters. Concerns must be
  about skills or experience relevant to this job, never about the person.
- If the resume is too short or unclear to judge, say so in the summary.
```

The instruction against inferring personal characteristics is load-bearing, not
decoration — see the limitations section in
[00-PROJECT-BRIEF.md](00-PROJECT-BRIEF.md). A small model will happily comment on
someone's career gap or name if you let it.

### Degradation

Every failure path returns **200** with nulls and a reason. It never raises:

| Situation | `degradedReason` |
|---|---|
| Connection refused / DNS failure | `ollama_unreachable` |
| No response within `ollama_timeout_seconds` | `ollama_timeout` |
| Response isn't valid JSON, or is missing `summary` | `invalid_json` |
| `SUMMARY_ENABLED=false` | `disabled` |

Even in JSON mode a small model sometimes wraps output in prose or a code fence.
Strip fences and take the outermost `{...}` before parsing. One retry on
`invalid_json` is worth it; a second is not.

Enforce the length caps in code after parsing — truncate `summary` at 600 chars,
slice `strengths` / `concerns` to 3. The model does not reliably respect limits
it was asked to respect, and `api-service` and the UI are sized for these bounds.

## Errors

One handler in `main.py` produces the envelope from
[03-API-CONTRACT.md](03-API-CONTRACT.md) for every failure — validation errors,
our own exceptions, and unhandled ones alike. No endpoint builds an error body
by hand.

- `traceId`: 16 hex chars, generated per request, put on the response and
  included in the log line.
- Unhandled exceptions log the traceback but return a generic message. Internal
  paths and stack frames don't go over the wire.
- **No bare `except:`.** Catch what you can handle. The one deliberate
  catch-broad is around the Ollama call, and it records a reason rather than
  swallowing.

## Dockerfile

Two stages: download the model in the builder, copy the cache into a slim runtime.

```dockerfile
FROM python:3.11-slim AS builder
WORKDIR /build
# CPU-only torch — the default index pulls ~2 GB of CUDA we can't use.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake the model in so containers never download at boot.
ARG EMBEDDING_MODEL=sentence-transformers/all-MiniLM-L6-v2
ARG EMBEDDING_MODEL_REVISION=1110a243fdf4706b3f48f1d95db1a4f5529b4d41
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
SentenceTransformer('${EMBEDDING_MODEL}', revision='${EMBEDDING_MODEL_REVISION}', \
cache_folder='/opt/models')"

FROM python:3.11-slim
WORKDIR /app
ENV HF_HOME=/opt/models \
    HF_HUB_OFFLINE=1 \
    PYTHONUNBUFFERED=1
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /opt/models /opt/models
COPY app/ ./app/
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

Notes worth keeping:

- **`--index-url .../whl/cpu` is not optional.** Default torch drags in CUDA
  wheels for hardware the container doesn't have.
- **`HF_HUB_OFFLINE=1`** makes an accidental network fetch fail loudly at build
  review time instead of silently at runtime.
- **Use `COPY --chown=`, never a later `RUN chown -R`.** A recursive chown
  rewrites every file into a new layer — doing it to `/opt/models` duplicated
  the entire 88 MB model cache in the image.
- One worker. The model isn't thread-safe to share carelessly, and multiple
  workers each load their own copy of the weights.

### Measured size

**~2.1 GB**, and that is the CPU-only build working correctly. Breakdown:

| | |
|---|---|
| `torch` | 708 MB |
| `transformers` | 119 MB |
| `scipy` | 113 MB |
| `sympy` | 80 MB |
| `sklearn` | 50 MB |
| `numpy` (+ libs) | 79 MB |
| model cache | 88 MB |
| base image + rest | remainder |

So **don't use image size to tell whether you accidentally pulled CUDA** — 2 GB
is normal here. Check directly:

```bash
docker run --rm ai-service:local python -c "import torch; print(torch.__version__, torch.version.cuda)"
# want: 2.13.0+cpu None
```

First ready request takes 10–20 s, most of it loading torch. Don't set an
aggressive Compose healthcheck `start_period` — 60 s.

## Dependencies

Pin exact versions in `requirements.txt`. `torch` and `sentence-transformers`
change behaviour between minor releases, and a floating version means scores
that shift for no visible reason.

See [`ai-service/requirements.txt`](../ai-service/requirements.txt) for the
current pins. `requirements-dev.txt` adds `pytest`, `pytest-asyncio`, `ruff`,
`respx` (for stubbing the Ollama HTTP calls), and `jsonschema` + `PyYAML` for the
contract-conformance test.

**Run `pip-audit -r requirements.txt` before bumping anything, and treat a stale
pin as a finding rather than a stability win.** We originally pinned
`torch==2.2.2` — the last release with macOS x86_64 wheels — to get identical
embeddings on an Intel Mac, in the container, and on Windows. That version
carries 11 known CVEs. Reproducibility across dev laptops is not worth shipping
those, so the pin follows current torch and an Intel Mac runs the suite in Docker
instead:

```bash
docker build -f ai-service/Dockerfile.test -t ai-service-test .   # context: repo root
docker run --rm ai-service-test
```

Bumping torch 2.2 → 2.13 and transformers 4 → 5 did **not** change the fixture
ranking, which is the payoff for asserting ordering and bands rather than exact
scores ([08-TESTING.md](08-TESTING.md)).

## Local run

```bash
cd ai-service
source .venv/bin/activate
export SERVICE_TOKEN=dev-token
export OLLAMA_BASE_URL=http://localhost:11434   # native, not in a container
uvicorn app.main:app --reload --port 8000
```

Smoke test:

```bash
curl -s localhost:8000/health | jq
curl -s -X POST localhost:8000/score \
  -H 'Content-Type: application/json' \
  -H 'X-Service-Token: dev-token' \
  -d '{"jobDescription":"We need a backend engineer with strong Java and Spring Boot experience building REST APIs and working with MongoDB in production.","requiredSkills":["java","spring boot","mongodb"],"resumes":[{"resumeId":"a","text":"Backend engineer. Four years of Java and Spring Boot. Built REST APIs on MongoDB."},{"resumeId":"b","text":"Graphic designer. Photoshop, Illustrator, brand identity work."}]}' | jq
```

Resume `a` should score far above `b`. If it doesn't, the problem is in
sectioning or normalization — check that the text survived to `encode()`.

## TODO

- [ ] Decide whether `header` sections should be excluded from the max-pool.
      A name and address block sometimes scores oddly high on short JDs.
      Partly mitigated: the header is usually short enough to merge into the
      following section rather than standing alone as its own chunk.
- [ ] Alias table is hand-written and will not scale. Revisit once we see real
      resumes.
