# Fixtures

Shared test inputs, so both services score against the same text and we can
compare results directly.

```
jobs/         two job descriptions
resumes/      five resume texts, spanning strong match to no match
*.json        ready-made request bodies for the curl smoke tests
```

Resumes are plain text rather than PDF: `ai-service` never sees a PDF, and text
diffs are readable in review. `api-service` keeps its own small PDFs under
`src/test/resources/pdfs/` for the parsing branches (normal, scanned, corrupt).

**These are invented.** Nobody's real CV goes in this repo.

## Expected behaviour on `backend-engineer`

Not exact scores — those shift with library versions. This is the **ordering**
that must hold, and it's what the tests assert:

```
strong-backend  >  partial-backend  >  career-changer  >  unrelated-designer
```

`minimal.txt` isn't in the ordering. It's there to prove that a ~40-word resume
produces a valid result instead of crashing or yielding zero chunks.

On `data-analyst`, `unrelated-designer` should still come last, and
`career-changer` should move up relative to the backend roles — a fixture set
that only ever ranks one way isn't testing much.

## Adding fixtures

Keep them realistic in shape: section headings, dates, a mix of prose and bullet
lists. A fixture that's a bare keyword list makes the scorer look better than it
is, and hides exactly the sectioning bugs these are meant to catch.
