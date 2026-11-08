import { useEffect, useState } from 'react'

import { fetchRangeStats } from '../api/endpoints'
import type { GroupBy, RangeStats } from '../api/types'
import TrendChart from '../components/TrendChart'
import { useQueryParams } from '../hooks/useQueryParams'
import { addDays, daysBetween, isISODate, toISODate } from '../lib/dates'
import { buildPeriods, defaultGrouping, isGroupingUsable, lastNRange, longPeriodLabel } from '../lib/trendPeriods'

type Interval = GroupBy | 'custom'

const GROUPINGS: GroupBy[] = ['day', 'week', 'month', 'year']
const GROUP_LABELS: Record<GroupBy, string> = { day: 'Days', week: 'Weeks', month: 'Months', year: 'Years' }
const INTERVAL_LABELS: Record<Interval, string> = { ...GROUP_LABELS, custom: 'Custom' }

// Counts offered per interval, plus a ceiling for "Other" that keeps one request's bucket count sane.
const COUNTS: Record<GroupBy, { presets: number[]; fallback: number; max: number }> = {
  day: { presets: [7, 30, 90, 365], fallback: 7, max: 730 },
  week: { presets: [4, 12, 26, 52], fallback: 12, max: 156 },
  month: { presets: [3, 6, 12, 24], fallback: 6, max: 60 },
  year: { presets: [2, 3, 5], fallback: 2, max: 10 },
}

// The same stretch immediately before this one: the previous N weeks for "last N weeks", the
// same number of days for a custom range.
function previousPeriod(start: string, end: string, interval: Interval, count: number): { start: string; end: string } {
  const previousEnd = addDays(start, -1)
  if (interval !== 'custom') return lastNRange(interval, count, previousEnd)
  return { start: addDays(previousEnd, -(daysBetween(start, end) - 1)), end: previousEnd }
}

function formatDelta(current: number, previous: number): string {
  const delta = Math.round(current - previous)
  if (delta === 0) return 'Same as the previous period'
  // Stryker disable next-line EqualityOperator: zero already returned above, so > and >= agree
  return `${delta > 0 ? '+' : ''}${delta} vs the previous period`
}

function MacroTile({
  label,
  value,
  goal,
  modifier,
}: {
  label: string
  value: number
  goal?: number
  modifier: string
}) {
  const progress = goal ? Math.min(value / goal, 1) : 0
  return (
    <div className="trend-macro">
      <div className="trend-macro__row">
        <span className="trend-macro__label">{label}</span>
        <span className="trend-macro__value numeral">
          {Math.round(value)}g{goal !== undefined && <span className="trend-macro__goal"> / {goal}g</span>}
        </span>
      </div>
      <div className="macro-bar__track">
        <div className={`macro-bar__fill macro-bar__fill--${modifier}`} style={{ width: `${progress * 100}%` }} />
      </div>
    </div>
  )
}

function isInterval(value: string | null): value is Interval {
  return value === 'custom' || GROUPINGS.includes(value as GroupBy)
}

function isValidCount(value: number, interval: GroupBy): boolean {
  return Number.isInteger(value) && value >= 1 && value <= COUNTS[interval].max
}

