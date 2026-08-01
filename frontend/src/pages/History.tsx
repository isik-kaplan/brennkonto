import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { deleteEntry, fetchDailyStats } from '../api/endpoints'
import type { DailyStats, FoodEntry } from '../api/types'
import EntryList from '../components/EntryList'
import { addDays, displayDate, toISODate } from '../lib/dates'

export default function History() {
  const [date, setDate] = useState(toISODate(new Date()))
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setStats(await fetchDailyStats(date))
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

  const isToday = date === toISODate(new Date())

  return (
    <>
      <div className="page-header">
        <h1>History</h1>
      </div>

      <div className="range-controls">
        <button type="button" className="btn btn--small" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
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
          className="btn btn--small"
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
            emptyMessage={
              isToday ? 'Nothing logged yet today.' : 'Nothing was logged on this day.'
            }
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
