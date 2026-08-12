# Testing

Not aiming for a coverage number. Aiming to cover the things that will actually
break: the scoring maths, the parse-status branches, the ownership check, and
the contract between the two services.

## What each layer is responsible for

| Layer | Tool | Covers |
|---|---|---|
| `ai-service` unit | pytest | Sectioning, skill matching, score composition, degradation |
| `ai-service` API | pytest + TestClient | Status codes, envelope shape, auth |
| `api-service` unit | JUnit 5 + Mockito | Services in isolation |
| `api-service` integration | Testcontainers + WireMock | Real Mongo, stubbed `ai-service` |
| `web` unit | Vitest + Testing Library | Component states |
| `web` API | MSW | The client, error mapping, 401 handling |

No end-to-end browser tests. At this size they'd cost more than they catch;
the seed script (`./scripts/seed.sh`) is the manual smoke test.

## Fixtures

`docs/fixtures/` — shared by both services so we're testing against the same
inputs.

```
docs/fixtures/
├── jobs/
│   ├── backend-engineer.json      # Java/Spring/Mongo, 5 required skills
│   └── data-analyst.json          # SQL/Python/Tableau, 4 required skills
└── resumes/
    ├── strong-backend.txt         # should score high on backend-engineer
    ├── partial-backend.txt        # some overlap, missing several skills
    ├── career-changer.txt         # relevant education, little experience
    ├── unrelated-designer.txt     # should score low on both
    └── minimal.txt                # ~40 words, tests the short-input path
```

Text files, not PDFs, so `ai-service` tests don't need PDF parsing and diffs stay
readable. `api-service` keeps three small real PDFs under
`src/test/resources/pdfs/` for its parsing tests: a normal text PDF, a scanned
image-only PDF (→ `EMPTY`), and a deliberately corrupt file (→ `FAILED`).

Fixtures are invented, not real resumes. Don't put anyone's actual CV in the
repo.

## Testing the scoring — the important part

**Assert relative ordering and bands. Never assert an exact score.**

Embedding output shifts with `torch` and `sentence-transformers` versions, and
with hardware. `assert score == 82` passes on your laptop and fails in CI for
reasons that have nothing to do with your change. Chasing that number is how a
test suite becomes something people skip.

What actually holds:

```python
def test_relevant_resume_outranks_unrelated(score_all):
    results = score_all("backend-engineer", ["strong-backend", "unrelated-designer"])
    assert results["strong-backend"].score > results["unrelated-designer"].score


def test_strong_match_lands_in_a_high_band(score_all):
    r = score_all("backend-engineer", ["strong-backend"])["strong-backend"]
    assert r.score >= 60          # a band, not a point


def test_ordering_is_stable_across_runs(score_all):
    first = [r.resume_id for r in score_all("backend-engineer", ALL).ranked()]
    second = [r.resume_id for r in score_all("backend-engineer", ALL).ranked()]
    assert first == second        # determinism is a real guarantee we make
```

The ordering test is the one that catches genuine regressions. If a change makes
the designer outrank the backend engineer, something is broken regardless of the
absolute numbers.

### Things worth a targeted test

| Case | Why |
|---|---|
| Skill matching on word boundaries | "r" must not match inside "experience", "go" not inside "algorithm". This is the classic bug. |
| Skills with punctuation | `c++`, `c#`, `.net`, `node.js` need regex escaping. |
| Alias resolution | `js` ↔ `javascript`, both directions. |
| Empty `requiredSkills` | `skillScore` is 0.0, no divide-by-zero. |
| Resume with no recognized headings | Falls back to fixed-size chunking. |
| Very short resume (`minimal.txt`) | No crash, no chunk-under-20-words wipeout leaving zero chunks. |
| Max-pool, not mean | Add irrelevant text to a strong resume; the score must not collapse. |
| Score bounds | Never below 0, never above 100, always an integer. |
| One bad resume in a batch | Batch still returns, bad one scores 0. |

The max-pool test deserves a note — it encodes an actual design decision from
[04-AI-SERVICE.md](04-AI-SERVICE.md):

```python
def test_irrelevant_section_does_not_dilute_the_score(score_all):
    base = score_all("backend-engineer", ["strong-backend"])["strong-backend"].score
    padded = score_one("backend-engineer", STRONG_BACKEND_TEXT + "\n\nINTERESTS\n" + HOBBIES * 5)
    assert padded.score >= base - 5    # small drift is fine, collapse is not
```

## Stub Ollama

Never hit a real model in tests. It's slow, and its output changes, which makes
tests flaky in a way that teaches people to ignore failures.

