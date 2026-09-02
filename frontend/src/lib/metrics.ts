import type { RangeStatsPoint } from '../api/types'

export type MetricKey = 'calories' | 'protein' | 'carbs' | 'fat'

export interface MetricConfig {
  key: MetricKey
  label: string
  colorVar: string
  value: (point: RangeStatsPoint) => number
  goal: (point: RangeStatsPoint) => number
  formatAmount: (value: number) => string
}

// Colors mirror the token comments in tokens.css: accent is already earmarked "primary/protein",
// accent-2 "secondary/fat". Calories (the aggregate, not a macro) gets the neutral ink instead of
// a fourth hue; carbs takes the theme's remaining warm/yellow anchor. Shared between History's
// trend chart and Settings' "which metrics show by default" picker, so both always offer the
// same four in the same order.
export const METRICS: MetricConfig[] = [
  {
    key: 'calories',
    label: 'Calories',
    colorVar: '--color-ink',
    value: (p) => p.calories,
    goal: (p) => p.calorie_goal,
    formatAmount: (v) => `${Math.round(v)} kcal`,
  },
  {
    key: 'protein',
    label: 'Protein',
    colorVar: '--color-accent',
    value: (p) => p.protein_g,
    goal: (p) => p.protein_goal_g,
    formatAmount: (v) => `${Math.round(v)}g`,
  },
  {
    key: 'carbs',
    label: 'Carbs',
    colorVar: '--color-warning',
    value: (p) => p.carbs_g,
    goal: (p) => p.carbs_goal_g,
    formatAmount: (v) => `${Math.round(v)}g`,
  },
  {
    key: 'fat',
    label: 'Fat',
    colorVar: '--color-accent-2',
    value: (p) => p.fat_g,
    goal: (p) => p.fat_goal_g,
    formatAmount: (v) => `${Math.round(v)}g`,
  },
]
