import { useCallback, useEffect, useState } from 'react'

import { Link } from 'react-router'

import {
  deleteEntry,
  deleteMealGroup,
  fetchDailyStats,
  fetchMealGroups,
  moveEntryToGroup,
  updateEntry,
  updateMealGroup,
} from '../api/endpoints'
import type { DailyStats, FoodEntry, MealGroup } from '../api/types'
import EntryList, { type EntryEditValues } from '../components/EntryList'
import MacroSummary from '../components/MacroSummary'
import { displayDateLong, toISODate } from '../lib/dates'

export default function Dashboard() {
  const today = toISODate(new Date())
  const [stats, setStats] = useState<DailyStats | null>(null)
  const [groups, setGroups] = useState<MealGroup[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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
              groups={groups}
              onMoveEntry={handleMoveEntry}
              onRenameGroup={handleRenameGroup}
              onUngroup={handleUngroup}
              onUpdateEntry={handleUpdateEntry}
            />
          </div>
        </>
      )}
    </>
  )
}
