import { Suspense, lazy, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'

import { ApiError } from '../api/client'
import { createEntry, fetchFavorites, lookupBarcode, searchFoods } from '../api/endpoints'
import type { Favorite, FoodSearchResult } from '../api/types'
import { combineDateAndTime, toISOTime } from '../lib/dates'
import { defaultAmountFor, unitLabel } from '../lib/units'

// Same lazy split as Log Food's scanner - most History visits never open the camera, so it
// shouldn't ship on every page load.
const BarcodeScanner = lazy(() => import('./BarcodeScanner'))

interface AddEntryPanelProps {
  // The day currently being viewed on History - seeds the amount form's date so a retroactive
  // add lands on the day the user is already looking at, without them having to re-pick it.
  date: string
  onAdded: () => void | Promise<void>
}

// A product-shaped view of a favorite, so selecting one can reuse the same amount form as a
// fresh search/barcode result instead of a separate code path.
function favoriteAsResult(favorite: Favorite): FoodSearchResult {
  return {
    barcode: favorite.barcode,
    name: favorite.name,
    brand: favorite.brand,
    calories_per_100g: favorite.calories_per_100g,
    protein_per_100g: favorite.protein_per_100g,
    carbs_per_100g: favorite.carbs_per_100g,
    fat_per_100g: favorite.fat_per_100g,
    suggested_unit: favorite.default_input_unit ?? 'g',
    unit_to_grams: favorite.default_unit_to_grams ?? 1,
  }
}

export default function AddEntryPanel({ date, onAdded }: AddEntryPanelProps) {
  const [isOpen, setIsOpen] = useState(false)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [barcode, setBarcode] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [justAddedId, setJustAddedId] = useState<string | null>(null)

  const [selected, setSelected] = useState<FoodSearchResult | null>(null)
  const [unit, setUnit] = useState('g')
  const [amountInput, setAmountInput] = useState('100')
  const [entryDate, setEntryDate] = useState(date)
  const [entryTime, setEntryTime] = useState(toISOTime(new Date()))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState<string | null>(null)

  // A one-off portion for this add only - like Add, but always asks for the amount instead of
  // using (or falling back past) the favorite's saved default, and never touches that default.
  const [customAddFavorite, setCustomAddFavorite] = useState<Favorite | null>(null)
  const [customUnit, setCustomUnit] = useState('g')
  const [customAmountInput, setCustomAmountInput] = useState('')
  const [isAddingCustom, setIsAddingCustom] = useState(false)
  const [customAddError, setCustomAddError] = useState<string | null>(null)

  // The panel always reopens onto whichever day History is currently showing, not whatever day
  // it was last left on.
  useEffect(() => {
    setEntryDate(date)
  }, [date])

  useEffect(() => {
    if (isOpen) fetchFavorites().then(setFavorites)
  }, [isOpen])

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([])
      return
    }
    setIsSearching(true)
    setSearchError(null)
    const timeout = setTimeout(() => {
      searchFoods(query.trim())
        .then(setResults)
        .catch((error) => setSearchError(error instanceof ApiError ? error.message : 'Search failed.'))
        .finally(() => setIsSearching(false))
    }, 350)
    return () => clearTimeout(timeout)
  }, [query])

  function selectResult(result: FoodSearchResult) {
    setSelected(result)
    setJustAdded(null)
    setUnit(result.suggested_unit)
    setAmountInput(defaultAmountFor(result.suggested_unit))
  }

  async function handleBarcodeLookup(event: FormEvent) {
    event.preventDefault()
    if (!barcode.trim()) return
    setIsLookingUp(true)
    setSearchError(null)
    try {
      selectResult(await lookupBarcode(barcode.trim()))
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Barcode lookup failed.')
    } finally {
      setIsLookingUp(false)
    }
  }

  async function handleScanDetected(code: string) {
    setIsScanning(false)
    setBarcode(code)
    setIsLookingUp(true)
    setSearchError(null)
    try {
      selectResult(await lookupBarcode(code))
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Barcode lookup failed.')
    } finally {
      setIsLookingUp(false)
    }
  }

  async function handleQuickAddFavorite(favorite: Favorite) {
    if (favorite.default_input_amount == null || favorite.default_input_unit == null) {
      selectResult(favoriteAsResult(favorite))
      return
    }
    const unitToGrams = favorite.default_unit_to_grams ?? 1
    const grams =
      favorite.default_input_unit === 'g' ? favorite.default_input_amount : favorite.default_input_amount * unitToGrams
    try {
      await createEntry({
        name: favorite.name,
        brand: favorite.brand,
        barcode: favorite.barcode,
        grams,
        input_unit: favorite.default_input_unit,
        input_amount: favorite.default_input_amount,
        unit_to_grams: favorite.default_input_unit === 'g' ? 1 : unitToGrams,
        calories_per_100g: favorite.calories_per_100g,
        protein_per_100g: favorite.protein_per_100g,
        carbs_per_100g: favorite.carbs_per_100g,
        fat_per_100g: favorite.fat_per_100g,
        consumed_at: combineDateAndTime(entryDate, entryTime),
      })
      setJustAddedId(favorite.id)
      setTimeout(() => setJustAddedId(null), 1500)
      await onAdded()
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Could not add this favorite.')
    }
  }

  // Asks only for the amount, then logs immediately - like handleQuickAddFavorite's default-set
  // path, but for a one-off portion instead of the favorite's saved default. Doesn't touch the
  // favorite's own default.
  function handleStartCustomAdd(favorite: Favorite) {
    const unitValue = favorite.default_input_unit ?? 'g'
    setCustomAddFavorite(favorite)
    setCustomUnit(unitValue)
    setCustomAmountInput(
      favorite.default_input_amount != null ? String(favorite.default_input_amount) : defaultAmountFor(unitValue)
    )
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

  async function handleConfirmCustomAdd(event: FormEvent) {
    event.preventDefault()
    const favorite = customAddFavorite!
    const amount = customAmountInput === '' ? 0 : Number(customAmountInput)
    if (amount <= 0) return
    const unitToGrams = customUnit === 'g' ? 1 : (favorite.default_unit_to_grams ?? 1)
    const grams = customUnit === 'g' ? amount : amount * unitToGrams
    setIsAddingCustom(true)
    setCustomAddError(null)
    try {
      await createEntry({
        name: favorite.name,
        brand: favorite.brand,
        barcode: favorite.barcode,
        grams,
        input_unit: customUnit,
        input_amount: amount,
        unit_to_grams: unitToGrams,
        calories_per_100g: favorite.calories_per_100g,
        protein_per_100g: favorite.protein_per_100g,
        carbs_per_100g: favorite.carbs_per_100g,
        fat_per_100g: favorite.fat_per_100g,
        consumed_at: combineDateAndTime(entryDate, entryTime),
      })
      setCustomAddFavorite(null)
      setJustAddedId(favorite.id)
      setTimeout(() => setJustAddedId(null), 1500)
      await onAdded()
    } catch (error) {
      setCustomAddError(error instanceof ApiError ? error.message : 'Could not add this favorite.')
    } finally {
      setIsAddingCustom(false)
    }
  }

  function handleAmountChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (raw === '') {
      setAmountInput('')
      return
    }
    setAmountInput(raw.replace(/^0+(?=\d)/, ''))
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    const product = selected!
    if (grams <= 0) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await createEntry({
        name: product.name,
        brand: product.brand,
        barcode: product.barcode,
        grams,
        input_unit: unit,
        input_amount: amount,
        unit_to_grams: unit === 'g' ? 1 : product.unit_to_grams,
        calories_per_100g: product.calories_per_100g,
        protein_per_100g: product.protein_per_100g,
        carbs_per_100g: product.carbs_per_100g,
        fat_per_100g: product.fat_per_100g,
        consumed_at: combineDateAndTime(entryDate, entryTime),
      })
      setJustAdded(product.name)
      setSelected(null)
      setQuery('')
      setResults([])
      setBarcode('')
      await onAdded()
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Could not save this entry.')
    } finally {
      setIsSaving(false)
    }
  }

  function handleClose() {
    setIsOpen(false)
    setSelected(null)
    setQuery('')
    setResults([])
    setBarcode('')
    setJustAdded(null)
    setSaveError(null)
    setSearchError(null)
    setCustomAddFavorite(null)
  }

  const amount = amountInput === '' ? 0 : Number(amountInput)
  const grams = selected && unit !== 'g' ? amount * selected.unit_to_grams : amount
  const scale = grams / 100

  if (!isOpen) {
    return (
      <p style={{ marginBottom: 'var(--space-lg)' }}>
        <button type="button" className="btn btn--primary btn--small" onClick={() => setIsOpen(true)}>
          + Add entry
        </button>
      </p>
    )
  }

  return (
    <div className="card" style={{ marginBottom: 'var(--space-lg)' }}>
      <div className="page-header" style={{ marginBottom: selected ? 'var(--space-md)' : 0 }}>
        <h2 className="card__title" style={{ margin: 0 }}>
          Add entry
        </h2>
        <button type="button" className="btn btn--ghost btn--small" onClick={handleClose}>
          Close
        </button>
      </div>

      {justAdded && (
        <div className="form__banner form__banner--success" style={{ marginTop: 'var(--space-md)' }}>
          Added {justAdded}.
        </div>
      )}

      {!selected && (
        <>
          <div className="form__row" style={{ marginTop: 'var(--space-md)' }}>
            <div className="field">
              <label htmlFor="add-entry-query">Product name</label>
              <input
                id="add-entry-query"
                className="input"
                type="text"
                placeholder="e.g. greek yogurt"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <form className="form" onSubmit={handleBarcodeLookup}>
              <div className="field">
                <label htmlFor="add-entry-barcode">Barcode</label>
                <input
                  id="add-entry-barcode"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 3017620422003"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                />
              </div>
              <div className="form__actions" style={{ marginTop: 'var(--space-sm)' }}>
                <button type="submit" className="btn btn--small" disabled={isLookingUp}>
                  {isLookingUp && <span className="btn__spinner" aria-hidden="true" />}
                  Look up
                </button>
                <button type="button" className="btn btn--ghost btn--small" onClick={() => setIsScanning(true)}>
                  Scan
                </button>
              </div>
            </form>
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
                  <button type="button" className="search-result__select" onClick={() => selectResult(result)}>
                    <span>
                      <span className="search-result__name">{result.name}</span>
                      <br />
                      <span className="search-result__meta">{result.brand ?? 'Unbranded'}</span>
                    </span>
                    <span className="search-result__macros numeral">
                      {Math.round(result.calories_per_100g)} kcal/100g
                    </span>
                  </button>
                </div>
              ))}
            </div>
          )}

          {favorites.length > 0 && (
            <div style={{ marginTop: 'var(--space-lg)' }}>
              <h3 className="card__title">Favorites</h3>
              <ul className="entry-list">
                {favorites.map((favorite) => (
                  <li key={favorite.id} className="entry-row">
                    <div>
                      <div className="entry-row__name">{favorite.name}</div>
                      <div className="entry-row__meta">
                        {favorite.brand ?? 'Unbranded'} · {Math.round(favorite.calories_per_100g)} kcal/100g
                        {favorite.default_input_amount != null && (
                          <>
                            {' '}
                            · {favorite.default_input_amount}
                            {favorite.default_input_unit} default
                          </>
                        )}
                      </div>
                    </div>
                    {customAddFavorite?.id === favorite.id ? (
                      <form
                        className="form"
                        onSubmit={handleConfirmCustomAdd}
                        style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'flex-end', flexWrap: 'wrap' }}
                      >
                        <div className="field" style={{ marginBottom: 0 }}>
                          <label htmlFor={`add-entry-custom-amount-${favorite.id}`}>{unitLabel(customUnit)}</label>
                          <input
                            id={`add-entry-custom-amount-${favorite.id}`}
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
                        {favorite.default_input_unit != null && favorite.default_input_unit !== 'g' && (
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => {
                              const nextUnit = customUnit === 'g' ? favorite.default_input_unit! : 'g'
                              setCustomUnit(nextUnit)
                              setCustomAmountInput(defaultAmountFor(nextUnit))
                            }}
                          >
                            {customUnit === 'g' ? `Use ${favorite.default_input_unit} instead` : 'Use grams instead'}
                          </button>
                        )}
                        {customAddError && <div className="form__banner">{customAddError}</div>}
                        <div className="entry-row__actions">
                          <button type="submit" className="btn btn--primary btn--small" disabled={isAddingCustom}>
                            {isAddingCustom && <span className="btn__spinner" aria-hidden="true" />}
                            Add
                          </button>
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => setCustomAddFavorite(null)}
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
                          onClick={() => handleQuickAddFavorite(favorite)}
                        >
                          {justAddedId === favorite.id ? 'Added ✓' : 'Add'}
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--small"
                          onClick={() => handleStartCustomAdd(favorite)}
                        >
                          Custom amount
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {isScanning && (
        <Suspense fallback={<div className="scanner-overlay">Loading camera…</div>}>
          <BarcodeScanner onDetected={handleScanDetected} onClose={() => setIsScanning(false)} />
        </Suspense>
      )}

      {selected && (
        <>
          <p className="page-header__meta" style={{ marginBottom: 'var(--space-md)' }}>
            <strong>{selected.name}</strong> · {selected.brand ?? 'Unbranded'} ·{' '}
            {Math.round(selected.calories_per_100g)} kcal / 100g
          </p>

          {saveError && <div className="form__banner">{saveError}</div>}

          <form className="form" onSubmit={handleSave}>
            <div className="form__row">
              <div className="field">
                <label htmlFor="add-entry-amount">{unitLabel(unit)}</label>
                <input
                  id="add-entry-amount"
                  className="input"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step="any"
                  required
                  value={amountInput}
                  onChange={handleAmountChange}
                />
                {selected.suggested_unit !== 'g' && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    style={{ marginTop: 'var(--space-xs)' }}
                    onClick={() => {
                      const nextUnit = unit === 'g' ? selected.suggested_unit : 'g'
                      setUnit(nextUnit)
                      setAmountInput(defaultAmountFor(nextUnit))
                    }}
                  >
                    {unit === 'g' ? `Use ${selected.suggested_unit} instead` : 'Use grams instead'}
                  </button>
                )}
              </div>
              <div className="field">
                <label htmlFor="add-entry-date">Date</label>
                <input
                  id="add-entry-date"
                  className="input"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(event) => setEntryDate(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="add-entry-time">Time</label>
                <input
                  id="add-entry-time"
                  className="input"
                  type="time"
                  required
                  value={entryTime}
                  onChange={(event) => setEntryTime(event.target.value)}
                />
              </div>
            </div>

            <div className="stat-strip" style={{ marginTop: 'var(--space-lg)' }}>
              <div className="stat-tile">
                <div className="stat-tile__label">Calories</div>
                <div className="stat-tile__value">{Math.round(selected.calories_per_100g * scale)}</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__label">Protein</div>
                <div className="stat-tile__value">{Math.round(selected.protein_per_100g * scale)}g</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__label">Carbs</div>
                <div className="stat-tile__value">{Math.round(selected.carbs_per_100g * scale)}g</div>
              </div>
              <div className="stat-tile">
                <div className="stat-tile__label">Fat</div>
                <div className="stat-tile__value">{Math.round(selected.fat_per_100g * scale)}g</div>
              </div>
            </div>

            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={isSaving}>
                {isSaving && <span className="btn__spinner" aria-hidden="true" />}
                Save entry
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setSelected(null)}>
                Back
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
