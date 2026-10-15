# cron-starter

Vercel's [Cron Jobs example](https://github.com/vercel/examples/tree/main/solutions/cron)
— seven cron schedules, each requesting `/api/cron/<interval>` to record the
newest Hacker News story and the run time in KV, and a page that polls
`/api/data/<interval>` to show how long ago each interval last ran — running
on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), with the
schedules as **Cron Triggers** on the same Worker and the records in a
**Workers KV** namespace provisioned by Terraform through
[Orun](https://github.com/sourceplane/orun), inside the repository
conventions of the [Cirrus baseline](https://github.com/sourceplane/cirrus-baseline).

The page and the API routes are the template's; what calls the routes on
schedule, and where they write, is Cloudflare's. See
[`specs/epics/cron-starter`](specs/epics/cron-starter/README.md) for the
design, the milestones and the as-built status.

## What is here

| Surface | Where |
|---|---|
| The page (seven intervals, each polling its record with SWR) | `apps/web/pages/index.tsx`, `apps/web/components/post.tsx` |
| The cron route (records `{ fetchedAt, id }` under the interval) | `apps/web/pages/api/cron/[cron].ts` |
| The data route (reads the record, fetches the story) | `apps/web/pages/api/data/[interval].ts` |
| `@vercel/kv`'s `set`/`get` over the `KV` binding | `apps/web/lib/kv.ts` |
| The Worker entry: OpenNext's `fetch` + the `scheduled` handler | `apps/web/worker.ts`, `apps/web/lib/scheduled.ts`, `apps/web/lib/crons.ts` |
| Workers build, triggers, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json`, `component.yaml` |
| The KV namespace (stage, prod) | `infra/terraform/cloudflare-kv` |
| Tests | `tests/web` (vitest) |

## The schedules

The seven schedules are `vercel.json`'s, verbatim, now `triggers.crons` in
`apps/web/wrangler.template.jsonc`. Cron Triggers take the same five-field
expressions, in UTC.

| Interval | Expression | Fires | Route the trigger runs |
|---|---|---|---|
| `1m` | `* * * * *` | every minute | `GET /api/cron/1m` |
| `10m` | `*/10 * * * *` | every ten minutes | `GET /api/cron/10m` |
| `1h` | `0 * * * *` | on the hour | `GET /api/cron/1h` |
| `12h` | `0 */12 * * *` | 00:00 and 12:00 | `GET /api/cron/12h` |
| `1d` | `0 0 * * *` | daily at 00:00 | `GET /api/cron/1d` |
| `1w` | `0 0 * * 0` | Sundays at 00:00 | `GET /api/cron/1w` |
| `1mo` | `0 0 1 * *` | the 1st at 00:00 | `GET /api/cron/1mo` |

A trigger hands the Worker only the expression that fired; `lib/crons.ts`
turns it back into the interval, and `lib/scheduled.ts` requests
`/api/cron/<interval>` through the OpenNext fetch handler in-process — so
the template's own route is what runs on schedule, as it did on Vercel.

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
Triggers lists the seven Cron Triggers and their next runs; the page's
"fetched N ago" is the same thing from the outside.

## How it maps to Vercel

| Vercel | Here |
|---|---|
| Next.js hosting | One Cloudflare Worker (`worker.ts` wrapping `.open-next/worker.js`) + Static Assets |
| Vercel Cron: `vercel.json` `crons[]` requesting `/api/cron/<interval>` | Cron Triggers: `triggers.crons` on the same Worker; the `scheduled` handler requests the same path through the OpenNext fetch handler |
| Vercel KV `kv.set` / `kv.get` | Workers KV `KV` binding behind `lib/kv.ts` with the same surface (JSON values) |
| `KV_URL`, `KV_REST_API_*` | No env var: the namespace id is rendered into `wrangler.jsonc` per environment from the Terraform root's wiring document |
| `@vercel/analytics` | Cloudflare Web Analytics beacon (`components/analytics.tsx`), rendered when `NEXT_PUBLIC_CF_BEACON_TOKEN` is set at build |
| Deploy on push | Orun deploys `cron-starter-web-{stage,prod}` on merge to `main` (`apps/web/component.yaml`); each carries its own seven triggers and writes its own namespace |

The cron route is public over HTTP, as upstream (no `CRON_SECRET`); the
risks file names the guard. KV is eventually consistent: a record written in
one location can read as the previous value elsewhere for up to a minute,
which "fetched N ago" on a polling page does not notice.

## Deploying

`.github/workflows/checks.yml` runs install, wire, typecheck, lint, test and
build on every push and pull request. `ci.yml` is the Orun pipeline: set
`execution.state.workspace` in `intent.yaml` to this product's workspace
(`orun cloud link`), connect a Cloudflare account to it, and set the
`ORUN_CI` repository variable to `true`. A merge to `main` then applies the
KV root, renders the Worker's config with the real namespace id, and deploys
to `stage`, then `prod` — the triggers register with the Worker and start
firing on the next minute. Cloudflare caps Cron Triggers per account by
plan (5 on Workers Free, 250 on Workers Paid); seven per environment is the
template's count, so stage + prod need the Paid plan.
