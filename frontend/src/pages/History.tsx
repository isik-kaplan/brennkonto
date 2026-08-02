import { useCallback, useEffect, useState } from 'react'

import { Link } from 'react-router'

import {
  deleteEntry,
  deleteMealGroup,
  fetchArchivedEntries,
  fetchDailyStats,
  fetchMealGroups,
  moveEntryToGroup,
  permanentlyDeleteEntry,
  restoreEntry,
  updateEntry,
  updateMealGroup,
} from '../api/endpoints'
import type { DailyStats, FoodEntry, MealGroup } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import EntryList from '../components/EntryList'
import { addDays, displayDate, toISODate } from '../lib/dates'

export default function History() {
  const [date, setDate] = useState(toISODate(new Date()))
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [groups, setGroups] = useState<MealGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showRemoved, setShowRemoved] = useState(false)
  const [archivedEntries, setArchivedEntries] = useState<FoodEntry[]>([])
  const [pendingPermanentDelete, setPendingPermanentDelete] = useState<FoodEntry | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [dailyStats, mealGroups] = await Promise.all([fetchDailyStats(date), fetchMealGroups()])
      setStats(dailyStats)
      setGroups(mealGroups)
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

  async function handleUpdateConsumedAt(entry: FoodEntry, consumedAt: string) {
    await updateEntry(entry.id, entry.grams, consumedAt)
    await load()
  }

  const isToday = date === toISODate(new Date())

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

          <EntryList
            entries={stats.entries}
            onDelete={handleDelete}
            deletingId={deletingId}
            emptyMessage={isToday ? 'Nothing logged yet today.' : 'Nothing was logged on this day.'}
            groups={groups}
            onMoveEntry={handleMoveEntry}
            onRenameGroup={handleRenameGroup}
            onUngroup={handleUngroup}
            onUpdateConsumedAt={handleUpdateConsumedAt}
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
