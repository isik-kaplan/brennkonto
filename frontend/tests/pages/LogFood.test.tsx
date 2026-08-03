import { fireEvent, render, screen, waitFor, waitForElementToBeRemoved } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { Favorite, FoodSearchResult } from '../../src/api/types'
import LogFood from '../../src/pages/LogFood'

vi.mock('../../src/api/endpoints')

vi.mock('../../src/components/BarcodeScanner', () => ({
  default: ({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) => (
    <div>
      <p>Mock scanner</p>
      <button type="button" onClick={() => onDetected('3017620422003')}>
        Simulate detection
      </button>
      <button type="button" onClick={onClose}>
        Close scanner
      </button>
    </div>
  ),
}))

const nutella: FoodSearchResult = {
  barcode: '3017620422003',
  name: 'Nutella',
  brand: 'Ferrero',
  calories_per_100g: 539,
  protein_per_100g: 6.3,
  carbs_per_100g: 57.5,
  fat_per_100g: 30.9,
  suggested_unit: 'g',
  unit_to_grams: 1,
}

const eggs: FoodSearchResult = {
  barcode: '4',
  name: 'Eggs',
  brand: null,
  calories_per_100g: 155,
  protein_per_100g: 13,
  carbs_per_100g: 1.1,
  fat_per_100g: 11,
  suggested_unit: 'count',
  unit_to_grams: 53,
}

const milk: FoodSearchResult = {
  barcode: '5',
  name: 'Milk',
  brand: null,
  calories_per_100g: 42,
  protein_per_100g: 3.4,
  carbs_per_100g: 5,
  fat_per_100g: 1,
  suggested_unit: 'l',
  unit_to_grams: 1000,
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function makeFavorite(overrides: Partial<Favorite> = {}): Favorite {
  return {
    id: 'f1',
    barcode: '3017620422003',
    name: 'Nutella',
    brand: 'Ferrero',
    calories_per_100g: 539,
    protein_per_100g: 6.3,
    carbs_per_100g: 57.5,
    fat_per_100g: 30.9,
    default_input_unit: null,
    default_input_amount: null,
    default_unit_to_grams: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(endpoints.searchFoods).mockReset()
  vi.mocked(endpoints.lookupBarcode).mockReset()
  vi.mocked(endpoints.createEntry).mockReset()
  vi.mocked(endpoints.fetchFavorites).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.upsertFavorite).mockReset().mockResolvedValue(makeFavorite())
  vi.mocked(endpoints.deleteFavorite).mockReset()
})

function renderLogFood() {
  return render(
    <MemoryRouter initialEntries={['/log']}>
      <Routes>
        <Route path="/log" element={<LogFood />} />
        <Route path="/" element={<div>Dashboard page</div>} />
      </Routes>
    </MemoryRouter>
  )
}

describe('LogFood search', () => {
  it('does not search for a query shorter than 2 characters', async () => {
    const user = userEvent.setup()
    renderLogFood()
    await user.type(screen.getByLabelText('Product name'), 'a')
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(endpoints.searchFoods).not.toHaveBeenCalled()
  })

  it('debounces and searches, then lists results', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    renderLogFood()

    await user.type(screen.getByLabelText('Product name'), 'nutella')
    expect(screen.getByText('Searching…')).toBeInTheDocument()

    await waitFor(() => expect(endpoints.searchFoods).toHaveBeenCalledWith('nutella'), { timeout: 1000 })
    expect(await screen.findByText('Nutella')).toBeInTheDocument()
    expect(screen.getByText('539 kcal/100g')).toBeInTheDocument()
  })

  it('shows a search error message', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockRejectedValue(new ApiError('Search unavailable.', 503))
    renderLogFood()

    await user.type(screen.getByLabelText('Product name'), 'nutella')
    expect(await screen.findByText('Search unavailable.', {}, { timeout: 1000 })).toBeInTheDocument()
  })

  it('shows a generic search error for a non-API failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockRejectedValue(new Error('boom'))
    renderLogFood()

    await user.type(screen.getByLabelText('Product name'), 'nutella')
    expect(await screen.findByText('Search failed.', {}, { timeout: 1000 })).toBeInTheDocument()
  })

  it('selecting a result opens the save form with an unbranded fallback handled', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([{ ...nutella, brand: null }])
    renderLogFood()

    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByText('Nutella'))

    expect(screen.getByRole('heading', { name: 'Nutella' })).toBeInTheDocument()
    expect(screen.getByText(/Unbranded/)).toBeInTheDocument()
  })
})