Use `respx` to stub the HTTP call, and cover every degradation branch — they're
the whole point of that code:

```python
@pytest.mark.parametrize("failure,expected", [
    (httpx.ConnectError("refused"),    "ollama_unreachable"),
    (httpx.ReadTimeout("timeout"),     "ollama_timeout"),
])
def test_summarize_degrades_without_raising(respx_mock, failure, expected):
    respx_mock.post("/api/generate").mock(side_effect=failure)
    r = client.post("/summarize", json=VALID_BODY, headers=AUTH)
    assert r.status_code == 200          # 200, not 5xx — this is the contract
    assert r.json()["degraded"] is True
    assert r.json()["degradedReason"] == expected
    assert r.json()["summary"] is None
```

Also test the model returning prose around its JSON, and a code-fenced response —
both happen with small models, and the fence-stripping is easy to regress.

## api-service

### Unit

Plain JUnit + Mockito. `ScreeningService` with a mocked `AiClient` is where the
orchestration logic lives:

- Scoring fails → nothing is written to Mongo, 503 surfaces.
- Summarize fails → screening still saves, `summaryDegraded: true`, request
  returns 200.
- Zero parsed resumes → `NO_SCOREABLE_RESUMES`, `ai-service` is never called.
- Over the cap → `BATCH_TOO_LARGE`, `ai-service` is never called.

### Integration

`@SpringBootTest` + Testcontainers Mongo + WireMock. A real database, because
the upsert-on-`(jobId, resumeId)` behaviour is a database guarantee — mocking the
repository would test nothing.

```java
@Testcontainers
@SpringBootTest(webEnvironment = RANDOM_PORT)
class ScreeningIntegrationTest {
    @Container
    static MongoDBContainer mongo = new MongoDBContainer("mongo:7");

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.data.mongodb.uri", mongo::getReplicaSetUrl);
    }
}
```

Must-have cases:

| Test | Why |
|---|---|
| **Recruiter A cannot read recruiter B's job, resumes, or candidates** | The most likely real security bug here. Expect 403, not 404. |
| Re-screening upserts | Screen twice, assert exactly one `screenings` document for the pair, with the newer `scoredAt`. |
| Expired token → 401 in our envelope | Not Spring's default HTML page. |
| Malformed token → 401, not 500 | |
| Non-PDF rejected by magic bytes | Rename a `.docx` to `.pdf` — it must still be rejected. |
| Oversized file → 413 in our envelope | |
| Upload with a path-traversal filename (`../../etc/passwd.pdf`) | File lands under the job directory; `originalFilename` is stored as data only. |
| Scanned PDF → `EMPTY`, document still created | The record must not vanish. |
| Corrupt PDF → `FAILED`, document still created | |
| Password hash never appears in any response | Grep the serialized body. |

### Controllers

`@WebMvcTest` with mocked services for status codes and envelope shape. Fast,
and it catches the error-mapping mistakes that integration tests bury.

## web

MSW intercepts at the network layer, so components are tested through the real
client rather than around it.

- Every table row state: screened, unscreened, `EMPTY`, `FAILED`.
- Degraded summary → the "scoring was not affected" note renders.
- 401 → token cleared, redirect to `/login`.
- Loading and empty states render (the states most often skipped).
- Error state shows the message and the `traceId`.
- Long screening → the button stays disabled and doesn't time out early.

Charts: assert that the right data is passed to the chart component, not the
rendered canvas. Testing Chart.js's rendering is testing Chart.js.

## Contract drift

The failure this project is most exposed to: `ai-service` changes a field name
and `api-service` finds out at runtime, three days later.

Two cheap guards:

1. **Response validation in `ai-service` tests.** Validate real responses against
   `docs/contracts/ai-service.openapi.yaml`. A renamed field fails the suite
   rather than the integration.
2. **WireMock stubs are copied from the contract examples**, not written from
   memory. If `api-service`'s stub of `/score` doesn't match what `ai-service`
   actually returns, both suites pass and the system is still broken.

CI also fails a PR that changes endpoints without touching the contract — see
[09-CI.md](09-CI.md). That catches the intent, not the shape.

## Running

```bash
cd ai-service && ruff check . && pytest -q
cd api-service && ./mvnw -B verify          # needs Docker for Testcontainers
cd web && npm run lint && npm run test
```

Run yours before opening a PR. CI runs all three.

## Deliberately not tested

- Chart.js rendering.
- Spring Security's own filter chain — only our configuration of it.
- Ollama output quality. Not a property we can assert; that's what the fixture
  review is for.
- PDFBox's parsing of arbitrary PDFs. We test our three status branches, not
  the library.
