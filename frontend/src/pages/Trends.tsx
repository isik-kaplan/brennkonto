import { useCallback, useEffect, useState } from 'react'

import { fetchRangeStats } from '../api/endpoints'
import type { GroupBy, RangeStats } from '../api/types'
import BarChart from '../components/BarChart'
import { addDays, fromISODate, toISODate } from '../lib/dates'

type Preset = '7' | '30' | '90' | 'custom'

function presetRange(preset: Preset, customStart: string, customEnd: string): { start: string; end: string } {
  const end = toISODate(new Date())
  if (preset === 'custom') {
    return { start: customStart, end: customEnd }
  }
  return { start: addDays(end, -(Number(preset) - 1)), end }
}

function defaultGroupBy(preset: Preset): GroupBy {
  if (preset === '90') return 'week'
  return 'day'
}

function shortLabel(periodStart: string, groupBy: GroupBy): string {
  const date = fromISODate(periodStart)
  if (groupBy === 'month') {
    return date.toLocaleDateString(undefined, { month: 'short' })
  }
  if (groupBy === 'week') {
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

function daysBetween(start: string, end: string): number {
  const MS_PER_DAY = 24 * 60 * 60 * 1000
  return Math.round((fromISODate(end).getTime() - fromISODate(start).getTime()) / MS_PER_DAY) + 1
}

function previousPeriod(start: string, end: string): { start: string; end: string } {
  const length = daysBetween(start, end)
  const previousEnd = addDays(start, -1)
  return { start: addDays(previousEnd, -(length - 1)), end: previousEnd }
}

function formatDelta(current: number, previous: number): string {
  const delta = Math.round(current - previous)
  if (delta === 0) return 'Same as the previous period'
  return `${delta > 0 ? '+' : ''}${delta} vs the previous period`
}

export default function Trends() {
  const [preset, setPreset] = useState<Preset>('7')
  const [groupBy, setGroupBy] = useState<GroupBy>('day')
  const [customStart, setCustomStart] = useState(addDays(toISODate(new Date()), -6))
  const [customEnd, setCustomEnd] = useState(toISODate(new Date()))
  const [stats, setStats] = useState<RangeStats | null>(null)
  const [previousStats, setPreviousStats] = useState<RangeStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback(async () => {
    const { start, end } = presetRange(preset, customStart, customEnd)
    const previous = previousPeriod(start, end)
    setIsLoading(true)
    try {
      const [current, before] = await Promise.all([
        fetchRangeStats(start, end, groupBy),
        fetchRangeStats(previous.start, previous.end, groupBy),
      ])
      setStats(current)
      setPreviousStats(before)
    } finally {
      setIsLoading(false)
    }
  }, [preset, groupBy, customStart, customEnd])

  useEffect(() => {
    load()
  }, [load])

  function choosePreset(next: Preset) {
    setPreset(next)
    setGroupBy(defaultGroupBy(next))
  }

  return (
    <>
      <div className="page-header">
        <h1>Trends</h1>
      </div>

      <div className="range-controls">
        <div className="segmented" role="group" aria-label="Time range">
          {(['7', '30', '90', 'custom'] as Preset[]).map((value) => (
            <button
              key={value}
              type="button"
              className={preset === value ? 'is-active' : ''}
              onClick={() => choosePreset(value)}
            >
              {value === 'custom' ? 'Custom' : `${value}d`}
            </button>
          ))}
        </div>

        <div className="segmented" role="group" aria-label="Group by">
          {(['day', 'week', 'month'] as GroupBy[]).map((value) => (
            <button
              key={value}
              type="button"
              className={groupBy === value ? 'is-active' : ''}
              onClick={() => setGroupBy(value)}
            >
              {value[0].toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>

        {preset === 'custom' && (
          <>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="start" className="visually-hidden">
                Start date
              </label>
              <input
                id="start"
                className="input"
                type="date"
                value={customStart}
                max={customEnd}
                onChange={(event) => setCustomStart(event.target.value)}
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label htmlFor="end" className="visually-hidden">
                End date
              </label>
              <input
                id="end"
                className="input"
                type="date"
                value={customEnd}
                min={customStart}
                max={toISODate(new Date())}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </div>
          </>
        )}
      </div>

      {isLoading || !stats ? (
        <div className="centered-loader">Loading…</div>
      ) : (
        <>
          <div className="stat-strip">
            <div className="stat-tile">
              <div className="stat-tile__label">Avg calories / logged day</div>
              <div className="stat-tile__value">{Math.round(stats.average_calories)}</div>
              {previousStats && previousStats.days_logged > 0 && (
                <div className="stat-tile__delta">
                  {formatDelta(stats.average_calories, previousStats.average_calories)}
                </div>
              )}
            </div>
            <div className="stat-tile">
              <div className="stat-tile__label">Avg protein</div>
              <div className="stat-tile__value">{Math.round(stats.average_protein_g)}g</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile__label">Avg carbs</div>
              <div className="stat-tile__value">{Math.round(stats.average_carbs_g)}g</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile__label">Avg fat</div>
              <div className="stat-tile__value">{Math.round(stats.average_fat_g)}g</div>
            </div>
          </div>

          <div className="card">
            <h2 className="card__title">Calories</h2>
            <BarChart
              points={stats.points.map((point) => ({
                label: shortLabel(point.period_start, groupBy),
                value: point.calories,
              }))}
              goal={stats.points.at(-1)?.calorie_goal}
              sparse={stats.days_logged < Math.min(3, stats.days_in_range)}
            />
            <p className="page-header__meta" style={{ marginTop: 'var(--space-md)' }}>
              Logged {stats.days_logged} of {stats.days_in_range} days in range. Dashed line marks your daily goal.
            </p>
          </div>

          <div className="card">
            <h2 className="card__title">By period</h2>
            <ul className="entry-list">
              {stats.points.map((point) => (
                <li key={point.period_start} className="entry-row">
                  <div>
                    <div className="entry-row__name">{point.period_label}</div>
                    <div className="entry-row__meta">
                      P{Math.round(point.protein_g)} C{Math.round(point.carbs_g)} F{Math.round(point.fat_g)} ·{' '}
                      {point.days_logged} day{point.days_logged === 1 ? '' : 's'} logged
                    </div>
                  </div>
                  <div className="entry-row__calories numeral">{Math.round(point.calories)} kcal</div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  )
}
