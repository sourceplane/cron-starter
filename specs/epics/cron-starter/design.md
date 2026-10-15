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
| Vercel Cron Jobs (`vercel.json` `crons`: a schedule requests a path over HTTPS) | Cron Triggers (`triggers.crons` in `wrangler.template.jsonc`) on the same Worker; a custom entry `worker.ts` re-exports the generated fetch handler and adds `scheduled`, which turns the expression that fired into a synthetic `GET /api/cron/<interval>` through that handler (`lib/scheduled.ts`, `lib/crons.ts`) |
| Vercel KV (`@vercel/kv`'s `kv.set` / `kv.get`) | Workers KV namespace bound as `KV`; `lib/kv.ts` offers the same `set`/`get` over `getCloudflareContext().env.KV` with JSON values, so the routes change only their import |
| `KV_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, … | No env vars: the binding's id is rendered into `wrangler.jsonc` from the `cloudflare-kv` root's wiring document |
| A KV store created in the dashboard | `infra/terraform/cloudflare-kv`: one namespace per environment, id and title published as the `WIRING_CLOUDFLARE_KV` secret |
| `@vercel/analytics` | `components/analytics.tsx`: the Cloudflare Web Analytics beacon, rendered when `NEXT_PUBLIC_CF_BEACON_TOKEN` is set at build |
| `@vercel/examples-ui` (layout, nav, text, code, link) | Kept: it is an npm package with no Vercel runtime dependency; its deploy button and repository link point at this repository |
| Deploy on push | Orun: `apps/web/component.yaml` (`cloudflare-workers-assets-turbo`) renders the config for `$ORUN_ENVIRONMENT`, builds, and deploys `cron-starter-web-{stage,prod}` on merge to `main` once the product is linked; the triggers are part of the Worker's config, so each environment's Worker carries its own seven |

The seven schedules, side by side (identical — Cron Triggers take the
same five-field expressions, in UTC, as Vercel Cron):

| Interval | `vercel.json` `crons[].path` → `schedule` | `wrangler.template.jsonc` `triggers.crons` | `lib/crons.ts` |
|---|---|---|---|
| 1m | `/api/cron/1m` ← `* * * * *` | `* * * * *` | `{ interval: '1m', cron: '* * * * *' }` |
| 10m | `/api/cron/10m` ← `*/10 * * * *` | `*/10 * * * *` | `{ interval: '10m', cron: '*/10 * * * *' }` |
| 1h | `/api/cron/1h` ← `0 * * * *` | `0 * * * *` | `{ interval: '1h', cron: '0 * * * *' }` |
| 12h | `/api/cron/12h` ← `0 */12 * * *` | `0 */12 * * *` | `{ interval: '12h', cron: '0 */12 * * *' }` |
| 1d | `/api/cron/1d` ← `0 0 * * *` | `0 0 * * *` | `{ interval: '1d', cron: '0 0 * * *' }` |
| 1w | `/api/cron/1w` ← `0 0 * * 0` | `0 0 * * 0` | `{ interval: '1w', cron: '0 0 * * 0' }` |
| 1mo | `/api/cron/1mo` ← `0 0 1 * *` | `0 0 1 * *` | `{ interval: '1mo', cron: '0 0 1 * *' }` |

Vercel keyed each job by its path; Cloudflare keys each by its expression.
`lib/crons.ts` is the table that turns one back into the other, and a test
asserts it is exactly what `wrangler.template.jsonc` registers.

## 3. The scheduled flow

```
Cron Trigger fires on cron-starter-web-<env> with controller.cron = "*/10 * * * *"
  └─ worker.ts  scheduled(controller, env, ctx)             (lib/scheduled.ts)
       ├─ intervalFor("*/10 * * * *") → "10m"               (lib/crons.ts)
       ├─ handler.fetch(new Request("https://cron.internal/api/cron/10m"), env, ctx)
       │     └─ @opennextjs/cloudflare's generated worker → Next pages API route
       │           pages/api/cron/[cron].ts  (unchanged)
       │             ├─ fetch hacker-news newstories.json
       │             └─ kv.set("10m", { fetchedAt, id })  → env.KV.put (lib/kv.ts)
       └─ 2xx → log "/api/cron/10m 200 "OK""; otherwise throw (the invocation fails)

Browser: <Post interval="10m"> polls GET /api/data/10m
  └─ handler.fetch (the generated worker's own fetch export)
       └─ pages/api/data/[interval].ts (unchanged): kv.get("10m") → fetch the story → { fetchedAt, ...story }
```

The origin of the synthetic request is a placeholder (`https://cron.internal`);
the route reads only the path (`req.url.split('/')[3]`, as upstream). The
OpenNext handler runs the route inside the same `cloudflareContext` it uses
for real requests, so `getCloudflareContext()` in `lib/kv.ts` sees `env.KV`.
`wrangler dev --test-scheduled` exposes `GET /__scheduled?cron=<expression>`
to fire the handler locally; in production the Worker's logs show each run.

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
the rendered `wrangler.jsonc` is git-ignored. `next dev` reaches the local
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
  lib/crons.ts                the seven schedules ↔ intervals
  lib/scheduled.ts            the scheduled handler factory (expression → GET /api/cron/<interval>)
  worker.ts                   wrangler `main`: OpenNext's fetch + scheduled
  components/analytics.tsx    the Cloudflare Web Analytics beacon
  wrangler.template.jsonc     worker name, nodejs_compat, ASSETS, triggers.crons, the KV binding as a wiring token
  wiring.fixture.json         offline ids for the verify lane
  component.yaml              render for the environment, build with turbo, deploy, smoke /
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
