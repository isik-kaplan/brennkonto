import { useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import { ApiError } from '../api/client'
import { createEntry, createMealGroup, fetchHistoryFoods, fetchHistoryGroups } from '../api/endpoints'
import type { HistoryFood, HistoryGroup } from '../api/types'
import { unitLabel } from '../lib/units'

interface HistoryPickerProps {
  // Resolves the ISO consumed_at timestamp at the moment an item is actually added - a function
  // rather than a fixed prop so a quick add always uses "right now" (Log Food) or whatever
  // date/time is currently set on the caller's own form (History's inline add panel), not
  // whatever it was when the picker was opened.
  getConsumedAt: () => string
  onAdded: () => void | Promise<void>
}

// Everything the user has ever logged before, browsable without typing and filterable by name/
// brand as they type - a comprehensive fallback for "I've definitely eaten this before" that
// doesn't depend on having favorited it. Shared between Log Food and History's inline add panel
// so the browse/search/quick-add/custom-amount behavior stays identical in both places.
export default function HistoryPicker({ getConsumedAt, onAdded }: HistoryPickerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [foods, setFoods] = useState<HistoryFood[]>([])
  const [groups, setGroups] = useState<HistoryGroup[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [customAddFood, setCustomAddFood] = useState<HistoryFood | null>(null)
  const [customUnit, setCustomUnit] = useState('g')
  const [customAmountInput, setCustomAmountInput] = useState('')
  const [isAddingCustom, setIsAddingCustom] = useState(false)
  const [customAddError, setCustomAddError] = useState<string | null>(null)

  const [addingKey, setAddingKey] = useState<string | null>(null)
  const [justAddedKey, setJustAddedKey] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setIsLoading(true)
    setLoadError(null)
    // No debounce on an empty query - that's the initial "browse" load, not a keystroke.
    const timeout = setTimeout(
      () => {
        Promise.all([fetchHistoryFoods(query.trim()), fetchHistoryGroups(query.trim())])
          .then(([nextFoods, nextGroups]) => {
            setFoods(nextFoods)
            setGroups(nextGroups)
          })
          .catch((error) => setLoadError(error instanceof ApiError ? error.message : 'Could not load your history.'))
          .finally(() => setIsLoading(false))
      },
      query ? 300 : 0
    )
    return () => clearTimeout(timeout)
  }, [isOpen, query])

  function handleClose() {
    setIsOpen(false)
    setQuery('')
    setCustomAddFood(null)
    setActionError(null)
  }

  async function quickAddFood(food: HistoryFood) {
    setAddingKey(food.barcode)
    setActionError(null)
    try {
      const grams = food.suggested_unit === 'g' ? food.last_input_amount : food.last_input_amount * food.unit_to_grams
      await createEntry({
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        grams,
        input_unit: food.suggested_unit,
        input_amount: food.last_input_amount,
        unit_to_grams: food.unit_to_grams,
        calories_per_100g: food.calories_per_100g,
        protein_per_100g: food.protein_per_100g,
        carbs_per_100g: food.carbs_per_100g,
        fat_per_100g: food.fat_per_100g,
        consumed_at: getConsumedAt(),
      })
      setJustAddedKey(food.barcode)
      setTimeout(() => setJustAddedKey(null), 1500)
      await onAdded()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : `Could not add "${food.name}".`)
    } finally {
      setAddingKey(null)
    }
  }

  // Asks only for the amount, then logs immediately - like quickAddFood, but for a one-off
  // portion instead of the last-used one.
  function startCustomAdd(food: HistoryFood) {
    setCustomAddFood(food)
    setCustomUnit(food.suggested_unit)
    setCustomAmountInput(String(food.last_input_amount))
    setCustomAddError(null)
  }

  function handleCustomAmountChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (raw === '') {
      setCustomAmountInput('')
      return
    }
    setCustomAmountInput(raw.replace(/^0+(?=\d)/, ''))
  }

  async function confirmCustomAdd(event: FormEvent) {
    event.preventDefault()
    const food = customAddFood!
    const amount = customAmountInput === '' ? 0 : Number(customAmountInput)
    if (amount <= 0) return
    const grams = customUnit === 'g' ? amount : amount * food.unit_to_grams
    setIsAddingCustom(true)
    setCustomAddError(null)
    try {
      await createEntry({
        name: food.name,
        brand: food.brand,
        barcode: food.barcode,
        grams,
        input_unit: customUnit,
        input_amount: amount,
        unit_to_grams: food.unit_to_grams,
        calories_per_100g: food.calories_per_100g,
        protein_per_100g: food.protein_per_100g,
        carbs_per_100g: food.carbs_per_100g,
        fat_per_100g: food.fat_per_100g,
        consumed_at: getConsumedAt(),
      })
      setCustomAddFood(null)
      setJustAddedKey(food.barcode)
      setTimeout(() => setJustAddedKey(null), 1500)
      await onAdded()
    } catch (error) {
      setCustomAddError(error instanceof ApiError ? error.message : `Could not add "${food.name}".`)
    } finally {
      setIsAddingCustom(false)
    }
  }

  // Re-creates every item in a past named combo at once, then re-groups the new entries under the
  // same name - the same "repeat a whole meal" shape as EntryList's repeatGroup, just sourced from
  // history instead of the currently-viewed day.
  async function addGroup(group: HistoryGroup) {
    const key = `group:${group.name}`
    setAddingKey(key)
    setActionError(null)
    try {
      const consumedAt = getConsumedAt()
      const created = await Promise.all(
        group.items.map((item) =>
          createEntry({
            name: item.name,
            brand: item.brand,
            barcode: item.barcode,
            grams: item.grams,
            input_unit: item.input_unit,
            input_amount: item.input_amount,
            unit_to_grams: item.unit_to_grams,
            calories_per_100g: item.calories_per_100g,
            protein_per_100g: item.protein_per_100g,
            carbs_per_100g: item.carbs_per_100g,
            fat_per_100g: item.fat_per_100g,
            consumed_at: consumedAt,
          })
        )
      )
      await createMealGroup(
        created.map((entry) => entry.id),
        group.name
      )
      setJustAddedKey(key)
      setTimeout(() => setJustAddedKey(null), 1500)
      await onAdded()
    } catch (error) {
      setActionError(error instanceof ApiError ? error.message : `Could not add "${group.name}".`)
    } finally {
      setAddingKey(null)
    }
  }

  if (!isOpen) {
    return (
      <p style={{ marginTop: 'var(--space-md)' }}>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => setIsOpen(true)}>
          Browse past foods
        </button>
      </p>
    )
  }

  return (
    <div style={{ marginTop: 'var(--space-lg)' }}>
      <div className="page-header" style={{ marginBottom: 'var(--space-md)' }}>
        <h3 className="card__title" style={{ margin: 0 }}>
          From your history
        </h3>
        <button type="button" className="btn btn--ghost btn--small" onClick={handleClose}>
          Close
        </button>
      </div>

      <div className="field">
        <label htmlFor="history-picker-query" className="visually-hidden">
          Search everything you've logged before
        </label>
        <input
          id="history-picker-query"
          className="input"
          type="text"
          placeholder="Search everything you've logged before…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          autoFocus
        />
      </div>

      {loadError && (
        <div className="form__banner" style={{ marginTop: 'var(--space-md)' }}>
          {loadError}
        </div>
      )}
      {actionError && (
        <div className="form__banner" style={{ marginTop: 'var(--space-md)' }}>
          {actionError}
        </div>
      )}
      {isLoading && (
        <p className="page-header__meta" style={{ marginTop: 'var(--space-md)' }}>
          Loading…
        </p>
      )}

      {!isLoading && groups.length === 0 && foods.length === 0 && (
        <p className="page-header__meta" style={{ marginTop: 'var(--space-md)' }}>
          {query ? 'Nothing in your history matches.' : 'Nothing logged yet - what you eat will show up here.'}
        </p>
      )}

      {groups.length > 0 && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <h4 className="card__title">Past meals</h4>
          <ul className="entry-list">
            {groups.map((group) => {
              const key = `group:${group.name}`
              return (
                <li key={key} className="entry-row">
                  <div>
                    <div className="entry-row__name">{group.name}</div>
                    <div className="entry-row__meta">
                      {group.items.length} item{group.items.length === 1 ? '' : 's'} ·{' '}
                      <span className="numeral">{Math.round(group.calories)}</span> kcal · logged {group.times_logged}×
                    </div>
                  </div>
                  <div className="entry-row__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => addGroup(group)}
                      disabled={addingKey === key}
                    >
                      {addingKey === key ? (
                        <span className="btn__spinner" aria-hidden="true" />
                      ) : justAddedKey === key ? (
                        'Added ✓'
                      ) : (
                        'Add meal'
                      )}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {foods.length > 0 && (
        <div style={{ marginTop: 'var(--space-md)' }}>
          <h4 className="card__title">Past foods</h4>
          <ul className="entry-list">
            {foods.map((food) => (
              <li key={food.barcode} className="entry-row">
                <div>
                  <div className="entry-row__name">{food.name}</div>
                  <div className="entry-row__meta">
                    {food.brand ?? 'Unbranded'} · {Math.round(food.calories_per_100g)} kcal/100g · last had{' '}
                    {food.last_input_amount}
                    {food.suggested_unit}
                  </div>
                </div>
                {customAddFood?.barcode === food.barcode ? (
                  <form
                    className="form"
                    onSubmit={confirmCustomAdd}
                    style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', flexWrap: 'wrap' }}
                  >
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label htmlFor={`history-amount-${food.barcode}`}>{unitLabel(customUnit)}</label>
                      <input
                        id={`history-amount-${food.barcode}`}
                        className="input"
                        type="number"
                        inputMode="decimal"
                        min={0.01}
                        step="any"
                        required
                        autoFocus
                        value={customAmountInput}
                        onChange={handleCustomAmountChange}
                      />
                    </div>
                    {customAddError && <div className="form__banner">{customAddError}</div>}
                    <div className="entry-row__actions">
                      <button type="submit" className="btn btn--primary btn--small" disabled={isAddingCustom}>
                        {isAddingCustom && <span className="btn__spinner" aria-hidden="true" />}
                        Add
                      </button>
                      <button
                        type="button"
                        className="btn btn--ghost btn--small"
                        onClick={() => setCustomAddFood(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="entry-row__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => quickAddFood(food)}
                      disabled={addingKey === food.barcode}
                    >
                      {addingKey === food.barcode ? (
                        <span className="btn__spinner" aria-hidden="true" />
                      ) : justAddedKey === food.barcode ? (
                        'Added ✓'
                      ) : (
                        'Add'
                      )}
                    </button>
                    <button type="button" className="btn btn--ghost btn--small" onClick={() => startCustomAdd(food)}>
                      Custom amount
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
