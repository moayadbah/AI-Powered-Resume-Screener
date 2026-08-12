# Local development

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Docker Desktop | 24+ with Compose v2 | [docker.com](https://www.docker.com/products/docker-desktop/) |
| Java (Temurin) | **21** | `brew install --cask temurin@21` |
| Python | **3.11** | `brew install python@3.11`, or pyenv |
| Node | 20+ | `brew install node` |
| Ollama | latest | `brew install ollama` |
| jq | any | `brew install jq` — the curl examples use it |

Verify:

```bash
docker compose version && java -version && python3.11 --version && node -v && ollama --version
```

### Why the Python version matters

Use **3.11**, not whatever `python3` points at. `torch` and
`sentence-transformers` publish wheels for a lagging set of Python versions; on
3.13/3.14 pip tries to build torch from source, which fails or takes an hour.
If `pip install` starts compiling C++, this is why.

### Ollama runs on the host

Not in Compose. Docker Desktop on macOS can't pass the GPU through, so a
containerized Ollama runs on CPU and is unusably slow.

```bash
ollama serve          # or just start the Ollama app
ollama pull llama3.2:3b
curl -s localhost:11434/api/tags | jq '.models[].name'
```

Containers reach it at `host.docker.internal:11434`; that's the default in
`.env.example`. Running `ai-service` natively, override it to `localhost:11434`.

The pull is ~2 GB. Do it once, before you need it in a demo.

## First run

```bash
git clone <repo> && cd AI-Powered-Resume-Screener
cp .env.example .env

# Generate a real signing key — the app refuses to start with the placeholder.
JWT="$(openssl rand -base64 48)"
TOKEN="$(openssl rand -hex 24)"
# then edit .env: JWT_SECRET=$JWT, SERVICE_TOKEN=$TOKEN

ollama serve &
ollama pull llama3.2:3b

docker compose up --build
```

First build takes 10–15 minutes: the AI image pulls torch and bakes in the
embedding model. Later builds are cached unless a requirements file changes.

Then:

```bash
curl -s localhost:8080/actuator/health | jq
open http://localhost:5173
```

## Ports

| Service | Container port | Published | Notes |
|---|---|---|---|
| `web` | 5173 | 5173 | Vite dev server |
| `api-service` | 8080 | 8080 | The only API the browser uses |
| `ai-service` | 8000 | **dev profile only** | Internal; not published in the default profile |
| `mongodb` | 27017 | **dev profile only** | |
| `ollama` | 11434 | host process | Not in Compose |

Publishing `ai-service` and `mongodb` is a development convenience. In the
default profile they're reachable only inside the Compose network — which is
also a small sanity check that nothing in `web` is calling them directly.

```bash
docker compose up                       # default: only web + api published
docker compose --profile dev up         # also publishes 8000 and 27017
```

## Environment variables

Full list in [`.env.example`](../.env.example). The ones that actually cause
problems:

| Variable | Trap |
|---|---|
| `JWT_SECRET` | Must be ≥ 32 chars and not the placeholder. `api-service` refuses to start otherwise — deliberately. |
| `SERVICE_TOKEN` | Must be **identical** for both services. Mismatched → every screen fails with 401 from `ai-service`, surfacing as a confusing 503. |
| `MONGODB_URI` | Host is `mongodb` inside Compose, `localhost` when running a service natively. Needs `?authSource=admin`. |
| `OLLAMA_BASE_URL` | `host.docker.internal` in a container, `localhost` natively. |
| `AI_SERVICE_BASE_URL` | `http://ai-service:8000` in Compose, `http://localhost:8000` natively (needs the dev profile). |
| `VITE_API_BASE_URL` | Read at **build** time and inlined. Changing it needs a dev-server restart. |

## Hybrid workflow

The normal way to work: everything else in Compose, your own service native.

**Working on `ai-service`:**
```bash
docker compose up -d mongodb
cd ai-service && source .venv/bin/activate
export SERVICE_TOKEN=<same as .env> OLLAMA_BASE_URL=http://localhost:11434
uvicorn app.main:app --reload --port 8000
```

**Working on `api-service`:**
```bash
docker compose --profile dev up -d mongodb ai-service
cd api-service
export MONGODB_URI='mongodb://screener:<pw>@localhost:27017/screener?authSource=admin'
export AI_SERVICE_BASE_URL=http://localhost:8000
export JWT_SECRET=<yours> SERVICE_TOKEN=<same as .env> UPLOAD_DIR=./uploads
./mvnw spring-boot:run
```

**Working on `web`:**
```bash
docker compose up -d mongodb ai-service api-service
cd web && npm run dev
```

## Seed data

```bash
./scripts/seed.sh
```

Registers `demo@example.com` / `demopassword`, creates a "Backend Engineer" job,
uploads the fixtures from `docs/fixtures/`, and runs a screen. Idempotent —
re-running resets the demo account.

Fixtures are described in [08-TESTING.md](08-TESTING.md).

## Useful commands

```bash
docker compose logs -f ai-service
docker compose ps
docker compose restart api-service
docker compose down                 # stop, keep data
docker compose down -v              # stop and wipe the database
docker compose build --no-cache ai-service

# Mongo shell
docker compose exec mongodb mongosh -u screener -p --authenticationDatabase admin screener
```

## Troubleshooting

### `ai-service` can't reach Ollama

Symptom: screening works, every summary is `null`, `summaryDegraded: true`.

`host.docker.internal` resolves on Docker Desktop for Mac and Windows. **On
Linux it does not**, unless you add:

```yaml
services:
  ai-service:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Then check the host side:

```bash
curl -s localhost:11434/api/tags                                   # from the host
docker compose exec ai-service curl -s http://host.docker.internal:11434/api/tags
```

If the first works and the second doesn't, it's the hosts entry. If neither
works, Ollama isn't running.

Note that scoring still works throughout — this is the degraded path behaving
correctly.

### `ai-service` is slow to start / healthcheck flapping

Loading torch and the model takes 10–20 s. Give the healthcheck
`start_period: 60s`. Without it, Compose kills the container mid-load and
restarts it forever.

### `MODEL_NOT_READY` on the first screen

Same cause, seen from the API side. Wait for `/health` to report
`modelLoaded: true`.

### Mongo auth fails after changing credentials

`MONGO_INITDB_*` variables only take effect **when the data volume is created**.
Changing them in `.env` does nothing to an existing volume.

```bash
docker compose down -v && docker compose up
```

That deletes the database. It's the right move locally and never in a shared
environment.

### Screening returns 503 `AI_SERVICE_UNAVAILABLE`

In order:
1. `docker compose ps` — is `ai-service` up?
2. `docker compose logs ai-service` — did it crash loading the model?
3. Are `SERVICE_TOKEN` values identical in both services? A mismatch gives 401
   from `ai-service`, which `api-service` reports as 503 — misleading, but that's
   what it is.
4. `docker compose exec api-service curl -s http://ai-service:8000/health`

### Uploads succeed but every resume is `EMPTY`

The PDFs have no text layer — they're scans or image exports. Expected
behaviour, not a bug (see the parse-status table in
[02-DATA-MODEL.md](02-DATA-MODEL.md)). Test with a PDF exported from a text
editor. If a *text* PDF comes back `EMPTY`, that's a real PDFBox issue worth
digging into.

### Port already in use

```bash
lsof -i :8080     # then kill the pid, or change the published port
```

macOS AirPlay Receiver holds :5000, which is why nothing here uses it.

### First build is enormous / very slow

Expected: `ai-service` is ~1.2 GB, mostly torch. If it's closer to 3 GB, the
CPU-only index URL is missing from the Dockerfile and you've pulled CUDA — see
[04-AI-SERVICE.md](04-AI-SERVICE.md).
