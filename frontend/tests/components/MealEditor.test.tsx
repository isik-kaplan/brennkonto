import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { FoodSearchResult, Meal } from '../../src/api/types'
import MealEditor from '../../src/components/MealEditor'
import { triggerIntersection } from '../testUtils/intersectionObserver'

vi.mock('../../src/api/endpoints')
vi.mock('../../src/components/BarcodeScanner', () => ({
  default: ({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) => (
    <div>
      <p>Mock scanner</p>
      <button type="button" onClick={() => onDetected('6000')}>
        Simulate detection
      </button>
      <button type="button" onClick={onClose}>
        Close scanner
      </button>
    </div>
  ),
}))

const egg: FoodSearchResult = {
  barcode: '6000',
  name: 'Egg',
  brand: null,
  calories_per_100g: 155,
  protein_per_100g: 13,
  carbs_per_100g: 1,
  fat_per_100g: 11,
  suggested_unit: 'count',
  unit_to_grams: 50,
}

const oats: FoodSearchResult = { ...egg, barcode: '5000', name: 'Oats', brand: 'Kölln', suggested_unit: 'g' }

const breakfast: Meal = {
  id: 'meal-1',
  name: 'Breakfast',
  items: [
    {
      name: 'Egg',
      brand: null,
      barcode: '6000',
      grams: 100,
      input_unit: 'count',
      input_amount: 2,
      unit_to_grams: 50,
      calories_per_100g: 155,
      protein_per_100g: 13,
      carbs_per_100g: 1,
      fat_per_100g: 11,
    },
  ],
  calories: 155,
  protein_g: 13,
  carbs_g: 1,
  fat_g: 11,
  times_logged: 2,
  last_logged_at: '2026-08-20T08:00:00Z',
}

function renderEditor(meal?: Meal) {
  const onSaved = vi.fn()
  const onCancel = vi.fn()
  render(<MealEditor meal={meal} onSaved={onSaved} onCancel={onCancel} />)
  return { onSaved, onCancel }
}

beforeEach(() => {
  vi.mocked(endpoints.searchFoods).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.lookupBarcode).mockReset().mockResolvedValue(egg)
  vi.mocked(endpoints.createMeal).mockReset()
  vi.mocked(endpoints.updateMeal).mockReset()
})

