import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { ApiError } from '../api/client'
import { createEntry, lookupBarcode, searchFoods } from '../api/endpoints'
import type { FoodSearchResult } from '../api/types'
import { toISODate } from '../lib/dates'

export default function LogFood() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<FoodSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)

  const [barcode, setBarcode] = useState('')
  const [isLookingUp, setIsLookingUp] = useState(false)

  const [selected, setSelected] = useState<FoodSearchResult | null>(null)
  const [grams, setGrams] = useState(100)
  const [consumedAt, setConsumedAt] = useState(toISODate(new Date()))
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedName, setSavedName] = useState<string | null>(null)

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
      const result = await lookupBarcode(barcode.trim())
      setSelected(result)
      setSavedName(null)
    } catch (error) {
      setSearchError(error instanceof ApiError ? error.message : 'Barcode lookup failed.')
    } finally {
      setIsLookingUp(false)
    }
  }

  function selectResult(result: FoodSearchResult) {
    setSelected(result)
    setSavedName(null)
    setGrams(100)
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await createEntry({
        name: selected.name,
        brand: selected.brand,
        barcode: selected.barcode,
        grams,
        calories_per_100g: selected.calories_per_100g,
        protein_per_100g: selected.protein_per_100g,
        carbs_per_100g: selected.carbs_per_100g,
        fat_per_100g: selected.fat_per_100g,
        consumed_at: consumedAt,
      })
      setSavedName(selected.name)
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

  const scale = grams / 100

  return (
    <>
      <div className="page-header">
        <h1>Log food</h1>
      </div>

      {savedName && (
        <div className="form__banner form__banner--success">
          Logged {savedName}. <button type="button" className="btn btn--ghost btn--small" onClick={() => navigate('/')}>View today</button>
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
                autoFocus
              />
            </div>

            {searchError && <div className="form__banner" style={{ marginTop: 'var(--space-md)' }}>{searchError}</div>}

            {isSearching && <p className="page-header__meta" style={{ marginTop: 'var(--space-md)' }}>Searching…</p>}

            {results.length > 0 && (
              <div className="search-results" style={{ marginTop: 'var(--space-md)' }}>
                {results.map((result) => (
                  <button
                    key={result.barcode}
                    type="button"
                    className="search-result"
                    onClick={() => selectResult(result)}
                  >
                    <span>
                      <span className="search-result__name">{result.name}</span>
                      <br />
                      <span className="search-result__meta">{result.brand ?? 'Unbranded'}</span>
                    </span>
                    <span className="search-result__macros numeral">
                      {Math.round(result.calories_per_100g)} kcal/100g
                    </span>
                  </button>
                ))}
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
              </div>
            </form>
          </div>
        </div>
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
                <label htmlFor="grams">Amount (grams)</label>
                <input
                  id="grams"
                  className="input"
                  type="number"
                  min={1}
                  step="1"
                  required
                  value={grams}
                  onChange={(event) => setGrams(Number(event.target.value))}
                  autoFocus
                />
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
                Back to search
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
