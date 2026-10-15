# cron-starter — risks and open questions

## CR-A — The cron route is public, as upstream (ACCEPTED, documented)

Vercel Cron requests `/api/cron/<interval>` over HTTPS, so the route is
reachable by anyone; upstream does not set a `CRON_SECRET`. The port keeps
that: `GET /api/cron/1m` from a browser rewrites the `1m` record. The guard,
when wanted, is a Worker secret the scheduled handler sends as a header and
the route checks — `lib/scheduled.ts` already builds the `Request`, so it is
one header there and one comparison in the route.

## CR-B — Cron Triggers per account (ACCEPTED in CR4: the card asks for Workers Paid)

Seven triggers per Worker, one Worker per environment: fourteen on the
account for stage + prod. Cloudflare caps Cron Triggers per account by plan
— 5 on Workers Free, 250 on Workers Paid (Workers → Limits) — so the
account that hosts stage and prod needs the Paid plan, or the deploy fails
loudly when the cap is hit. The schedules are the template's, verbatim; a
product that only needs some of them trims `triggers.crons` and
`lib/crons.ts` together (the test holds them equal). Since CR4 the
baseline's card, its BOOTSTRAP and the product's README and operating
contract all say the account needs Workers Paid; the platform has no way to
check a plan before the deploy, so on Free the first deploy is what refuses.

## CR-C — KV is not Redis (ACCEPTED)

Vercel KV was Redis: a write is visible to the next read. Workers KV is
eventually consistent across locations — a record written by the scheduled
handler in one location can be read from another up to ~60 s later as the
previous value. For "fetched N ago" on a page that polls, that is invisible;
each key is written at most once a minute, inside KV's one-write-per-second
limit.

## CR-D — Hacker News at request time (ACCEPTED, upstream)

Both routes call `hacker-news.firebaseio.com` live, as upstream: the cron
route for the newest ids, the data route for the story. A Hacker News outage
makes the cron route throw (the invocation fails and the previous record
stays) and the data route answer an error body. Nothing is cached; nothing
was upstream either.

## CR-E — `wrangler dev` does not run the clock (RESOLVED)

Local `wrangler dev` never fires a trigger on the wall clock;
`--test-scheduled` exposes `GET /__scheduled?cron=<expression>` so a trigger
can be fired by hand, which is how CR1 is verified and what the README
documents. `next dev` has no scheduler at all — the page works (SWR polls
the routes through the platform proxy) but nothing writes until a route is
requested.

## CR-F — The verify lane renders a fixture id (RESOLVED)

`wiring.fixture.json` carries placeholder ids; `wrangler deploy --dry-run`
accepts them, and `wrangler dev` provisions a local namespace regardless.
The deploy lane renders the real id from the root's wiring document.

## CR-G — Page copy (RESOLVED)

"Vercel Cron Jobs Example", the "Vercel Cron Jobs" and "Vercel KV" links,
the deploy button and the Vercel-hosted thumbnail URL read "Cron Triggers on
Cloudflare", link to Cloudflare's docs, point at this repository, and serve
the thumbnail from `public/`. Layout, styles and structure are untouched;
`@vercel/examples-ui`'s nav still shows its own "Vercel Examples" chrome.

## CR-H — The deploy lane checked for a config only the build makes (RESOLVED in CR4)

stack-tectonic's `cloudflare-workers-assets-turbo` runs `verify-app-structure`
— `test -f package.json`, `test -f <wranglerConfig>` — BEFORE `build-app`, in
a job tree staged from the checkout. `wrangler.jsonc` was git-ignored and
rendered only by the build, so every Orun lane of the product (dev, stage,
prod; pull request or merge) would have failed at that step: no lane had
ever run (`ORUN_CI` was never set). Fix: commit `wrangler.jsonc` as the
fixture render of `wrangler.template.jsonc` (with a GENERATED banner); the
build still re-renders it for its environment, keeping `main: worker.ts` and
the seven `triggers.crons`. Checks fails when the two disagree
(`git diff --exit-code` after `wire:fixture`), and `testing/wire.test.sh`
checks the same. `testing/e2e.test.sh` runs the step in a staged tree.

## CR-I — The dev lane had no wiring document to render (RESOLVED in CR4)

`buildCommand` rendered with `live.mjs --env "${ORUN_ENVIRONMENT}"`, which
needs `WIRING_CLOUDFLARE_KV_<ENV>`. `dev` subscribes `web` (verify) but no
root applies there, so `WIRING_CLOUDFLARE_KV_DEV` never exists: every dev
lane would have failed in `build-app`. Fix: `live.mjs --fixture
wiring.fixture.json --fixture-envs dev` renders the fixture for the
verify-only environment, and only for it; the fixture gained a `dev` entry.
stage and prod still need the real document and refuse without it
(`testing/wire.test.sh`).

## CR-J — The deploy's smoke waits on a trigger (ACCEPTED)

The smoke reads `/api/data/1m` and requires a `fetchedAt` from the last ten
minutes: a run the every-minute Cron Trigger recorded through the scheduled
handler. On every later deploy the schedule is already running and the
smoke passes at once. On the FIRST deploy it passes only once the new
trigger has fired; Cloudflare says a trigger change "may take several
minutes (up to 15 minutes)" to propagate, and the composition's smoke
retries for about 4.5 minutes. Usually that is enough. When it is not, the
lane fails, and `01-product`'s `orun.run/watch@v1` resumes failed lanes up to
three times (`resumeBudget: 3`, each attempt a fresh build, deploy and 4.5
minute smoke), by which time the trigger fires. Hacker News is on the same
path (CR-D): the record's story is fetched as the route answers, so an
outage there fails the smoke too, and the resumes cover it the same way. A
smoke that only fetched `/` would pass sooner and prove neither the trigger
nor the binding.

## CR-K — No live bootstrap yet (OPEN)

Everything short of the platform is proven on every pull request: the card
against the build, the blueprint read by three orun versions, the leak gate,
the wiring path, the offline bootstrap with the blueprint's own hooks, the
product's own plan (the KV apply before the Worker's deploy; nothing waiting
on a pull request), and the produced product built in the job tree,
dry-deployed with the stage document's namespace id, served under
`wrangler dev --test-scheduled` with every schedule fired through the
scheduled handler and read back, and smoke-tested. NOT proven: the
repository created and linked, the token minted by `integrations/reconcile`,
a real `terraform apply` (the root is held to `terraform validate`; its
`adopt.tf` lookup calls the Cloudflare API), the lease-published document, a
real `wrangler deploy` registering fourteen triggers on a Workers Paid
account, the triggers firing on Cloudflare's clock, the probes. Hence the
registry row is `unlisted` until one bootstrap from the tag has come up.

## CR-L — The bootstrap floor plans every edge enforced (ACCEPTED)

orun v2.58.11 — the floor for RUNNING a bootstrap — does not apply a
`dependsOn` edge's `modeRules`: it plans a pull request with `web` waiting on
the KV plan. That CLI never plans the product's CI (its `ci.yml` pins
v2.78.4, which applies them), and on a push to main both agree. The
placement tier plans as the product does: `baseline.yml` runs it under the
lane pin, and the test refuses an orun older than `ci.yml`'s pin.

## CR-M — A custom domain is the owner's step (ACCEPTED)

Attaching a domain to a Worker needs zone permissions the brokered
`workers-deploy` token does not carry, and `dns-edit` needs zone ids a build
does not have. The product's README says how to attach one; nothing in the
repository changes, because the page takes its origin from the request and
the triggers need no hostname.