describe('MealEditor', () => {
  it('prompts to add foods and only enables saving once there is a name and a valid amount', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(screen.getByText('Search or scan to add foods.')).toBeInTheDocument()
    const save = screen.getByRole('button', { name: 'Save meal' })

    await user.type(screen.getByLabelText('Meal name'), '   ')
    await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
    expect(await screen.findByText('1 item ·', { exact: false })).toBeInTheDocument()
    expect(save).toBeDisabled()

    await user.clear(screen.getByLabelText('Meal name'))
    await user.type(screen.getByLabelText('Meal name'), 'Eggs')
    expect(save).toBeEnabled()

    await user.clear(screen.getByLabelText('How many?'))
    expect(save).toBeDisabled()
    await user.type(screen.getByLabelText('How many?'), '0')
    expect(save).toBeDisabled()
  })

  it('strips leading zeros from an amount', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
    const amount = await screen.findByLabelText('How many?')
    await user.clear(amount)
    await user.type(amount, '03')
    expect(amount).toHaveValue(3)
  })

  it("toggles a food between its own unit and grams, resetting the amount to that unit's default", async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')

    await user.click(await screen.findByRole('button', { name: 'Use grams instead' }))
    expect(screen.getByLabelText('Amount (grams)')).toHaveValue(100)
    await user.click(screen.getByRole('button', { name: 'Use count instead' }))
    expect(screen.getByLabelText('How many?')).toHaveValue(1)
  })

  it('offers no unit toggle for a food only measured in grams, and lists its brand', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockResolvedValue(oats)
    renderEditor()
    await user.type(screen.getByLabelText('Or add by barcode'), '5000{Enter}')

    expect(await screen.findByText(/Kölln ·/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /instead/ })).not.toBeInTheDocument()
  })

  it('removes a food', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Remove Egg from this meal' }))
    expect(screen.getByText('Search or scan to add foods.')).toBeInTheDocument()
  })

  it('ignores a blank barcode lookup', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.type(screen.getByLabelText('Or add by barcode'), '  ')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(endpoints.lookupBarcode).not.toHaveBeenCalled()
  })

  it('falls back to a generic message when a lookup fails unexpectedly', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new Error('network'))
    renderEditor()
    await user.type(screen.getByLabelText('Or add by barcode'), '6000')
    await user.click(screen.getByRole('button', { name: 'Look up' }))
    expect(await screen.findByText('Barcode lookup failed.')).toBeInTheDocument()
  })

  it('adds a scanned food and closes the scanner', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    await user.click(await screen.findByRole('button', { name: 'Simulate detection' }))

    expect(endpoints.lookupBarcode).toHaveBeenCalledWith('6000')
    expect(await screen.findByLabelText('How many?')).toBeInTheDocument()
    expect(screen.queryByText('Mock scanner')).not.toBeInTheDocument()
  })

  it('closes the scanner without adding anything', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Scan with camera' }))
    await user.click(await screen.findByRole('button', { name: 'Close scanner' }))
    expect(screen.queryByText('Mock scanner')).not.toBeInTheDocument()
    expect(endpoints.lookupBarcode).not.toHaveBeenCalled()
  })

  it('adds a searched food with a brandless meta line and clears the search', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.searchFoods).mockResolvedValue([egg])
    renderEditor()
    await user.type(screen.getByLabelText('Add a food'), 'egg')
    expect(await screen.findByText('155 kcal/100g')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Egg/ }))

    expect(screen.getByLabelText('Add a food')).toHaveValue('')
    expect(screen.getByText(/Unbranded ·/)).toBeInTheDocument()
  })

  it('creates a new meal, trimmed', async () => {
    const user = userEvent.setup()
    const { onSaved } = renderEditor()
    await user.type(screen.getByLabelText('Meal name'), ' Eggs ')
    await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
    await user.click(await screen.findByRole('button', { name: 'Save meal' }))

    expect(endpoints.createMeal).toHaveBeenCalledWith('Eggs', [expect.objectContaining({ name: 'Egg' })])
    expect(endpoints.updateMeal).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()
  })

  it('saves an edit to the meal it was opened on, trimmed', async () => {
    const user = userEvent.setup()
    const { onSaved } = renderEditor(breakfast)
    const name = screen.getByLabelText('Meal name')
    await user.clear(name)
    await user.type(name, ' Brunch ')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))

    expect(endpoints.updateMeal).toHaveBeenCalledWith('meal-1', 'Brunch', [
      expect.objectContaining({ name: 'Egg', input_unit: 'count', input_amount: 2 }),
    ])
    expect(endpoints.createMeal).not.toHaveBeenCalled()
    expect(onSaved).toHaveBeenCalled()
  })

  it('falls back to a generic message when saving fails unexpectedly', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.updateMeal).mockRejectedValue(new Error('network'))
    const { onSaved } = renderEditor(breakfast)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Could not save this meal.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows an API error from saving', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.updateMeal).mockRejectedValue(new ApiError('Name taken', 400))
    renderEditor(breakfast)
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Name taken')).toBeInTheDocument()
  })

  it('cancels', async () => {
    const user = userEvent.setup()
    const { onCancel } = renderEditor()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('ignores a submit (e.g. Enter in the name field) while the meal is incomplete', () => {
    const { onSaved } = renderEditor()
    fireEvent.submit(screen.getByLabelText('Meal name').closest('form')!)
    expect(endpoints.createMeal).not.toHaveBeenCalled()
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('shows a food without a barcode', () => {
    renderEditor({ ...breakfast, items: [{ ...breakfast.items[0], barcode: null, name: 'Homemade bread' }] })
    expect(screen.getByText('Homemade bread')).toBeInTheDocument()
  })

  it('shows a spinner while the next page of search results loads', async () => {
    const user = userEvent.setup()
    const page = (offset: number) =>
      Array.from({ length: 25 }, (_, i) => ({ ...oats, barcode: String(offset + i), name: `Food ${offset + i}` }))
    vi.mocked(endpoints.searchFoods).mockResolvedValueOnce(page(0))
    const { container } = render(<MealEditor onSaved={vi.fn()} onCancel={vi.fn()} />)
    await user.type(screen.getByLabelText('Add a food'), 'food')
    expect(await screen.findByText('Food 0')).toBeInTheDocument()

    let resolveNext!: (results: FoodSearchResult[]) => void
    vi.mocked(endpoints.searchFoods).mockReturnValueOnce(new Promise((resolve) => (resolveNext = resolve)))
    act(() => triggerIntersection())
    await waitFor(() => expect(container.querySelector('.search-results__sentinel .btn__spinner')).toBeInTheDocument())

    await act(async () => resolveNext(page(25)))
    expect(screen.getByText('Food 25')).toBeInTheDocument()
  })

  describe('what the tests above leave unpinned', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }

    it('shows nothing but the form when empty - no list, results, or banners', () => {
      const { container } = render(<MealEditor onSaved={vi.fn()} onCancel={vi.fn()} />)
      expect(container.querySelector('.entry-list')).not.toBeInTheDocument()
      expect(container.querySelector('.search-results')).not.toBeInTheDocument()
      expect(container.querySelector('.form__banner')).not.toBeInTheDocument()
      expect(screen.queryByText('Searching…')).not.toBeInTheDocument()
      expect(container.querySelector('.btn__spinner')).not.toBeInTheDocument()
    })

    it('needs at least one food, and every food needs an amount', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.lookupBarcode).mockResolvedValueOnce(egg).mockResolvedValueOnce(oats)
      renderEditor()
      await user.type(screen.getByLabelText('Meal name'), 'Eggs')
      const save = screen.getByRole('button', { name: 'Save meal' })
      expect(save).toBeDisabled()

      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      await user.type(await screen.findByLabelText('Or add by barcode'), '5000{Enter}')
      await screen.findByText('Oats')
      expect(save).toBeEnabled()
      await user.clear(screen.getAllByRole('spinbutton')[1])
      expect(save).toBeDisabled()
    })

    it('counts items in the summary, pluralized', async () => {
      const user = userEvent.setup()
      renderEditor()
      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      expect(await screen.findByText(/^1 item ·/)).toHaveTextContent(/^1 item · 78 kcal$/)
      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      expect(await screen.findByText(/^2 items ·/)).toHaveTextContent(/^2 items · 155 kcal$/)
    })

    it('edits only the food whose amount changed', async () => {
      const user = userEvent.setup()
      renderEditor()
      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      await waitFor(() => expect(screen.getAllByRole('spinbutton')).toHaveLength(2))
      const [first, second] = screen.getAllByRole('spinbutton')
      await user.clear(second)
      await user.type(second, '4')
      expect(first).toHaveValue(1)
      expect(second).toHaveValue(4)
    })

    it('shows each food with its brand (or Unbranded) and calories', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.lookupBarcode).mockResolvedValueOnce(egg).mockResolvedValueOnce(oats)
      const { container } = render(<MealEditor onSaved={vi.fn()} onCancel={vi.fn()} />)
      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      await user.type(screen.getByLabelText('Or add by barcode'), '5000{Enter}')
      await screen.findByText('Oats')
      const metas = [...container.querySelectorAll('.entry-row__meta')].map((meta) => meta.textContent)
      // Oats default to 100g: 155 kcal/100g.
      expect(metas).toEqual(['Unbranded · 78 kcal', 'Kölln · 155 kcal'])
    })

    it('computes calories from grams once a food is switched to grams', async () => {
      const user = userEvent.setup()
      const { container } = render(<MealEditor onSaved={vi.fn()} onCancel={vi.fn()} />)
      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      await user.click(await screen.findByRole('button', { name: 'Use grams instead' }))
      // 100g at 155 kcal/100g - not 100 eggs.
      expect(container.querySelector('.entry-row__meta')).toHaveTextContent('Unbranded · 155 kcal')
    })

    it('offers the unit toggle when editing only for foods logged in their own unit', () => {
      const grams = { ...breakfast.items[0], name: 'Rice', input_unit: 'g', input_amount: 100, unit_to_grams: 1 }
      renderEditor({ ...breakfast, items: [grams, breakfast.items[0]] })
      expect(screen.getAllByRole('button', { name: /instead/ })).toHaveLength(1)
      expect(screen.getByRole('button', { name: 'Use grams instead' })).toBeInTheDocument()
      expect(screen.getByLabelText('Amount (grams)')).toHaveValue(100)
    })

    it.each([
      ['0007', '7'],
      ['100', '100'],
      ['0.5', '0.5'],
    ])('shows an amount entered as %s as %s', async (entered, shown) => {
      const user = userEvent.setup()
      renderEditor()
      await user.type(screen.getByLabelText('Or add by barcode'), '6000{Enter}')
      const amount = await screen.findByLabelText('How many?')
      // All at once, like a paste - typed a key at a time, each keystroke would be cleaned up alone.
      fireEvent.change(amount, { target: { value: entered } })
      expect(amount).toHaveDisplayValue(shown)
    })

    it('trims a typed barcode and disables Look up while it runs', async () => {
      const user = userEvent.setup()
      const lookup = deferred<FoodSearchResult>()
      vi.mocked(endpoints.lookupBarcode).mockReturnValue(lookup.promise)
      const { container } = render(<MealEditor onSaved={vi.fn()} onCancel={vi.fn()} />)
      await user.type(screen.getByLabelText('Or add by barcode'), ' 6000 ')
      await user.click(screen.getByRole('button', { name: 'Look up' }))

      expect(endpoints.lookupBarcode).toHaveBeenCalledWith('6000')
      expect(screen.getByRole('button', { name: 'Look up' })).toBeDisabled()
      expect(container.querySelector('.btn__spinner')).toBeInTheDocument()

      await act(async () => lookup.resolve(egg))
      expect(screen.getByRole('button', { name: 'Look up' })).toBeEnabled()
      expect(container.querySelector('.btn__spinner')).not.toBeInTheDocument()
    })

    it('re-enables Look up after a failed lookup', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.lookupBarcode).mockRejectedValue(new ApiError('Nope', 404))
      renderEditor()
      await user.type(screen.getByLabelText('Or add by barcode'), '1')
      await user.click(screen.getByRole('button', { name: 'Look up' }))
      await screen.findByText('Nope')
      expect(screen.getByRole('button', { name: 'Look up' })).toBeEnabled()
    })

    it('disables saving while it runs, and allows a retry after it fails', async () => {
      const user = userEvent.setup()
      const save = deferred<never>()
      vi.mocked(endpoints.updateMeal).mockReturnValue(save.promise)
      const { container } = render(<MealEditor meal={breakfast} onSaved={vi.fn()} onCancel={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Save changes' }))

      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled()
      expect(container.querySelector('.btn__spinner')).toBeInTheDocument()

      await act(async () => save.reject(new ApiError('Name taken', 400)))
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
      expect(container.querySelector('.btn__spinner')).not.toBeInTheDocument()
    })

    it('shows Searching… while a search runs, then each result with its brand', async () => {
      const user = userEvent.setup()
      const search = deferred<FoodSearchResult[]>()
      vi.mocked(endpoints.searchFoods).mockReturnValue(search.promise)
      renderEditor()
      await user.type(screen.getByLabelText('Add a food'), 'eg')
      expect(await screen.findByText('Searching…')).toBeInTheDocument()

      // The search itself only fires once the debounce elapses.
      await waitFor(() => expect(endpoints.searchFoods).toHaveBeenCalled())
      await act(async () => search.resolve([egg, oats]))
      expect(screen.queryByText('Searching…')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Egg Unbranded/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /Oats Kölln/ })).toBeInTheDocument()
    })
  })
})
