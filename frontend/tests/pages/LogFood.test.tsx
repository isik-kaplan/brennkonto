import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { FoodSearchResult } from '../../src/api/types'
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

beforeEach(() => {
  vi.mocked(endpoints.searchFoods).mockReset()
  vi.mocked(endpoints.lookupBarcode).mockReset()
  vi.mocked(endpoints.createEntry).mockReset()
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
})
