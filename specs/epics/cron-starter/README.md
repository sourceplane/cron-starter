# Epic: cron-starter (CR)

**Vercel's Cron Jobs example is seven schedules and two API routes: a cron requests `/api/cron/<interval>`, which records the newest Hacker News story and the run time in KV; the page polls `/api/data/<interval>` and shows how long ago each interval last ran. On Cloudflare one Cron Trigger fires the Worker every minute, its `scheduled` handler turns each of the seven schedules due at that minute back into the request Vercel used to make, and the record lives in Workers KV — the namespace from Terraform through Orun, its id reaching the Worker through the Cirrus baseline's wiring documents. The routes and the page do not change; what calls the routes on schedule, and where they write, does.**

The port keeps the template's pages, API routes, component, styles and `@vercel/examples-ui` chrome. It adds `lib/kv.ts` (the `@vercel/kv` `set`/`get` surface over the `KV` binding, so the routes change only their import), a custom Worker entry that re-exports `@opennextjs/cloudflare`'s fetch handler and adds `scheduled`, the cron-to-interval table, the Workers build, the monorepo wrapper, a test package that exercises the table, the scheduled handler, the KV shim and the two routes against mocks, the KV Terraform root, and the deploy contract. `@vercel/analytics` becomes the Cloudflare Web Analytics beacon.

## Status

| Field | Value |
|-------|-------|
| Status | ✅ Shipped — CR0–CR6 landed (#1–#8; CR4 tagged `baseline-v1`, CR5 — the cirrus standard, CR-6 and CR-7 — tagged `baseline-v2`, CR6 — the domain is set later, CR-8 — tagged `baseline-v3`). KV apply, live deploy and the trigger on Cloudflare's clock proven only by a live bootstrap (risk CR-K) |
| Cluster | **CR** (CR0–CR6) |
| Owner(s) | `apps/web` (the page, the routes, the worker entry) · `tests/web` · `infra/terraform/cloudflare-kv` |
| Builds on | `cirrus-baseline` conventions: the `cloudflare-kv` root and the `@@wiring(...)@@` deploy-time render; `kv-redis-starter`'s shape for a KV-bound Next app |
| Upstream | [vercel/examples `solutions/cron`](https://github.com/vercel/examples/tree/main/solutions/cron) |
| Changes | What runs the routes on schedule (Vercel Cron → Cron Triggers through a custom worker entry), where they write (Vercel KV → Workers KV behind `lib/kv.ts`), analytics (beacon), the Workers build, tests, the KV root and the deploy contract; page copy says Cron Triggers and Workers KV |
| Decisions locked | (1) One Worker: the triggers sit on the Next Worker and the scheduled handler calls the OpenNext fetch handler in-process with a synthetic request — not a second Worker calling the routes over HTTP. (2) The routes stay as written: `lib/kv.ts` mirrors `kv.set`/`kv.get` (JSON values, `"OK"` from `set`). (3) `wrangler.jsonc` is rendered per environment from the wiring document — and, since CR4, committed as the fixture render, because the deploy lane checks it exists before the build (risk CR-H). (4) The seven schedules are the template's, verbatim, in `lib/crons.ts` (and, until CR4, in `triggers.crons`); a test holds the trigger and the template together. (5) CR4: one landing — the plan, not a landing boundary, orders the namespace before the Worker; the deploy's smoke reads a run the trigger recorded. (6) CR4: one Cron Trigger per Worker (`* * * * *`), the seven schedules dispatched from its scheduled time — two triggers per product, inside Workers Free's five per account. |
| Gate | CR1 is the first user-visible rung. CR2 applies only with a linked workspace; it is verified by `terraform validate`. |
| Shipped as | `baseline-v3` ([#8](https://github.com/sourceplane/cron-starter/pull/8), CR6: no domain asked), `baseline-v1` ([#5](https://github.com/sourceplane/cron-starter/pull/5)), `baseline-v2` ([#6](https://github.com/sourceplane/cron-starter/pull/6), [#7](https://github.com/sourceplane/cron-starter/pull/7)); proven offline (Baseline CI), deploy gated until a workspace is linked |

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
| CR5 — the cirrus standard | no kiox, generated component docs, the context pack, status that agrees with the tags; the console card reads `subdomain` from the Cloudflare connection | Baseline CI green with the docs check |
| CR6 — the domain is set later | the console asks for no domain; an empty `productdomain` brands the placeholder `<reponame>.example.com` for an owner to replace | Baseline CI green on a fixture with no domain |
