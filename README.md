# cron-starter

Vercel's [Cron Jobs example](https://github.com/vercel/examples/tree/main/solutions/cron)
— seven cron schedules, each requesting `/api/cron/<interval>` to record the
newest Hacker News story and the run time in KV, and a page that polls
`/api/data/<interval>` to show how long ago each interval last ran — running
on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with the
schedules as **Cron Triggers** on the same Worker and the records in a
**Workers KV** namespace provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun), and packaged as an **Orun
baseline**: one command takes a new product from nothing to live on stage
and prod, in its own repository, under its own name — in ONE landing.

The page and the API routes are the template's; what calls the routes on
schedule, and where they write, is Cloudflare's. What the baseline adds is
everything needed to make a copy of it somebody else's, built the way
[cirrus-baseline](https://github.com/sourceplane/cirrus-baseline) is since
its one-landing bootstrap. See
[`specs/epics/cron-starter`](specs/epics/cron-starter/README.md) for the
design, the milestones and the as-built status.

## Instantiating a product

```bash
git clone --depth 1 --branch <baseline-tag> https://github.com/sourceplane/cron-starter
cd cron-starter
orun new --blueprint repo-blueprint.yaml --out ~/sites/acme-crons --run-hooks --resume \
  --set reponame=acme-crons --set productname="Acme Crons" --set productdomain=acme.dev \
  --set githuborg=acme-inc --set subdomain=<workers-dev-subdomain>
```

Or, once the platform's registry lists it, from the Orun console (Baselines →
`cron-starter` → Build). Two phases: **`01-product`** creates the
repository and lands the whole product as ONE pull request — intent, CI,
tooling, the KV root, the Worker with its page, routes and Cron Trigger,
and its tests — and one convergence applies the KV namespace on stage and
prod and then deploys the Worker with its id, smoke-tested on a run its
every-minute trigger recorded; **`02-docs`** records the live deployment
from probed facts. **[BOOTSTRAP.md](BOOTSTRAP.md)** is the operator guide;
[docs/phases/](docs/phases/README.md) has a page per phase. The Workers
Free plan is enough: the product registers one Cron Trigger per Worker.

The new repository receives the **product only** — the app, its KV root, its
tests, its CI, its tooling, a README of its own and its operating contract —
renamed throughout to the product's name, repository, Cloudflare Worker and
namespace titles. None of this repository's machinery ships.

| What makes it a baseline | Where |
|---|---|
| The console card (inputs, secrets, programme) | `blueprint.yaml` |
| The build document (modules, phases, hooks) | `repo-blueprint.yaml` |
| This tree's identity, and the bootstrap's task contracts | `.baseline/` |
| The rename engine | `tooling/rebrand/rebrand.mjs` |
| The bootstrap's helpers (deferrals, redeploy marker, work-tree strip) | `tooling/bootstrap/` |
| The deployment-record renderer | `hooks/render-deployment-docs.sh` |
| The product's README and context pack | `.baseline/product/README.md`, `ai/context/` |
| The baseline's tests: contract, wiring, leak, offline bootstrap, end to end | `testing/`, `.github/workflows/baseline.yml` |
| Cutting a `baseline-vN` tag | `.github/workflows/tag.yml` |

## What is here (the product)

| Surface | Where |
|---|---|
| The page (seven intervals, each polling its record with SWR) | `apps/web/pages/index.tsx`, `apps/web/components/post.tsx` |
| The site's name and source link | `apps/web/lib/site.ts` |
| The cron route (records `{ fetchedAt, id }` under the interval) | `apps/web/pages/api/cron/[cron].ts` |
| The data route (reads the record, fetches the story) | `apps/web/pages/api/data/[interval].ts` |
| `@vercel/kv`'s `set`/`get` over the `KV` binding | `apps/web/lib/kv.ts` |
| The Worker entry: OpenNext's `fetch` + the `scheduled` handler that dispatches the schedules | `apps/web/worker.ts`, `apps/web/lib/scheduled.ts`, `apps/web/lib/crons.ts` |
| Workers build, trigger, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ the committed `wrangler.jsonc`), `component.yaml` |
| The KV namespace (stage, prod) | `infra/terraform/cloudflare-kv` |
| The wrangler renderer | `tooling/wire` |
| Tests | `tests/web` (vitest) |

## The schedules

The seven schedules are `vercel.json`'s, verbatim, now in
`apps/web/lib/crons.ts`. The Worker registers ONE Cron Trigger, every minute
(`triggers.crons` in `apps/web/wrangler.template.jsonc`), and the scheduled
handler runs every schedule whose five-field expression, in UTC, matches the
minute the trigger was scheduled for. One trigger per Worker — two for stage
and prod — fits the Workers Free plan's five per account; seven per Worker
would not.

| Interval | Expression | Due | Route the handler runs |
|---|---|---|---|
| `1m` | `* * * * *` | every minute | `GET /api/cron/1m` |
| `10m` | `*/10 * * * *` | every ten minutes | `GET /api/cron/10m` |
| `1h` | `0 * * * *` | on the hour | `GET /api/cron/1h` |
| `12h` | `0 */12 * * *` | 00:00 and 12:00 | `GET /api/cron/12h` |
| `1d` | `0 0 * * *` | daily at 00:00 | `GET /api/cron/1d` |
| `1w` | `0 0 * * 0` | Sundays at 00:00 | `GET /api/cron/1w` |
| `1mo` | `0 0 1 * *` | the 1st at 00:00 | `GET /api/cron/1mo` |

