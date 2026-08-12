# Project brief

## What we're building

A tool that lets a recruiter post a job description, upload a batch of resumes,
and get back a ranked shortlist with a similarity score and a short written
summary for each candidate.

The point is to cut the first-pass reading. A recruiter with 60 PDFs gets an
ordered list and a reason for each position, instead of an unordered folder.

## Who uses it

**Recruiter (the only user role in v1).** Signs in, creates a job posting,
uploads resumes against it, hits screen, reads the ranked table, opens a
candidate to see the matched/missing skills and the summary.

There is no candidate-facing side. Candidates never log in and never see scores.

## What "done" looks like for v1

1. A recruiter can register and log in.
2. They can create a job with a description and a required-skills list.
3. They can upload up to 10 PDF resumes at a time against that job.
4. Text is extracted from each PDF and stored.
5. Screening produces, for every resume: a 0–100 score, matched skills, missing
   skills, and a 2–3 sentence summary.
6. The dashboard shows the candidates ranked by score, with charts for score
   distribution, the top 10, and skill coverage.
7. The whole thing comes up with `docker compose up` plus Ollama running on the host.

## Non-goals for v1

Listed so we stop re-litigating them mid-sprint:

- **No async job queue.** Screening is a synchronous request with a batch cap.
  We know this doesn't scale; see the follow-ups.
- **No OCR.** Scanned image-only PDFs are recorded with `parseStatus: EMPTY`
  and shown as unscoreable, not silently dropped.
- **No DOCX**, no plain text upload. PDF only.
- **No multi-tenancy.** Every recruiter sees only their own jobs, but there's no
  org/team layer.
- **No refresh tokens.** One 24-hour access token, then log in again.
- **No candidate deduplication** across jobs.
- **No cloud deploy.** Local Docker only.

## Known limitations we're not hiding

**Semantic similarity is not a hiring decision.** The score measures how close a
resume's wording is to a job description's wording in embedding space. That
correlates with fit, but it also correlates with things we don't want it to:
whether someone writes in the same industry dialect, whether English is their
first language, whether they had access to resume-polishing tools. We have not
run any bias audit and we are not claiming the ranking is fair — it's a reading
aid that reorders a pile.

That's why the product is built the way it is:

- The score is **advisory and always shown alongside the summary and the matched
  / missing skills**, so a recruiter sees the reason and not just the number.
- Nothing is auto-rejected. There is no "reject below 40" feature and we should
  not add one.
- Scoring is **deterministic** (see `01-ARCHITECTURE.md`) so a given resume and
  job always produce the same number, and a change in ranking is traceable to a
  model or weight change rather than to model temperature.

If this ever moved past an internal demo, an adverse-impact analysis over a
labelled dataset would be the first thing needed, not a feature.

## Follow-ups (explicitly after v1)

- Async screening with a job queue and progress polling.
- GridFS or object storage for PDFs instead of a bind mount.
- Refresh tokens + logout.
- OCR fallback for scanned resumes.
- Per-section weighting (experience worth more than education).

## Glossary

| Term | Meaning here |
|---|---|
| **Job** | A posting: title, description text, required-skills list. Owned by a recruiter. |
| **Resume** | One uploaded PDF plus its extracted text, attached to exactly one job. |
| **Screening** | The stored result of scoring one resume against one job. One row per (job, resume). |
| **Score** | Integer 0–100. `0.7 × semantic similarity + 0.3 × skill overlap`, rounded. |
| **Semantic score** | Cosine similarity between the job-description embedding and the best-matching resume section. |
| **Skill score** | Fraction of the job's required skills found in the resume text. |
| **Summary** | 2–3 sentences written by a local language model. Advisory text only — it never affects the score. |
| **Candidate** | How the UI refers to a resume + its screening result together. Not a separate collection. |

## Who owns what

| Area | Owner |
|---|---|
| `ai-service` — scoring, embeddings, summarization | Moayad |
| `web` — recruiter dashboard | Moayad |
| `api-service` — auth, upload, PDF parsing, orchestration | Marwan |
| Database schema, Docker Compose | Marwan |
| API contract, CI | Both — changes need both approvals |

## Doc index

| Doc | What's in it |
|---|---|
| [01-ARCHITECTURE.md](01-ARCHITECTURE.md) | Services, boundaries, request flows |
| [02-DATA-MODEL.md](02-DATA-MODEL.md) | Collections, fields, indexes |
| [03-API-CONTRACT.md](03-API-CONTRACT.md) | Every endpoint. Source of truth. |
| [04-AI-SERVICE.md](04-AI-SERVICE.md) | Scoring algorithm, model, summarization |
| [05-API-SERVICE.md](05-API-SERVICE.md) | Spring Boot service spec |
| [06-WEB-DASHBOARD.md](06-WEB-DASHBOARD.md) | Frontend spec |
| [07-LOCAL-DEV.md](07-LOCAL-DEV.md) | Setup, ports, env vars, troubleshooting |
| [08-TESTING.md](08-TESTING.md) | Test strategy and fixtures |
| [09-CI.md](09-CI.md) | GitHub Actions |
| [10-TEAM-WORKFLOW.md](10-TEAM-WORKFLOW.md) | Branches, commits, PR review |
