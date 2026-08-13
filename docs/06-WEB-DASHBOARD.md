# web — recruiter dashboard

React 18 · Vite · TypeScript · Chart.js. Owner: **Moayad**.

Talks only to `api-service`. It has no knowledge that `ai-service` exists —
see the boundary rules in [01-ARCHITECTURE.md](01-ARCHITECTURE.md).

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite 6 | Fast dev server, no config to fight. |
| Language | TypeScript, `strict: true` | The API types are the whole app; losing them defeats the point. |
| Routing | React Router 7 | |
| Server state | TanStack Query 5 | Caching, refetch, loading/error states we'd otherwise hand-roll badly. |
| Charts | Chart.js 4 + react-chartjs-2 | |
| Styling | CSS Modules | No framework. This is four screens. |
| Tests | Vitest + Testing Library + MSW | See [08-TESTING.md](08-TESTING.md). |

No component library. Four screens don't justify the dependency, and hand-writing
the table is faster than configuring someone else's.

Versions are chosen by `npm audit`, not by preference — React Router 7 rather
than 6, and current Vite/Vitest, because the older pins carried advisories. Run
`npm audit` before adding or bumping anything; a stale pin is a finding, not a
stability win.

### Developing without the API

`VITE_USE_MOCKS=true` (the default in `.env.development`) starts MSW in the
browser with the same handlers the tests use, so the dashboard runs against
stubbed contract examples before `api-service` exists. Set it to `false` to hit
the real API. Because the browser and the test suite share one set of handlers,
they cannot drift apart.

## Layout

```
web/
├── src/
│   ├── main.tsx
│   ├── App.tsx                    # routes
│   ├── api/
│   │   ├── client.ts              # fetch wrapper, auth header, error mapping
│   │   ├── types.ts               # generated from the OpenAPI spec
│   │   └── queries.ts             # TanStack Query hooks
│   ├── auth/
│   │   ├── AuthContext.tsx
│   │   └── RequireAuth.tsx        # route guard
│   ├── pages/
│   │   ├── LoginPage.tsx
│   │   ├── JobListPage.tsx
│   │   ├── JobDetailPage.tsx      # the main screen
│   │   └── CandidateDetailPage.tsx
│   ├── components/
│   │   ├── CandidateTable.tsx
│   │   ├── ScoreBadge.tsx
│   │   ├── SkillChips.tsx
│   │   ├── UploadDropzone.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   └── charts/
│   │       ├── ScoreDistribution.tsx
│   │       ├── TopCandidates.tsx
│   │       └── SkillCoverage.tsx
│   └── styles/
├── index.html
├── vite.config.ts
├── tsconfig.json
└── package.json
```

## Types come from the spec

Don't hand-write `src/api/types.ts`. Generate it:

```bash
npx openapi-typescript ../docs/contracts/api-service.openapi.yaml -o src/api/types.ts
```

Committed, and regenerated whenever the contract changes (there's an npm script:
`npm run gen:types`). Hand-writing these types is how the frontend ends up
believing in a field the backend doesn't send.

## Routes

| Path | Page | Auth |
|---|---|---|
| `/login` | LoginPage | public |
| `/jobs` | JobListPage | required |
| `/jobs/:jobId` | JobDetailPage | required |
| `/candidates/:resumeId` | CandidateDetailPage | required |
| `/` | redirect → `/jobs` | |

`RequireAuth` wraps the protected routes and redirects to `/login`, preserving
the attempted path so login returns there.

## API client

`src/api/client.ts` is the only place `fetch` is called.

- Base URL from `import.meta.env.VITE_API_BASE_URL`.
- Attaches `Authorization: Bearer <token>` when a token exists.
- Parses the error envelope from [03-API-CONTRACT.md](03-API-CONTRACT.md) into a
  typed `ApiError { code, message, traceId, status }`. Components branch on
  `code`, never on message text.
- **On 401: clear the token and redirect to `/login`.** The 24-hour expiry means
  this happens daily, and without handling it the app shows an infinite spinner.
- Non-JSON error responses (a proxy 502, an HTML error page) still produce an
  `ApiError` with `code: 'INTERNAL_ERROR'` so callers have one shape to handle.

### Token storage

`localStorage`, read into `AuthContext` at boot.

This is XSS-vulnerable in principle — any injected script can read it. The proper
answer is an httpOnly cookie, which needs CSRF protection and a same-site story
that the local Compose setup doesn't have. We took the simpler option knowingly
for a local tool. Worth writing down rather than pretending it's fine.

### Timeouts

The default fetch has no timeout, and screening can legitimately run for over a
minute. Use an `AbortController`:

- normal requests: 30 s
- `POST /api/jobs/{id}/screen`: **180 s**

A screen that aborts at 30 s looks like a broken backend when it's actually still
working.

## Screens

### LoginPage

Email + password, with a register toggle on the same page. On success, store the
token and navigate to the attempted path or `/jobs`.

`INVALID_CREDENTIALS` → "Email or password is incorrect." Don't split it into
"no such user" / "wrong password", even though it would be friendlier — the
backend deliberately doesn't tell us which, for the reason in
[05-API-SERVICE.md](05-API-SERVICE.md).

### JobListPage

