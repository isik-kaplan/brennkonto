import { describe, expect, it } from 'vitest'

import type { RangeStatsPoint } from '../../src/api/types'
import { METRICS } from '../../src/lib/metrics'

const point = {
  calories: 1800,
  protein_g: 120,
  carbs_g: 210,
  fat_g: 60,
  calorie_goal: 2000,
  protein_goal_g: 150,
  carbs_goal_g: 250,
  fat_goal_g: 70,
} as RangeStatsPoint

describe('METRICS', () => {
  it('lists calories, protein, carbs and fat, in that order', () => {
    expect(METRICS.map((metric) => [metric.key, metric.label])).toEqual([
      ['calories', 'Calories'],
      ['protein', 'Protein'],
      ['carbs', 'Carbs'],
      ['fat', 'Fat'],
    ])
  })

  it('reads each metric its own value and goal', () => {
    expect(METRICS.map((metric) => [metric.value(point), metric.goal(point)])).toEqual([
      [1800, 2000],
      [120, 150],
      [210, 250],
      [60, 70],
    ])
  })

  it('formats calories in kcal and macros in grams, rounded', () => {
    expect(METRICS.map((metric) => metric.formatAmount(12.6))).toEqual(['13 kcal', '13g', '13g', '13g'])
  })

  it('gives every metric its own theme color', () => {
    const colors = METRICS.map((metric) => metric.colorVar)
    expect(new Set(colors).size).toBe(METRICS.length)
    for (const color of colors) expect(color).toMatch(/^--color-[a-z0-9-]+$/)
  })
})
