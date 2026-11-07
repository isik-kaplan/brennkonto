import { describe, expect, it } from 'vitest'

import type { RangeStatsPoint } from '../../src/api/types'
import {
  type TrendPeriod,
  bucketEnd,
  bucketStart,
  buildPeriods,
  groupingsFor,
  lastNRange,
  longPeriodLabel,
  niceScale,
  shortPeriodLabel,
} from '../../src/lib/trendPeriods'

function point(overrides: Partial<RangeStatsPoint> = {}): RangeStatsPoint {
  return {
    period_label: '',
    period_start: '2026-11-02',
    period_end: '2026-11-08',
    calories: 4000,
    protein_g: 200,
    carbs_g: 300,
    fat_g: 100,
    days_logged: 2,
    calorie_goal: 2000,
    protein_goal_g: 150,
    carbs_goal_g: 200,
    fat_goal_g: 65,
    ...overrides,
  }
}

function period(overrides: Partial<TrendPeriod> = {}): TrendPeriod {
  return {
    start: '2026-11-02',
    end: '2026-11-08',
    daysInPeriod: 7,
    daysLogged: 7,
    avgCalories: 2000,
    avgProtein: 100,
    avgCarbs: 150,
    avgFat: 50,
    calorieGoal: 2000,
    isPartial: false,
    ...overrides,
  }
}

describe('bucketStart', () => {
  it('keeps a day as itself', () => {
    expect(bucketStart('2026-11-07', 'day')).toBe('2026-11-07')
  })

  it('snaps a week to its Monday, including from a Sunday and from the Monday itself', () => {
    expect(bucketStart('2026-11-07', 'week')).toBe('2026-11-02')
    expect(bucketStart('2026-11-08', 'week')).toBe('2026-11-02')
    expect(bucketStart('2026-11-02', 'week')).toBe('2026-11-02')
  })

  it('snaps a month to its first day', () => {
    expect(bucketStart('2026-11-07', 'month')).toBe('2026-11-01')
  })
})

describe('bucketEnd', () => {
  it('ends a day on itself and a week six days later', () => {
    expect(bucketEnd('2026-11-07', 'day')).toBe('2026-11-07')
    expect(bucketEnd('2026-11-02', 'week')).toBe('2026-11-08')
  })

  it('ends a month on its own last day, leap years included', () => {
    expect(bucketEnd('2026-11-01', 'month')).toBe('2026-11-30')
    expect(bucketEnd('2026-02-01', 'month')).toBe('2026-02-28')
    expect(bucketEnd('2024-02-01', 'month')).toBe('2024-02-29')
    expect(bucketEnd('2026-12-01', 'month')).toBe('2026-12-31')
  })
})

describe('lastNRange', () => {
  it('counts days back from the end, inclusive', () => {
    expect(lastNRange('day', 7, '2026-11-07')).toEqual({ start: '2026-11-01', end: '2026-11-07' })
    expect(lastNRange('day', 1, '2026-11-07')).toEqual({ start: '2026-11-07', end: '2026-11-07' })
  })

  it('starts N whole calendar weeks back, counting the current one', () => {
    expect(lastNRange('week', 1, '2026-11-07')).toEqual({ start: '2026-11-02', end: '2026-11-07' })
    expect(lastNRange('week', 12, '2026-11-07')).toEqual({ start: '2026-08-17', end: '2026-11-07' })
  })

  it('starts N whole calendar months back, across a year boundary', () => {
    expect(lastNRange('month', 1, '2026-11-07')).toEqual({ start: '2026-11-01', end: '2026-11-07' })
    expect(lastNRange('month', 12, '2026-11-07')).toEqual({ start: '2025-12-01', end: '2026-11-07' })
  })
})

describe('groupingsFor', () => {
  it.each([
    [1, ['day']],
    [14, ['day']],
    [15, ['day', 'week']],
    [62, ['day', 'week']],
    [63, ['week', 'month']],
    [200, ['week', 'month']],
    [201, ['month']],
  ])('offers sensible groupings for %i days', (days, expected) => {
    expect(groupingsFor(days)).toEqual(expected)
  })
})

