import { Suspense, lazy, useState } from 'react'
import type { FormEvent } from 'react'

import { ApiError } from '../api/client'
import { createSavedMeal, lookupBarcode, renameMealName, updateSavedMeal } from '../api/endpoints'
import type { FoodSearchResult, MealName, SavedMealItemPayload } from '../api/types'
import { useFoodSearch } from '../hooks/useFoodSearch'
import { defaultAmountFor, unitLabel, withoutLeadingZeros } from '../lib/units'

// Same lazy-load as Log Food's - the barcode library is only worth shipping once someone scans.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'))

interface DraftItem {
  food: Omit<SavedMealItemPayload, 'input_unit' | 'input_amount'>
  // The food's own non-gram unit ("count", "ml", ...), if it has one - what the grams/unit toggle
  // flips to. null when the food is only measured in grams.
  altUnit: string | null
  unit: string
  amountInput: string
}

interface SavedMealEditorProps {
  // Omitted when creating a new meal. A meal that's only ever been logged (no saved_meal_id) gets
  // saved for the first time when edited here.
  meal?: MealName
  onSaved: () => void | Promise<void>
  onCancel: () => void
}

function draftFromSearchResult(result: FoodSearchResult): DraftItem {
  return {
    food: {
      name: result.name,
      brand: result.brand,
      barcode: result.barcode,
      unit_to_grams: result.unit_to_grams,
      calories_per_100g: result.calories_per_100g,
      protein_per_100g: result.protein_per_100g,
      carbs_per_100g: result.carbs_per_100g,
      fat_per_100g: result.fat_per_100g,
    },
    altUnit: result.suggested_unit === 'g' ? null : result.suggested_unit,
    unit: result.suggested_unit,
    amountInput: defaultAmountFor(result.suggested_unit),
  }
}

function draftsFromMeal(meal: MealName): DraftItem[] {
  return meal.items.map((item) => ({
    food: {
      name: item.name,
      brand: item.brand,
      barcode: item.barcode,
      unit_to_grams: item.unit_to_grams,
      calories_per_100g: item.calories_per_100g,
      protein_per_100g: item.protein_per_100g,
      carbs_per_100g: item.carbs_per_100g,
      fat_per_100g: item.fat_per_100g,
    },
    altUnit: item.input_unit === 'g' ? null : item.input_unit,
    unit: item.input_unit,
    amountInput: String(item.input_amount),
  }))
}

function gramsOf(item: DraftItem): number {
  // Number('') is 0, so a cleared field counts as nothing.
  const amount = Number(item.amountInput)
  return item.unit === 'g' ? amount : amount * item.food.unit_to_grams
}

