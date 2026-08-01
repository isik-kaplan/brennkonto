import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { deleteEntry, fetchDailyStats } from '../api/endpoints'
import type { DailyStats, FoodEntry } from '../api/types'
import EntryList from '../components/EntryList'
import MacroSummary from '../components/MacroSummary'
import { displayDateLong, toISODate } from '../lib/dates'

export default function Dashboard() {
  const today = toISODate(new Date())
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setStats(await fetchDailyStats(today))
    } finally {
      setIsLoading(false)
    }
  }, [today])

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

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Today</h1>
          <span className="page-header__meta">{displayDateLong(today)}</span>
        </div>
        <Link to="/log" className="btn btn--primary">
          + Log food
        </Link>
      </div>

      {isLoading || !stats ? (
        <div className="centered-loader">Loading…</div>
      ) : (
        <>
          <div className="card">
            <MacroSummary
              calories={stats.calories}
              calorieGoal={stats.calorie_goal}
              protein={stats.protein_g}
              proteinGoal={stats.protein_goal_g}
              carbs={stats.carbs_g}
              carbsGoal={stats.carbs_goal_g}
              fat={stats.fat_g}
              fatGoal={stats.fat_goal_g}
            />
          </div>

          <div className="card">
            <h2 className="card__title">Logged today</h2>
            <EntryList
              entries={stats.entries}
              onDelete={handleDelete}
              deletingId={deletingId}
              emptyMessage="Nothing logged yet today - start with the button above."
            />
          </div>
        </>
      )}
    </>
  )
}
