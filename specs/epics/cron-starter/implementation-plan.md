# cron-starter — implementation plan

Milestones land in order; each task is one pull request on an
`orun/CR-n-<slug>` branch with an `Orun-Task: CR-n` trailer.

## CR0 — the spec ✅

This doc set, `epic.yaml` and the task contracts, merged to `main`.

**Done when**
- the five documents and `epic.yaml` are on `main`
- `tasks/CR-1..CR-4.TaskContract.yaml` exist

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

## Sequencing note

CR1's component already names the root's wiring secret; CR2 makes the name
true. Applying CR2 needs a workspace with a Cloudflare connection; until
then the Orun lane is gated and `Checks` is the merge gate. The triggers
register on the first real deploy — nothing fires until then.
