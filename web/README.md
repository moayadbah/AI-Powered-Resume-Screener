# web

Recruiter dashboard. React 18 · Vite · TypeScript · Chart.js.

Talks only to `api-service`.

**Spec: [../docs/06-WEB-DASHBOARD.md](../docs/06-WEB-DASHBOARD.md).**

## Run

```bash
npm install
npm run dev        # http://localhost:5173
```

Needs `VITE_API_BASE_URL` (see `../.env.example`). Vite inlines `VITE_`
variables into the bundle at build time — nothing secret goes in one.

## Types

`src/api/types.ts` is generated from the OpenAPI spec, not hand-written:

```bash
npm run gen:types
```

Regenerate and commit whenever the contract changes. CI fails if it's stale.

```bash
npm run lint && npx tsc --noEmit && npm run test
```

Not implemented yet — see [task list A9–A13](../docs/tasks/INTERN-A-MOAYAD.md).