export default function Trends() {
  const today = toISODate(new Date())
  // The range lives in the URL - ?interval=week&count=12, or
  // ?interval=custom&start=YYYY-MM-DD&end=YYYY-MM-DD&group=week - so a refresh or a shared link
  // shows the same chart. Anything missing or invalid falls back to the defaults below.
  const [params, updateParams] = useQueryParams()
  const intervalParam = params.get('interval')
  const interval: Interval = isInterval(intervalParam) ? intervalParam : 'day'
  const countParam = Number(params.get('count'))
  const count = interval === 'custom' ? 0 : isValidCount(countParam, interval) ? countParam : COUNTS[interval].fallback
  const [isOtherCount, setIsOtherCount] = useState(interval !== 'custom' && !COUNTS[interval].presets.includes(count))
  const [countDraft, setCountDraft] = useState(String(count))
  // Null until someone picks one, so the range's own default applies.
  const groupParam = params.get('group')
  const customGroupBy = GROUPINGS.includes(groupParam as GroupBy) ? (groupParam as GroupBy) : null
  const startParam = params.get('start')
  const endParam = params.get('end')
  const customEnd = isISODate(endParam) ? endParam : today
  const defaultStart = addDays(today, -29)
  const requestedStart = isISODate(startParam) ? startParam : defaultStart
  // Only a hand-edited URL can put the start after the end; the date inputs never allow it.
  const customStart = requestedStart <= customEnd ? requestedStart : addDays(customEnd, -29)
  const [loaded, setLoaded] = useState<{ key: string; stats: RangeStats; previousStats: RangeStats } | null>(null)

  const { start, end } =
    interval === 'custom' ? { start: customStart, end: customEnd } : lastNRange(interval, count, today)
  // A grouping picked for an earlier, different range falls back to the default once it stops
  // fitting, rather than drawing one lone bar or a thousand hairline days.
  const groupBy: GroupBy =
    interval !== 'custom'
      ? interval
      : customGroupBy && isGroupingUsable(start, end, customGroupBy)
        ? customGroupBy
        : defaultGrouping(daysBetween(start, end))

  // Results are tagged with the request they answer, so a slow earlier request (a 365-day range)
  // that resolves after a quick later one can never overwrite it, and a render between a control
  // change and its response never pairs old points with the new grouping.
  const requestKey = `${start}|${end}|${groupBy}`
  useEffect(() => {
    let isStale = false
    const previous = previousPeriod(start, end, interval, count)
    Promise.all([fetchRangeStats(start, end, groupBy), fetchRangeStats(previous.start, previous.end, groupBy)]).then(
      ([current, before]) => {
        if (!isStale) setLoaded({ key: requestKey, stats: current, previousStats: before })
      }
    )
    return () => {
      isStale = true
    }
  }, [requestKey, start, end, groupBy, interval, count])

  const answer = loaded?.key === requestKey ? loaded : null
  const stats = answer?.stats
  const previousStats = answer?.previousStats

  // Each interval keeps only its own params, so the URL never carries a stale count or range.
  function chooseInterval(next: Interval) {
    if (next === 'custom') {
      updateParams({ interval: next, count: null })
      return
    }
    updateParams({ interval: next, count: null, start: null, end: null, group: null })
    setCountDraft(String(COUNTS[next].fallback))
    setIsOtherCount(false)
  }

  function choosePresetCount(next: number) {
    updateParams({ count: String(next) })
    setCountDraft(String(next))
    setIsOtherCount(false)
  }

  function changeCountDraft(value: string) {
    setCountDraft(value)
    const parsed = Number(value)
    // Only rendered for a day/week/month/year interval, never for custom.
    if (isValidCount(parsed, interval as GroupBy)) {
      updateParams({ count: String(parsed) })
    }
  }

  const setCustomStart = (value: string) => updateParams({ start: value || null })
  const setCustomEnd = (value: string) => updateParams({ end: value || null })
  const setCustomGroupBy = (value: GroupBy) => updateParams({ group: value })

  const periods = stats && buildPeriods(stats.points, start, end, groupBy)
  const latestGoal = stats?.points.at(-1)

  return (
    <>
      <div className="page-header">
        <h1>Trends</h1>
      </div>

      <div className="range-controls">
        <div className="segmented" role="group" aria-label="Interval">
          {([...GROUPINGS, 'custom'] as Interval[]).map((value) => (
            <button
              key={value}
              type="button"
              className={interval === value ? 'is-active' : ''}
              onClick={() => chooseInterval(value)}
            >
              {INTERVAL_LABELS[value]}
            </button>
          ))}
        </div>

        {interval !== 'custom' ? (
          <div className="trend-count">
            <span className="trend-count__lead">Last</span>
            <div
              className="segmented segmented--sm"
              role="group"
              aria-label={`How many ${GROUP_LABELS[interval].toLowerCase()}`}
            >
              {COUNTS[interval].presets.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={!isOtherCount && count === value ? 'is-active' : ''}
                  onClick={() => choosePresetCount(value)}
                >
                  {value}
                </button>
              ))}
              <button type="button" className={isOtherCount ? 'is-active' : ''} onClick={() => setIsOtherCount(true)}>
                Other
              </button>
            </div>
            {isOtherCount && (
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="trend-count" className="visually-hidden">
                  Number of {GROUP_LABELS[interval].toLowerCase()}
                </label>
                <input
                  id="trend-count"
                  className="input trend-count__input"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={COUNTS[interval].max}
                  value={countDraft}
                  autoFocus
                  onChange={(event) => changeCountDraft(event.target.value)}
                />
              </div>
            )}
            <span className="trend-count__lead">{GROUP_LABELS[interval].toLowerCase()}</span>
          </div>
        ) : (
          <div className="trend-dates">
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
            <span className="trend-dates__sep" aria-hidden="true">
              to
            </span>
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
                max={today}
                onChange={(event) => setCustomEnd(event.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {!stats ? (
        <div className="centered-loader">Loading…</div>
      ) : (
        <>
          <section className="card trend-summary">
            <div className="trend-summary__calories">
              <div className="eyebrow">Average per logged day</div>
              <div className="trend-summary__value">
                <span className="numeral">{Math.round(stats.average_calories)}</span>
                <span className="trend-summary__unit">kcal</span>
              </div>
              <div className="trend-summary__meta">
                {latestGoal && <span>Goal {latestGoal.calorie_goal}</span>}
                {/* Loaded together with stats, so it's set whenever stats is. */}
                {previousStats!.days_logged > 0 && (
                  <span className="stat-tile__delta">
                    {formatDelta(stats.average_calories, previousStats!.average_calories)}
                  </span>
                )}
              </div>
              <div className="trend-summary__logged">
                Logged <span className="numeral">{stats.days_logged}</span> of{' '}
                <span className="numeral">{stats.days_in_range}</span> days
              </div>
            </div>
            <div className="trend-summary__macros">
              <MacroTile
                label="Protein"
                value={stats.average_protein_g}
                goal={latestGoal?.protein_goal_g}
                modifier="protein"
              />
              <MacroTile label="Carbs" value={stats.average_carbs_g} goal={latestGoal?.carbs_goal_g} modifier="carbs" />
              <MacroTile label="Fat" value={stats.average_fat_g} goal={latestGoal?.fat_goal_g} modifier="fat" />
            </div>
          </section>

          <section className="card">
            <div className="trend-card-head">
              <h2 className="card__title">Calories</h2>
              {interval === 'custom' && (
                <div className="segmented segmented--sm" role="group" aria-label="Group by">
                  {GROUPINGS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      className={groupBy === value ? 'is-active' : ''}
                      disabled={!isGroupingUsable(start, end, value)}
                      title={
                        isGroupingUsable(start, end, value)
                          ? undefined
                          : `This range is too ${value === 'day' ? 'long' : 'short'} to group by ${value}`
                      }
                      onClick={() => setCustomGroupBy(value)}
                    >
                      {GROUP_LABELS[value]}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <TrendChart key={requestKey} periods={periods!} groupBy={groupBy} />
          </section>

          {groupBy !== 'day' && (
            <section className="card">
              <h2 className="card__title">{GROUP_LABELS[groupBy]}</h2>
              <ul className="trend-periods">
                {[...periods!].reverse().map((period) => (
                  <li key={period.start} className="trend-periods__row">
                    <div>
                      <div className="trend-periods__name">{longPeriodLabel(period, groupBy)}</div>
                      <div className="trend-periods__meta">
                        {period.daysLogged} of {period.daysInPeriod} day{period.daysInPeriod === 1 ? '' : 's'} logged
                        {period.avgProtein !== null &&
                          ` · P ${Math.round(period.avgProtein)}g · C ${Math.round(period.avgCarbs!)}g · F ${Math.round(period.avgFat!)}g per day`}
                      </div>
                    </div>
                    <div className="trend-periods__value">
                      {period.avgCalories === null ? (
                        <span className="trend-periods__empty">—</span>
                      ) : (
                        <>
                          <span className="numeral">{Math.round(period.avgCalories)}</span>
                          <span className="trend-periods__unit">kcal / day</span>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </>
  )
}
