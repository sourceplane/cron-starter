# apps/web — the page, its API routes and its Cron Trigger

Seven schedules record the newest Hacker News story and the time they ran,
and a page shows each one's last run — Vercel's Cron Jobs example
([vercel/examples `solutions/cron`](https://github.com/vercel/examples/tree/main/solutions/cron),
MIT), running on Cloudflare Workers + Static Assets with the schedules
dispatched from one every-minute **Cron Trigger** on the same Worker and the
records in a **Workers KV** namespace instead of Vercel KV:

- `pages/index.tsx` — the page: the seven intervals, each polling its record
- `pages/api/cron/[cron].ts` — what a schedule runs: fetches the newest story
  id and writes `{ fetchedAt, id }` under the interval's key
- `pages/api/data/[interval].ts` — reads the record back with its story
- `worker.ts` — the Worker's entry: OpenNext's `fetch`, plus the `scheduled`
  handler the trigger calls (`lib/scheduled.ts`), which turns every schedule
  due at the trigger's scheduled minute into `GET /api/cron/<interval>`
  through that same `fetch`
- `lib/crons.ts` — the seven expressions and their intervals, the trigger
  (`* * * * *`, the only entry in `triggers.crons`) and the UTC matcher that
  says which schedules are due
- `lib/kv.ts` — `kv.set` / `kv.get` over the `KV` binding
- `lib/site.ts` — the site's name and the repository its links point at

```bash
pnpm dev        # next dev on http://localhost:3000, a local KV through wrangler's platform proxy (no scheduler)
pnpm build      # next build + opennextjs-cloudflare build → .open-next/
pnpm exec wrangler dev --test-scheduled   # the built Worker, same local KV, the trigger fired by hand:
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # now: /api/cron/1m and whatever else is due
curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*&time=1793491200000"   # as at 2026-11-01 00:00 UTC: all seven
curl http://localhost:8787/api/data/1m                     # a record
```

The binding's namespace id is not hand-written. `wrangler.template.jsonc`
names it as a wiring token; `wrangler.jsonc` is that template rendered from
`wiring.fixture.json` (placeholder ids, for local work and verification), and
every deploy renders it again from the id the `cloudflare-kv` Terraform root
published for the environment (`component.yaml`'s `buildCommand`).

One Cron Trigger per deployed environment, two in all, fits the Workers
Free plan's five per account. KV is eventually consistent, so a record written in one location can read as the
previous run elsewhere for up to a minute — invisible for "fetched N ago".
