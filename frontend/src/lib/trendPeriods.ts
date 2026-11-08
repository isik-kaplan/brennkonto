import type { GroupBy, RangeStatsPoint } from '../api/types'
import { addDays, daysBetween, fromISODate, toISODate } from './dates'

export interface TrendPeriod {
  /** First and last day of the period that actually fall inside the requested range. */
  start: string
  end: string
  daysInPeriod: number
  daysLogged: number
  /** Per logged day, so a week or month bar is directly comparable to the daily goal. Null when
   * nothing was logged - an empty period is a gap, not a zero. */
  avgCalories: number | null
  avgProtein: number | null
  avgCarbs: number | null
  avgFat: number | null
  calorieGoal: number | null
  /** The range cut this period short of its full calendar week/month. */
  isPartial: boolean
}

// Bucket boundaries mirror the backend's _bucket_key: weeks start on Monday, months on the 1st,
// years on January 1st.
export function bucketStart(date: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return date
  if (groupBy === 'week') return addDays(date, -((fromISODate(date).getDay() + 6) % 7))
  if (groupBy === 'year') return `${date.slice(0, 4)}-01-01`
  return `${date.slice(0, 8)}01`
}

export function bucketEnd(start: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return start
  if (groupBy === 'week') return addDays(start, 6)
  if (groupBy === 'year') return `${start.slice(0, 4)}-12-31`
  const first = fromISODate(start)
  return toISODate(new Date(first.getFullYear(), first.getMonth() + 1, 0))
}

// "Last N weeks/months" snaps to whole calendar periods ending with the one that contains `end`,
// so only the current, in-progress period is ever partial - never the first bar.
export function lastNRange(groupBy: GroupBy, count: number, end: string): { start: string; end: string } {
  if (groupBy === 'day') return { start: addDays(end, -(count - 1)), end }
  if (groupBy === 'week') return { start: addDays(bucketStart(end, 'week'), -7 * (count - 1)), end }
  if (groupBy === 'year') return { start: `${Number(end.slice(0, 4)) - (count - 1)}-01-01`, end }
  const current = fromISODate(end)
  return { start: toISODate(new Date(current.getFullYear(), current.getMonth() - (count - 1), 1)), end }
}

export const MAX_BARS = 730

// How many bars a range draws at a grouping, counting the clipped ones at either end.
export function bucketCount(start: string, end: string, groupBy: GroupBy): number {
  if (groupBy === 'day') return daysBetween(start, end)
  if (groupBy === 'week') return (daysBetween(bucketStart(start, 'week'), bucketStart(end, 'week')) - 1) / 7 + 1
  const years = Number(end.slice(0, 4)) - Number(start.slice(0, 4))
  if (groupBy === 'year') return years + 1
  return years * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7)) + 1
}

// A grouping is worth offering when it compares at least two bars without drawing more than the
// chart can hold. Days are the exception for a single day, which has nothing finer to fall back to.
export function isGroupingUsable(start: string, end: string, groupBy: GroupBy): boolean {
  const count = bucketCount(start, end, groupBy)
  return count <= MAX_BARS && (count >= 2 || groupBy === 'day')
}

// What a custom range opens on before anyone picks: the finest grouping that stays readable.
export function defaultGrouping(days: number): GroupBy {
  if (days <= 62) return 'day'
  if (days <= 200) return 'week'
  return 'month'
}

// The backend only returns buckets that have entries, labelled by their full calendar span. This
// walks every bucket the range touches, clipped to the range, so the chart's x-axis is continuous.
export function buildPeriods(points: RangeStatsPoint[], start: string, end: string, groupBy: GroupBy): TrendPeriod[] {
  const byStart = new Map(points.map((point) => [point.period_start, point]))
  const periods: TrendPeriod[] = []
  let lastGoal: number | null = points[0]?.calorie_goal ?? null
  for (let cursor = bucketStart(start, groupBy); cursor <= end; cursor = addDays(bucketEnd(cursor, groupBy), 1)) {
    const fullEnd = bucketEnd(cursor, groupBy)
    // Stryker disable next-line EqualityOperator: at equality both branches pick the same date
    const clippedStart = cursor < start ? start : cursor
    // Stryker disable next-line EqualityOperator: same as above
    const clippedEnd = fullEnd > end ? end : fullEnd
    const point = byStart.get(cursor)
    if (point) lastGoal = point.calorie_goal
    // A returned bucket always has at least one logged day, so the division is safe.
    periods.push({
      start: clippedStart,
      end: clippedEnd,
      daysInPeriod: daysBetween(clippedStart, clippedEnd),
      daysLogged: point ? point.days_logged : 0,
      avgCalories: point ? point.calories / point.days_logged : null,
      avgProtein: point ? point.protein_g / point.days_logged : null,
      avgCarbs: point ? point.carbs_g / point.days_logged : null,
      avgFat: point ? point.fat_g / point.days_logged : null,
      calorieGoal: lastGoal,
      isPartial: daysBetween(clippedStart, clippedEnd) < daysBetween(cursor, fullEnd),
    })
  }
  return periods
}

export function shortPeriodLabel(period: TrendPeriod, groupBy: GroupBy): string {
  const date = fromISODate(period.start)
  if (groupBy === 'month') return date.toLocaleDateString(undefined, { month: 'short' })
  if (groupBy === 'year') return period.start.slice(0, 4)
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export function longPeriodLabel(period: TrendPeriod, groupBy: GroupBy): string {
  const startDate = fromISODate(period.start)
  if (groupBy === 'day') {
    return startDate.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
  }
  const endDate = fromISODate(period.end)
  if (groupBy === 'month' && !period.isPartial) {
    return startDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  if (groupBy === 'year' && !period.isPartial) return period.start.slice(0, 4)
  // A clipped year names its own year, since its dates alone could belong to any.
  const format: Intl.DateTimeFormatOptions =
    groupBy === 'year' ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }
  if (period.start === period.end) return startDate.toLocaleDateString(undefined, format)
  return `${startDate.toLocaleDateString(undefined, format)} – ${endDate.toLocaleDateString(undefined, format)}`
}

// Rounds the chart's ceiling up to a step that yields 3-5 gridlines.
export function niceScale(max: number): { top: number; step: number } {
  const steps = [100, 250, 500, 1000, 2000, 5000]
  const target = Math.max(max, 1)
  const step = steps.find((candidate) => target / candidate <= 4) ?? 5000
  return { top: Math.ceil(target / step) * step, step }
}
