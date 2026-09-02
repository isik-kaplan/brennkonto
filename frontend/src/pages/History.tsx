import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'

import { Link } from 'react-router'

import {
  deleteEntry,
  deleteMealGroup,
  fetchArchivedEntries,
  fetchDailyStats,
  fetchMealGroups,
  fetchRangeStats,
  moveEntryToGroup,
  permanentlyDeleteEntry,
  restoreEntry,
  updateEntry,
  updateMealGroup,
} from '../api/endpoints'
import type { DailyStats, FoodEntry, MealGroup, RangeStats } from '../api/types'
import AddEntryPanel from '../components/AddEntryPanel'
import BarChart from '../components/BarChart'
import ConfirmDialog from '../components/ConfirmDialog'
import EntryList, { type EntryEditValues } from '../components/EntryList'
import RangeSummary from '../components/RangeSummary'
import { useHistoryPreferences } from '../hooks/useHistoryPreferences'
import { addDays, displayDate, fromISODate, toISODate } from '../lib/dates'
import type { MetricKey } from '../lib/metrics'
import { METRICS } from '../lib/metrics'

const TREND_WINDOW_DAYS = 14

function shortDayLabel(periodStart: string): string {
  return fromISODate(periodStart).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}

export default function History() {
  // Settings' "History defaults" only ever seeds this initial state - once the page has mounted,
  // toggling a metric or Show amounts here is a per-visit adjustment, not a rewrite of the saved
  // default. Read once via the hook's lazy initializer, same as `date` and the toggles below.
  const { preferences } = useHistoryPreferences()
  const [date, setDate] = useState(toISODate(new Date()))
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [groups, setGroups] = useState<MealGroup[]>([])
  const [trend, setTrend] = useState<RangeStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showRemoved, setShowRemoved] = useState(false)
  const [archivedEntries, setArchivedEntries] = useState<FoodEntry[]>([])
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<FoodEntry | null>(null)
  const [activeMetrics, setActiveMetrics] = useState<Set<MetricKey>>(() => new Set(preferences.activeMetrics))
  const [showAmounts, setShowAmounts] = useState(preferences.showAmounts)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [dailyStats, mealGroups, trendStats] = await Promise.all([
        fetchDailyStats(date),
        fetchMealGroups(),
        fetchRangeStats(addDays(date, -(TREND_WINDOW_DAYS - 1)), date, 'day'),
      ])
      setStats(dailyStats)
      setGroups(mealGroups)
      setTrend(trendStats)
    } finally {
      setIsLoading(false)
    }
  }, [date])

  useEffect(() => {
    load()
  }, [load])

  const loadArchived = useCallback(async () => {
    setArchivedEntries(await fetchArchivedEntries(date))
  }, [date])

  useEffect(() => {
    if (showRemoved) {
      loadArchived()
    }
  }, [showRemoved, loadArchived])

  async function handleDelete(entry: FoodEntry) {
    setDeletingId(entry.id)
    try {
      await deleteEntry(entry.id)
      await load()
      if (showRemoved) await loadArchived()
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRestore(entry: FoodEntry) {
    await restoreEntry(entry.id)
    await load()
    await loadArchived()
  }

  async function handlePermanentDelete(entry: FoodEntry) {
    await permanentlyDeleteEntry(entry.id)
    setPendingPermanentDelete(null)
    await loadArchived()
  }

  async function handleMoveEntry(entry: FoodEntry, targetGroupId: string) {
    await moveEntryToGroup(entry.id, targetGroupId)
    await load()
  }

  async function handleRenameGroup(groupId: string, name: string) {
    await updateMealGroup(groupId, { name })
    await load()
  }

  async function handleUngroup(groupId: string) {
    await deleteMealGroup(groupId)
    await load()
  }

  async function handleUpdateEntry(entry: FoodEntry, updates: EntryEditValues) {
    await updateEntry(entry.id, updates.grams, updates.consumedAt, updates.inputAmount)
    await load()
  }

  async function handleEntryAdded() {
    await load()
    if (showRemoved) await loadArchived()
  }

  const isToday = date === toISODate(new Date())

  // A repeated entry always lands on today, never on whatever date is currently being viewed - so
  // there's only something to refresh here when today is what's already on screen. Browsing a
  // past date and repeating one of its entries logs it for today invisibly as far as this view is
  // concerned; the row's own "Repeated ✓" confirmation is the only feedback for that case.
  async function handleEntryRepeated() {
    if (isToday) await load()
  }

  function toggleMetric(key: MetricKey) {
    setActiveMetrics((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  return (
    <>
      <div className="page-header">
        <h1>History</h1>
      </div>

      <div className="range-controls">
        <button type="button" className="btn" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          ← Prev
        </button>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="history-date" className="visually-hidden">
            Date
          </label>
          <input
            id="history-date"
            className="input"
            type="date"
            value={date}
            max={toISODate(new Date())}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setDate(addDays(date, 1))}
          disabled={isToday}
          aria-label="Next day"
        >
          Next →
        </button>
      </div>

      {isLoading || !stats ? (
        <div className="centered-loader">Loading…</div>
      ) : (
        <div className="card">
          <h2 className="card__title">{displayDate(date)}</h2>
          <div className="stat-strip">
            <div className="stat-tile">
              <div className="stat-tile__label">Calories</div>
              <div className="stat-tile__value">{Math.round(stats.calories)}</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile__label">Protein</div>
              <div className="stat-tile__value">{Math.round(stats.protein_g)}g</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile__label">Carbs</div>
              <div className="stat-tile__value">{Math.round(stats.carbs_g)}g</div>
            </div>
            <div className="stat-tile">
              <div className="stat-tile__label">Fat</div>
              <div className="stat-tile__value">{Math.round(stats.fat_g)}g</div>
            </div>
          </div>

          {trend && (
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <h3 className="card__title">Last {TREND_WINDOW_DAYS} days</h3>
              <div className="metric-toggles" role="group" aria-label="Metrics shown in the chart">
                {METRICS.map((metric) => {
                  const isActive = activeMetrics.has(metric.key)
                  return (
                    <button
                      key={metric.key}
                      type="button"
                      className="metric-toggle"
                      aria-pressed={isActive}
                      style={{ '--dot-color': `var(${metric.colorVar})` } as CSSProperties}
                      onClick={() => toggleMetric(metric.key)}
                    >
                      <span className="metric-toggle__dot" aria-hidden="true" />
                      {metric.label}
                    </button>
                  )
                })}
                <button
                  type="button"
                  className="btn btn--ghost btn--small"
                  aria-pressed={showAmounts}
                  onClick={() => setShowAmounts((v) => !v)}
                >
                  {showAmounts ? 'Hide amounts' : 'Show amounts'}
                </button>
              </div>

              {activeMetrics.size === 0 ? (
                <p className="page-header__meta">Pick at least one metric above to see its bars.</p>
              ) : (
                <>
                  <BarChart
                    points={trend.points.map((point) => ({
                      label: shortDayLabel(point.period_start),
                      bars: METRICS.filter((metric) => activeMetrics.has(metric.key)).map((metric) => ({
                        key: metric.key,
                        colorVar: metric.colorVar,
                        value: Math.round((metric.value(point) / Math.max(metric.goal(point), 1)) * 100),
                        amountLabel: showAmounts ? metric.formatAmount(metric.value(point)) : undefined,
                      })),
                    }))}
                    goal={100}
                    sparse={trend.days_logged < Math.min(3, trend.days_in_range)}
                  />
                  <p className="page-header__meta" style={{ marginTop: 'var(--space-md)' }}>
                    % of each metric's own daily goal met. Dashed line marks 100%.
                    {showAmounts && ' The logged amount is labeled above each bar.'}
                  </p>
                </>
              )}
            </div>
          )}

          <AddEntryPanel date={date} onAdded={handleEntryAdded} />

          <EntryList
            entries={stats.entries}
            onDelete={handleDelete}
            deletingId={deletingId}
            emptyMessage={isToday ? 'Nothing logged yet today.' : 'Nothing was logged on this day.'}
            groups={groups}
            onMoveEntry={handleMoveEntry}
            onRenameGroup={handleRenameGroup}
            onUngroup={handleUngroup}
            onUpdateEntry={handleUpdateEntry}
            onEntryRepeated={handleEntryRepeated}
          />

          {isToday && stats.entries.length === 0 && (
            <p style={{ marginTop: 'var(--space-md)' }}>
              <Link to="/log" className="btn btn--primary">
                + Log food
              </Link>
            </p>
          )}

          <p style={{ marginTop: 'var(--space-lg)' }}>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setShowRemoved((v) => !v)}>
              {showRemoved ? 'Hide removed' : 'Show removed'}
            </button>
          </p>

          {showRemoved && (
            <div style={{ marginTop: 'var(--space-md)' }}>
              <h3 className="card__title">Removed on {displayDate(date)}</h3>
              {archivedEntries.length === 0 ? (
                <div className="empty-state">Nothing removed on this day.</div>
              ) : (
                <ul className="entry-list">
                  {archivedEntries.map((entry) => (
                    <li key={entry.id} className="entry-row">
                      <div>
                        <div className="entry-row__name">{entry.name}</div>
                        <div className="entry-row__meta">{entry.grams}g</div>
                      </div>
                      <div className="entry-row__calories numeral">{Math.round(entry.calories)} kcal</div>
                      <div className="entry-row__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => handleRestore(entry)}
                        >
                          Restore
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setPendingPermanentDelete(entry)}
                        >
                          Delete permanently
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      <RangeSummary defaultPreset={preferences.aggregateRangePreset} />

      {pendingPermanentDelete && (
        <ConfirmDialog
          title="Permanently delete this entry?"
          message={`"${pendingPermanentDelete.name}" will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete permanently"
          isDestructive
          onConfirm={() => handlePermanentDelete(pendingPermanentDelete)}
          onCancel={() => setPendingPermanentDelete(null)}
        />
      )}
    </>
  )
}
