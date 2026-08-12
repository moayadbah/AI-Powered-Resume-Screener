# ai-service

Scoring and summarization. Python 3.11 · FastAPI · sentence-transformers · Ollama.

Internal only — `api-service` is the only caller. No database, no user auth, no
CORS.

**Spec: [../docs/04-AI-SERVICE.md](../docs/04-AI-SERVICE.md).** Endpoint shapes:
[../docs/03-API-CONTRACT.md](../docs/03-API-CONTRACT.md).

## Endpoints

| | |
|---|---|
| `POST /score` | Deterministic. Embeddings + cosine similarity + skill overlap. |
| `POST /summarize` | Ollama prose. Degrades to nulls with a 200 rather than failing. |
| `GET /health` | Unauthenticated. |
| `GET /model-info` | |

All except `/health` require `X-Service-Token`.

## Run

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

export SERVICE_TOKEN=dev-token
export OLLAMA_BASE_URL=http://localhost:11434
uvicorn app.main:app --reload --port 8000
```

Use **3.11**. `torch` and `sentence-transformers` don't publish wheels for the
newest Python releases, and pip will try to build from source.

`torch` is pinned to **2.2.2** and `numpy` to **1.26.4** on purpose: 2.2.2 is the
last release with macOS x86_64 wheels, so pinning it means the same version — and
therefore the same embeddings and the same scores — everywhere. torch 2.2.x was
built against NumPy 1.x and crashes on import with NumPy 2.

## Test

```bash
ruff check . && ruff format --check .
pytest -q
```

The first run downloads the embedding model (~90 MB) and takes a minute or so;
after that the suite is ~25 s. Ollama is always stubbed — no test touches a real
model.

## Smoke test

```bash
curl -s localhost:8000/health | jq

curl -s -X POST localhost:8000/score \
  -H 'Content-Type: application/json' -H 'X-Service-Token: dev-token' \
  -d @../docs/fixtures/score-request.json | jq
```

`strong-backend` should rank well above `unrelated-designer`. If it doesn't, the
problem is in sectioning or normalization — check the text survived to `encode()`.

## Notes

- The model loads in the FastAPI lifespan handler, not at import time. Requests
  before it's ready get `503 MODEL_NOT_READY`.
- Scoring is deterministic and the language model is **not** in that path. Ollama
  only writes the summary, and a failure there degrades to `summary: null` with a
  200 rather than failing the score.
- The Docker image is ~2.1 GB, which is normal for the CPU-only build — see the
  size breakdown in the spec before assuming CUDA got pulled in.
