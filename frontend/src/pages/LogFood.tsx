import { Suspense, lazy, useCallback, useEffect, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'

import { useNavigate } from 'react-router'

import { ApiError } from '../api/client'
import {
  createEntry,
  deleteFavorite,
  fetchFavorites,
  lookupBarcode,
  searchFoods,
  upsertFavorite,
} from '../api/endpoints'
import type { Favorite, FoodSearchResult } from '../api/types'
import { combineDateAndTime, toISODate, toISOTime } from '../lib/dates'

// The zxing barcode-decoding library is ~450kB - lazy-loaded so it only ships to people who
// actually open the scanner, not on every visit to this page.
const BarcodeScanner = lazy(() => import('../components/BarcodeScanner'))

// Small amounts (grams/ml) default to a serving-sized 100; larger/discrete units (count, kg, l,
// oz, ...) default to 1 - a default of "100 L" would be absurd.
function defaultAmountFor(unit: string): string {
  return unit === 'g' || unit === 'ml' ? '100' : '1'
}

// A favorite is structurally the same product data a search result carries, just with its saved
// default amount (if any) standing in for suggested_unit/unit_to_grams - mapping it into this
// shape lets it flow through the exact same selectResult()/amount-form code path a search result
// already uses, instead of duplicating that UI.
function favoriteToSearchResult(favorite: Favorite): FoodSearchResult {
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

function StarIcon({ filled }: { filled: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path
        d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.2 6.1-.7z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export default function LogFood() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [barcode, setBarcode] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)
  const [isScanning, setIsScanning] = useState(false)

  const [selected, setSelected] = useState<FoodSearchResult | null>(null)
  const [unit, setUnit] = useState('g')
  const [amountInput, setAmountInput] = useState('100')
  const [consumedAt, setConsumedAt] = useState(toISODate(new Date()))
  const [consumedTime, setConsumedTime] = useState(toISOTime(new Date()))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedName, setSavedName] = useState<string | null>(null)

  const [favorites, setFavorites] = useState<Favorite[]>([])
  const [saveAsFavorite, setSaveAsFavorite] = useState(false)
  const [rememberAmount, setRememberAmount] = useState(false)
  const [justAddedId, setJustAddedId] = useState<string | null>(null)

  const loadFavorites = useCallback(async () => {
    setFavorites(await fetchFavorites())
  }, [])

  useEffect(() => {
    loadFavorites()
  }, [loadFavorites])

  const favoriteByBarcode = new Map(favorites.map((favorite) => [favorite.barcode, favorite]))

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

  // presetAmount lets a favorite's saved default seed the form instead of the generic 100/1
  // fallback, so opening the form from a favorite reads as "confirm or adjust" rather than
  // starting from scratch.
  function selectResult(result: FoodSearchResult, presetAmount?: { unit: string; amount: string }) {
    setSelected(result)
    setSavedName(null)
    const nextUnit = presetAmount?.unit ?? result.suggested_unit
    setUnit(nextUnit)
    setAmountInput(presetAmount?.amount ?? defaultAmountFor(nextUnit))
    setSaveAsFavorite(favoriteByBarcode.has(result.barcode))
    setRememberAmount(false)
  }

  async function handleToggleFavorite(result: FoodSearchResult) {
    const existing = favoriteByBarcode.get(result.barcode)
    if (existing) {
      await deleteFavorite(existing.id)
    } else {
      await upsertFavorite({
        barcode: result.barcode,
        name: result.name,
        brand: result.brand,
        calories_per_100g: result.calories_per_100g,
        protein_per_100g: result.protein_per_100g,
        carbs_per_100g: result.carbs_per_100g,
        fat_per_100g: result.fat_per_100g,
      })
    }
    await loadFavorites()
  }

  function handleAddWithEdit(favorite: Favorite) {
    const presetAmount =
      favorite.default_input_amount != null && favorite.default_input_unit != null
        ? { unit: favorite.default_input_unit, amount: String(favorite.default_input_amount) }
        : undefined
    selectResult(favoriteToSearchResult(favorite), presetAmount)
  }

  async function handleQuickAdd(favorite: Favorite) {
    // No saved default - fall back to the same "ask for an amount" behavior as Add & Edit.
    if (favorite.default_input_amount == null || favorite.default_input_unit == null) {
      handleAddWithEdit(favorite)
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
        consumed_at: combineDateAndTime(toISODate(new Date()), toISOTime(new Date())),
      })
      // Silent-success: swap the button's own label briefly rather than a toast/modal.
      setJustAddedId(favorite.id)
      setTimeout(() => setJustAddedId(null), 1500)
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Could not add this favorite.')
    }
  }

  async function handleRemoveFavorite(id: string) {
    await deleteFavorite(id)
    await loadFavorites()
  }

  function handleAmountChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (raw === '') {
      setAmountInput('')
      return
    }
    // Strip a stuck leading zero (e.g. from clearing down to "0" then typing) without touching
    // a legitimate "0." while the user is mid-way through typing a decimal.
    setAmountInput(raw.replace(/^0+(?=\d)/, ''))
  }

  function unitLabel(u: string): string {
    if (u === 'g') return 'Amount (grams)'
    if (u === 'count') return 'How many?'
    return `Amount (${u})`
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    // Asserted rather than runtime-checked: this handler is only ever wired to the form that
    // renders when `selected` is already set, so there's no real null case to branch on - just
    // a closure TypeScript can't narrow on its own.
    const product = selected!
    // Belt-and-suspenders: the input's own min/required attributes should already block this,
    // but a controlled string-backed field can still reach an empty/zero commit in some browsers.
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
        consumed_at: combineDateAndTime(consumedAt, consumedTime),
      })
      if (saveAsFavorite) {
        await upsertFavorite({
          barcode: product.barcode,
          name: product.name,
          brand: product.brand,
          calories_per_100g: product.calories_per_100g,
          protein_per_100g: product.protein_per_100g,
          carbs_per_100g: product.carbs_per_100g,
          fat_per_100g: product.fat_per_100g,
          // Sending these as null (rather than omitting) explicitly clears any previously-saved
          // default when "remember this amount" isn't checked, rather than leaving a stale one.
          default_input_unit: rememberAmount ? unit : null,
          default_input_amount: rememberAmount ? amount : null,
          default_unit_to_grams: rememberAmount ? (unit === 'g' ? 1 : product.unit_to_grams) : null,
        })
        await loadFavorites()
      }
      setSavedName(product.name)
      setSelected(null)
      setQuery('')
      setResults([])
      setBarcode('')
    } catch (error) {
      setSaveError(error instanceof ApiError ? error.message : 'Could not save this entry.')
    } finally {
      setIsSaving(false)
    }
  }

  const amount = amountInput === '' ? 0 : Number(amountInput)
  const grams = selected && unit !== 'g' ? amount * selected.unit_to_grams : amount
  const scale = grams / 100

  return (
    <>
      <div className="page-header">
        <h1>Log food</h1>
      </div>

      {savedName && (
        <div className="form__banner form__banner--success">
          Logged {savedName}.{' '}
          <button type="button" className="btn btn--ghost btn--small" onClick={() => navigate('/')}>
            View today
          </button>
        </div>
      )}

      {!selected && (
        <div className="grid grid--2">
          <div className="card">
            <h2 className="card__title">Search Open Food Facts</h2>
            <div className="field">
              <label htmlFor="query">Product name</label>
              <input
                id="query"
                className="input"
                type="text"
                placeholder="e.g. greek yogurt"
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
                {results.map((result) => {
                  const isFavorited = favoriteByBarcode.has(result.barcode)
                  return (
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
                      <button
                        type="button"
                        className={isFavorited ? 'search-result__favorite is-favorited' : 'search-result__favorite'}
                        onClick={() => handleToggleFavorite(result)}
                        aria-label={isFavorited ? `Remove ${result.name} from favorites` : `Favorite ${result.name}`}
                      >
                        <StarIcon filled={isFavorited} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card">
            <h2 className="card__title">Have a barcode?</h2>
            <form className="form" onSubmit={handleBarcodeLookup}>
              <div className="field">
                <label htmlFor="barcode">Barcode</label>
                <input
                  id="barcode"
                  className="input"
                  type="text"
                  inputMode="numeric"
                  placeholder="e.g. 3017620422003"
                  value={barcode}
                  onChange={(event) => setBarcode(event.target.value)}
                />
              </div>
              <div className="form__actions">
                <button type="submit" className="btn" disabled={isLookingUp}>
                  {isLookingUp && <span className="btn__spinner" aria-hidden="true" />}
                  Look up
                </button>
                <button type="button" className="btn btn--primary" onClick={() => setIsScanning(true)}>
                  Scan with camera
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {!selected && (
        <div className="card" style={{ marginTop: 'var(--space-lg)' }}>
          <h2 className="card__title">Favorites</h2>
          {favorites.length === 0 ? (
            <p className="page-header__meta">No favorites yet - tap the star on a search result to save one.</p>
          ) : (
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
                  <div className="entry-row__actions">
                    <button
                      type="button"
                      className="btn btn--primary btn--small"
                      onClick={() => handleQuickAdd(favorite)}
                    >
                      {justAddedId === favorite.id ? 'Added ✓' : 'Add'}
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => handleAddWithEdit(favorite)}
                    >
                      Add & Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--small"
                      onClick={() => handleRemoveFavorite(favorite.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isScanning && (
        <Suspense fallback={<div className="scanner-overlay">Loading camera…</div>}>
          <BarcodeScanner onDetected={handleScanDetected} onClose={() => setIsScanning(false)} />
        </Suspense>
      )}

      {selected && (
        <div className="card">
          <h2 className="card__title">{selected.name}</h2>
          <p className="page-header__meta" style={{ marginBottom: 'var(--space-lg)' }}>
            {selected.brand ?? 'Unbranded'} · {Math.round(selected.calories_per_100g)} kcal / 100g
          </p>

          {saveError && <div className="form__banner">{saveError}</div>}

          <form className="form" onSubmit={handleSave}>
            <div className="form__row">
              <div className="field">
                <label htmlFor="amount">{unitLabel(unit)}</label>
                <input
                  id="amount"
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
                <label htmlFor="consumed_at">Date</label>
                <input
                  id="consumed_at"
                  className="input"
                  type="date"
                  required
                  value={consumedAt}
                  onChange={(event) => setConsumedAt(event.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="consumed_time">Time</label>
                <input
                  id="consumed_time"
                  className="input"
                  type="time"
                  required
                  value={consumedTime}
                  onChange={(event) => setConsumedTime(event.target.value)}
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

            <div className="field" style={{ marginTop: 'var(--space-lg)' }}>
              <label>
                <input
                  type="checkbox"
                  checked={saveAsFavorite}
                  onChange={(event) => setSaveAsFavorite(event.target.checked)}
                />{' '}
                Save as favorite
              </label>
              {saveAsFavorite && (
                <label style={{ display: 'block', marginTop: 'var(--space-2xs)' }}>
                  <input
                    type="checkbox"
                    checked={rememberAmount}
                    onChange={(event) => setRememberAmount(event.target.checked)}
                  />{' '}
                  Remember this amount as the default
                </label>
              )}
            </div>

            <div className="form__actions">
              <button type="submit" className="btn btn--primary" disabled={isSaving}>
                {isSaving && <span className="btn__spinner" aria-hidden="true" />}
                Save entry
              </button>
              <button type="button" className="btn btn--ghost" onClick={() => setSelected(null)}>
                Back to search
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
