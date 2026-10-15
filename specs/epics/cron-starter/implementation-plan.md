# cron-starter — implementation plan

Milestones land in order; each task is one pull request on an
`orun/CR-n-<slug>` branch with an `Orun-Task: CR-n` trailer.

## CR0 — the spec ✅

This doc set, `epic.yaml` and the task contracts, merged to `main`.

**Done when**
- the five documents and `epic.yaml` are on `main`
- `tasks/CR-1..CR-4.TaskContract.yaml` exist (CR-5 joined with CR4)

## CR1 — the crons on Workers ✅

`apps/web` with the routes over `lib/kv.ts`, the custom worker entry and the
scheduled handler, the wrangler template (triggers + the KV token) + fixture,
`tests/web`.

**Done when**
- `pnpm install && pnpm run wire:fixture && pnpm typecheck && pnpm lint && pnpm test && pnpm build` is green locally and in `Checks`
- `wrangler dev --test-scheduled` answers `/` with "Cron Triggers on Cloudflare", `/api/data/1m` with `{}` before any run, `GET /__scheduled?cron=*+*+*+*+*` runs `/api/cron/1m`, and `/api/data/1m` then carries `fetchedAt`; `/nope` is a 404
- the tests cover the cron→interval table (and that it equals `triggers.crons`), the scheduled handler's request, `lib/kv.ts` over a mocked namespace, and both routes with mocked KV and Hacker News — no network

## CR2 — the KV namespace from Terraform ✅

`infra/terraform/cloudflare-kv` (component + terraform), validated.

**Done when**
- `terraform validate` passes on the root
- the wiring keys the root outputs (`app_kv_id`) are the ones the template's token names

## CR3 — ready to instantiate ✅

README (run, test, preview, fire a trigger, deploy; the schedules table),
`IMPLEMENTATION-STATUS.md`, epic `completed`.

**Done when**
- the README quick start works from a fresh clone
- the status file lists every PR and departure

## CR4 — a baseline, in one landing ✅

`blueprint.yaml`, `repo-blueprint.yaml` (two phases: `01-product`,
`02-docs`), `.baseline/` (identity, task contracts, the product's README),
`tooling/rebrand`, `tooling/bootstrap`, `hooks/render-deployment-docs.sh`,
`ai/context/`, `docs/phases/`, `BOOTSTRAP.md`, `testing/`, `baseline.yml`
and `tag.yml` (design §8); and what the product needed to deploy from a
fresh repository: `wrangler.jsonc` committed, dev rendering the fixture,
`apps/web`'s enforced `dependsOn: cloudflare-kv` on main, `packages/`, a
smoke on a recorded run, the `lib/site.ts` seam and an absolute Open Graph
image from the request.

**Done when**
- orun at the bootstrap floor (v2.58.11), the lane pin (v2.78.4) and the
  current CLI (v2.79.0) reads `repo-blueprint.yaml`, and
  `testing/manifest.test.sh` holds the card to it
- the product's own push-to-main plan applies `cloudflare-kv` before it
  deploys `web` on stage and prod (`testing/placement.test.sh`)
- `Baseline CI` is green: the contract tests, the wiring path, the leak gate,
  the offline bootstrap and the end-to-end tier — which fires every schedule
  through the scheduled handler in the built Worker and reads each record
  back
- the status file records what is proven offline and what only a live
  bootstrap can prove

## After CR4 (outside this repository)

1. Cut `baseline-v1` with `tag.yml` from the merged `main`.
2. Register the row in orun-cloud's `infra/baselines-registry/baselines.yaml`
   (unlisted) with the card vendored at the tag.
3. Bootstrap one product from the tag against a workspace whose Cloudflare
   account is on Workers Paid; record its timings and how long the first
   trigger took to fire; then flip the row to public with a page on
   orunbase.com.

## Sequencing note

CR1's component already names the root's wiring secret; CR2 makes the name
true. Applying CR2 needs a workspace with a Cloudflare connection; until
then the Orun lane plans nothing (`ws_CHANGE_ME`) and `Checks` is the merge
gate. The triggers register on the first real deploy — nothing fires until
then. CR4 packages CR1–CR2 as a baseline whose one landing applies CR2's
root before it deploys CR1's Worker.
