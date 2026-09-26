import { useCallback, useEffect, useState } from 'react'

import { ApiError } from '../api/client'
import { fetchMealNames, removeMealName } from '../api/endpoints'
import type { HistoryGroupItem, MealName } from '../api/types'
import ConfirmDialog from '../components/ConfirmDialog'
import SavedMealEditor from '../components/SavedMealEditor'
import { displayDate } from '../lib/dates'

function ItemRow({ item }: { item: HistoryGroupItem }) {
  const per = (per100g: number) => Math.round((item.grams * per100g) / 100)
  return (
    <li className="entry-row">
      <div className="entry-row__info">
        <div>
          <div className="entry-row__name">{item.name}</div>
          <div className="entry-row__meta">
            {item.brand ? `${item.brand} · ` : ''}
            {item.input_unit === 'g' ? (
              `${item.grams}g`
            ) : (
              <>
                {item.input_amount} {item.input_unit} (≈{Math.round(item.grams)}g)
              </>
            )}{' '}
            · P{per(item.protein_per_100g)} C{per(item.carbs_per_100g)} F{per(item.fat_per_100g)}
          </div>
        </div>
      </div>
      <div className="entry-row__calories numeral">{per(item.calories_per_100g)} kcal</div>
    </li>
  )
}

export default function Meals() {
  const [meals, setMeals] = useState<MealName[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // 'new' while building a new meal, the meal's name while editing one, null otherwise.
  const [editing, setEditing] = useState<string | null>(null)
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

  useEffect(
    () => {
      load()
    },
    // Stryker disable next-line ArrayDeclaration: `load` keeps its identity (no dependencies), so both run once
    [load]
  )

  async function handleSaved() {
    setEditing(null)
    await load()
  }

  async function confirmRemove() {
    const meal = pendingRemove!
    setPendingRemove(null)
    setActionError(null)
    try {
      await removeMealName(meal.name)
      await load()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : `Could not delete "${meal.name}".`)
    }
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1>Meals</h1>
          <span className="page-header__meta">Ready to add in one go when you log food.</span>
        </div>
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => setEditing('new')}
          disabled={editing === 'new'}
        >
          + Add meal
        </button>
      </div>

      {editing === 'new' && (
        <div className="card">
          <h2 className="card__title">New meal</h2>
          <SavedMealEditor onSaved={handleSaved} onCancel={() => setEditing(null)} />
        </div>
      )}

      <div className="card">
        <h2 className="card__title">Your meals</h2>

        {loadError && <div className="form__banner">{loadError}</div>}
        {actionError && <div className="form__banner">{actionError}</div>}

        {isLoading && <p className="page-header__meta">Loading…</p>}

        {!isLoading && meals.length === 0 && !loadError && (
          <div className="empty-state">
            No meals yet - add one above, or name a group of foods when you log them and it'll show up here too.
          </div>
        )}

        {!isLoading && meals.length > 0 && (
          <ul className="entry-list">
            {meals.map((meal) =>
              editing === meal.name ? (
                <li key={meal.name} className="meal-group" style={{ padding: 'var(--space-md)' }}>
                  <SavedMealEditor meal={meal} onSaved={handleSaved} onCancel={() => setEditing(null)} />
                </li>
              ) : (
                <li key={meal.name} className="meal-group">
                  <div className="meal-group__header">
                    <span>
                      {meal.name}
                      <span className="entry-row__meta" style={{ fontWeight: 400 }}>
                        {' '}
                        · <span className="numeral">{Math.round(meal.calories)}</span> kcal · P
                        {Math.round(meal.protein_g)} C{Math.round(meal.carbs_g)} F{Math.round(meal.fat_g)}
                        {meal.last_logged_at
                          ? ` · logged ${meal.times_logged}×, last ${displayDate(meal.last_logged_at.slice(0, 10))}`
                          : ' · not logged yet'}
                      </span>
                    </span>
                    <div className="meal-group__header-actions">
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => setEditing(meal.name)}
                        aria-label={`Edit ${meal.name}`}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => setPendingRemove(meal)}
                        aria-label={`Delete ${meal.name}`}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <ul className="entry-list">
                    {meal.items.map((item, index) => (
                      <ItemRow key={index} item={item} />
                    ))}
                  </ul>
                </li>
              )
            )}
          </ul>
        )}
      </div>

      {pendingRemove && (
        <ConfirmDialog
          title="Delete this meal?"
          message={`"${pendingRemove.name}" will no longer be offered when you log food. Nothing you've logged is deleted - any time you've had it stays in your history, just as individual foods.`}
          confirmLabel="Delete"
          isDestructive
          onConfirm={confirmRemove}
          onCancel={() => setPendingRemove(null)}
        />
      )}
    </>
  )
}
