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
| `GET /health` | |
| `GET /model-info` | |

All except `/health` require `X-Service-Token`.

## Run

```bash
python3.11 -m venv .venv && source .venv/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install -r requirements.txt -r requirements-dev.txt

export SERVICE_TOKEN=dev-token
export OLLAMA_BASE_URL=http://localhost:11434
uvicorn app.main:app --reload --port 8000
```

Use **3.11**. `torch` and `sentence-transformers` don't publish wheels for the
newest Python releases, and pip will try to build from source.

```bash
ruff check . && pytest -q
```

Not implemented yet — see [task list A1–A8](../docs/tasks/INTERN-A-MOAYAD.md).
