import { useCallback, useEffect, useState } from 'react'

import { Link } from 'react-router'

import { ApiError } from '../api/client'
import { fetchMealNames, removeMealName, renameMealName } from '../api/endpoints'
import type { MealName } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import { displayDate } from '../lib/dates'

export default function Meals() {
  const [meals, setMeals] = useState<MealName[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [editingName, setEditingName] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const [pendingRemove, setPendingRemove] = useState<MealName | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      setMeals(await fetchMealNames())
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : 'Could not load your meals.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function startEditing(meal: MealName) {
    setEditingName(meal.name)
    setRenameValue(meal.name)
    setActionError(null)
  }

  async function saveRename(originalName: string) {
    const newName = renameValue.trim()
    if (!newName || newName === originalName) {
      setEditingName(null)
      return
    }
    setIsSaving(true)
    setActionError(null)
    try {
      await renameMealName(originalName, newName)
      setEditingName(null)
      await load()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : `Could not rename "${originalName}".`)
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmRemove() {
    const meal = pendingRemove!
    setPendingRemove(null)
    setActionError(null)
    try {
      await removeMealName(meal.name)
      await load()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : `Could not remove "${meal.name}".`)
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Meals</h1>
        <Link to="/settings" className="btn btn--ghost">
          ← Back to Settings
        </Link>
      </div>

      <div className="card">
        <h2 className="card__title">Your meals</h2>
        <p className="page-header__meta" style={{ marginBottom: 'var(--space-md)' }}>
          These are the named combos you've logged together before, like "Breakfast" - the ones that show up under "Past
          meals" when you're logging food. Removing one only stops grouping it; every food you logged stays in your
          history.
        </p>

        {loadError && <div className="form__banner">{loadError}</div>}
        {actionError && <div className="form__banner">{actionError}</div>}

        {isLoading && <p className="page-header__meta">Loading…</p>}

        {!isLoading && meals.length === 0 && !loadError && (
          <div className="empty-state">
            No named meals yet - name a meal when you log or group foods together and it'll show up here.
          </div>
        )}

        {!isLoading && meals.length > 0 && (
          <ul className="entry-list">
            {meals.map((meal) => {
              const isEditing = editingName === meal.name
              return (
                <li key={meal.name} className={isEditing ? 'entry-row entry-row--editing' : 'entry-row'}>
                  {isEditing ? (
                    <form
                      style={{ display: 'contents' }}
                      onSubmit={(event) => {
                        event.preventDefault()
                        saveRename(meal.name)
                      }}
                    >
                      <div className="field" style={{ marginBottom: 0 }}>
                        <label htmlFor={`meal-name-${meal.name}`} className="visually-hidden">
                          Meal name
                        </label>
                        <input
                          id={`meal-name-${meal.name}`}
                          className="input"
                          type="text"
                          required
                          autoFocus
                          value={renameValue}
                          onChange={(event) => setRenameValue(event.target.value)}
                        />
                      </div>
                      <div className="entry-row__actions">
                        <button type="submit" className="btn btn--primary btn--small" disabled={isSaving}>
                          {isSaving && <span className="btn__spinner" aria-hidden="true" />}
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setEditingName(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div>
                        <div className="entry-row__name">{meal.name}</div>
                        <div className="entry-row__meta">
                          {meal.items.join(', ')} · logged {meal.times_logged}× · last{' '}
                          {displayDate(meal.last_logged_at.slice(0, 10))}
                        </div>
                      </div>
                      <div className="entry-row__actions">
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => startEditing(meal)}
                          aria-label={`Rename ${meal.name}`}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => setPendingRemove(meal)}
                          aria-label={`Remove ${meal.name}`}
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {pendingRemove && (
        <ConfirmDialog
          title="Remove this meal?"
          message={`"${pendingRemove.name}" will stop showing up as a grouped meal. Nothing you've logged is deleted - every food in it stays in your history as an individual item.`}
          confirmLabel="Remove"
          isDestructive
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </>
  )
}