describe('LogFood barcode lookup', () => {
  it('looks up a barcode and opens the save form', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(nutella)
    renderLogFood()

    await user.type(screen.getByLabelText('Barcode'), '3017620422003')
    await user.click(screen.getByRole('button', { name: 'Look up' }))

    expect(endpoints.lookupBarcode).toHaveBeenCalledWith('3017620422003')
    expect(await screen.findByRole('heading', { name: 'Nutella' })).toBeInTheDocument()
  })

  it('does nothing when the barcode field is blank', async () => {
    const user = userEvent.setup()
    renderLogFood()
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(endpoints.lookupBarcode).not.toHaveBeenCalled()
  })

  it('shows an API error message on lookup failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new ApiError('No product found for this barcode.', 404))
    renderLogFood()

    await user.type(screen.getByLabelText('Barcode'), '0000000000000')
    await user.click(screen.getByRole('button', { name: 'Look up' }))

    expect(await screen.findByText('No product found for this barcode.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API lookup failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new Error('boom'))
    renderLogFood()

    await user.type(screen.getByLabelText('Barcode'), '0000000000000')
    await user.click(screen.getByRole('button', { name: 'Look up' }))

    expect(await screen.findByText('Barcode lookup failed.')).toBeInTheDocument()
  })
})

describe('LogFood camera scan', () => {
  it('opens the scanner and looks up a detected barcode', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(nutella)
    renderLogFood()

    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    expect(await screen.findByText('Mock scanner')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Simulate detection' }))
    expect(endpoints.lookupBarcode).toHaveBeenCalledWith('3017620422003')
    expect(await screen.findByRole('heading', { name: 'Nutella' })).toBeInTheDocument()
    expect(screen.queryByText('Mock scanner')).not.toBeInTheDocument()
  })

  it('shows an error when the barcode detected by the scanner fails to look up', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new ApiError('No product found for this barcode.', 404))
    renderLogFood()

    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    await user.click(await screen.findByRole('button', { name: 'Simulate detection' }))

    expect(await screen.findByText('No product found for this barcode.')).toBeInTheDocument()
  })

  it('shows a generic error when the scanner-detected lookup fails with a non-API error', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new Error('boom'))
    renderLogFood()

    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    await user.click(await screen.findByRole('button', { name: 'Simulate detection' }))

    expect(await screen.findByText('Barcode lookup failed.')).toBeInTheDocument()
  })

  it('closes the scanner without looking anything up', async () => {
    const user = userEvent.setup()
    renderLogFood()

    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    await user.click(await screen.findByText('Close scanner'))

    expect(screen.queryByText('Mock scanner')).not.toBeInTheDocument()
    expect(endpoints.lookupBarcode).not.toHaveBeenCalled()
  })
})

