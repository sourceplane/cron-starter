# cron-starter — design

## 1. What the template is

A Next.js pages-router app. `vercel.json` declares seven cron jobs — every
minute, every ten minutes, hourly, every twelve hours, daily, weekly,
monthly — each requesting `/api/cron/<interval>`. That route fetches the
newest Hacker News story ids and writes `{ fetchedAt: Date.now(), id }`
under the interval's key in Vercel KV (`kv.set`). `/api/data/<interval>`
reads the record back (`kv.get`), fetches the story, and answers it with
`fetchedAt`. `pages/index.tsx` lists the seven intervals with their cron
expressions and renders a `<Post interval>` for each, which polls
`/api/data/<interval>` with SWR and shows the story and "fetched N ago".
`@vercel/examples-ui` is the layout; `@vercel/analytics` the beacon;
Tailwind the styles.

## 2. The mapping (Vercel → Cloudflare)

| Vercel primitive the template uses | Here |
|---|---|
| Next.js hosting (a static page, two API routes) | Cloudflare Workers + Static Assets; the Worker is `@opennextjs/cloudflare`'s output, the pages-router API routes run inside it |
| Serverless Functions (`pages/api/*`) | The same route modules, unchanged, executed by the OpenNext handler in the Worker |
| Vercel Cron Jobs (`vercel.json` `crons`: a schedule requests a path over HTTPS) | ONE Cron Trigger, every minute (`triggers.crons` in `wrangler.template.jsonc`), on the same Worker (since CR4; seven before); a custom entry `worker.ts` re-exports the generated fetch handler and adds `scheduled`, which turns every schedule due at the trigger's scheduled minute into a synthetic `GET /api/cron/<interval>` through that handler (`lib/scheduled.ts`, `lib/crons.ts`) |
| Vercel KV (`@vercel/kv`'s `kv.set` / `kv.get`) | Workers KV namespace bound as `KV`; `lib/kv.ts` offers the same `set`/`get` over `getCloudflareContext().env.KV` with JSON values, so the routes change only their import |
| `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, … | No env vars: the binding's id is rendered into `wrangler.jsonc` from the `cloudflare-kv` root's wiring document |
| A KV store created in the dashboard | `infra/terraform/cloudflare-kv`: one namespace per environment, id and title published as the `WIRING_CLOUDFLARE_KV` secret |
| `@vercel/analytics` | `components/analytics.tsx`: the Cloudflare Web Analytics beacon, rendered when `NEXT_PUBLIC_CF_BEACON_TOKEN` is set at build |
| `@vercel/examples-ui` (layout, nav, text, code, link) | Kept: it is an npm package with no Vercel runtime dependency; its deploy button and repository link point at this repository |
| Deploy on push | Orun: `apps/web/component.yaml` (`cloudflare-workers-assets-turbo`) renders the config for `$ORUN_ENVIRONMENT`, builds, and deploys `cron-starter-web-{stage,prod}` on merge to `main` once the product is linked; the trigger is part of the Worker's config, so each environment's Worker carries its own |

The seven schedules, side by side (identical five-field expressions, in
UTC, as Vercel Cron evaluates them):

| Interval | `vercel.json` `crons[].path` → `schedule` | `lib/crons.ts` | Due (UTC) |
|---|---|---|---|
| 1m | `/api/cron/1m` ← `* * * * *` | `{ interval: '1m', cron: '* * * * *' }` | every minute |
| 10m | `/api/cron/10m` ← `*/10 * * * *` | `{ interval: '10m', cron: '*/10 * * * *' }` | minute % 10 = 0 |
| 1h | `/api/cron/1h` ← `0 * * * *` | `{ interval: '1h', cron: '0 * * * *' }` | minute 0 |
| 12h | `/api/cron/12h` ← `0 */12 * * *` | `{ interval: '12h', cron: '0 */12 * * *' }` | 00:00 and 12:00 |
| 1d | `/api/cron/1d` ← `0 0 * * *` | `{ interval: '1d', cron: '0 0 * * *' }` | 00:00 |
| 1w | `/api/cron/1w` ← `0 0 * * 0` | `{ interval: '1w', cron: '0 0 * * 0' }` | Sunday 00:00 |
| 1mo | `/api/cron/1mo` ← `0 0 1 * *` | `{ interval: '1mo', cron: '0 0 1 * *' }` | the 1st, 00:00 |

Until CR4 each schedule was its own Cron Trigger (seven per Worker, and
`lib/crons.ts` turned the expression that fired back into the interval).
Cloudflare counts Cron Triggers per ACCOUNT — five on Workers Free — so
fourteen across stage and prod refused the first deploy on a Free account,
and the platform cannot see a plan before it deploys. Since CR4 the Worker
registers one trigger, `* * * * *` (`TRIGGER` in `lib/crons.ts`, the only
entry in `triggers.crons`; a test holds the two equal), and the handler
evaluates the seven expressions against the trigger's `scheduledTime`: two
triggers per product, and the schedules are the template's, verbatim, still
the ones the page shows.

## 3. The scheduled flow

```
Cron Trigger "* * * * *" fires on cron-starter-web-<env>, controller.scheduledTime = 12:10:00Z
  └─ worker.ts  scheduled(controller, env, ctx)             (lib/scheduled.ts)
       ├─ controller.cron === TRIGGER, else warn and return
       ├─ dueIntervals(scheduledTime) → ["1m", "10m"]       (lib/crons.ts, UTC)
       ├─ for each, in turn:
       │    handler.fetch(new Request("https://cron.internal/api/cron/10m"), env, ctx)
       │     └─ @opennextjs/cloudflare's generated worker → Next pages API route
       │           pages/api/cron/[cron].ts  (unchanged)
       │             ├─ fetch hacker-news newstories.json
       │             └─ kv.set("10m", { fetchedAt, id })  → env.KV.put (lib/kv.ts)
       │    2xx → log "/api/cron/10m 200 "OK""; otherwise noted, and the rest still run
       └─ any noted → throw, naming each (the invocation fails)

Browser: <Post interval="10m"> polls GET /api/data/10m
  └─ handler.fetch (the generated worker's own fetch export)
       └─ pages/api/data/[interval].ts (unchanged): kv.get("10m") → fetch the story → { fetchedAt, ...story }
```

The origin of the synthetic request is a placeholder (`https://cron.internal`);
the route reads only the path (`req.url.split('/')[3]`, as upstream). The
OpenNext handler runs the route inside the same `cloudflareContext` it uses
for real requests, so `getCloudflareContext()` in `lib/kv.ts` sees `env.KV`.
`wrangler dev --test-scheduled` exposes `GET /__scheduled?cron=<expression>`
to fire the handler locally at the present minute, and
`/cdn-cgi/local/scheduled?cron=<expression>&time=<ms>` at any scheduled time;
in production the Worker's logs show each run.

## 4. The wiring flow

```
infra/terraform/cloudflare-kv  ──apply──►  orun secret WIRING_CLOUDFLARE_KV (project/<env>)
   output wiring {app_kv_id, app_kv_title}       │
                                                 ▼
apps/web/component.yaml secretEnv  WIRING_CLOUDFLARE_KV_<ENV>
   buildCommand: tooling/wire/live.mjs --env $ORUN_ENVIRONMENT → wrangler.jsonc (kv_namespaces[0].id)
   verify lanes / local: tooling/wire/render.mjs --map wiring.fixture.json
```

`wrangler.template.jsonc` carries `@@wiring(cloudflare-kv/__ENV__:app_kv_id)@@`;
the rendered `wrangler.jsonc` is committed as the fixture render (CR4: the
deploy lane checks it exists before it builds — risk CR-H) and re-rendered
by every lane's build, `main` and `triggers.crons` included. `dev`, which no
root applies to, renders the fixture (CR-I). `next dev` reaches the local
KV through `initOpenNextCloudflareForDev()` (wrangler's platform proxy), so
the fixture render is enough for local work; `next dev` has no scheduler,
so firing a trigger locally is `opennextjs-cloudflare preview` or
`wrangler dev --test-scheduled` over the built Worker.

## 5. The repository

```
apps/web                      the template (pages/, components/, public/) + the Workers build
  pages/api/cron/[cron].ts    unchanged but for the kv import
  pages/api/data/[interval].ts unchanged but for the kv import
  lib/kv.ts                   @vercel/kv's set/get over the KV binding (JSON)
  lib/crons.ts                the seven schedules ↔ intervals, the one TRIGGER, the UTC matcher (dueIntervals)
  lib/scheduled.ts            the scheduled handler factory (each schedule due → GET /api/cron/<interval>)
  lib/site.ts                 the site's name and source link (CR4: the rename seam) + the request origin
  worker.ts                   wrangler `main`: OpenNext's fetch + scheduled
  components/analytics.tsx    the Cloudflare Web Analytics beacon
  wrangler.template.jsonc     worker name, nodejs_compat, ASSETS, the one trigger, the KV binding as a wiring token
  wiring.fixture.json         offline ids for local work and the verify lanes (dev, stage, prod)
  wrangler.jsonc              the fixture render, committed (CR4)
  component.yaml              render for the environment, build with turbo, deploy, smoke /api/data/1m
  cloudflare-env.d.ts         the bindings' types and the runtime slice the entry uses
infra/terraform/cloudflare-kv the namespace per environment (Cirrus's root, generic name)
tests/web                     vitest: the table, the scheduled handler, the kv shim, the two routes — all against mocks
```

## 6. Out of scope

A `CRON_SECRET`-style guard on `/api/cron/*` (upstream has none; the risks
file names the shape), retries beyond what Cron Triggers do, a custom
domain, and anything that needs the Durable Object alarms API.

## 7. Alternative rejected: a second Worker for the crons

A plain Worker (`apps/cron`) carrying the seven triggers whose `scheduled`
handler `fetch`es `https://cron-starter-web-<env>.<subdomain>.workers.dev/api/cron/<interval>`
— the literal shape of Vercel Cron, which is an external scheduler
requesting a URL. Rejected because:

- it is a second deployable (component, lane, worker name per environment)
  and a second render — the Next Worker's URL per environment has to reach
  the cron Worker's config, which is another wiring document or a service
  binding, for a handler of a dozen lines;
- a Worker calling another Worker by public hostname is an internet round
  trip subject to the account's routing, `workers.dev` availability and the
  `global_fetch_strictly_public` posture; a service binding avoids that but
  still couples two Workers by name;
- the only thing it buys — the route being called over HTTP — the in-process
  call already gives: the OpenNext fetch handler runs the same route module
  with the same `Request`, in the same Worker, on the same KV binding.

The custom entry is the adapter's documented way to add a `scheduled`
handler (its "custom worker" howto); wrangler bundles the generated
`.open-next/worker.js` into it, and nothing about the Next build changes.

## 8. The baseline (CR4)

The repository instantiates new products the way
[cirrus-baseline](https://github.com/sourceplane/cirrus-baseline) does since
its one-landing bootstrap (`baseline-v22`): a console card (`blueprint.yaml`)
the platform renders, a build document (`repo-blueprint.yaml`) `orun new`
runs, and a rename engine that makes the copy somebody else's. What a small
product carries besides — the product README, the context pack, the
deployment-record hook, the bootstrap helpers and the offline test suite —
is `portfolio-starter-kit`'s `baseline-v2`, as `kv-redis-starter` (KR4)
ported it for a KV-bound Next app; this is that port with a scheduled
handler.

| | portfolio-starter-kit (`baseline-v2`) | cirrus-baseline (`baseline-v22`) | here |
|---|---|---|---|
| phases | three: `01-scaffold`, `02-site`, `03-docs` | `01-product`, `07-domain` (optional), `08-docs` | two: `01-product`, `02-docs` |
| the order a landing used to hold | the scaffold before the site | the data plane before the fleet, the fleet before its bindings | the KV namespace before the Worker that binds it (and whose triggers write to it) |
| how the plan holds it instead | — | enforced `dependsOn` on main (advisory on a PR) | `apps/web` `dependsOn: cloudflare-kv`, `mode: enforced` with `modeRules` advisory on `github-pull-request` |
| brokered secrets | `CLOUDFLARE_API_TOKEN` (`workers-deploy`), `CLOUDFLARE_ACCOUNT_ID` | + `CLOUDFLARE_D1_TOKEN` (`d1-edit`) | the portfolio's two: `workers-deploy` covers KV Storage write and the Worker's triggers, so one token applies the namespace and deploys the Worker |
| the landing's await | watch, probe | watch, `WIRING_CLOUDFLARE_D1`/`_KV` exist on stage and prod, probe | watch, `WIRING_CLOUDFLARE_KV` exists on stage and prod, probe |
| the deploy's smoke | the page's marker text | each Worker's own health | a run the trigger recorded, read back from KV (`/api/data/1m`) |
| Cron Triggers | — | — | one per Worker (`* * * * *`), two per product — inside Workers Free's five per account; the seven schedules are dispatched from its scheduled time |
| stack-tectonic | 0.19.0 | 0.20.0 | 0.19.0 (Next 16's Turbopack) |

**One landing.** `01-product` places every module, brands the tree, and
lands it as one pull request whose checks it waits for (Checks: install, the
fixture render, typecheck, lint, test, build). The convergence after the
merge plans `cloudflare-kv` (apply) and `web` (deploy) on stage and prod; the
web lanes are one level below the KV lanes, so each Worker deploy starts
after its environment's apply — and since a job resolves its secrets when it
starts, the `WIRING_CLOUDFLARE_KV_<ENV>` it renders from is there. Each
deploy registers its Worker's one Cron Trigger, and its smoke waits (with
backoff, ~4.5 minutes) for it to record a `1m` run (CR-J).
Stage and prod run side by side (the promotion gate is deferred until
`02-docs`), and dev's push lanes are deferred too. The landing then waits on
the convergence (`orun.run/watch@v1`, resuming failed lanes up to three
times), asks the platform that the wiring exists on both environments
(`orun.secrets/exists@v1`), and probes both URLs. `02-docs` places nothing:
it restores the two deferrals, renders the deployment record (with each
environment's last recorded run) and lands it.

**The cron path survives the staged build.** The scheduled handler is not in
OpenNext's generated worker; it is in the committed entry `worker.ts`, which
wrangler bundles with the generated `.open-next/worker.js`, and the
schedules it dispatches are in `lib/crons.ts`, bundled with it. The trigger
is in the template the build re-renders. So nothing the build generates
carries any of them: the entry is a source file the job tree is staged
with, the re-render keeps `main` and the one `triggers.crons` entry (the
placement and e2e tiers assert both, the latter on the config the lane's own
build wrote), and the dry run bundles the entry with the generated worker.

**Identity in the app** is `apps/web/lib/site.ts`: `SITE_NAME` (the heading
and `<title>`) and `SOURCE_URL` (the layout's repository link and its
"Clone & Deploy" button). The name is written with `JSON.stringify`, so any
name the card's pattern admits stays a valid string. The slug also names the
KV namespace titles (`stg-<slug>-app-kv-stage`) through terraform's `repo`,
so two products in one account never collide on a title.

**No `SITE_URL`.** The only absolute link the page renders to itself is the
Open Graph image. `pages/index.tsx` renders per request and takes the
request's own origin (`getServerSideProps` → `requestOrigin`): right on
workers.dev, on a custom domain and under `wrangler dev`, with nothing to
configure. The Cron Triggers need no hostname at all: the scheduled handler
calls the fetch handler in-process.

**Testing without the platform.** `testing/lib/bootstrap.sh` places both
phases and runs the blueprint's own `run:` hooks, read out of the document;
`testing/placement.test.sh` plans the product's own merge (the KV apply
first) and a pull request (nothing waits); `testing/wire.test.sh` holds the
wiring path together; `testing/e2e.test.sh` builds the product in the tree
orun stages, with the stage wiring document in the job's environment,
dry-deploys it, serves it with `wrangler dev --test-scheduled`, checks that
the component's own smoke refuses it before any trigger fired, fires the
trigger through the scheduled handler on the clock and at eight crafted
scheduled times — each must run exactly the schedules due then — reads every
record back and runs the smoke again.
