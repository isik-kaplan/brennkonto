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
import MacroSummary from '../components/MacroSummary'
import { displayDateLong, toISODate } from '../lib/dates'

export default function Dashboard() {
  const today = toISODate(new Date())
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [groups, setGroups] = useState<MealGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [groupName, setGroupName] = useState('')

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const [dailyStats, mealGroups] = await Promise.all([fetchDailyStats(today), fetchMealGroups()])
      setStats(dailyStats)
      setGroups(mealGroups)
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
              emptyMessage="Nothing logged yet today - start with the button above."
              groups={groups}
              selectable
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onUngroup={handleUngroup}
              onUpdateConsumedAt={handleUpdateConsumedAt}
            />
          </div>
        </>
      )}
    </>
  )
}