Cards or rows: title, location, `resumeCount`, `screenedCount`, created date.
A "New job" form (title, description, required skills as a chip input).

Empty state: "No jobs yet — create one to start screening." Not a blank page.

### JobDetailPage — the main screen

Sections, top to bottom:

1. **Header** — title, location, required-skill chips, "Screen all" button.
2. **Upload** — drag-and-drop plus a file picker. Client-side check for PDF
   extension and 5 MB before sending, so obvious mistakes don't cost a round
   trip. The server checks properly regardless; the client check is courtesy,
   not enforcement.
3. **Charts row** — three charts, below.
4. **Candidate table** — the ranked list.

**Screen button behaviour.** Disabled while running, with a determinate-looking
progress message ("Screening 12 resumes… this can take a minute"). Because the
request is synchronous there's no progress to poll, so don't fake a percentage —
say what's happening and roughly how long. On completion, invalidate the
candidates query and show a toast: `screened`, `skipped`, and, if
`summariesDegraded > 0`, "N summaries unavailable (the local model didn't
respond)".

Disable the button when `resumeCount == 0`, and surface `NO_SCOREABLE_RESUMES`
as "None of the uploaded files had readable text" — pointing at the unreadable
rows in the table.

### CandidateDetailPage

Score, the semantic/skill breakdown, matched and missing skill chips, the
summary, strengths, concerns, and the file metadata.

When `screening.summaryDegraded` is true, show the score normally and put a
subdued note where the prose would be: "Summary unavailable — scoring was not
affected." That last clause matters. A recruiter seeing a blank summary should
not doubt the number next to it.

## Candidate table

Columns: rank, name, score, matched-skill count, missing-skill count, status,
uploaded date. Sortable by score, name, upload date — the server does the
sorting, via the `sort` and `order` query params.

Row states:

| Condition | Rendering |
|---|---|
| `screening != null` | Normal row, score badge, rank number. |
| `screening == null`, `parseStatus == PARSED` | Muted row, "Not screened yet", no rank. Sorts last. |
| `parseStatus == EMPTY` | Muted row, "No readable text — likely a scanned PDF". Not screenable. |
| `parseStatus == FAILED` | Muted row, "Could not read this file". Not screenable. |

Unreadable resumes stay visible. Hiding them is how a candidate silently
disappears, and the recruiter is the only one who can fix it (by asking for a
different file).

`ScoreBadge` colours by band — 80+, 60–79, 40–59, below 40 — but always shows the
number, and pairs colour with a text label so it doesn't rely on colour alone.
Keep the bands from reading as verdicts: no red/green pass-fail styling. The
score is one signal, and [00-PROJECT-BRIEF.md](00-PROJECT-BRIEF.md) explains why
we're careful about that.

## Charts

All three read from the already-loaded candidates page — no extra endpoints. Set
`maintainAspectRatio: false` inside a fixed-height container, or Chart.js grows
without bound in a flex layout.

### ScoreDistribution — bar

Counts per 10-point bucket. Shows shape: whether the pile is genuinely
differentiated or everything clustered at 55.

### TopCandidates — horizontal bar

Top 10 by score, name on the y-axis. Click a bar → candidate detail. This is the
chart people actually look at.

### SkillCoverage — radar

One axis per required skill, plotting the percentage of candidates who have it.
Answers a different question from the others: not "who is best" but "is this
requirement realistic". A skill at 5% coverage usually means the JD asks for
something the market doesn't have.

Cap the radar at 8 skills (the highest-variance ones) — beyond that the labels
overlap into mush.

## UI states

Every data-driven view needs all four. This is the checklist that gets skipped:

| State | Requirement |
|---|---|
| **Loading** | Skeleton rows or a spinner. Never a blank screen, never a layout that jumps when data lands. |
| **Empty** | An explanation and the next action. "No candidates yet — upload resumes to get started." |
| **Error** | The message, plus a retry button. Show `traceId` in small text — it's how we find the log. |
| **Partial** | Some rows screened, some not; some summaries degraded. This is the **normal** state, not an edge case, and it's the one most likely to be forgotten. |

## Accessibility

Not exhaustive, but non-negotiable at this size:

- Every chart has a text alternative — the candidate table already conveys the
  same data, so `aria-hidden` on the canvas plus a caption pointing at the table
  is honest and sufficient.
- Score is never communicated by colour alone.
- Upload dropzone is keyboard-reachable and has a real `<input type="file">`
  behind it. Drag-and-drop as the only path excludes keyboard users.
- Focus visible on all interactive elements. Don't remove the outline without
  replacing it.

## Environment

Vite only exposes `VITE_`-prefixed variables to the client, and they are **inlined
into the bundle**. Nothing secret goes in a `VITE_` variable — there is no such
thing as a private one.

```
VITE_API_BASE_URL=http://localhost:8080
```

## Local run

```bash
cd web
npm install
npm run dev        # http://localhost:5173
```

Scripts: `dev`, `build`, `preview`, `lint`, `test`, `gen:types`.

## TODO

- [ ] Editing `candidateName` when extraction guesses wrong. The API doesn't
      support it yet — needs a contract change first.
- [ ] Decide whether the charts should reflect the current page or the whole job.
      Currently the page, which is misleading past 20 candidates.
