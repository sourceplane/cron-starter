# cron-starter (CR) — Implementation status

As-built ≠ intent. This file records what actually shipped, and every place
the code departed from `design.md` or from the upstream template.

| Milestone | State | PR |
|---|---|---|
| CR0 — the spec | ✅ Shipped | [#1](https://github.com/sourceplane/cron-starter/pull/1) |
| CR1 — the crons on Workers | ✅ Shipped | [#2](https://github.com/sourceplane/cron-starter/pull/2) |
| CR2 — the KV namespace from Terraform | ✅ Shipped (validated; apply gated on a linked workspace) | [#3](https://github.com/sourceplane/cron-starter/pull/3) |
| CR3 — ready to instantiate | ✅ Shipped | [#4](https://github.com/sourceplane/cron-starter/pull/4) |
| CR4 — a baseline, in one landing | ✅ Shipped (offline-proven; no live bootstrap yet, risk CR-K) | [#5](https://github.com/sourceplane/cron-starter/pull/5) (CR-5), tagged `baseline-v1` |
| CR5 — the cirrus standard | ✅ Shipped | CR-6 — on `main` after `baseline-v1`, not yet tagged |

## Departures from the upstream template

### Vercel Cron → Cron Triggers through a custom worker entry

`vercel.json` is gone. Its seven `crons` are the table in `lib/crons.ts`,
verbatim, each with the interval whose route it called. The Worker registers
ONE Cron Trigger, `* * * * *` (`TRIGGER`, the only entry in `triggers.crons`
in `wrangler.template.jsonc`). `worker.ts` is wrangler's `main`: it imports
the generated `.open-next/worker.js` (with `@ts-ignore`, as the OpenNext
custom-worker howto does — the file exists only after the build), re-exports
its `fetch`, and adds `scheduled` from `lib/scheduled.ts`, which runs every
schedule whose expression matches the trigger's `scheduledTime` (UTC,
`dueIntervals`), one after another, each as a synthetic
`GET https://cron.internal/api/cron/<interval>` through the fetch handler, and
fails the invocation naming any route that failed. The component's
`workerEntrypoint` is `worker.ts`, not `.open-next/worker.js`. (Through CR3
the seven expressions were seven `triggers.crons` entries and the handler
mapped the one that fired to its interval, `intervalFor`; CR4 replaced both —
"Departures from the port (CR4)" below, risks CR-B and CR-N.)

### `lib/kv.ts` replaces `@vercel/kv`

`pages/api/cron/[cron].ts` and `pages/api/data/[interval].ts` import `kv`
from `@/lib/kv` — the only change to either file. `kv.set` is
`env.KV.put(key, JSON.stringify(value))` answering `"OK"` (what the route
returns as its JSON body, as before); `kv.get<T>` is `env.KV.get(key, 'json')`.
No `KV_URL` / `KV_REST_API_*`; `.env.example` says so.

### `@vercel/analytics` → the Cloudflare Web Analytics beacon

`components/analytics.tsx` renders the beacon script when
`NEXT_PUBLIC_CF_BEACON_TOKEN` is set at build; `pages/_app.tsx` renders it
where `<Analytics />` was.

### Page copy and links

"Vercel Cron Jobs Example" → "Cron Triggers on Cloudflare"; the "Vercel Cron
Jobs" links → Cloudflare's Cron Triggers docs; "Vercel KV" → "Workers KV"
(the KV docs); the layout title "Vercel Cron Job Example" → "Cron Triggers
Example" and its description; the deploy button and repository link → this
repository; the OG/Twitter image `https://cron-template.vercel.app/thumbnail.png`
→ `/thumbnail.png` (the file ships in `public/`).

### `@vercel/examples-ui` 1.0.5 kept

It installs and builds; its React peer range (17–18) against React 19 is
the same pairing upstream's own lockfile carries. Its nav still reads
"Vercel Examples / solutions / cron" and "More Examples →" links to
vercel/examples — the package's chrome, not the template's.

### The Workers build: `next.config.mjs`, `open-next.config.ts`, tsconfig

The template had no `next.config`; `next.config.mjs` sets `output:
standalone`, the monorepo tracing root and `initOpenNextCloudflareForDev()`
so `next dev` sees the KV binding through wrangler's platform proxy.
`open-next.config.ts` uses the static-assets incremental cache (the page is
static; the routes are dynamic). `tsconfig.json` keeps the template's paths
(`@/components/*`, `@/lib/*`) and moves `moduleResolution` from `node` to
`bundler` (the adapter's subpath exports need it), `module` to `esnext`,
sets `allowJs: false` and excludes `.open-next` so `tsc` does not walk into
the generated bundle through `worker.ts`'s import, and includes
`cloudflare-env.d.ts`.

### `cloudflare-env.d.ts` hand-types the runtime slice

`@cloudflare/workers-types` is not loaded as a global: v5's
`Body.json<T>(): Promise<T>` merges ahead of lib.dom's `Promise<any>`, and
the template's untyped `res.json()` calls (both routes, `post.tsx`) stop
compiling. The file declares `CloudflareEnv` (`KV`, `ASSETS`) and the
`KVNamespace`, `Fetcher`, `ExecutionContext`, `ScheduledController` and
`ExportedHandler` shapes the entry and the shim use.

### eslint 9 + eslint-config-next 16 flat config

The template ran `next lint` with eslint 8 and `eslint-config-next canary`.
Rules turned off by name rather than rewriting the template:
`react-hooks/static-components` (`getLayout(Component)` in `_app.tsx`, the
examples-ui pattern), `@typescript-eslint/no-explicit-any` (`data: any` in
`index.tsx`), `@typescript-eslint/no-require-imports` for
`tailwind.config.js` / `postcss.config.js` (the examples-ui Tailwind preset
is `require`-only), and `@typescript-eslint/ban-ts-comment` allows
`@ts-ignore` with a description for `worker.ts`. One warning remains:
the unused `data` prop in `index.tsx`, upstream's.

### Versions and the monorepo wrapper

Next `^16.0.10` → `16.3.8`; React 19; Tailwind `^3.2.7` (resolves 3.4);
`@types/node` `^20` → `^22`; `swr` `^2.1.0` (resolves 2.5). Package name
`@app/web`, a per-app `turbo.json`, `component.yaml`, the wrangler template
and fixture. Upstream's `turbo.json`, `pnpm-lock.yaml`, `vercel.json`,
`.gitignore` and `.env.example` are not carried. `apps/web/README.md` was
upstream's, verbatim, through CR3; CR4 replaced it with the app's own (below).

### The page's name and source link come from `lib/site.ts` (CR4)

`SITE_NAME` is the heading ("Cron Triggers on Cloudflare") and now the
`<title>` too; `SOURCE_URL` is the layout's repository link and its "Clone &
Deploy" button. It lives in `lib/`, not beside the pages: anything under
`pages/` is a route. `pages/_app.tsx` renders the `<title>` and the
description meta itself and no longer passes the layout its `title` and
`description` props: the e2e tier found that `@vercel/examples-ui`'s own
`<Head>` (it imports `next/head.js`) does not reach the server-rendered page
— with the props passed, the served HTML carried no description meta, and
CR3's title went through that same `<Head>` — and the layout would have
suffixed the name with " - Vercel Examples".

### `.wrangler/` is not linted (CR4)

`wrangler dev` (which the README tells a reader to run in `apps/web`) writes
its bundles to `apps/web/.wrangler/tmp`, and `pnpm lint` then failed on
them; `eslint.config.mjs` ignores the directory with `.next` and `.open-next`.

### The page renders per request, for an absolute Open Graph image (CR4)

`og:image` / `twitter:image` were the relative `/thumbnail.png`, which Open
Graph does not accept. `pages/index.tsx` has a `getServerSideProps` that
reads the request's origin (`requestOrigin` in `lib/site.ts`) and nothing
else; the image is `<origin>/thumbnail.png` on workers.dev, a custom domain
or `wrangler dev`, with no configured site URL. `/` is therefore dynamic
(it was static); the cron data still loads in the browser through SWR, as
upstream. The unused `data: any` prop went with it, and so did its
`no-explicit-any` lint override and the one upstream lint warning.

### `apps/web/README.md` is the app's, not the template's (CR4)

Upstream's advertised "Deploy with Vercel" and Vercel KV, and it ships into
every product.

## Departures from the port (CR4)

| What | Before | After | Why |
|---|---|---|---|
| `apps/web/wrangler.jsonc` | git-ignored, rendered by the build | committed as the fixture render, GENERATED banner; Checks diffs it | the deploy lane checks it exists before the build (risk CR-H) |
| dev's render | `live.mjs --env dev` → no document → red | `--fixture wiring.fixture.json --fixture-envs dev`; the fixture has a `dev` entry | dev is verify-only; no root applies there (CR-I) |
| `apps/web` → `cloudflare-kv` | `dependsOn` in the default mode (a PR's web lane waited on the KV plan) | `mode: enforced`, `modeRules` advisory on `github-pull-request` | the one landing's order on main; a PR deploys nothing (cirrus-baseline v22's shape) |
| `apps/web` smoke | `grep 'Cron Triggers on Cloudflare'` on `/` | `/api/data/1m` carries a `fetchedAt` from the last ten minutes | the cron's effect, read back: the every-minute trigger ran the route through the scheduled handler and the Worker reads its namespace. The name is the owner's (risk CR-J) |
| `ci.yml` gate | `vars.ORUN_CI == 'true'` | skip only while `intent.yaml` names `ws_CHANGE_ME` | a bootstrap cannot set a repository variable |
| `checks.yml` | push to main + PRs | PRs + `workflow_dispatch` | `orun.run/watch@v1` takes the newest run on the merge sha from ANY workflow |
| Cron Triggers | seven per Worker (fourteen per product), the handler mapping the expression that fired to its interval (`intervalFor`) | ONE per Worker, `* * * * *` (`TRIGGER`); the handler runs every schedule in `lib/crons.ts` whose expression matches the trigger's `scheduledTime` (UTC), one after another, and fails the invocation naming any route that failed | Cloudflare counts Cron Triggers per account — five on Workers Free — and the platform cannot check a plan before a deploy; two triggers per product fit Free (risk CR-B, CR-N) |
| stack-tectonic | 0.18.2 | 0.19.0 | first-deploy retry and smoke backoff; not 0.20.0, whose lane-scoped install Next 16's Turbopack refuses |
| orun lane pin | v2.78.0 | v2.78.4 | cirrus-baseline's and portfolio's pin |
| `packages/` | absent — `orun plan` failed: `failed to access discovery root packages` | `packages/.gitkeep` | the discovery roots are required |
| `intent.yaml` docs pages | `specs/epics/…` | `ai/context/*` | the pages must exist in a product |
| the KV root's prose and names | Cirrus's "api-edge idempotency replay store", "this fork"; `idempotency_namespace_title`, `adopt_idempotency_namespace` | the cron runs' namespace; `app_kv_title`, `adopt_app_kv` | it ships into every product; no resource address changed |
| `tooling/wire/render.mjs` | copied the template's header comment | writes a GENERATED banner | the committed render must say it is one |
| `tasks/CR-1..4` | no `metadata` | `metadata.name` and `title` | `orun work check` (≥ v2.79) refused them |

## The cirrus standard (CR5)

Nothing about the app changed. What changed is the baseline around it:

| What | Before | After | Why |
|---|---|---|---|
| orun pin | `kiox.yaml` (v2.15.0) + `kiox.lock`, shipped to every product | gone; orun is pinned where it runs, the `orun-action` `version:` in each workflow | nothing ran the kiox pin, and it disagreed with the lanes (v2.78.4) |
| `root-kiox`, `root-kiox-lock` modules | in `01-product` | removed (`testing/phases.test.sh` and the rebrand's skip list follow) | a product is placed with 79 files (72 − 2 + 9): no kiox, plus the docs below |
| component docs | none | `apps/web/docs/`, `infra/terraform/cloudflare-kv/docs/`, `tests/web/docs/` — `overview.md`, `architecture.md`, `runbook.md` | cirrus-baseline documents every component; the workspace Docs library renders `docs/` beside each `component.yaml` |
| how the docs stay true | — | `tooling/catalog/gen-component-docs.py` derives them from the manifest, the Worker config (the one trigger included), Terraform, migrations and package scripts; Baseline CI runs it with `--check` | a hand-written copy of a manifest drifts silently |
| context pack | `operations.md`, `deployment.md` | plus `current.md`, `decisions.md`, `open-risks.md` | cirrus-baseline's shape; the three new pages are this repository's own and no module places them (the leak gate still allows exactly two) |
| status | CR4 "this PR, to be tagged"; the epic README's summary and "Vercel Cron → Cron Triggers" above still describing seven triggers and `intervalFor`; "Versions" calling `apps/web/README.md` upstream's | CR4 shipped ([#5](https://github.com/sourceplane/cron-starter/pull/5)) and tagged `baseline-v1`; one `* * * * *` trigger dispatching the seven schedules, as built; the README the app's | the documents had not caught up with the tag and with CR4 |

## Verified (CR5)

- `testing/{manifest,phases,coverage,rebrand,retouch,bootstrap-defer,wire}.test.sh`
  green; `gen-component-docs.py --check` green (3 components, 9 pages).
- `testing/leak.test.sh` at v2.58.11 (the blueprint job's pin): 79 files
  derived (72 − 2 kiox + 9 docs pages); `ai/context` still exactly the two
  declared pages; 72 shipped sources name no factory path, the generated
  pages included.
- `testing/placement.test.sh` at v2.78.4 (the lane pin, as `baseline.yml`
  runs it — CR-L): 79 files placed, two landings, branded and re-tenanted,
  the one `* * * * *` trigger kept; the product's own push-to-main plan
  applies `cloudflare-kv` at level 0 and deploys `web` at level 1 on stage
  and prod; on a pull request nothing waits; the 02-docs merge plans 0 jobs;
  `--resume` a no-op.
- The Checks sequence: `pnpm install --frozen-lockfile`, `wire:fixture` (no
  diff), typecheck, lint (no warnings), test (5 files, 34 tests), build
  green.
- `testing/e2e.test.sh` at v2.78.4 green: the stage lane's four steps in the
  staged job tree; under `wrangler dev --test-scheduled` the smoke refuses
  the Worker before any trigger fired, the trigger at 8 crafted times runs
  exactly the schedules due, all 7 records read back, and the smoke passes.
- `orun task check CR-6` complete.

## Verified (CR4)

- `orun new --status` reads the blueprint at v2.58.11 (the bootstrap floor),
  v2.78.4 (the lane pin) and v2.79.0: `01-product` 72 files, `02-docs`
  hook-only. `orun validate` and `orun work check` (1 epic, 5 contracts,
  prefix CR) clean.
- `testing/{manifest,phases,coverage,rebrand,retouch,bootstrap-defer,wire}.test.sh`
  green.
- `testing/leak.test.sh` (v2.58.11 and v2.79.0): 72 files derived; nothing
  of the factory, nothing local or built, no provenance prose; 65 shipped
  sources name no factory path; `worker.ts`, `lib/scheduled.ts` and
  `lib/crons.ts` ship.
- `testing/placement.test.sh` (fixture "Sam's Crons & Schedules" /
  `acme-inc/acme-cron-jobs`; v2.78.4 and v2.79.0): two landings; rebrand
  `--verify` clean; the page, the Worker, the KV titles and every secret ref
  the product's; `main: worker.ts` and the one `* * * * *` trigger kept in
  the template and the committed render; no file names a factory path;
  workspace re-tenanted, `work:` stripped, promotion and dev lanes restored;
  record rendered. The product's own `orun plan --trigger github-push-main`
  for the 01-product merge: `cloudflare-kv` apply on stage and prod at lane
  level 0, `web` deploy at level 1, each waiting on its own environment's
  apply alone, its smoke reading `/api/data/1m`; on a pull request `web`
  waits on nothing; the 02-docs merge plans 0 jobs; `--resume` changes
  nothing. Refused under v2.58.11 by design (risk CR-L).
- `testing/e2e.test.sh` (v2.79.0 and v2.78.4): the 01-product landing passes
  the Checks sequence (the committed config is the fixture render); in the
  job tree staged as orun stages it, the stage lane's `verify-app-structure`,
  `build-app` (the live render, from a stage document in the job's
  environment), `verify-build-output` and `deploy-dry-run` pass, binding `KV`
  to the document's id; the built config keeps `main: worker.ts` and its one
  trigger and `.open-next/worker.js` exists for it. `wrangler dev
  --test-scheduled` serves the built Worker: the component's own smoke
  REFUSES it before any trigger fired; `/__scheduled?cron=*+*+*+*+*` runs
  `/api/cron/1m` (logged `200 "OK"` by the scheduled handler); at eight
  crafted scheduled times (`/cdn-cgi/local/scheduled?…&time=`, since
  `/__scheduled` always stamps the present) exactly the schedules due then
  run — 1m always, 10m, 1h, 12h, 1d, 1w on a Sunday and not a Monday, 1mo
  on the 1st — and every other record stays; every record reads back
  through `/api/data/<interval>`; a foreign expression runs nothing; the
  smoke then PASSES. `/`
  carries the product's name (heading and `<title>`), its repository links,
  a description, the seven schedules and an Open Graph image absolute on
  the origin asked; `GET /api/cron/1h` runs that schedule on request; the
  thumbnail, the favicon and a 404 are served.
- Repository checks: `pnpm install --frozen-lockfile`, `wire:fixture` (no
  diff), typecheck, lint (no warnings), test (34: the matcher at crafted
  times, the dispatcher, the routes, the seam), build (`/` and both API
  routes dynamic; Worker + assets) green.
- `terraform validate` green on `infra/terraform/cloudflare-kv` (1.15.3).
- Not verified: a live bootstrap against a workspace — the KV apply, a real
  deploy registering its trigger, the trigger firing on Cloudflare's clock,
  the probes (risk CR-K).

## Verified (CR0–CR3)

- Local: `pnpm run wire:fixture`, `pnpm typecheck`, `pnpm lint` (0 errors,
  1 upstream warning), `pnpm test` (16 tests: the cron table equals the
  template's `triggers.crons`; the scheduled handler for all seven
  expressions, an unknown one and a non-2xx; `lib/kv.ts` over a mocked
  namespace; both routes with mocked KV and a mocked Hacker News),
  `pnpm build` (`/` static, `/api/cron/[cron]` and `/api/data/[interval]`
  dynamic, Worker + assets, `populateCache local`) green; `tsc` stays green
  after the build (the generated bundle is excluded).
- `wrangler dev --port 8808 --config wrangler.jsonc --test-scheduled` over
  the built Worker with a local namespace: `/` 200 ("Cron Triggers on
  Cloudflare", no beacon without a token); `/api/data/1m` → `{}` before any
  run; `GET /__scheduled?cron=*+*+*+*+*` → "Ran scheduled event" with the
  Worker logging `/api/cron/1m 200 "OK"`; `/api/data/1m` then →
  `{"fetchedAt":…,"id":…,"title":…}`; `0 0 1 * *` → `1mo` likewise; an
  unknown expression → a warning and no call; `/api/cron/10m` by hand →
  `"OK"`; `/nope` 404; `/thumbnail.png` and `/favicon.ico` 200.
- `wrangler deploy --dry-run` on the rendered config bundles `worker.ts`
  (4.5 MiB, the seven triggers and the `KV`/`ASSETS` bindings accepted).
- `terraform init -backend=false && terraform validate` green on
  `infra/terraform/cloudflare-kv`.
- CI: `Checks` green on #1, #2, #3 and #4.
- Not verified: the KV apply and a live deploy — both need the product
  linked to an Orun workspace with a Cloudflare connection (`ORUN_CI`) —
  and a trigger firing on the wall clock, which only a deployed Worker does
  (the account needs Workers Paid for fourteen triggers across stage and
  prod; Free allows five).

## Versions

| Package | Version | Why |
|---|---|---|
| next | 16.3.8 | newest inside `@opennextjs/cloudflare` 1.20.11's peer range (16.4.x fails at boot on the adapter) |
| @opennextjs/cloudflare | ^1.20.11 | `getCloudflareContext` for the binding; the generated fetch handler the custom entry wraps; static-assets cache + `populateCache local` |
| wrangler | ^4.151.0 | `triggers.crons`, `--test-scheduled`, compatibility_date 2026-10-01 |
| @vercel/examples-ui | ^1.0.5 | upstream's pin; React 19 pairing as upstream's lockfile |
| swr, ms | ^2.1.0, ^2.1.3 | upstream's pins |
| eslint-config-next | 16.3.8 | flat config for Next 16 (upstream: eslint 8 + `canary`) |
