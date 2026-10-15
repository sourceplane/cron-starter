import { intervalFor } from './crons'

type FetchHandler = (
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext
) => Response | Promise<Response>

// Vercel ran each cron job by requesting its path over HTTPS. A Cron Trigger
// hands the Worker only the expression that fired, so this turns it back into
// that request: a synthetic GET to /api/cron/<interval> through the OpenNext
// fetch handler, which means the template's own route — unchanged — is what
// runs on schedule. The origin is a placeholder; the route never reads it.
export const CRON_ORIGIN = 'https://cron.internal'

export function makeScheduled(fetch: FetchHandler) {
  return async function scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    const interval = intervalFor(controller.cron)
    if (!interval) {
      console.warn(`scheduled: no route for cron "${controller.cron}"`)
      return
    }
    const path = `/api/cron/${interval}`
    const response = await fetch(new Request(`${CRON_ORIGIN}${path}`), env, ctx)
    const body = await response.text()
    if (!response.ok) {
      // A thrown error marks the invocation failed in the Worker's logs.
      throw new Error(`${path} answered ${response.status}: ${body}`)
    }
    console.log(`${path} ${response.status} ${body}`)
  }
}
