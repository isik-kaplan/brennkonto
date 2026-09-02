import { describe, expect, it } from 'vitest'

import { toISODate } from '../../src/lib/dates'
import { RANGE_PRESETS, groupByForDays, isRangePresetKey, presetDateRange } from '../../src/lib/rangePresets'

describe('RANGE_PRESETS', () => {
  it('offers a week, 2 weeks, a month, and 6 months, in that order', () => {
    expect(RANGE_PRESETS.map((preset) => preset.key)).toEqual(['week', '2weeks', 'month', '6months'])
  })
})

describe('isRangePresetKey', () => {
  it('accepts every known preset key', () => {
    for (const preset of RANGE_PRESETS) {
      expect(isRangePresetKey(preset.key)).toBe(true)
    }
  })

  it('rejects an unknown string, a non-string, and undefined', () => {
    expect(isRangePresetKey('decade')).toBe(false)
    expect(isRangePresetKey(42)).toBe(false)
    expect(isRangePresetKey(undefined)).toBe(false)
  })
})

describe('presetDateRange', () => {
  it('ends today and spans the preset’s day count, inclusive', () => {
    const today = toISODate(new Date())
    for (const preset of RANGE_PRESETS) {
      const { start, end } = presetDateRange(preset.key)
      expect(end).toBe(today)
      const spanDays = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1
      expect(spanDays).toBe(preset.days)
    }
  })
})

describe('groupByForDays', () => {
  it('groups by day up to 31 days', () => {
    expect(groupByForDays(1)).toBe('day')
    expect(groupByForDays(31)).toBe('day')
  })

  it('groups by week between 32 and 120 days', () => {
    expect(groupByForDays(32)).toBe('week')
    expect(groupByForDays(120)).toBe('week')
  })

  it('groups by month beyond 120 days', () => {
    expect(groupByForDays(121)).toBe('month')
    expect(groupByForDays(182)).toBe('month')
  })
})
