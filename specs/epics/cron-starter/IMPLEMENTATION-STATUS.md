# cron-starter (CR) — Implementation status

As-built ≠ intent. This file records what actually shipped, and every place
the code departed from `design.md` or from the upstream template.

| Milestone | State | PR |
|---|---|---|
| CR0 — the spec | ✅ Shipped | [#1](https://github.com/sourceplane/cron-starter/pull/1) |
| CR1 — the crons on Workers | ✅ Shipped | [#2](https://github.com/sourceplane/cron-starter/pull/2) |
| CR2 — the KV namespace from Terraform | ✅ Shipped (validated; apply gated on a linked workspace) | [#3](https://github.com/sourceplane/cron-starter/pull/3) |
| CR3 — ready to instantiate | ✅ Shipped | [#4](https://github.com/sourceplane/cron-starter/pull/4) |

## Departures from the upstream template

### Vercel Cron → Cron Triggers through a custom worker entry

`vercel.json` is gone. Its seven `crons` are `triggers.crons` in
`wrangler.template.jsonc`, verbatim. `worker.ts` is wrangler's `main`: it
imports the generated `.open-next/worker.js` (with `@ts-ignore`, as the
OpenNext custom-worker howto does — the file exists only after the build),
re-exports its `fetch`, and adds `scheduled` from `lib/scheduled.ts`, which
maps the expression that fired to its interval (`lib/crons.ts`) and calls the
fetch handler with a synthetic `GET https://cron.internal/api/cron/<interval>`.
The component's `workerEntrypoint` is `worker.ts`, not `.open-next/worker.js`.

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
`.gitignore` and `.env.example` are not carried; `apps/web/README.md` is
upstream's, verbatim.

## Verified

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