// Builds a meal - search or scan each food, set its amount - without logging anything. Used both
// to create a new meal and to edit an existing one on the Meals page.
export default function SavedMealEditor({ meal, onSaved, onCancel }: SavedMealEditorProps) {
  const { query, setQuery, results, isSearching, isLoadingMore, searchError, setSearchError, sentinelRef } =
    useFoodSearch()
  const [barcode, setBarcode] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [name, setName] = useState(meal?.name ?? '')
  const [items, setItems] = useState<DraftItem[]>(() => (meal ? draftsFromMeal(meal) : []))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  function addFood(result: FoodSearchResult) {
    setItems((current) => [...current, draftFromSearchResult(result)])
    setQuery('')
  }

  async function addByBarcode(code: string) {
    if (!code.trim()) return
    setIsLookingUp(true)
    setSearchError(null)
    try {
      addFood(await lookupBarcode(code.trim()))
      setBarcode('')
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Barcode lookup failed.')
    } finally {
      setIsLookingUp(false)
    }
  }

  function updateItem(index: number, patch: Partial<DraftItem>) {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  function removeItem(index: number) {
    setItems((current) => current.filter((_, i) => i !== index))
  }

  const totalCalories = items.reduce((sum, item) => sum + (gramsOf(item) * item.food.calories_per_100g) / 100, 0)
  const canSave = name.trim() !== '' && items.length > 0 && items.every((item) => Number(item.amountInput) > 0)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSave) return
    const payload = items.map((item) => ({
      ...item.food,
      input_unit: item.unit,
      input_amount: Number(item.amountInput),
    }))
    setIsSaving(true)
    setSaveError(null)
    try {
      const newName = name.trim()
      if (meal?.saved_meal_id) {
        // Renames the meal's logged occurrences too, server-side.
        await updateSavedMeal(meal.saved_meal_id, newName, payload)
      } else {
        await createSavedMeal(newName, payload)
        // A logged-only meal being saved under a new name - bring its logged occurrences along,
        // or they'd stay behind as a second meal under the old name.
        if (meal && meal.name.toLowerCase() !== newName.toLowerCase()) {
          await renameMealName(meal.name, newName)
        }
      }
      await onSaved()
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Could not save this meal.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form className="form" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="saved-meal-name">Meal name</label>
        <input
          id="saved-meal-name"
          className="input"
          type="text"
          placeholder="e.g. Breakfast"
          required
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>

      {items.length > 0 && (
        <ul className="entry-list" style={{ marginTop: 'var(--space-md)' }}>
          {items.map((item, index) => (
            <li key={index} className="entry-row entry-row--editing">
              <div>
                <div className="entry-row__name">{item.food.name}</div>
                <div className="entry-row__meta">
                  {item.food.brand ?? 'Unbranded'} ·{' '}
                  <span className="numeral">{Math.round((gramsOf(item) * item.food.calories_per_100g) / 100)}</span>{' '}
                  kcal
                </div>
              </div>
              <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div className="field" style={{ marginBottom: 0 }}>
                  <label htmlFor={`saved-meal-amount-${index}`}>{unitLabel(item.unit)}</label>
                  <input
                    id={`saved-meal-amount-${index}`}
                    className="input"
                    type="number"
                    inputMode="decimal"
                    min={0.01}
                    step="any"
                    required
                    value={item.amountInput}
                    onChange={(event) => updateItem(index, { amountInput: withoutLeadingZeros(event.target.value) })}
                  />
                </div>
                <div className="entry-row__actions">
                  {item.altUnit && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => {
                        const nextUnit = item.unit === 'g' ? item.altUnit! : 'g'
                        updateItem(index, { unit: nextUnit, amountInput: defaultAmountFor(nextUnit) })
                      }}
                    >
                      {item.unit === 'g' ? `Use ${item.altUnit} instead` : 'Use grams instead'}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => removeItem(index)}
                    aria-label={`Remove ${item.food.name} from this meal`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="field" style={{ marginTop: 'var(--space-md)' }}>
        <label htmlFor="saved-meal-query">Add a food</label>
        <input
          id="saved-meal-query"
          className="input"
          type="text"
          placeholder="Search for a food…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {searchError && (
        <div className="form__banner" style={{ marginTop: 'var(--space-md)' }}>
          {searchError}
        </div>
      )}
      {isSearching && (
        <p className="page-header__meta" style={{ marginTop: 'var(--space-md)' }}>
          Searching…
        </p>
      )}
      {results.length > 0 && (
        <div className="search-results" style={{ marginTop: 'var(--space-md)' }}>
          {results.map((result) => (
            <div key={result.barcode} className="search-result">
              <button type="button" className="search-result__select" onClick={() => addFood(result)}>
                <span>
                  <span className="search-result__name">{result.name}</span>
                  <br />
                  <span className="search-result__meta">{result.brand ?? 'Unbranded'}</span>
                </span>
                <span className="search-result__macros numeral">{Math.round(result.calories_per_100g)} kcal/100g</span>
              </button>
            </div>
          ))}
          <div ref={sentinelRef} className="search-results__sentinel">
            {isLoadingMore && <span className="btn__spinner" aria-hidden="true" />}
          </div>
        </div>
      )}

      <div className="field" style={{ marginTop: 'var(--space-md)' }}>
        <label htmlFor="saved-meal-barcode">Or add by barcode</label>
        <div style={{ display: 'flex', gap: 'var(--space-sm)', flexWrap: 'wrap' }}>
          <input
            id="saved-meal-barcode"
            className="input"
            type="text"
            inputMode="numeric"
            placeholder="e.g. 3017620422003"
            style={{ flex: '1 1 12rem' }}
            value={barcode}
            onChange={(event) => setBarcode(event.target.value)}
            onKeyDown={(event) => {
              // Enter here means "look this up", not "save the whole meal".
              if (event.key === 'Enter') {
                event.preventDefault()
                addByBarcode(barcode)
              }
            }}
          />
          <button type="button" className="btn" onClick={() => addByBarcode(barcode)} disabled={isLookingUp}>
            {isLookingUp && <span className="btn__spinner" aria-hidden="true" />}
            Look up
          </button>
          <button type="button" className="btn" onClick={() => setIsScanning(true)}>
            Scan with camera
          </button>
        </div>
      </div>

      {isScanning && (
        <Suspense fallback={<div className="scanner-overlay">Loading camera…</div>}>
          <BarcodeScanner
            onDetected={(code) => {
              setIsScanning(false)
              addByBarcode(code)
            }}
            onClose={() => setIsScanning(false)}
          />
        </Suspense>
      )}

      {saveError && (
        <div className="form__banner" style={{ marginTop: 'var(--space-md)' }}>
          {saveError}
        </div>
      )}

      <div className="form__actions" style={{ marginTop: 'var(--space-md)' }}>
        <span className="page-header__meta">
          {items.length === 0 ? (
            'Search or scan to add foods.'
          ) : (
            <>
              {items.length} item{items.length === 1 ? '' : 's'} ·{' '}
              <span className="numeral">{Math.round(totalCalories)}</span> kcal
            </>
          )}
        </span>
        <button type="submit" className="btn btn--primary" disabled={!canSave || isSaving}>
          {isSaving && <span className="btn__spinner" aria-hidden="true" />}
          {meal ? 'Save changes' : 'Save meal'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}
