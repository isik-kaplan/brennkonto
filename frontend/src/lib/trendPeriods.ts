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

// Bucket boundaries mirror the backend's _bucket_key: weeks start on Monday, months on the 1st.
export function bucketStart(date: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return date
  if (groupBy === 'week') return addDays(date, -((fromISODate(date).getDay() + 6) % 7))
  return `${date.slice(0, 8)}01`
}

export function bucketEnd(start: string, groupBy: GroupBy): string {
  if (groupBy === 'day') return start
  if (groupBy === 'week') return addDays(start, 6)
  const first = fromISODate(start)
  return toISODate(new Date(first.getFullYear(), first.getMonth() + 1, 0))
}

// "Last N weeks/months" snaps to whole calendar periods ending with the one that contains `end`,
// so only the current, in-progress period is ever partial - never the first bar.
export function lastNRange(groupBy: GroupBy, count: number, end: string): { start: string; end: string } {
  if (groupBy === 'day') return { start: addDays(end, -(count - 1)), end }
  if (groupBy === 'week') return { start: addDays(bucketStart(end, 'week'), -7 * (count - 1)), end }
  const current = fromISODate(end)
  return { start: toISODate(new Date(current.getFullYear(), current.getMonth() - (count - 1), 1)), end }
}

// Long ranges cap out at a coarser grouping and short ones never offer one, so every combination
// on screen draws a chart worth reading: no single "month" bar for a week, no 90 hairline days.
export function groupingsFor(days: number): GroupBy[] {
  if (days <= 14) return ['day']
  if (days <= 62) return ['day', 'week']
  if (days <= 200) return ['week', 'month']
  return ['month']
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
  const format: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
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
