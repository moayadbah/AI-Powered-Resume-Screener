## What

<!-- One or two sentences. What changed and why. -->

## Task

<!-- e.g. A4 from docs/tasks/INTERN-A-MOAYAD.md, or Closes #12 -->

## Contract impact

<!-- Delete whichever doesn't apply. -->

- [ ] No interface change
- [ ] Changes `docs/03-API-CONTRACT.md` and the matching OpenAPI spec
      (**needs both approvals**)

## How I verified

<!-- The command you ran and what came back. Not "it works". -->

```
```

## Checklist

- [ ] Matches [the contract](../docs/03-API-CONTRACT.md) — paths, fields, casing, status codes
- [ ] Errors use the shared envelope and an existing error code
- [ ] Only touched directories I own ([ownership table](../docs/10-TEAM-WORKFLOW.md))
- [ ] Tests added for the new behaviour, and they fail without the change
- [ ] No secrets, tokens, or `.env` committed
- [ ] Dependency versions pinned
- [ ] Docs updated if behaviour changed

## Notes for the reviewer

<!-- Anything you're unsure about, or want a second opinion on. -->
