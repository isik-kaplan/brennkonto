import { useState } from 'react'

import type { GroupBy } from '../api/types'
import { toISODate } from '../lib/dates'
import { type TrendPeriod, longPeriodLabel, niceScale, shortPeriodLabel } from '../lib/trendPeriods'

interface TrendChartProps {
  periods: TrendPeriod[]
  groupBy: GroupBy
}

const MAX_AXIS_LABELS = 7

function lastLoggedIndex(periods: TrendPeriod[]): number {
  for (let index = periods.length - 1; index >= 0; index--) {
    if (periods[index].avgCalories !== null) return index
  }
  return periods.length - 1
}

// Consecutive periods sharing a goal draw as one dashed segment, so the dash pattern stays even
// however narrow the columns get, and a goal change still shows as a step. Goals are either all
// null (nothing logged at all) or all set, since buildPeriods carries the last known goal forward.
function goalRuns(periods: TrendPeriod[]): { from: number; to: number; goal: number }[] {
  const runs: { from: number; to: number; goal: number }[] = []
  periods.forEach((period, index) => {
    if (period.calorieGoal === null) return
    const last = runs.at(-1)
    if (last?.goal === period.calorieGoal) last.to = index
    else runs.push({ from: index, to: index, goal: period.calorieGoal })
  })
  return runs
}

function describe(period: TrendPeriod, groupBy: GroupBy): string {
  const label = longPeriodLabel(period, groupBy)
  if (period.avgCalories === null) return `${label}: nothing logged`
  const unit = groupBy === 'day' ? 'kcal' : 'kcal per logged day'
  return `${label}: ${Math.round(period.avgCalories)} ${unit}`
}

export default function TrendChart({ periods, groupBy }: TrendChartProps) {
  const [selected, setSelected] = useState<number | null>(null)
  // The page remounts the chart for every new range, so a selection always indexes these periods.
  const activeIndex = selected ?? lastLoggedIndex(periods)
  const active = periods[activeIndex]

  const peak = Math.max(...periods.map((period) => Math.max(period.avgCalories ?? 0, period.calorieGoal ?? 0)))
  const { top, step } = niceScale(peak * 1.08)
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, index) => index * step)
  const pct = (value: number) => `${(value / top) * 100}%`
  // Always label the newest bar, then every nth one back from it.
  const labelEvery = Math.ceil(periods.length / MAX_AXIS_LABELS)
  const isDaily = groupBy === 'day'

  return (
    <div className="trend-chart">
      <div className="trend-chart__readout" aria-live="polite">
        <div className="trend-chart__readout-label">{longPeriodLabel(active, groupBy)}</div>
        <div className="trend-chart__readout-value">
          {active.avgCalories === null ? (
            <span className="trend-chart__readout-empty">Nothing logged</span>
          ) : (
            <>
              <span className="numeral">{Math.round(active.avgCalories)}</span>
              <span className="trend-chart__readout-unit">{isDaily ? 'kcal' : 'kcal / logged day'}</span>
            </>
          )}
        </div>
        <div className="trend-chart__readout-meta">
          {active.calorieGoal !== null && <>Goal {active.calorieGoal} · </>}
          {isDaily
            ? `${active.daysLogged ? 'Logged' : 'Not logged'}`
            : `${active.daysLogged} of ${active.daysInPeriod} days logged`}
          {active.isPartial && (active.end === toISODate(new Date()) ? ' · in progress' : ' · partial')}
        </div>
      </div>

      <div className="trend-chart__frame">
        <div className="trend-chart__y" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className="trend-chart__y-label numeral" style={{ bottom: pct(tick) }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="trend-chart__plot">
          {ticks.map((tick) => (
            <span key={tick} className="trend-chart__gridline" style={{ bottom: pct(tick) }} aria-hidden="true" />
          ))}
          {goalRuns(periods).map((run) => (
            <span
              key={run.from}
              className="trend-chart__goal"
              style={{
                bottom: pct(run.goal),
                left: `${(run.from / periods.length) * 100}%`,
                width: `${((run.to - run.from + 1) / periods.length) * 100}%`,
              }}
              aria-hidden="true"
            />
          ))}
          <div className={periods.length > 62 ? 'trend-chart__cols is-dense' : 'trend-chart__cols'}>
            {periods.map((period, index) => (
              <button
                key={period.start}
                type="button"
                className={
                  'trend-chart__col' +
                  (index === activeIndex ? ' is-active' : '') +
                  (period.isPartial ? ' is-partial' : '') +
                  (period.avgCalories === null ? ' is-empty' : '')
                }
                aria-label={describe(period, groupBy)}
                aria-pressed={index === activeIndex}
                onClick={() => setSelected(index)}
                onMouseEnter={() => setSelected(index)}
                onFocus={() => setSelected(index)}
              >
                {period.avgCalories !== null ? (
                  <span className="trend-chart__bar" style={{ height: pct(period.avgCalories) }} />
                ) : (
                  <span className="trend-chart__gap" />
                )}
              </button>
            ))}
          </div>
        </div>
        <div />
        <div className="trend-chart__x" aria-hidden="true">
          {periods.map((period, index) => {
            const stepsBack = (periods.length - 1 - index) / labelEvery
            // Every other label is minor, so a narrow chart can drop them and keep the rest apart.
            return (
              <span
                key={period.start}
                className={stepsBack % 2 === 1 ? 'trend-chart__x-label is-minor' : 'trend-chart__x-label'}
              >
                {Number.isInteger(stepsBack) ? shortPeriodLabel(period, groupBy) : ''}
              </span>
            )
          })}
        </div>
      </div>

      <div className="trend-chart__legend">
        <span className="trend-chart__key trend-chart__key--goal">Daily goal</span>
        {!isDaily && <span className="trend-chart__key trend-chart__key--partial">Partial or in progress</span>}
        <span className="trend-chart__key trend-chart__key--gap">Nothing logged</span>
      </div>
    </div>
  )
}
