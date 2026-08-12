# Team workflow

Two people, one repo, two halves of one system. The rules below exist to stop
the halves from drifting apart.

## Ownership

| Path | Owner |
|---|---|
| `ai-service/` | Moayad |
| `web/` | Moayad |
| `api-service/` | Marwan |
| `docker-compose.yml`, `mongo-init/`, `scripts/` | Marwan |
| `docs/03-API-CONTRACT.md`, `docs/contracts/` | **Both** |
| `.github/`, root config | **Both** |

Don't edit outside your half. If your task seems to need a change on the other
side, that's a conversation and probably a contract change — not a quick fix in
someone else's directory. You'll both lose an afternoon to the merge conflict
you save five minutes on.

Reviewing the other person's code is expected. Editing it without asking isn't.

## Branches

```
<name>/<short-description>

moayad/scoring-endpoint
moayad/candidate-table
marwan/jwt-auth
marwan/pdf-parsing
```

One branch per task from [`docs/tasks/`](tasks/). Branch from `main`, keep it
short-lived — a branch open for a week is a merge conflict with a countdown.

`main` is protected: no direct pushes, no force pushes.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/) with a service scope.

```
feat(ai-service): add cosine similarity scoring endpoint
fix(api-service): return 403 instead of 404 for another user's job
docs: document the parse status branches
test(web): cover the degraded summary state
chore(ai-service): pin sentence-transformers to 3.3.1
refactor(api-service): move ownership check into the service layer
```

- Imperative mood ("add", not "added"). Under ~70 characters.
- Body only when the *why* isn't obvious from the subject. Explain the reason,
  not the diff — the diff is right there.
- Commit in small logical units. One commit touching all three services means
  the work was scoped wrong.
- Reference an issue when there is one: `Closes #14`.

Don't commit commented-out code, `console.log`, `System.out.println`, or a
`.env`.

## Pull requests

Every change goes through one. Even a typo fix — it's thirty seconds and it keeps
`main` reviewable.

The template is in [`.github/pull_request_template.md`](../.github/pull_request_template.md).
Keep PRs under ~400 lines of diff where you can. Past that, review quality drops
off a cliff and you get an approval that means nothing.

### Contract changes need both approvals

Any PR touching `docs/03-API-CONTRACT.md` or `docs/contracts/` needs both of us
to approve, because it changes what the other side is building against. This is
the one rule with no exceptions.

Order of operations: **change the contract, get it merged, then implement.** Not
the other way round.

## Review checklist

Read the diff against the contract, not just for style.

**Correctness**
- [ ] Endpoints, fields, and status codes match
      [03-API-CONTRACT.md](03-API-CONTRACT.md) exactly. Casing too.
- [ ] Error responses use the shared envelope and a code from the table — no new
      codes invented in passing.
- [ ] Nothing outside the author's owned directories changed.

**Error handling**
- [ ] No swallowed exceptions. No bare `except:`, no
      `catch (Exception e) {}` that continues as if nothing happened.
- [ ] Failures that should degrade (summarization) degrade; failures that should
      surface (scoring, auth) surface.
- [ ] No internal paths, stack traces, or driver messages in a response body.

**Security**
- [ ] Ownership checked on every job-scoped route — 403, not 404.
- [ ] No secret, token, or password hash in a log line or a response.
- [ ] User input never used as a file path.
- [ ] File type checked by content, not by filename.

**Data**
- [ ] Queries the ranked list can use an index (see
      [02-DATA-MODEL.md](02-DATA-MODEL.md)).
- [ ] Screenings are upserted, not duplicated.
- [ ] No N+1: one query per row is a bug, not a style preference.

**Tests**
- [ ] New behaviour has a test that would fail without the change. If it passes
      on the old code, it isn't testing the change.
- [ ] Scoring tests assert ordering and bands, not exact floats
      ([08-TESTING.md](08-TESTING.md)).
- [ ] No test asserts only "did not throw".
- [ ] A failing test wasn't "fixed" by weakening its assertion.

**Dependencies**
- [ ] Versions pinned. No floating `latest`, no unpinned model revision.
- [ ] New dependency is actually needed — say why in the PR.
- [ ] Lockfile changes are the ones the PR intends, not a wholesale regeneration.

### How to review

Say what's wrong and where. `file.java:88 — this returns 404 for another user's
job; the contract says 403` is a review comment. "Looks good to me" on a
300-line diff isn't.

Separate blocking from non-blocking. Prefix optional suggestions with **nit:**
so the author knows what's required to merge.

If you don't understand a piece of code well enough to review it, say so and ask.
An approval you didn't mean is worse than a slow review.

## Integration order

Both halves need the other to exist before either can be tested end to end. The
way out is stubs, in this order:

1. **Contract and fixtures first** (both). Nothing else starts until
   [03-API-CONTRACT.md](03-API-CONTRACT.md) and the fixture set are merged.
2. **Both build against stubs.** Marwan stubs `ai-service` with WireMock using
   the contract's example responses. Moayad builds `web` against MSW using the
   same examples. Neither waits.
3. **Wire up.** `api-service` → real `ai-service`, `web` → real `api-service`.
4. **Fix the mismatches**, which will exist regardless. Every one is a place the
   contract was ambiguous — fix the contract too, not just the code.

Stubs come from contract *examples*, copied. Writing stubs from memory means both
suites pass while the system is broken.

## When you're blocked

Say so the same day. The most expensive failure mode here isn't a bug, it's one
person quietly waiting on the other for two days.

If you're blocked on the other half, build against a stub and keep going. That's
what step 2 is for.

## Weekly

Once a week, together, twenty minutes:

- Walk `docs/tasks/` and move things.
- Check whether the contract has drifted from reality — CI catches structural
  drift, not the semantic kind.
- Update the TODO sections at the bottom of the service docs. A stale doc is
  worse than a missing one, because someone will trust it.
