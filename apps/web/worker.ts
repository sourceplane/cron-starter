// The Worker's entry (wrangler `main`). @opennextjs/cloudflare generates a
// worker that exports only `fetch`; this re-uses that handler and adds the
// `scheduled` handler the Cron Trigger calls, the way the adapter's custom-worker
// howto describes (https://opennext.js.org/cloudflare/howtos/custom-worker).
// @ts-ignore `.open-next/worker.js` is generated at build time
import { default as handler } from './.open-next/worker.js'
import { makeScheduled } from './lib/scheduled'

const worker = {
  fetch: handler.fetch,
  scheduled: makeScheduled(handler.fetch),
} satisfies ExportedHandler<CloudflareEnv>

export default worker