The trigger hands the Worker its expression and the minute it was
scheduled for; `lib/crons.ts` says which schedules are due then, and
`lib/scheduled.ts` requests `/api/cron/<interval>` for each through the
OpenNext fetch handler in-process — so the template's own route is what runs
on schedule, as it did on Vercel.

## Getting started

```bash
pnpm install
pnpm run wire:fixture   # render apps/web/wrangler.jsonc from the offline fixture
pnpm typecheck
pnpm lint
pnpm test
pnpm build              # next build + opennextjs-cloudflare build → apps/web/.open-next
```

```bash
pnpm --filter @app/web dev        # http://localhost:3000 — a local KV through wrangler's platform proxy (no scheduler)
pnpm --filter @app/web preview    # wrangler dev over the built Worker, same local KV
```

## Watching a trigger fire

`wrangler dev` never runs the clock; `--test-scheduled` adds a
`/__scheduled` endpoint that fires the handler with the expression you pass:

```bash
cd apps/web
pnpm exec wrangler dev --port 8808 --config wrangler.jsonc --test-scheduled

curl http://127.0.0.1:8808/api/data/1m                      # {} — nothing recorded yet
curl "http://127.0.0.1:8808/__scheduled?cron=*+*+*+*+*"      # fires the 1m trigger → /api/cron/1m
curl http://127.0.0.1:8808/api/data/1m                      # {"fetchedAt":…,"id":…,"title":…}
```

The Worker's log shows `/api/cron/1m 200 "OK"` for each run; a route that
answers non-2xx makes the invocation throw, which is how a failed run shows
in the Workers dashboard once deployed. There, Workers → the Worker →
Triggers lists the one Cron Trigger and its next run; the page's
"fetched N ago" is the same thing from the outside.

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js hosting | One Cloudflare Worker (`worker.ts` wrapping `.open-next/worker.js`) + Static Assets |
| Vercel Cron: `vercel.json` `crons[]` requesting `/api/cron/<interval>` | One every-minute Cron Trigger on the same Worker; the `scheduled` handler requests the same path, for each schedule due that minute, through the OpenNext fetch handler |
| Vercel KV `kv.set` / `kv.get` | Workers KV `KV` binding behind `lib/kv.ts` with the same surface (JSON values) |
| `KV_URL`, `KV_REST_API_*` | No env var: the namespace id is rendered into `wrangler.jsonc` per environment from the Terraform root's wiring document |
| `@vercel/analytics` | Cloudflare Web Analytics beacon (`components/analytics.tsx`), rendered when `NEXT_PUBLIC_CF_BEACON_TOKEN` is set at build |
| A KV store created in the dashboard | `infra/terraform/cloudflare-kv`, applied by Orun before the Worker deploys |
| Deploy on push | Orun applies the namespace and deploys `<repo>-web-{stage,prod}` on merge to `main` (`apps/web/component.yaml`); each carries its own trigger and writes its own namespace |
| "Deploy with Vercel" (clone the template) | `orun new --blueprint repo-blueprint.yaml` — a new repository, branded, deployed |

The cron route is public over HTTP, as upstream (no `CRON_SECRET`); the
risks file names the guard. KV is eventually consistent: a record written in
one location can read as the previous value elsewhere for up to a minute,
which "fetched N ago" on a polling page does not notice.

## How the namespace id reaches the Worker

```
infra/terraform/cloudflare-kv ──apply──► orun secret WIRING_CLOUDFLARE_KV (stage, prod)
                                               │   (the landing's await checks it exists)
                                               ▼
apps/web  dependsOn cloudflare-kv (enforced on main) · secretEnv WIRING_CLOUDFLARE_KV_<ENV>
  build:  tooling/wire/live.mjs → wrangler.jsonc with the environment's namespace id
          (dev, verify-only, renders the fixture) → next build → opennextjs-cloudflare
  deploy: worker.ts (fetch + scheduled) and its one trigger, * * * * *
  smoke:  /api/data/1m carries a fetchedAt the every-minute trigger recorded
```

`wrangler.jsonc` is committed as the fixture render of
`wrangler.template.jsonc`, because the deploy lane's `verify-app-structure`
step checks the config exists before it builds; Checks fails if the two
disagree. The render keeps the template's `main` (`worker.ts`) and its
`triggers.crons`, so the scheduled handler and its trigger survive every
lane's build; the schedules live in `lib/crons.ts`, inside the bundle.

## CI

| Workflow | What it runs | Ships to a product |
|---|---|---|
| `checks.yml` | install, wire fixtures (and the committed config is their render), typecheck, lint, test, build — every PR (not pushes: on main, `ci.yml` must be the only run a commit has, because the bootstrap's convergence watch takes the newest one) | yes |
| `ci.yml` | the Orun pipeline: `orun plan --changed`, then one job per lane; applies the KV namespace, then deploys stage → prod on merge — the trigger registers with the Worker and starts firing within minutes. It plans nothing while `intent.yaml` names the placeholder workspace `ws_CHANGE_ME`, as this repository does | yes |
| `baseline.yml` | the baseline's own tiers: contract tests, the wiring path, the blueprint read by the pinned orun, the leak gate, the offline bootstrap with the product's own plan, the product built in the job tree, dry-deployed, served, and its scheduled handler fired | no |
| `tag.yml` | cuts a `baseline-vN` tag (manual) | no |
