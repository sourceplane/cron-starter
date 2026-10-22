# cron-starter — where this repository stands

The entry page for anyone (or any agent) picking this repository up. It is
this repository's own state and does not ship to a product built from it; the
two pages that do are [operations.md](operations.md) and
[deployment.md](deployment.md).

## What it is

Vercel's Cron Jobs example on Cloudflare Workers + Static Assets through
`@opennextjs/cloudflare`: one every-minute Cron Trigger per Worker whose
`scheduled` handler runs the template's seven schedules as the requests Vercel
used to make, the records in a Workers KV namespace. Packaged as an Orun
baseline: `orun new --blueprint repo-blueprint.yaml` builds a new product in
its own repository and takes it to live on stage and prod in one landing
(`01-product`) — the KV namespace applied before the Worker that binds it,
the deploy's smoke reading a run the trigger recorded — then records what
went live (`02-docs`).

## Release

| | |
|---|---|
| Latest tag | `baseline-v3` (CR6 — the domain is set later, [#8](https://github.com/sourceplane/cron-starter/pull/8): the console asks for no domain, and a site is born with the placeholder `<reponame>.example.com` for an owner to replace); `baseline-v2` is CR5 (the cirrus standard, [#6](https://github.com/sourceplane/cron-starter/pull/6) and [#7](https://github.com/sourceplane/cron-starter/pull/7)), `baseline-v1` CR4 ([#5](https://github.com/sourceplane/cron-starter/pull/5)) |
| Proven live | No. Everything short of the platform is proven offline in Baseline CI, the trigger fired by hand at crafted times; the token minted, a real KV apply, a real deploy registering its trigger and the trigger firing on Cloudflare's clock are still to come (risk CR-K) |

## Where to read

| Question | Page |
|---|---|
| What shipped, and every departure from upstream | `specs/epics/cron-starter/IMPLEMENTATION-STATUS.md` |
| Why it is built this way | [decisions.md](decisions.md), then `specs/epics/cron-starter/design.md` |
| What could still go wrong | [open-risks.md](open-risks.md), then `specs/epics/cron-starter/risks-and-open-questions.md` |
| How to instantiate it | `BOOTSTRAP.md`, `docs/phases/` |
| What each component is | `apps/web/docs/`, `infra/terraform/cloudflare-kv/docs/`, `tests/web/docs/` (generated; `python3 tooling/catalog/gen-component-docs.py`) |

## Next

1. Bootstrap one product from `baseline-v3` against a workspace and record
   its timings, including how long the first trigger took to fire (closes
   CR-K).
