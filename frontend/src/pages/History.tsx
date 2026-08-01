import { useCallback, useEffect, useState } from 'react'

import { Link } from 'react-router-dom'

import {
  createMealGroup,
  deleteEntry,
  deleteMealGroup,
  fetchDailyStats,
  fetchMealGroups,
  updateEntry,
} from '../api/endpoints'
import type { DailyStats, FoodEntry, MealGroup } from '../api/types'
import EntryList from '../components/EntryList'
import { addDays, displayDate, toISODate } from '../lib/dates'

export default function History() {
  const [date, setDate] = useState(toISODate(new Date()))
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [groups, setGroups] = useState<MealGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')

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

  async function handleDelete(entry: FoodEntry) {
    setDeletingId(entry.id)
    try {
      await deleteEntry(entry.id)
      await load()
    } finally {
      setDeletingId(null)
    }
  }

  function toggleSelect(entry: FoodEntry) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(entry.id)) {
        next.delete(entry.id)
      } else {
        next.add(entry.id)
      }
      return next
    })
  }

  async function handleGroupSelected() {
    await createMealGroup([...selectedIds], groupName.trim() || null)
    setSelectedIds(new Set())
    setGroupName('')
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

          {selectedIds.size >= 2 && (
            <div className="form__row" style={{ marginBottom: 'var(--space-md)' }}>
              <input
                className="input"
                type="text"
                placeholder="Meal name (optional)"
                value={groupName}
                onChange={(event) => setGroupName(event.target.value)}
              />
              <button type="button" className="btn btn--primary" onClick={handleGroupSelected}>
                Group selected
              </button>
            </div>
          )}
          <EntryList
            entries={stats.entries}
            onDelete={handleDelete}
            deletingId={deletingId}
            emptyMessage={isToday ? 'Nothing logged yet today.' : 'Nothing was logged on this day.'}
            groups={groups}
            selectable
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
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
        </div>
      )}
    </>
  )
}
