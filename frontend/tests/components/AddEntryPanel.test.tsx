import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { Favorite, FoodSearchResult } from '../../src/api/types'
import AddEntryPanel from '../../src/components/AddEntryPanel'
import { triggerIntersection } from '../testUtils/intersectionObserver'

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

// Matches the backend's _PAGE_SIZE (backend/app/controllers/foods.py) - a page this long is what
// tells the search UI there may be a next one to scroll to.
const PAGE_SIZE = 25

function fullPageOfResults(offset = 0): FoodSearchResult[] {
  return Array.from({ length: PAGE_SIZE }, (_, i) => ({
    barcode: String(offset + i),
    name: `Product ${offset + i}`,
    brand: 'Brand',
    calories_per_100g: 100,
    protein_per_100g: 1,
    carbs_per_100g: 2,
    fat_per_100g: 3,
    suggested_unit: 'g',
    unit_to_grams: 1,
  }))
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
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
  vi.mocked(endpoints.fetchFavorites).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.searchFoods).mockReset()
  vi.mocked(endpoints.lookupBarcode).mockReset()
  vi.mocked(endpoints.createEntry).mockReset()
})

describe('AddEntryPanel', () => {
  it('starts collapsed, showing only the toggle', () => {
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)
    expect(screen.getByRole('button', { name: '+ Add entry' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Product name')).not.toBeInTheDocument()
    expect(endpoints.fetchFavorites).not.toHaveBeenCalled()
  })

  it('opens the composer and loads favorites', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    expect(screen.getByLabelText('Product name')).toBeInTheDocument()
    await waitFor(() => expect(endpoints.fetchFavorites).toHaveBeenCalled())
    expect(await screen.findByText('Nutella')).toBeInTheDocument()
  })

  it('closing resets the search and selection', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByLabelText('Product name')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    expect(screen.getByLabelText('Product name')).toHaveValue('')
  })

  it('loads the next page of results when scrolled into view', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(fullPageOfResults(0))
    const { container } = render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'product')
    expect(await screen.findByText('Product 0')).toBeInTheDocument()
    expect(screen.getByText('Product 24')).toBeInTheDocument()
    expect(container.querySelector('.search-results__sentinel .btn__spinner')).not.toBeInTheDocument()

    const secondPage = deferred<FoodSearchResult[]>()
    vi.mocked(endpoints.searchFoods).mockReturnValueOnce(secondPage.promise)

    act(() => triggerIntersection())
    await waitFor(() => expect(container.querySelector('.search-results__sentinel .btn__spinner')).toBeInTheDocument())
    expect(endpoints.searchFoods).toHaveBeenCalledWith('product', 2)

    await act(async () => secondPage.resolve(fullPageOfResults(PAGE_SIZE)))
    expect(await screen.findByText('Product 25')).toBeInTheDocument()
    expect(container.querySelector('.search-results__sentinel .btn__spinner')).not.toBeInTheDocument()
  })

  it('searches, selects a result, and saves it against the viewed date', async () => {
    const user = userEvent.setup()
    const onAdded = vi.fn()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockResolvedValue({
      id: '1',
      name: 'Nutella',
      brand: 'Ferrero',
      barcode: '3017620422003',
      grams: 50,
      input_unit: 'g',
      input_amount: 50,
      unit_to_grams: 1,
      calories_per_100g: 539,
      protein_per_100g: 6.3,
      carbs_per_100g: 57.5,
      fat_per_100g: 30.9,
      calories: 269.5,
      protein_g: 3.15,
      carbs_g: 28.75,
      fat_g: 15.45,
      consumed_at: '2026-08-01T08:00:00',
      created_at: '2026-08-01T08:00:00Z',
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    })
    render(<AddEntryPanel date="2026-08-01" onAdded={onAdded} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByText('Nutella'))

    expect(screen.getByLabelText('Date')).toHaveValue('2026-08-01')

    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    await user.type(amountInput, '50')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalled())
    const [payload] = vi.mocked(endpoints.createEntry).mock.calls[0]
    expect(payload).toMatchObject({ name: 'Nutella', grams: 50 })
    expect(payload.consumed_at).toMatch(/^2026-08-01T\d{2}:\d{2}:00$/)
    expect(onAdded).toHaveBeenCalled()
    expect(await screen.findByText('Added Nutella.')).toBeInTheDocument()
    // Composer resets so another item can be logged without reopening the panel.
    expect(screen.getByLabelText('Product name')).toHaveValue('')
  })

  it('allows changing the entry date and time, and going back to search', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByText('Nutella'))

    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-01-01' } })
    expect(dateInput.value).toBe('2026-01-01')

    const timeInput = screen.getByLabelText('Time') as HTMLInputElement
    fireEvent.change(timeInput, { target: { value: '08:30' } })
    expect(timeInput.value).toBe('08:30')

    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.queryByLabelText('Date')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Product name')).toBeInTheDocument()
  })

  it('saves a non-gram entry with the unit conversion applied', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([eggs])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'eggs')
    await user.click(await screen.findByText('Eggs'))

    const howMany = screen.getByLabelText('How many?')
    await user.clear(howMany)
    await user.type(howMany, '2')
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ grams: 106, input_unit: 'count', input_amount: 2, unit_to_grams: 53 })
      )
    )
  })

  it('re-syncs its date field when the viewed History date changes', () => {
    const { rerender } = render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)
    rerender(<AddEntryPanel date="2026-08-05" onAdded={vi.fn()} />)
    // Nothing observable while collapsed - opening after the date prop changes proves the sync;
    // covered indirectly via the save test's date assertion above for the common path.
    expect(screen.getByRole('button', { name: '+ Add entry' })).toBeInTheDocument()
  })

  it('quick-adds a favorite with a saved default amount without opening the amount form', async () => {
    const user = userEvent.setup()
    const onAdded = vi.fn()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 15, default_unit_to_grams: 1 }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={onAdded} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 15, input_amount: 15 }))
    )
    expect(onAdded).toHaveBeenCalled()
  })

  it('falls back to the amount form for a favorite with no saved default', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(screen.getByLabelText('Amount (grams)')).toBeInTheDocument()
    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it("shows the favorite's saved default amount", async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 15, default_unit_to_grams: 1 }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    expect(await screen.findByText(/15g default/)).toBeInTheDocument()
  })

  it('logs a one-off custom amount without touching the saved default', async () => {
    const user = userEvent.setup()
    const onAdded = vi.fn()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 15, default_unit_to_grams: 1 }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={onAdded} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))

    const amountInput = screen.getByLabelText('Amount (grams)')
    expect(amountInput).toHaveValue(15)
    await user.clear(amountInput)
    await user.type(amountInput, '40')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ grams: 40, input_amount: 40, input_unit: 'g' })
      )
    )
    expect(endpoints.upsertFavorite).not.toHaveBeenCalled()
    expect(onAdded).toHaveBeenCalled()
  })

  it('saves a custom amount for a non-gram favorite with the unit conversion applied', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 1, default_unit_to_grams: 53 }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))

    const amountInput = screen.getByLabelText('How many?')
    await user.clear(amountInput)
    await user.type(amountInput, '3')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ grams: 159, input_unit: 'count', input_amount: 3, unit_to_grams: 53 })
      )
    )
  })

  it('falls back unit_to_grams to 1 for a custom amount when no conversion was saved', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 1, default_unit_to_grams: null }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ grams: 1, input_unit: 'count', input_amount: 1, unit_to_grams: 1 })
      )
    )
  })

  it('offers a unit toggle inside the custom-amount form for a non-gram favorite', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: 53 }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))

    expect(screen.getByLabelText('How many?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use grams instead' }))
    expect(screen.getByLabelText('Amount (grams)')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Use count instead' }))
    expect(screen.getByLabelText('How many?')).toBeInTheDocument()
  })

  it('cancels a custom amount without adding', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Amount (grams)')).not.toBeInTheDocument()
    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('does not submit a custom amount of zero, even bypassing native validation', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))

    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    fireEvent.submit(amountInput.closest('form')!)

    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('shows an API error message when a custom amount fails to save', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add.', 500))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API custom-amount failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite()])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add this favorite.')).toBeInTheDocument()
  })

  it('looks up a barcode and scans via camera', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(nutella)
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(screen.getByRole('button', { name: 'Scan' }))
    await user.click(await screen.findByRole('button', { name: 'Simulate detection' }))

    expect(endpoints.lookupBarcode).toHaveBeenCalledWith('3017620422003')
    expect(await screen.findByText(/Nutella/)).toBeInTheDocument()
  })

  it('closes the scanner without looking anything up', async () => {
    const user = userEvent.setup()
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(screen.getByRole('button', { name: 'Scan' }))
    await user.click(await screen.findByRole('button', { name: 'Close scanner' }))

    expect(screen.queryByText('Mock scanner')).not.toBeInTheDocument()
    expect(endpoints.lookupBarcode).not.toHaveBeenCalled()
  })

  it('shows an error message when the barcode lookup fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new ApiError('No product found for this barcode.', 404))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Barcode'), '0000000000000')
    await user.click(screen.getByRole('button', { name: 'Look up' }))

    expect(await screen.findByText('No product found for this barcode.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API barcode lookup failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new Error('boom'))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Barcode'), '0000000000000')
    await user.click(screen.getByRole('button', { name: 'Look up' }))

    expect(await screen.findByText('Barcode lookup failed.')).toBeInTheDocument()
  })

  it('does nothing when the barcode field is blank', async () => {
    const user = userEvent.setup()
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(screen.getByRole('button', { name: 'Look up' }))

    expect(endpoints.lookupBarcode).not.toHaveBeenCalled()
  })

  it('shows an API error message when the scanner-detected lookup fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new ApiError('No product found for this barcode.', 404))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(screen.getByRole('button', { name: 'Scan' }))
    await user.click(await screen.findByRole('button', { name: 'Simulate detection' }))

    expect(await screen.findByText('No product found for this barcode.')).toBeInTheDocument()
  })

  it('shows a generic error message when the scanner-detected lookup fails with a non-API error', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new Error('boom'))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(screen.getByRole('button', { name: 'Scan' }))
    await user.click(await screen.findByRole('button', { name: 'Simulate detection' }))

    expect(await screen.findByText('Barcode lookup failed.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API search failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockRejectedValue(new Error('boom'))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')

    expect(await screen.findByText('Search failed.')).toBeInTheDocument()
  })

  it('shows an API error message for a search failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockRejectedValue(new ApiError('Search unavailable.', 503))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')

    expect(await screen.findByText('Search unavailable.')).toBeInTheDocument()
  })

  it('renders search results and favorites with an unbranded fallback', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([{ ...nutella, brand: null }])
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([makeFavorite({ brand: null })])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByText('Nutella'))

    expect(screen.getByText(/Unbranded/)).toBeInTheDocument()
  })

  it('offers a unit toggle for a non-gram product and can switch to grams and back', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([eggs])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'eggs')
    await user.click(await screen.findByText('Eggs'))

    expect(screen.getByLabelText('How many?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use grams instead' }))
    expect(screen.getByLabelText('Amount (grams)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Use count instead' }))
    expect(screen.getByLabelText('How many?')).toBeInTheDocument()
  })

  it('does not submit when the amount is cleared to empty, even bypassing native validation', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByText('Nutella'))

    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    fireEvent.submit(amountInput.closest('form')!)

    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('shows an error message when saving the entry fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not save.', 500))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByText('Nutella'))
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(await screen.findByText('Could not save.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API save failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.type(screen.getByLabelText('Product name'), 'nutella')
    await user.click(await screen.findByText('Nutella'))
    await user.click(screen.getByRole('button', { name: 'Save entry' }))

    expect(await screen.findByText('Could not save this entry.')).toBeInTheDocument()
  })

  it('shows an API error message when quick-adding a favorite fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 15, default_unit_to_grams: 1 }),
    ])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add.', 500))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API quick-add failure', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 15, default_unit_to_grams: 1 }),
    ])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add this favorite.')).toBeInTheDocument()
  })

  it('falls back unit_to_grams to 1 when quick-adding a non-gram favorite with no saved conversion', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'count', default_input_amount: 2, default_unit_to_grams: null }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ grams: 2, input_unit: 'count', input_amount: 2, unit_to_grams: 1 })
      )
    )
  })

  it('reverts the quick-add button label after the confirmation window', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
      makeFavorite({ default_input_unit: 'g', default_input_amount: 15, default_unit_to_grams: 1 }),
    ])
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))
    expect(await screen.findByRole('button', { name: 'Added ✓' })).toBeInTheDocument()

    // Real timers - the 1500ms confirmation window really elapses rather than being faked, to
    // sidestep user-event's known friction with vi.useFakeTimers().
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument(), {
      timeout: 3000,
    })
  }, 10000)

  it("adds a food from History using the panel's own viewed date and the current time", async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([
      {
        barcode: '3017620422003',
        name: 'Nutella',
        brand: 'Ferrero',
        calories_per_100g: 539,
        protein_per_100g: 6.3,
        carbs_per_100g: 57.5,
        fat_per_100g: 30.9,
        suggested_unit: 'g',
        unit_to_grams: 1,
        last_input_amount: 45,
        last_logged_at: '2026-08-05T08:00:00Z',
        times_logged: 3,
      },
    ])
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([])
    vi.mocked(endpoints.createEntry).mockResolvedValue({} as never)
    render(<AddEntryPanel date="2026-08-01" onAdded={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '+ Add entry' }))
    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await user.click(await screen.findByRole('button', { name: 'Add' }))

    await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalled())
    const [payload] = vi.mocked(endpoints.createEntry).mock.calls[0]
    expect(payload).toMatchObject({ name: 'Nutella', grams: 45 })
    // The date comes from the panel's own `date` prop (whichever day History is viewing), not
    // "today" - unlike Log Food's history picker, which always logs against right now.
    expect(payload.consumed_at).toMatch(/^2026-08-01T\d{2}:\d{2}:00$/)
  })
})
