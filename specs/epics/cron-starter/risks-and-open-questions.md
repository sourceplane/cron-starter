# cron-starter — risks and open questions

## CR-A — The cron route is public, as upstream (ACCEPTED, documented)

Vercel Cron requests `/api/cron/<interval>` over HTTPS, so the route is
reachable by anyone; upstream does not set a `CRON_SECRET`. The port keeps
that: `GET /api/cron/1m` from a browser rewrites the `1m` record. The guard,
when wanted, is a Worker secret the scheduled handler sends as a header and
the route checks — `lib/scheduled.ts` already builds the `Request`, so it is
one header there and one comparison in the route.

## CR-B — Cron Triggers per account (OPEN until linked)

Seven triggers per Worker, one Worker per environment: fourteen on the
account for stage + prod. Cloudflare caps Cron Triggers per account by plan
— 5 on Workers Free, 250 on Workers Paid (Workers → Limits) — so the
account that hosts stage and prod needs the Paid plan, or the deploy fails
loudly when the cap is hit. The schedules are the template's, verbatim; a
product that only needs some of them trims `triggers.crons` and
`lib/crons.ts` together (the test holds them equal).

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
