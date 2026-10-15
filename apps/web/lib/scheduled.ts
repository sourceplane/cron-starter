import { TRIGGER, dueIntervals } from './crons'

type FetchHandler = (
  request: Request,
  env: CloudflareEnv,
  ctx: ExecutionContext
) => Response | Promise<Response>

// Vercel ran each cron job by requesting its path over HTTPS. Here one Cron
// Trigger fires every minute, and this handler decides which of the seven
// schedules are due at the minute it was scheduled for (`scheduledTime`, via
// lib/crons.ts) and turns each into that request: a synthetic GET to
// /api/cron/<interval> through the OpenNext fetch handler, which means the
// template's own route — unchanged — is what runs on schedule. The origin is a
// placeholder; the route never reads it.
export const CRON_ORIGIN = 'https://cron.internal'

export function makeScheduled(fetch: FetchHandler) {
  return async function scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    if (controller.cron !== TRIGGER) {
      console.warn(`scheduled: no route for cron "${controller.cron}" (this Worker's trigger is "${TRIGGER}")`)
      return
    }
    // One at a time, and every due schedule runs even when an earlier one
    // failed: at midnight on the 1st up to seven are due at once.
    const failures: string[] = []
    for (const interval of dueIntervals(controller.scheduledTime)) {
      const path = `/api/cron/${interval}`
      try {
        const response = await fetch(new Request(`${CRON_ORIGIN}${path}`), env, ctx)
        const body = await response.text()
        if (!response.ok) {
          failures.push(`${path} answered ${response.status}: ${body}`)
          continue
        }
        console.log(`${path} ${response.status} ${body}`)
      } catch (error) {
        failures.push(`${path} threw: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (failures.length > 0) {
      // A thrown error marks the invocation failed in the Worker's logs.
      throw new Error(failures.join('; '))
    }
  }
}
