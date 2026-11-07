import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TrendChart from '../../src/components/TrendChart'
import { addDays } from '../../src/lib/dates'
import type { TrendPeriod } from '../../src/lib/trendPeriods'

function day(start: string, overrides: Partial<TrendPeriod> = {}): TrendPeriod {
  return {
    start,
    end: start,
    daysInPeriod: 1,
    daysLogged: 1,
    avgCalories: 1000,
    avgProtein: 100,
    avgCarbs: 100,
    avgFat: 50,
    calorieGoal: 1500,
    isPartial: false,
    ...overrides,
  }
}

function days(count: number, overrides: Partial<TrendPeriod> = {}): TrendPeriod[] {
  return Array.from({ length: count }, (_, index) => day(addDays('2026-11-01', index), overrides))
}

const readout = () => document.querySelector('.trend-chart__readout')!.textContent
const columns = () => [...document.querySelectorAll('.trend-chart__col')]
const goals = () => [...document.querySelectorAll<HTMLElement>('.trend-chart__goal')]

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TrendChart', () => {
  it('reads out the newest logged period by default, skipping trailing gaps', () => {
    render(
      <TrendChart
        periods={[day('2026-11-05', { avgCalories: 1200 }), day('2026-11-06', { avgCalories: null, daysLogged: 0 })]}
        groupBy="day"
      />
    )
    expect(readout()).toBe('Thu, Nov 51200kcalGoal 1500 · Logged')
    expect(columns()[0]).toHaveClass('is-active')
    expect(columns()[0]).toHaveAttribute('aria-pressed', 'true')
    expect(columns()[1]).not.toHaveClass('is-active')
    expect(columns()[1]).toHaveAttribute('aria-pressed', 'false')
  })

  it('falls back to the newest period when nothing was logged at all', () => {
    render(<TrendChart periods={days(2, { avgCalories: null, daysLogged: 0, calorieGoal: null })} groupBy="day" />)
    expect(readout()).toBe('Mon, Nov 2Nothing loggedNot logged')
    expect(columns()[1]).toHaveClass('is-active')
    expect(goals()).toHaveLength(0)
  })

  it('moves the readout to a bar on click, hover and focus', () => {
    render(<TrendChart periods={days(3).map((p, i) => ({ ...p, avgCalories: 1000 + i }))} groupBy="day" />)
    fireEvent.click(columns()[0])
    expect(readout()).toContain('1000kcal')
    fireEvent.mouseEnter(columns()[1])
    expect(readout()).toContain('1001kcal')
    fireEvent.focus(columns()[2])
    expect(readout()).toContain('1002kcal')
    fireEvent.click(columns()[0])
    expect(columns()[0]).toHaveClass('is-active')
  })

  it('reads a week or month out per logged day, with its days logged, and flags it in progress or partial', () => {
    const week = day('2026-11-02', { end: '2026-11-07', daysInPeriod: 6, daysLogged: 5, isPartial: true })
    const { unmount } = render(<TrendChart periods={[week]} groupBy="week" />)
    expect(readout()).toBe('Nov 2 – Nov 71000kcal / logged dayGoal 1500 · 5 of 6 days logged · in progress')
    expect(columns()[0]).toHaveClass('is-partial')
    unmount()

    render(<TrendChart periods={[{ ...week, end: '2026-11-06' }]} groupBy="week" />)
    expect(readout()).toBe('Nov 2 – Nov 61000kcal / logged dayGoal 1500 · 5 of 6 days logged · partial')
  })

  it('does not flag a whole period', () => {
    render(<TrendChart periods={[day('2026-10-26', { end: '2026-11-01', daysInPeriod: 7 })]} groupBy="week" />)
    expect(readout()).toBe('Oct 26 – Nov 11000kcal / logged dayGoal 1500 · 1 of 7 days logged')
    expect(columns()[0]).not.toHaveClass('is-partial')
  })

  it('labels every bar for screen readers', () => {
    render(
      <TrendChart
        periods={[
          day('2026-10-26', { end: '2026-11-01', avgCalories: 1234.4 }),
          day('2026-11-02', { end: '2026-11-08', avgCalories: null }),
        ]}
        groupBy="week"
      />
    )
    expect(screen.getByRole('button', { name: 'Oct 26 – Nov 1: 1234 kcal per logged day' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Nov 2 – Nov 8: nothing logged' })).toHaveClass('is-empty')
  })

  it('labels a day bar in plain kcal', () => {
    render(<TrendChart periods={[day('2026-11-07', { avgCalories: 999.6 })]} groupBy="day" />)
    expect(screen.getByRole('button', { name: 'Sat, Nov 7: 1000 kcal' })).not.toHaveClass('is-empty')
  })

  it('scales bars, gridlines and the goal to a rounded ceiling above the tallest value', () => {
    render(
      <TrendChart
        periods={[day('2026-11-06', { avgCalories: 1000 }), day('2026-11-07', { avgCalories: 500 })]}
        groupBy="day"
      />
    )
    const tickLabels = [...document.querySelectorAll('.trend-chart__y-label')].map((label) => label.textContent)
    expect(tickLabels).toEqual(['0', '500', '1000', '1500', '2000'])
    expect(document.querySelector('.trend-chart__y-label:last-child')).toHaveStyle({ bottom: '100%' })
    expect(document.querySelectorAll('.trend-chart__gridline')).toHaveLength(5)
    expect(document.querySelectorAll<HTMLElement>('.trend-chart__gridline')[1]).toHaveStyle({ bottom: '25%' })
    const bars = [...document.querySelectorAll<HTMLElement>('.trend-chart__bar')]
    expect(bars.map((bar) => bar.style.height)).toEqual(['50%', '25%'])
    expect(goals()).toHaveLength(1)
    expect(goals()[0]).toHaveStyle({ bottom: '75%', left: '0%', width: '100%' })
  })

  it('lets the tallest bar, not only the goal, set the ceiling', () => {
    render(<TrendChart periods={[day('2026-11-07', { avgCalories: 3000, calorieGoal: 1000 })]} groupBy="day" />)
    const tickLabels = [...document.querySelectorAll('.trend-chart__y-label')].map((label) => label.textContent)
    expect(tickLabels.at(-1)).toBe('4000')
  })

  it('draws the goal as one segment per run of equal goals, stepping where it changes', () => {
    const periods = [
      day('2026-11-01', { calorieGoal: 1500 }),
      day('2026-11-02', { calorieGoal: 1500 }),
      day('2026-11-03', { calorieGoal: 1000 }),
      day('2026-11-04', { calorieGoal: 1000 }),
    ]
    render(<TrendChart periods={periods} groupBy="day" />)
    expect(goals()).toHaveLength(2)
    expect(goals()[0]).toHaveStyle({ bottom: '75%', left: '0%', width: '50%' })
    expect(goals()[1]).toHaveStyle({ bottom: '50%', left: '50%', width: '50%' })
  })

  it('marks a gap where nothing was logged instead of a bar', () => {
    render(<TrendChart periods={[day('2026-11-07', { avgCalories: null, daysLogged: 0 })]} groupBy="day" />)
    expect(document.querySelector('.trend-chart__bar')).not.toBeInTheDocument()
    expect(document.querySelector('.trend-chart__gap')).toBeInTheDocument()
  })

  it('labels the newest bar and every nth one back from it', () => {
    render(<TrendChart periods={days(15)} groupBy="day" />)
    const labels = [...document.querySelectorAll('.trend-chart__x-label')].map((label) => label.textContent)
    expect(labels.filter(Boolean)).toEqual(['Nov 3', 'Nov 6', 'Nov 9', 'Nov 12', 'Nov 15'])
    expect(labels).toHaveLength(15)
  })

  it('labels every bar when there are few enough', () => {
    render(<TrendChart periods={days(7)} groupBy="day" />)
    const labels = [...document.querySelectorAll('.trend-chart__x-label')].map((label) => label.textContent)
    expect(labels).toEqual(['Nov 1', 'Nov 2', 'Nov 3', 'Nov 4', 'Nov 5', 'Nov 6', 'Nov 7'])
  })

  it('switches to the dense layout only past 62 bars', () => {
    const { unmount } = render(<TrendChart periods={days(62)} groupBy="day" />)
    expect(document.querySelector('.trend-chart__cols')).not.toHaveClass('is-dense')
    unmount()
    render(<TrendChart periods={days(63)} groupBy="day" />)
    expect(document.querySelector('.trend-chart__cols')).toHaveClass('is-dense')
  })

  it('only explains the partial hatching when bars can be partial', () => {
    const { unmount } = render(<TrendChart periods={days(1)} groupBy="day" />)
    expect(screen.queryByText('Partial or in progress')).not.toBeInTheDocument()
    unmount()
    render(<TrendChart periods={days(1)} groupBy="month" />)
    expect(screen.getByText('Partial or in progress')).toBeInTheDocument()
  })
})
