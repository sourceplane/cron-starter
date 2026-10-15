# Epic: cron-starter (CR)

**Vercel's Cron Jobs example is seven schedules and two API routes: a cron requests `/api/cron/<interval>`, which records the newest Hacker News story and the run time in KV; the page polls `/api/data/<interval>` and shows how long ago each interval last ran. On Cloudflare the seven schedules are Cron Triggers on the one Worker, a `scheduled` handler turns the expression that fired back into the request Vercel used to make, and the record lives in Workers KV — the namespace from Terraform through Orun, its id reaching the Worker through the Cirrus baseline's wiring documents. The routes and the page do not change; what calls the routes on schedule, and where they write, does.**

The port keeps the template's pages, API routes, component, styles and `@vercel/examples-ui` chrome. It adds `lib/kv.ts` (the `@vercel/kv` `set`/`get` surface over the `KV` binding, so the routes change only their import), a custom Worker entry that re-exports `@opennextjs/cloudflare`'s fetch handler and adds `scheduled`, the cron-to-interval table, the Workers build, the monorepo wrapper, a test package that exercises the table, the scheduled handler, the KV shim and the two routes against mocks, the KV Terraform root, and the deploy contract. `@vercel/analytics` becomes the Cloudflare Web Analytics beacon.

## Status

| Field | Value |
|-------|-------|
| Status | ✅ Shipped — CR0–CR3 landed (#1–#4); CR4 — a baseline, in one landing (CR-5); KV apply, live deploy and triggers on Cloudflare's clock proven only by a live bootstrap |
| Cluster | **CR** (CR0–CR4) |
| Owner(s) | `apps/web` (the page, the routes, the worker entry) · `tests/web` · `infra/terraform/cloudflare-kv` |
| Builds on | `cirrus-baseline` conventions: the `cloudflare-kv` root and the `@@wiring(...)@@` deploy-time render; `kv-redis-starter`'s shape for a KV-bound Next app |
| Upstream | [vercel/examples `solutions/cron`](https://github.com/vercel/examples/tree/main/solutions/cron) |
| Changes | What runs the routes on schedule (Vercel Cron → Cron Triggers through a custom worker entry), where they write (Vercel KV → Workers KV behind `lib/kv.ts`), analytics (beacon), the Workers build, tests, the KV root and the deploy contract; page copy says Cron Triggers and Workers KV |
| Decisions locked | (1) One Worker: the triggers sit on the Next Worker and the scheduled handler calls the OpenNext fetch handler in-process with a synthetic request — not a second Worker calling the routes over HTTP. (2) The routes stay as written: `lib/kv.ts` mirrors `kv.set`/`kv.get` (JSON values, `"OK"` from `set`). (3) `wrangler.jsonc` is rendered per environment from the wiring document — and, since CR4, committed as the fixture render, because the deploy lane checks it exists before the build (risk CR-H). (4) The seven schedules are the template's, verbatim, in `triggers.crons` and in `lib/crons.ts`; a test holds the two together. (5) CR4: one landing — the plan, not a landing boundary, orders the namespace before the Worker; the deploy's smoke reads a run the every-minute trigger recorded. |
| Gate | CR1 is the first user-visible rung. CR2 applies only with a linked workspace; it is verified by `terraform validate`. |
| Shipped as | `main` after [#4](https://github.com/sourceplane/cron-starter/pull/4); verified locally under `wrangler dev --test-scheduled` with a local namespace |

## Read order

1. `design.md` — what maps to what, the scheduled flow, the wiring flow, what is out of scope, the alternative rejected
2. `implementation-plan.md` — the milestones and what "done" means for each
3. `risks-and-open-questions.md` — what could go wrong and what was decided
4. `IMPLEMENTATION-STATUS.md` — what actually shipped (kept distinct from intent)

## Milestones at a glance

| Milestone | What it lands | Done when |
|---|---|---|
| CR0 — the spec | this doc set and the task contracts | merged on `main` |
| CR1 — the crons on Workers | `apps/web` (routes, `lib/`, `worker.ts`, the wrangler template + fixture), `tests/web` | `wrangler dev --test-scheduled` runs a trigger through the route and the page reads it back; Checks green |
| CR2 — the KV namespace from Terraform | `infra/terraform/cloudflare-kv` | the root validates; the wiring keys match the template |
| CR3 — ready to instantiate | README, as-built status | a reader can run, test, preview, fire a trigger and deploy it |
| CR4 — a baseline, in one landing | card, build document, rename, bootstrap tooling, tests | a new product goes from nothing to live in one landing, the KV namespace applied before the Worker, its smoke on a recorded run; Baseline CI green |
