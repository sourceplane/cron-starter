# cron-starter

Seven schedules — every minute, every ten minutes, hourly, every twelve
hours, daily, weekly, monthly — each recording the newest Hacker News story
and the time it ran, and a page that shows every schedule's last run.
Next.js on **Cloudflare Workers + Static Assets** through
[`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare), the schedules
as **Cron Triggers** on the same Worker, the runs in a **Workers KV**
namespace that Terraform provisions per environment.

## Live deployment

<!-- 02-docs:begin -->
Not recorded yet. The bootstrap's last phase writes the live URLs, the
workspace and the secrets inventory into
[ai/context/deployment.md](ai/context/deployment.md); how the site deploys
and how to operate it is in
[ai/context/operations.md](ai/context/operations.md).
<!-- 02-docs:end -->

## What is here

| Surface | Where |
|---|---|
| The page (the seven schedules and their last runs) | `apps/web/pages/index.tsx`, `components/post.tsx` |
| The site's name and source link | `apps/web/lib/site.ts` |
| What a schedule runs, and how its record is read | `apps/web/pages/api/cron/[cron].ts`, `pages/api/data/[interval].ts` |
| The Cron Trigger and the scheduled handler | the one `triggers.crons` entry in `apps/web/wrangler.template.jsonc`, the seven schedules in `lib/crons.ts`, `lib/scheduled.ts`, `worker.ts` |
| The store (Workers KV, `kv.set` / `kv.get`) | `apps/web/lib/kv.ts` |
| Workers build, bindings and deploy contract | `apps/web/next.config.mjs`, `open-next.config.ts`, `wrangler.template.jsonc` + `wiring.fixture.json` (→ `wrangler.jsonc`), `component.yaml` |
| The KV namespace (stage, prod) | `infra/terraform/cloudflare-kv` |
| Tests | `tests/web` (vitest) |

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
pnpm --filter @app/web dev    # http://localhost:3000 — a local KV through wrangler's platform proxy, no scheduler
cd apps/web && pnpm exec wrangler dev --test-scheduled         # the built Worker on :8787, triggers fired by hand
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"        # fires the trigger now: 1m, and whatever else is due
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*&time=1793491200000"   # as at Sunday 2026-11-01 00:00 UTC: all seven
curl http://localhost:8787/api/data/1m                          # …and reads what a run recorded
```

Make the page yours in `apps/web/pages/index.tsx`, and its name and the
repository it links to in `apps/web/lib/site.ts`.

## How the schedules run

`wrangler.template.jsonc` registers ONE Cron Trigger on the Worker, every
minute. `worker.ts` is the Worker's entry: the fetch handler OpenNext
generates, plus a `scheduled` handler. Each time the trigger fires, the
handler checks the seven schedules in `lib/crons.ts` against the minute the
trigger was scheduled for (UTC) and, for every one that is due, requests
`/api/cron/<interval>` through that same fetch handler — the route a
scheduler would call over HTTPS — which writes `{ fetchedAt, id }` under the
interval's key. `1m` runs every minute, `10m` when the minute is a multiple
of ten, `1h` on the hour, `12h` at 00:00 and 12:00, `1d` at midnight, `1w` at
midnight on Sunday and `1mo` at midnight on the 1st. The page polls
`/api/data/<interval>` for each schedule and shows "fetched N ago".

To change a schedule, change its expression in `lib/crons.ts` (and the one
the page shows beside it in `pages/index.tsx`); the trigger stays as it is.
One trigger per Worker, two for stage and prod, stays inside the five Cron
Triggers per account that Cloudflare's Workers Free plan allows. The trigger
can take a few minutes to start firing after the first deploy.
`/api/cron/<interval>` is public, as in the template it comes from: anyone
can run a schedule early. Guarding it is a Worker secret the scheduled
handler sends as a header and the route checks.

## How the namespace is wired

The Worker binds the namespace as `KV`. Its id is never hand-written:
`apps/web/wrangler.template.jsonc` names it as a wiring token, and
`wrangler.jsonc` is that template rendered — from `wiring.fixture.json`
(placeholder ids) for local work and verification, and on every deploy from
the document the `cloudflare-kv` Terraform root publishes after its apply
(`WIRING_CLOUDFLARE_KV`, per environment). Edit the template, then
`pnpm run wire:fixture`; Checks fails if the committed `wrangler.jsonc` is
not the fixture render.

KV is eventually consistent: a run recorded in one location can read as the
previous one elsewhere for up to a minute — invisible for "fetched N ago".

## How it deploys

Merges to `main` converge through [Orun](https://github.com/sourceplane/orun):
`.github/workflows/ci.yml` plans the changed components and runs each lane
against the workspace in `intent.yaml`. The KV namespace applies first, then
the Worker builds with that environment's namespace id and deploys — to
`stage`, then to `prod` once stage has converged on the same commit; `dev`
only verifies. The Worker is `cron-starter-web-<env>` on your account's
workers.dev subdomain, and every deploy is smoke-tested over HTTP:
`/api/data/1m` must carry a run the every-minute trigger recorded in the last
ten minutes. `checks.yml` runs install, the fixture render, typecheck, lint,
test and build on every pull request. (A push to `main` runs `ci.yml` alone,
which applies, builds and deploys.)

The pipeline holds one credential, GitHub's own `GITHUB_TOKEN`. The
Cloudflare token and account id are brokered per run from the workspace's
Cloudflare connection, and the namespace ids travel as Orun secrets; nothing
provider-shaped is stored in the repository or in GitHub.

## Custom domain

The site answers on workers.dev from its first deploy. To serve it on your
own domain, add the domain to the Cloudflare account the site deploys into
and attach it to the Worker (dashboard → Workers & Pages →
`cron-starter-web-prod` → Settings → Domains & Routes → Add → Custom
domain). The page builds its absolute links from the request it is
answering and the Cron Triggers do not depend on a hostname, so nothing else
has to change; the repository names the domain in one place, `BASE_DOMAIN` in
`intent.yaml`, which the site was born with as the reserved placeholder
`cron-starter.example.com`. Replace it with your domain in the same change that
records it.
