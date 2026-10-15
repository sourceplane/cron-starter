# apps/web — the page, its API routes and its Cron Triggers

Seven schedules record the newest Hacker News story and the time they ran,
and a page shows each one's last run — Vercel's Cron Jobs example
([vercel/examples `solutions/cron`](https://github.com/vercel/examples/tree/main/solutions/cron),
MIT), running on Cloudflare Workers + Static Assets with the schedules as
**Cron Triggers** on the same Worker and the records in a **Workers KV**
namespace instead of Vercel KV:

- `pages/index.tsx` — the page: the seven intervals, each polling its record
- `pages/api/cron/[cron].ts` — what a schedule runs: fetches the newest story
  id and writes `{ fetchedAt, id }` under the interval's key
- `pages/api/data/[interval].ts` — reads the record back with its story
- `worker.ts` — the Worker's entry: OpenNext's `fetch`, plus the `scheduled`
  handler Cron Triggers call (`lib/scheduled.ts`), which turns the expression
  that fired into `GET /api/cron/<interval>` through that same `fetch`
- `lib/crons.ts` — the seven expressions and their intervals, equal to
  `triggers.crons` in `wrangler.template.jsonc`
- `lib/kv.ts` — `kv.set` / `kv.get` over the `KV` binding
- `lib/site.ts` — the site's name and the repository its links point at

```bash
pnpm dev        # next dev on http://localhost:3000, a local KV through wrangler's platform proxy (no scheduler)
pnpm build      # next build + opennextjs-cloudflare build → .open-next/
pnpm exec wrangler dev --test-scheduled   # the built Worker, same local KV, triggers fired by hand:
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # runs /api/cron/1m
curl http://localhost:8787/api/data/1m                     # its record
```

The binding's namespace id is not hand-written. `wrangler.template.jsonc`
names it as a wiring token; `wrangler.jsonc` is that template rendered from
`wiring.fixture.json` (placeholder ids, for local work and verification), and
every deploy renders it again from the id the `cloudflare-kv` Terraform root
published for the environment (`component.yaml`'s `buildCommand`).

Fourteen Cron Triggers (seven per deployed environment) exceed the Workers
Free plan's five per account: the account needs Workers Paid. KV is
eventually consistent, so a record written in one location can read as the
previous run elsewhere for up to a minute — invisible for "fetched N ago".
