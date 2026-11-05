const CHILE_TIME_ZONE = 'America/Santiago'

type DateParts = { year: number; month: number; day: number; hour: number; minute: number; second: number }

function chileDateTimeParts(timestamp: number): DateParts {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHILE_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timestamp))
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find(part => part.type === type)?.value || 0)
  return { year: value('year'), month: value('month'), day: value('day'), hour: value('hour'), minute: value('minute'), second: value('second') }
}

function chileMidnightTimestamp(dateStr: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match) return Number.NaN
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const offsets = new Set<number>()

  // Sample both sides of midnight so a Chilean daylight-saving transition is
  // handled using the offset that actually applies on the requested date.
  for (const hours of [-36, -12, 0, 12, 36]) {
    const sample = desired + hours * 60 * 60 * 1000
    const local = chileDateTimeParts(sample)
    const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
    offsets.add(localAsUtc - Math.floor(sample / 1000) * 1000)
  }

  const candidates = [...offsets].map(offset => desired - offset)
  const exact = candidates.filter(candidate => {
    const local = chileDateTimeParts(candidate)
    return local.year === Number(match[1]) && local.month === Number(match[2]) && local.day === Number(match[3])
      && local.hour === 0 && local.minute === 0 && local.second === 0
  })
  if (exact.length) return Math.min(...exact)

  // If midnight is skipped by a clock change, choose the first representable
  // local time on that date (the compatible interpretation of local midnight).
  const afterGap = candidates
    .map(candidate => {
      const local = chileDateTimeParts(candidate)
      const localAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second)
      return { candidate, delta: localAsUtc - desired }
    })
    .filter(item => item.delta >= 0)
    .sort((a, b) => a.delta - b.delta || a.candidate - b.candidate)[0]
  return afterGap?.candidate ?? candidates[0] ?? Number.NaN
}

/** Calendar date in Chile, independent of the device's configured timezone. */
export function getChileDateStr(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CHILE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: 'year' | 'month' | 'day') => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

/** Shift a YYYY-MM-DD calendar date without relying on the device timezone. */
export function shiftDateStr(dateStr: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr)
  if (!match || !Number.isFinite(days)) return dateStr
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + Math.trunc(days)))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/** Exact Unix-millisecond boundaries for one local calendar day in Chile. */
export function getChileDayBounds(dateStr: string): { start: number; end: number } {
  const start = chileMidnightTimestamp(dateStr)
  const end = chileMidnightTimestamp(shiftDateStr(dateStr, 1))
  return { start, end }
}
