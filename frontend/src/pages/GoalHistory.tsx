import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import { useFormState } from '@isik-kaplan/core/hooks'
import { Link } from 'react-router'

import { ApiError } from '../api/client'
import { deleteGoalVersion, fetchGoalVersions, upsertGoalVersion } from '../api/endpoints'
import type { GoalVersion } from '../api/types'
import { displayDate, toISODate } from '../lib/dates'

interface GoalFormState {
  effective_date: string
  daily_calorie_goal: number
  daily_protein_goal_g: number
  daily_carbs_goal_g: number
  daily_fat_goal_g: number
}

function emptyGoalForm(): GoalFormState {
  return {
    effective_date: toISODate(new Date()),
    daily_calorie_goal: 2000,
    daily_protein_goal_g: 150,
    daily_carbs_goal_g: 200,
    daily_fat_goal_g: 65,
  }
}

// The version with the latest effective_date not after today - versions come back sorted
// ascending by effective_date, and ISO date strings compare correctly as plain strings, so the
// last one that's <= today is the one in effect right now.
function activeVersion(versions: GoalVersion[]): GoalVersion | null {
  const today = toISODate(new Date())
  let active: GoalVersion | null = null
  for (const version of versions) {
    if (version.effective_date <= today) active = version
  }
  return active
}

// end_date is null only for the most recent version (in effect indefinitely, until a later one
// supersedes it) - every other version has a real end, the day before whichever one starts next.
function dateRangeLabel(version: GoalVersion): string {
  const start = displayDate(version.effective_date)
  return version.end_date ? `${start} – ${displayDate(version.end_date)}` : `${start} – ongoing`
}

export default function GoalHistory() {
  const [versions, setVersions] = useState<GoalVersion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const { formState, setFormState } = useFormState(emptyGoalForm())
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      setVersions(await fetchGoalVersions())
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function handleNumberChange(key: keyof Omit<GoalFormState, 'effective_date'>) {
    // A native number input's .value is always a valid numeric string or "" - never text that
    // would make Number(...) produce NaN - so there's no invalid case to guard here.
    return (event: ChangeEvent<HTMLInputElement>) => {
      setFormState((prev) => ({ ...prev, [key]: Number(event.target.value) }))
    }
  }

  function startEditing(version: GoalVersion) {
    setFormState({
      effective_date: version.effective_date,
      daily_calorie_goal: version.daily_calorie_goal,
      daily_protein_goal_g: version.daily_protein_goal_g,
      daily_carbs_goal_g: version.daily_carbs_goal_g,
      daily_fat_goal_g: version.daily_fat_goal_g,
    })
  }

  async function handleDelete(id: string) {
    await deleteGoalVersion(id)
    await load()
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setIsSaving(true)
    setMessage(null)
    try {
      // Setting a goal for a date that already has one overwrites it in place - this is what
      // makes editing a past date's goal and scheduling a future one the same action: both are
      // just "what should the goal be starting from this date".
      await upsertGoalVersion(formState)
      await load()
      setMessage({ kind: 'success', text: 'Goal saved.' })
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof ApiError ? error.message : 'Could not save.' })
    } finally {
      setIsSaving(false)
    }
  }

  const active = activeVersion(versions)

  return (
    <>
      <div className="page-header">
        <h1>Goal history</h1>
        <Link to="/settings" className="btn btn--ghost">
          ← Back to Settings
        </Link>
      </div>

      <div className="card">
        <h2 className="card__title">All goals</h2>
        {message && (
          <div className={message.kind === 'success' ? 'form__banner form__banner--success' : 'form__banner'}>
            {message.text}
          </div>
        )}
        {!isLoading && versions.length > 0 && (
          <ul className="entry-list" style={{ marginBottom: 'var(--space-md)' }}>
            {versions.map((version) => (
              <li key={version.id} className="entry-row">
                <div>
                  <div className="entry-row__name">
                    {dateRangeLabel(version)}
                    {active?.id === version.id && (
                      <span className="badge badge--accent" style={{ marginLeft: 'var(--space-2xs)' }}>
                        Active
                      </span>
                    )}
                  </div>
                  <div className="entry-row__meta">
                    {version.daily_calorie_goal} kcal · P{version.daily_protein_goal_g} C{version.daily_carbs_goal_g} F
                    {version.daily_fat_goal_g}
                  </div>
                </div>
                <div className="entry-row__actions">
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => startEditing(version)}>
                    Edit
                  </button>
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => handleDelete(version.id)}>
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {!isLoading && versions.length === 0 && (
          <p className="page-header__meta" style={{ marginBottom: 'var(--space-md)' }}>
            No goals set yet - using the default (2000 kcal · P150 C200 F65) until you add one.
          </p>
        )}
        <form className="form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="goal_effective_date">Starting</label>
            <input
              id="goal_effective_date"
              className="input"
              type="date"
              required
              value={formState.effective_date}
              onChange={(event) => setFormState((prev) => ({ ...prev, effective_date: event.target.value }))}
            />
          </div>
          <div className="form__row" style={{ marginTop: 'var(--space-md)' }}>
            <div className="field">
              <label htmlFor="daily_calorie_goal">Calories</label>
              <input
                id="daily_calorie_goal"
                className="input"
                type="number"
                min={0}
                required
                value={formState.daily_calorie_goal}
                onChange={handleNumberChange('daily_calorie_goal')}
              />
            </div>
            <div className="field">
              <label htmlFor="daily_protein_goal_g">Protein (g)</label>
              <input
                id="daily_protein_goal_g"
                className="input"
                type="number"
                min={0}
                required
                value={formState.daily_protein_goal_g}
                onChange={handleNumberChange('daily_protein_goal_g')}
              />
            </div>
          </div>
          <div className="form__row" style={{ marginTop: 'var(--space-md)' }}>
            <div className="field">
              <label htmlFor="daily_carbs_goal_g">Carbs (g)</label>
              <input
                id="daily_carbs_goal_g"
                className="input"
                type="number"
                min={0}
                required
                value={formState.daily_carbs_goal_g}
                onChange={handleNumberChange('daily_carbs_goal_g')}
              />
            </div>
            <div className="field">
              <label htmlFor="daily_fat_goal_g">Fat (g)</label>
              <input
                id="daily_fat_goal_g"
                className="input"
                type="number"
                min={0}
                required
                value={formState.daily_fat_goal_g}
                onChange={handleNumberChange('daily_fat_goal_g')}
              />
            </div>
          </div>
          <div className="form__actions">
            <button type="submit" className="btn btn--primary" disabled={isSaving}>
              {isSaving && <span className="btn__spinner" aria-hidden="true" />}
              Save goal
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
