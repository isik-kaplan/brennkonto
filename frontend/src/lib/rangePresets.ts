import type { GroupBy } from '../api/types'
import { addDays, toISODate } from './dates'

export type RangePresetKey = 'week' | '2weeks' | 'month' | '6months'

export interface RangePreset {
  key: RangePresetKey
  label: string
  days: number
}

// Backs both the Range summary section on History and the "default range" picker in Settings -
// four presets wide enough apart to be genuinely different views (a week, a fortnight, a month,
// half a year) without crowding a .segmented control on mobile.
export const RANGE_PRESETS: RangePreset[] = [
  { key: 'week', label: 'Last week', days: 7 },
  { key: '2weeks', label: 'Last 2 weeks', days: 14 },
  { key: 'month', label: 'Last month', days: 30 },
  { key: '6months', label: 'Last 6 months', days: 182 },
]

export const RANGE_PRESET_KEYS: RangePresetKey[] = RANGE_PRESETS.map((preset) => preset.key)

export function isRangePresetKey(value: unknown): value is RangePresetKey {
  return typeof value === 'string' && RANGE_PRESET_KEYS.includes(value as RangePresetKey)
}

// The date range a preset means "as of right now" - always ending today, since these presets are
// only ever used to seed the initial/default view, not to describe a fixed historical window.
export function presetDateRange(key: RangePresetKey): { start: string; end: string } {
  // Non-null: RANGE_PRESET_KEYS is derived from RANGE_PRESETS, so every RangePresetKey has a match.
  const preset = RANGE_PRESETS.find((candidate) => candidate.key === key)!
  const end = toISODate(new Date())
  return { start: addDays(end, -(preset.days - 1)), end }
}

// Keeps a range-stats request's bucket count sane - a 6-month range grouped by day would ask the
// backend to resolve a goal for ~180 individual buckets that a summary view never displays.
export function groupByForDays(days: number): GroupBy {
  if (days <= 31) return 'day'
  if (days <= 120) return 'week'
  return 'month'
}