describe('LogFood save form', () => {
  async function openSaveForm(user: ReturnType<typeof userEvent.setup>) {
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(nutella)
    renderLogFood()
    await user.type(screen.getByLabelText('Barcode'), '3017620422003')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    await screen.findByRole('heading', { name: 'Nutella' })
  }

  it('scales macros to the entered grams', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)

    const gramsInput = screen.getByLabelText('Amount (grams)')
    await user.clear(gramsInput)
    await user.type(gramsInput, '50')

    expect(screen.getByText('270')).toBeInTheDocument() // 539 * 0.5, rounded
  })

  it('clearing the amount field leaves it empty rather than stuck at 0', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)

    const amountInput = screen.getByLabelText('Amount (grams)') as HTMLInputElement
    await user.clear(amountInput)
    expect(amountInput.value).toBe('')
  })

  it('typing after the field is cleared does not leave a stuck leading zero', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)

    const amountInput = screen.getByLabelText('Amount (grams)') as HTMLInputElement
    await user.clear(amountInput)
    await user.type(amountInput, '0521')
    expect(amountInput.value).toBe('521')
  })

  it('does not offer a unit toggle for a plain-grams product', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)
    expect(screen.queryByRole('button', { name: /Use .* instead/ })).not.toBeInTheDocument()
  })

  it('defaults to the suggested unit and can switch to grams and back', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(eggs)
    renderLogFood()
    await user.type(screen.getByLabelText('Barcode'), '4')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    await screen.findByRole('heading', { name: 'Eggs' })

    const howMany = screen.getByLabelText('How many?') as HTMLInputElement
    expect(howMany.value).toBe('1')
    // one egg (53g) at 155 kcal/100g -> ~82 kcal
    expect(screen.getByText('82')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use grams instead' }))
    expect(screen.getByLabelText('Amount (grams)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use count instead' }))
    expect(screen.getByLabelText('How many?')).toBeInTheDocument()
  })

  it('sends input_unit/input_amount/unit_to_grams for a count-based entry', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(eggs)
    vi.mocked(endpoints.createEntry).mockResolvedValue({
      id: '1',
      name: 'Eggs',
      brand: null,
      barcode: '4',
      grams: 106,
      input_unit: 'count',
      input_amount: 2,
      unit_to_grams: 53,
      calories_per_100g: 155,
      protein_per_100g: 13,
      carbs_per_100g: 1.1,
      fat_per_100g: 11,
      calories: 164.3,
      protein_g: 13.78,
      carbs_g: 1.17,
      fat_g: 11.66,
      consumed_at: '2026-08-01',
      created_at: '2026-08-01T12:00:00Z',
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    })
    renderLogFood()
    await user.type(screen.getByLabelText('Barcode'), '4')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    await screen.findByRole('heading', { name: 'Eggs' })

    const howMany = screen.getByLabelText('How many?')
    await user.clear(howMany)
    await user.type(howMany, '2')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(endpoints.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ grams: 106, input_unit: 'count', input_amount: 2, unit_to_grams: 53 })
    )
  })

  it('labels a non-count, non-gram unit with its unit name', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(milk)
    renderLogFood()
    await user.type(screen.getByLabelText('Barcode'), '5')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    await screen.findByRole('heading', { name: 'Milk' })

    expect(screen.getByLabelText('Amount (l)')).toBeInTheDocument()
  })

  it('does not submit when the amount is cleared to empty, even bypassing native validation', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)

    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    // fireEvent.submit dispatches the submit event directly, bypassing the browser's own
    // required/min constraint validation - this exercises the app's own defensive guard.
    fireEvent.submit(amountInput.closest('form')!)

    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('allows changing the consumed-at date', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } })
    expect(dateInput.value).toBe('2026-01-01')
  })

  it('allows changing the consumed-at time', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)

    const timeInput = screen.getByLabelText('Time') as HTMLInputElement
    fireEvent.change(timeInput, { target: { value: '08:30' } })
    expect(timeInput.value).toBe('08:30')
  })

  it('saves the entry and shows a success banner with a link back to today', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.createEntry).mockResolvedValue({
      id: '1',
      name: nutella.name,
      brand: nutella.brand,
      barcode: nutella.barcode,
      grams: 100,
      input_unit: 'g',
      input_amount: 100,
      unit_to_grams: 1,
      calories_per_100g: nutella.calories_per_100g,
      protein_per_100g: nutella.protein_per_100g,
      carbs_per_100g: nutella.carbs_per_100g,
      fat_per_100g: nutella.fat_per_100g,
      calories: 539,
      protein_g: 6.3,
      carbs_g: 57.5,
      fat_g: 30.9,
      consumed_at: '2026-08-01',
      created_at: '2026-08-01T12:00:00Z',
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    })
    await openSaveForm(user)

    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(endpoints.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Nutella', brand: 'Ferrero', barcode: '3017620422003', grams: 100 })
    )
    expect(await screen.findByText(/Logged Nutella\./)).toBeInTheDocument()
    // the search/barcode form should be visible again since `selected` was cleared
    expect(screen.getByLabelText('Product name')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'View today' }))
    expect(await screen.findByText('Dashboard page')).toBeInTheDocument()
  })

  it('shows an API error message when saving fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Invalid grams.', 400))
    await openSaveForm(user)

    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('Invalid grams.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API save failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    await openSaveForm(user)

    await user.click(screen.getByRole('button', { name: 'Save entry' }))
    expect(await screen.findByText('Could not save this entry.')).toBeInTheDocument()
  })

  it('going back to search clears the selected product', async () => {
    const user = userEvent.setup()
    await openSaveForm(user)

    await user.click(screen.getByRole('button', { name: 'Back to search' }))
    expect(screen.getByLabelText('Product name')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Nutella' })).not.toBeInTheDocument()
  })

  it('checking "Save as favorite" upserts it after a successful save, without remembering an amount', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.createEntry).mockResolvedValue({
      id: '1',
      name: nutella.name,
      brand: nutella.brand,
      barcode: nutella.barcode,
      grams: 100,
      input_unit: 'g',
      input_amount: 100,
      unit_to_grams: 1,
      calories_per_100g: nutella.calories_per_100g,
      protein_per_100g: nutella.protein_per_100g,
      carbs_per_100g: nutella.carbs_per_100g,
      fat_per_100g: nutella.fat_per_100g,
      calories: 539,
      protein_g: 6.3,
      carbs_g: 57.5,
      fat_g: 30.9,
      consumed_at: '2026-08-01T12:00:00',
      created_at: '2026-08-01T12:00:00Z',
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    })
    await openSaveForm(user)

    await user.click(screen.getByLabelText('Save as favorite'))
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    await waitFor(() =>
      expect(endpoints.upsertFavorite).toHaveBeenCalledWith({
        barcode: nutella.barcode,
        name: nutella.name,
        brand: nutella.brand,
        calories_per_100g: nutella.calories_per_100g,
        protein_per_100g: nutella.protein_per_100g,
        carbs_per_100g: nutella.carbs_per_100g,
        fat_per_100g: nutella.fat_per_100g,
        default_input_unit: null,
        default_input_amount: null,
        default_unit_to_grams: null,
      })
    )
  })

  it('remembering an amount for a non-grams product uses its own unit_to_grams', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(eggs)
    vi.mocked(endpoints.createEntry).mockResolvedValue({
      id: '1',
      name: eggs.name,
      brand: eggs.brand,
      barcode: eggs.barcode,
      grams: 53,
      input_unit: 'count',
      input_amount: 1,
      unit_to_grams: 53,
      calories_per_100g: eggs.calories_per_100g,
      protein_per_100g: eggs.protein_per_100g,
      carbs_per_100g: eggs.carbs_per_100g,
      fat_per_100g: eggs.fat_per_100g,
      calories: 82,
      protein_g: 6.6,
      carbs_g: 0.6,
      fat_g: 5.8,
      consumed_at: '2026-08-01T12:00:00',
      created_at: '2026-08-01T12:00:00Z',
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    })
    renderLogFood()
    await user.type(screen.getByLabelText('Barcode'), '4')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    await screen.findByRole('heading', { name: 'Eggs' })

    await user.click(screen.getByLabelText('Save as favorite'))
    await user.click(screen.getByLabelText('Remember this amount as the default'))
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    await waitFor(() =>
      expect(endpoints.upsertFavorite).toHaveBeenCalledWith(
        expect.objectContaining({ default_input_unit: 'count', default_input_amount: 1, default_unit_to_grams: 53 })
      )
    )
  })

  it('also checking "Remember this amount" includes the current amount in the upsert', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.createEntry).mockResolvedValue({
      id: '1',
      name: nutella.name,
      brand: nutella.brand,
      barcode: nutella.barcode,
      grams: 50,
      input_unit: 'g',
      input_amount: 50,
      unit_to_grams: 1,
      calories_per_100g: nutella.calories_per_100g,
      protein_per_100g: nutella.protein_per_100g,
      carbs_per_100g: nutella.carbs_per_100g,
      fat_per_100g: nutella.fat_per_100g,
      calories: 270,
      protein_g: 3.15,
      carbs_g: 28.75,
      fat_g: 15.45,
      consumed_at: '2026-08-01T12:00:00',
      created_at: '2026-08-01T12:00:00Z',
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    })
    await openSaveForm(user)

    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    await user.type(amountInput, '50')
    await user.click(screen.getByLabelText('Save as favorite'))
    await user.click(screen.getByLabelText('Remember this amount as the default'))
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    await waitFor(() =>
      expect(endpoints.upsertFavorite).toHaveBeenCalledWith(
        expect.objectContaining({ default_input_unit: 'g', default_input_amount: 50, default_unit_to_grams: 1 })
      )
    )
  })
})