describe('buildPeriods', () => {
  it('fills every bucket the range touches, clipped to the range', () => {
    const periods = buildPeriods([point()], '2026-10-25', '2026-11-07', 'week')
    expect(periods.map(({ start, end, daysInPeriod, isPartial }) => ({ start, end, daysInPeriod, isPartial }))).toEqual(
      [
        { start: '2026-10-25', end: '2026-10-25', daysInPeriod: 1, isPartial: true },
        { start: '2026-10-26', end: '2026-11-01', daysInPeriod: 7, isPartial: false },
        { start: '2026-11-02', end: '2026-11-07', daysInPeriod: 6, isPartial: true },
      ]
    )
  })

  it('averages a returned bucket per logged day and leaves empty buckets as gaps', () => {
    const [empty, logged] = buildPeriods([point({ period_start: '2026-11-02' })], '2026-10-26', '2026-11-08', 'week')
    expect(logged).toMatchObject({ daysLogged: 2, avgCalories: 2000, avgProtein: 100, avgCarbs: 150, avgFat: 50 })
    expect(empty).toMatchObject({ daysLogged: 0, avgCalories: null, avgProtein: null, avgCarbs: null, avgFat: null })
  })

  it('carries the latest goal forward, and backfills leading gaps with the first known goal', () => {
    const points = [
      point({ period_start: '2026-11-02', calorie_goal: 2000 }),
      point({ period_start: '2026-11-04', calorie_goal: 1800 }),
    ]
    const goals = buildPeriods(points, '2026-11-01', '2026-11-05', 'day').map((p) => p.calorieGoal)
    expect(goals).toEqual([2000, 2000, 2000, 1800, 1800])
  })

  it('has no goal at all when nothing was logged', () => {
    const periods = buildPeriods([], '2026-11-06', '2026-11-07', 'day')
    expect(periods.map((p) => p.calorieGoal)).toEqual([null, null])
  })

  it('includes a final bucket that starts on the last day of the range', () => {
    const periods = buildPeriods([], '2026-10-26', '2026-11-02', 'week')
    expect(periods.map((p) => p.start)).toEqual(['2026-10-26', '2026-11-02'])
  })
})

describe('labels', () => {
  it('labels days and weeks by date and months by month on the axis', () => {
    expect(shortPeriodLabel(period({ start: '2026-11-02' }), 'day')).toBe('Nov 2')
    expect(shortPeriodLabel(period({ start: '2026-11-02' }), 'week')).toBe('Nov 2')
    expect(shortPeriodLabel(period({ start: '2026-11-01' }), 'month')).toBe('Nov')
  })

  it('spells out a day with its weekday', () => {
    expect(longPeriodLabel(period({ start: '2026-11-07', end: '2026-11-07' }), 'day')).toBe('Sat, Nov 7')
  })

  it('names a whole month, and gives a partial one its dates', () => {
    const whole = period({ start: '2026-10-01', end: '2026-10-31' })
    expect(longPeriodLabel(whole, 'month')).toBe('October 2026')
    const partial = period({ start: '2026-11-01', end: '2026-11-07', isPartial: true })
    expect(longPeriodLabel(partial, 'month')).toBe('Nov 1 – Nov 7')
  })

  it('gives a week its date span, collapsed to one date when it is a single day', () => {
    expect(longPeriodLabel(period({ start: '2026-11-02', end: '2026-11-08' }), 'week')).toBe('Nov 2 – Nov 8')
    expect(longPeriodLabel(period({ start: '2026-11-01', end: '2026-11-01', isPartial: true }), 'week')).toBe('Nov 1')
  })
})

describe('niceScale', () => {
  it.each([
    [0, { top: 100, step: 100 }],
    [400, { top: 400, step: 100 }],
    [401, { top: 500, step: 250 }],
    [2160, { top: 3000, step: 1000 }],
    [30000, { top: 30000, step: 5000 }],
  ])('rounds %i up to a ceiling with 3-5 gridlines', (max, expected) => {
    expect(niceScale(max)).toEqual(expected)
  })
})
