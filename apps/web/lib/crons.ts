// The seven schedules vercel.json declared, each with the interval whose
// route it called (`/api/cron/<interval>`). They are not seven Cron Triggers:
// the Worker registers ONE, every minute (TRIGGER, the only entry in
// wrangler.template.jsonc's `triggers.crons`), and the scheduled handler runs
// every schedule below whose expression matches the minute that trigger was
// scheduled for. One trigger per Worker — two for stage and prod — fits the
// Workers Free plan's five per account; seven per Worker would not.
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

// The one Cron Trigger the Worker registers.
export const TRIGGER = '* * * * *'

// minute, hour, day of month, month, day of week (0 or 7 is Sunday)
const FIELDS = [
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31 },
  { min: 1, max: 12 },
  { min: 0, max: 7 },
] as const

function fieldMatches(spec: string, value: number, { min, max }: { min: number; max: number }): boolean {
  return spec.split(',').some((part) => {
    const [range = '', stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    let lo: number
    let hi: number
    if (range === '*') {
      lo = min
      hi = max
    } else if (range.includes('-')) {
      const [from = '', to = ''] = range.split('-')
      lo = Number(from)
      hi = Number(to)
    } else {
      lo = Number(range)
      hi = stepText === undefined ? lo : max
    }
    if (![lo, hi, step].every(Number.isInteger) || step < 1 || lo < min || hi > max) {
      throw new Error(`unsupported cron field "${spec}"`)
    }
    return value >= lo && value <= hi && (value - lo) % step === 0
  })
}

// Whether a five-field cron expression fires at `at`, in UTC as Cron Triggers
// (and Vercel Cron) evaluate it. When both day fields are restricted a day
// matching either one fires, as in cron(8).
export function matches(cron: string, at: Date): boolean {
  const fields = cron.trim().split(/\s+/)
  const [minute, hour, dom, month, dow] = fields
  if (fields.length !== 5 || !minute || !hour || !dom || !month || !dow) {
    throw new Error(`"${cron}" is not a five-field cron expression`)
  }
  const weekday = at.getUTCDay()
  const domOk = fieldMatches(dom, at.getUTCDate(), FIELDS[2])
  const dowOk =
    fieldMatches(dow, weekday, FIELDS[4]) || (weekday === 0 && fieldMatches(dow, 7, FIELDS[4]))
  const dayOk = dom.startsWith('*') || dow.startsWith('*') ? domOk && dowOk : domOk || dowOk
  return (
    fieldMatches(minute, at.getUTCMinutes(), FIELDS[0]) &&
    fieldMatches(hour, at.getUTCHours(), FIELDS[1]) &&
    fieldMatches(month, at.getUTCMonth() + 1, FIELDS[3]) &&
    dayOk
  )
}

// The schedules due at a trigger's scheduled time (ms since the epoch, the
// controller's `scheduledTime`), in table order. Every minute runs `1m`.
export function dueIntervals(scheduledTime: number): Interval[] {
  const at = new Date(scheduledTime)
  return crons.filter((entry) => matches(entry.cron, at)).map((entry) => entry.interval)
}