describe('LogFood favorites', () => {
  it('shows a hint when there are no favorites yet', async () => {
    renderLogFood()
    expect(await screen.findByText(/No favorites yet/)).toBeInTheDocument()
  })

  it('lists favorites with a default-amount badge when one is set', async () => {
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30 }),
    ])
    renderLogFood()

    expect(await screen.findByText(/30g default/)).toBeInTheDocument()
  })

  it('does not show a default-amount badge when none is set', async () => {
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    renderLogFood()

    await screen.findByText('Nutella', { selector: '.entry-row__name' })
    expect(screen.queryByText(/default/)).not.toBeInTheDocument()
  })

  it('falls back to "Unbranded" when a favorite has no brand', async () => {
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite({ brand: null })])
    renderLogFood()

    expect(await screen.findByText(/Unbranded/)).toBeInTheDocument()
  })

  it('starring an unfavorited search result upserts it with no default amount', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    renderLogFood()

    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByRole('button', { name: 'Favorite Nutella' }))

    expect(endpoints.upsertFavorite).toHaveBeenCalledWith({
      barcode: nutella.barcode,
      name: nutella.name,
      brand: nutella.brand,
      calories_per_100g: nutella.calories_per_100g,
      protein_per_100g: nutella.protein_per_100g,
      carbs_per_100g: nutella.carbs_per_100g,
      fat_per_100g: nutella.fat_per_100g,
    })
  })

  it('un-stars an already-favorited search result', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    renderLogFood()

    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByRole('button', { name: 'Remove Nutella from favorites' }))

    expect(endpoints.deleteFavorite).toHaveBeenCalledWith('f1')
  })

  it('Add with a saved default amount logs instantly, without opening the form', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(endpoints.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nutella',
        grams: 30,
        input_unit: 'g',
        input_amount: 30,
        unit_to_grams: 1,
      })
    )
    expect(screen.queryByRole('heading', { name: 'Nutella' })).not.toBeInTheDocument()
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()
  })

  it('reverts the "Added ✓" label back after a short delay', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()

    await waitForElementToBeRemoved(() => screen.queryByText('Added ✓'), { timeout: 2000 })
  }, 3000)

  it('Add with a non-grams default amount converts to grams before logging', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: 53 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(endpoints.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        grams: 106,
        input_unit: 'count',
        input_amount: 2,
        unit_to_grams: 53,
      })
    )
  })

  it('Add without a saved default amount asks for a custom amount inline instead', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(endpoints.createEntry).not.toHaveBeenCalled()
    expect(screen.queryByRole('heading', { name: 'Nutella' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Amount (grams)')).toBeInTheDocument()
  })

  it('Custom amount asks only for the new amount, then logs it immediately like Add', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))

    // No full form (no heading, no date/time fields, no favorite checkboxes) - just the amount.
    expect(screen.queryByRole('heading', { name: 'Nutella' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Save as favorite')).not.toBeInTheDocument()
    const amountField = screen.getByLabelText('Amount (grams)')
    expect(amountField).toHaveValue(30)

    await user.clear(amountField)
    await user.type(amountField, '45')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(endpoints.createEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Nutella',
        grams: 45,
        input_unit: 'g',
        input_amount: 45,
        unit_to_grams: 1,
      })
    )
    // The favorite's own saved default is untouched by a one-off custom amount.
    expect(endpoints.upsertFavorite).not.toHaveBeenCalled()
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()
  })

  it('shows an error message when a quick-add fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add this favorite.', 400))
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add this favorite.')).toBeInTheDocument()
  })

  it('shows a generic error message when a quick-add fails with a non-API error', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add this favorite.')).toBeInTheDocument()
  })

  it('treats a missing default_unit_to_grams as 1 gram per unit', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: null }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 30, unit_to_grams: 1 }))
  })

  it('removes a favorite', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValueOnce([makeFavorite()]).mockResolvedValueOnce([])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(endpoints.deleteFavorite).toHaveBeenCalledWith('f1')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument())
  })

  it('cancelling a custom amount closes the inline form without logging anything', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(endpoints.createEntry).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Custom amount' })).toBeInTheDocument()
  })

  it('does not submit a custom amount cleared to empty, even bypassing native validation', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    const amountField = screen.getByLabelText('Amount (grams)')
    await user.clear(amountField)
    fireEvent.submit(amountField.closest('form')!)

    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('shows an error message when a custom amount fails to log', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add this favorite.', 400))
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add this favorite.')).toBeInTheDocument()
  })

  it('shows a generic error message when a custom amount fails with a non-API error', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add this favorite.')).toBeInTheDocument()
  })

  it('shows a spinner on the custom-amount submit button while it is in flight', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    const { promise, resolve } = deferred<void>()
    vi.mocked(endpoints.createEntry).mockReturnValue(promise as never)
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    const submitButton = screen.getByRole('button', { name: 'Add' })
    await user.click(submitButton)

    expect(submitButton).toBeDisabled()
    resolve()
    // The form closes on success, taking the submit button with it - assert completion instead
    // of the (now-unmounted) button re-enabling.
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()
  })

  it('reverts the "Added ✓" label after a custom amount, same as a plain Add', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()

    await waitForElementToBeRemoved(() => screen.queryByText('Added ✓'), { timeout: 2000 })
  }, 3000)

  it('offers a unit toggle for a custom amount when the favorite has a non-gram default, in both directions', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: 53 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    expect(screen.getByLabelText('How many?')).toHaveValue(2)

    await user.click(screen.getByRole('button', { name: 'Use grams instead' }))
    expect(screen.getByLabelText('Amount (grams)')).toHaveValue(100)

    await user.click(screen.getByRole('button', { name: 'Use count instead' }))
    expect(screen.getByLabelText('How many?')).toHaveValue(1)
  })

  it('does not offer a unit toggle for a custom amount when the favorite has a gram default', async () => {
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    const user = userEvent.setup()
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))

    expect(screen.queryByRole('button', { name: /Use .* instead/ })).not.toBeInTheDocument()
  })

  it('treats a missing default_unit_to_grams as 1 gram per unit after toggling in the custom-amount form', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: null }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 2, unit_to_grams: 1 }))
  })
})

