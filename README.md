# AI-Powered Resume Screener

Upload a batch of resumes against a job description, get back a ranked shortlist
with a match score and a short written summary for each candidate.

Built by [@moayadbah](https://github.com/moayadbah) and Marwan as an internship
project. Three services in one repo.

```
web (React + Chart.js)  ->  api-service (Java / Spring Boot)  ->  ai-service (Python / FastAPI)
                                      |                                     |
                                  MongoDB                            Ollama (on the host)
```

The browser only ever talks to `api-service`. `ai-service` is internal: it takes
text in and returns scores and summaries, and holds no state.

## How the scoring works

The score is **deterministic** — embeddings and cosine similarity, no language
model. A resume is split into sections, each section is embedded with
`all-MiniLM-L6-v2` and compared against the job description, and the
best-matching section sets the semantic score. That's combined with a literal
skill-overlap check:

```
score = round(100 * (0.7 * semantic_similarity + 0.3 * skill_overlap))
```

Ollama runs afterwards to write the human-readable summary. It never affects the
number. If it's unavailable, you still get scores and the summary comes back
empty — see [the architecture doc](docs/01-ARCHITECTURE.md) for why it's built
that way.

The score is a reading aid for reordering a pile of PDFs, not a hiring decision.
Nothing is auto-rejected. [What that means and doesn't](docs/00-PROJECT-BRIEF.md#known-limitations-were-not-hiding).

## Quickstart

Needs Docker, Java 21, Python 3.11, Node 20+, and Ollama. Full setup and
troubleshooting in [docs/07-LOCAL-DEV.md](docs/07-LOCAL-DEV.md).

```bash
cp .env.example .env
# set JWT_SECRET and SERVICE_TOKEN — the app refuses to start with the placeholders
#   openssl rand -base64 48

ollama serve &
ollama pull llama3.2:3b

docker compose up --build
```

First build takes 10–15 minutes (torch, plus the embedding model baked into the
image). Then open <http://localhost:5173>, or:

```bash
./scripts/seed.sh
```

which creates a demo account, uploads the sample resumes, and runs a screen.

## Repo layout

| Path | What |
|---|---|
| `ai-service/` | Scoring and summarization. Python 3.11, FastAPI. |
| `api-service/` | Auth, upload, PDF parsing, orchestration. Java 21, Spring Boot. |
| `web/` | Recruiter dashboard. React, Vite, Chart.js. |
| `docs/` | Specs and contracts — start here. |
| `docs/contracts/` | OpenAPI specs. Client types are generated from these. |

## Documentation

| Doc | |
|---|---|
| [00-PROJECT-BRIEF.md](docs/00-PROJECT-BRIEF.md) | Scope, non-goals, glossary, limitations |
| [01-ARCHITECTURE.md](docs/01-ARCHITECTURE.md) | Services, boundaries, request flows |
| [02-DATA-MODEL.md](docs/02-DATA-MODEL.md) | Collections, fields, indexes |
| [03-API-CONTRACT.md](docs/03-API-CONTRACT.md) | **Every endpoint. Source of truth.** |
| [04-AI-SERVICE.md](docs/04-AI-SERVICE.md) | Scoring algorithm, model, prompts |
| [05-API-SERVICE.md](docs/05-API-SERVICE.md) | Spring Boot service |
| [06-WEB-DASHBOARD.md](docs/06-WEB-DASHBOARD.md) | Frontend |
| [07-LOCAL-DEV.md](docs/07-LOCAL-DEV.md) | Setup, ports, troubleshooting |
| [08-TESTING.md](docs/08-TESTING.md) | Test strategy and fixtures |
| [09-CI.md](docs/09-CI.md) | GitHub Actions |
| [10-TEAM-WORKFLOW.md](docs/10-TEAM-WORKFLOW.md) | Branches, commits, review |

Task lists: [Moayad](docs/tasks/INTERN-A-MOAYAD.md) · [Marwan](docs/tasks/INTERN-B-MARWAN.md)

## Contributing

Endpoints, field names, and error codes come from
[docs/03-API-CONTRACT.md](docs/03-API-CONTRACT.md). Changing the interface means
changing that doc and the matching OpenAPI spec in the same PR, with both of us
approving — CI fails a PR that moves routes without it.

Everything else: [docs/10-TEAM-WORKFLOW.md](docs/10-TEAM-WORKFLOW.md).

## Status

Documentation and contracts are in place. Implementation hasn't started — the
service directories are stubs. Work is tracked in the task lists above.
