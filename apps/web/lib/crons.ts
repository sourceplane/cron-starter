// The seven schedules vercel.json declared, each with the interval whose
// route it called (`/api/cron/<interval>`). wrangler.template.jsonc's
// `triggers.crons` lists the same seven expressions; a Cron Trigger hands the
// scheduled handler the expression that fired, and this table turns it back
// into the route.
export const crons = [
  { interval: '1m', cron: '* * * * *' },
  { interval: '10m', cron: '*/10 * * * *' },
  { interval: '1h', cron: '0 * * * *' },
  { interval: '12h', cron: '0 */12 * * *' },
  { interval: '1d', cron: '0 0 * * *' },
  { interval: '1w', cron: '0 0 * * 0' },
  { interval: '1mo', cron: '0 0 1 * *' },
] as const

export type Interval = (typeof crons)[number]['interval']

export function intervalFor(cron: string): Interval | undefined {
  return crons.find((entry) => entry.cron === cron)?.interval
}