describe('LogFood favorite editing', () => {
  it('opens pre-filled with the saved default amount and unit', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: 53 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('How many?')).toHaveValue(2)
  })

  it('falls back to a plain-grams default when the favorite has none saved', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Amount (grams)')).toHaveValue(100)
  })

  it('cancelling closes the inline form without saving anything', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(endpoints.upsertFavorite).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
  })

  it("opening Edit on one favorite closes another favorite's open custom-amount form", async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite(),
      makeFavorite({ id: 'f2', barcode: '4', name: 'Eggs', brand: null }),
    ])
    renderLogFood()

    const customAmountButtons = await screen.findAllByRole('button', { name: 'Custom amount' })
    expect(customAmountButtons).toHaveLength(2)
    await user.click(customAmountButtons[0]) // opens Nutella's custom-amount form

    // Only Eggs still shows its normal action row - Nutella's is replaced by the form.
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    expect(editButtons).toHaveLength(1)
    await user.click(editButtons[0]) // opens Eggs' edit form, which should close Nutella's

    // Nutella's custom-amount form closed - back to its normal action row.
    expect(screen.getAllByRole('button', { name: 'Custom amount' })).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('typing after the field is cleared does not leave a stuck leading zero', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const amountField = screen.getByLabelText('Amount (grams)') as HTMLInputElement
    await user.clear(amountField)
    expect(amountField.value).toBe('')
    await user.type(amountField, '0521')
    expect(amountField.value).toBe('521')
  })

  it('does not save when the amount is cleared to empty, even bypassing native validation', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const amountField = screen.getByLabelText('Amount (grams)')
    await user.clear(amountField)
    fireEvent.submit(amountField.closest('form')!)

    expect(endpoints.upsertFavorite).not.toHaveBeenCalled()
  })

  it('saves the new default amount and reloads favorites', async () => {
    const user = userEvent.setup()
    const favorite = makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 })
    vi.mocked(endpoints.fetchFavorites)
      .mockResolvedValueOnce([favorite])
      .mockResolvedValue([
        makeFavorite({ default_input_unit: 'g', default_input_amount: 45, default_unit_to_grams: 1 }),
      ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const amountField = screen.getByLabelText('Amount (grams)')
    await user.clear(amountField)
    await user.type(amountField, '45')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(endpoints.upsertFavorite).toHaveBeenCalledWith(
      expect.objectContaining({
        barcode: favorite.barcode,
        default_input_unit: 'g',
        default_input_amount: 45,
        default_unit_to_grams: 1,
      })
    )
    await waitFor(() => expect(endpoints.fetchFavorites).toHaveBeenCalledTimes(2))
    expect(await screen.findByText(/45g default/)).toBeInTheDocument()
  })

  it('shows a spinner on the Save button while the update is in flight', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    const { promise, resolve } = deferred<Favorite>()
    vi.mocked(endpoints.upsertFavorite).mockReturnValue(promise as never)
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    const saveButton = screen.getByRole('button', { name: 'Save' })
    await user.click(saveButton)

    expect(saveButton).toBeDisabled()
    resolve(makeFavorite())
    // The form closes on success, taking the Save button with it - assert completion instead
    // of the (now-unmounted) button re-enabling.
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument())
  })

  it('shows an error message when saving the new default fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    vi.mocked(endpoints.upsertFavorite).mockRejectedValue(new ApiError('Could not update this favorite.', 400))
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Could not update this favorite.')).toBeInTheDocument()
  })

  it('shows a generic error message when saving the new default fails with a non-API error', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 30, default_unit_to_grams: 1 }),
    ])
    vi.mocked(endpoints.upsertFavorite).mockRejectedValue(new Error('boom'))
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Could not update this favorite.')).toBeInTheDocument()
  })

  it('offers a unit toggle when the favorite has a non-gram default, in both directions', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: 53 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    expect(screen.getByLabelText('How many?')).toHaveValue(2)

    await user.click(screen.getByRole('button', { name: 'Use grams instead' }))
    expect(screen.getByLabelText('Amount (grams)')).toHaveValue(100)

    await user.click(screen.getByRole('button', { name: 'Use count instead' }))
    expect(screen.getByLabelText('How many?')).toHaveValue(1)
  })

  it('does not offer a unit toggle when the favorite has a gram default or none at all', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.queryByRole('button', { name: /Use .* instead/ })).not.toBeInTheDocument()
  })

  it('saving with the toggled-to-grams unit uses a 1:1 conversion regardless of the saved factor', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: 53 }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Use grams instead' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(endpoints.upsertFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ default_input_unit: 'g', default_input_amount: 100, default_unit_to_grams: 1 })
    )
  })

  it('treats a missing default_unit_to_grams as 1 gram per unit after toggling away from grams', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: null }),
    ])
    renderLogFood()

    await user.click(await screen.findByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(endpoints.upsertFavorite).toHaveBeenCalledWith(
      expect.objectContaining({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: 1 })
    )
  })
})
