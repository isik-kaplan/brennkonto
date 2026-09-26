import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { HistoryFood, HistoryGroup } from '../../src/api/types'
import HistoryPicker from '../../src/components/HistoryPicker'

vi.mock('../../src/api/endpoints')

const nutella: HistoryFood = {
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
}

// suggested_unit 'count' rather than 'g' - exercises the unit_to_grams scaling branch that a
// gram-based food never touches, and a null brand for the "Unbranded" fallback.
const bananaFood: HistoryFood = {
  barcode: '4011',
  name: 'Banana',
  brand: null,
  calories_per_100g: 89,
  protein_per_100g: 1.1,
  carbs_per_100g: 22.8,
  fat_per_100g: 0.3,
  suggested_unit: 'count',
  unit_to_grams: 53,
  last_input_amount: 2,
  last_logged_at: '2026-08-05T08:00:00Z',
  times_logged: 1,
}

const breakfast: HistoryGroup = {
  name: 'Breakfast',
  calories: 500,
  last_logged_at: '2026-08-05T08:00:00Z',
  times_logged: 2,
  items: [
    {
      name: 'Nutella',
      brand: 'Ferrero',
      barcode: '3017620422003',
      grams: 30,
      input_unit: 'g',
      input_amount: 30,
      unit_to_grams: 1,
      calories_per_100g: 539,
      protein_per_100g: 6.3,
      carbs_per_100g: 57.5,
      fat_per_100g: 30.9,
    },
    {
      name: 'Banana',
      brand: null,
      barcode: '4011',
      grams: 120,
      input_unit: 'g',
      input_amount: 120,
      unit_to_grams: 1,
      calories_per_100g: 89,
      protein_per_100g: 1.1,
      carbs_per_100g: 22.8,
      fat_per_100g: 0.3,
    },
  ],
}

// A single-item group (singular "1 item" copy) whose item is non-gram and barcode-less, to
// exercise both the unit_to_grams scaling and the barcode-less `?? item.name` React key fallback
// inside the Customize form.
const soloSnack: HistoryGroup = {
  name: 'Snack',
  calories: 187,
  last_logged_at: '2026-08-05T08:00:00Z',
  times_logged: 1,
  items: [
    {
      name: 'Banana',
      brand: null,
      barcode: null,
      grams: 106,
      input_unit: 'count',
      input_amount: 2,
      unit_to_grams: 53,
      calories_per_100g: 89,
      protein_per_100g: 1.1,
      carbs_per_100g: 22.8,
      fat_per_100g: 0.3,
    },
  ],
}

beforeEach(() => {
  vi.mocked(endpoints.fetchHistoryFoods).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.fetchHistoryGroups).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.createEntry).mockReset()
  vi.mocked(endpoints.createMealGroup).mockReset()
})

function renderPicker(onAdded = vi.fn()) {
  return { onAdded, ...render(<HistoryPicker getConsumedAt={() => '2026-08-06T12:00:00'} onAdded={onAdded} />) }
}

describe('HistoryPicker', () => {
  it('starts collapsed, centered in its own teaser box, and does not load anything until opened', () => {
    const { container } = renderPicker()
    const teaser = container.querySelector('.history-picker__teaser')
    expect(teaser).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse past foods' }).closest('.history-picker__teaser')).toBe(teaser)
    expect(endpoints.fetchHistoryFoods).not.toHaveBeenCalled()
    expect(endpoints.fetchHistoryGroups).not.toHaveBeenCalled()
  })

  it('loads and renders past foods and past meals on open', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))

    await waitFor(() => expect(endpoints.fetchHistoryFoods).toHaveBeenCalledWith(''))
    expect(endpoints.fetchHistoryGroups).toHaveBeenCalledWith('')
    expect(await screen.findByText('Nutella')).toBeInTheDocument()
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
  })

  it('labels a saved meal and only shows a logged count once it has been logged', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([
      { ...breakfast, name: 'Unlogged', saved_meal_id: 'meal-1', times_logged: 0, last_logged_at: null },
      { ...breakfast, name: 'Logged', saved_meal_id: 'meal-2', times_logged: 2 },
    ])
    renderPicker()
    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))

    const metaOf = (name: string) => screen.getByText(name).closest('li')!.querySelector('.entry-row__meta')
    await screen.findByText('Unlogged')
    expect(metaOf('Unlogged')).toHaveTextContent(/kcal · saved$/)
    expect(metaOf('Logged')).toHaveTextContent(/kcal · saved · logged 2×$/)
  })

  it('shows an empty state when history is empty', async () => {
    const user = userEvent.setup()
    renderPicker()
    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    expect(await screen.findByText(/Nothing logged yet/)).toBeInTheDocument()
  })

  it('searches by typing, debounced', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    renderPicker()
    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await waitFor(() => expect(endpoints.fetchHistoryFoods).toHaveBeenCalledWith(''))

    vi.mocked(endpoints.fetchHistoryFoods).mockClear()
    await user.type(screen.getByPlaceholderText(/Search everything/), 'nut')

    await waitFor(() => expect(endpoints.fetchHistoryFoods).toHaveBeenCalledWith('nut'), { timeout: 1000 })
  })

  it('quick-adds a past food using its last-used amount and unit', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockResolvedValue({} as never)
    const { onAdded } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Nutella',
          barcode: '3017620422003',
          grams: 45,
          input_unit: 'g',
          input_amount: 45,
          consumed_at: '2026-08-06T12:00:00',
        })
      )
    )
    expect(onAdded).toHaveBeenCalled()
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()

    // Real timers - the 1500ms confirmation window really elapses, same as EntryList's equivalent
    // "Repeated ✓" reversion.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toHaveTextContent('Add'), {
      timeout: 3000,
    })
  }, 10000)

  it('scales a quick-add by unit_to_grams for a non-gram food, and shows "Unbranded" for a null brand', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([bananaFood])
    vi.mocked(endpoints.createEntry).mockResolvedValue({} as never)
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Banana')
    expect(screen.getByText(/Unbranded/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ grams: 106, input_unit: 'count', input_amount: 2, unit_to_grams: 53 })
      )
    )
  })

  it('shows the API error message when a quick add fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add "Nutella".', 500))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add "Nutella".')).toBeInTheDocument()
  })

  it('shows a generic error message when a quick add fails without an ApiError', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add "Nutella".')).toBeInTheDocument()
  })

  it('lets a custom amount be entered instead of the last-used one', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockResolvedValue({} as never)
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Custom amount' }))

    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    await user.type(amountInput, '15')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 15, input_amount: 15 }))
    )
    // The row falls back out of the custom form to the normal one, briefly showing "Added ✓"
    // before reverting - same real-timer window as the quick-add path.
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toHaveTextContent('Add'), {
      timeout: 3000,
    })
  }, 10000)

  it('scales a custom amount by unit_to_grams for a non-gram food', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([bananaFood])
    vi.mocked(endpoints.createEntry).mockResolvedValue({} as never)
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Banana')
    await user.click(screen.getByRole('button', { name: 'Custom amount' }))

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

  it('cancels a custom-amount food form without adding it', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Custom amount' })).toBeInTheDocument()
    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('does not submit a custom amount of zero or less', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    const { container } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Custom amount' }))

    const amountInput = screen.getByLabelText('Amount (grams)')
    await user.clear(amountInput)
    // Bypasses the input's own `required`/`min` validation, isolating the component's own guard.
    fireEvent.submit(container.querySelector('form')!)

    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('shows the API error message when a custom-amount add fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add "Nutella".', 500))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add "Nutella".')).toBeInTheDocument()
  })

  it('shows a generic error message when a custom-amount add fails without an ApiError', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.click(screen.getByRole('button', { name: 'Custom amount' }))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Could not add "Nutella".')).toBeInTheDocument()
  })

  it('adds every item of a past meal and re-groups them under the same name', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    vi.mocked(endpoints.createEntry)
      .mockResolvedValueOnce({ id: 'e1' } as never)
      .mockResolvedValueOnce({
        id: 'e2',
      } as never)
    vi.mocked(endpoints.createMealGroup).mockResolvedValue({} as never)
    const { onAdded } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalledTimes(2))
    expect(endpoints.createMealGroup).toHaveBeenCalledWith(['e1', 'e2'], 'Breakfast')
    expect(onAdded).toHaveBeenCalled()
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()

    // Real timers - same 1500ms confirmation window as the per-food quick-add.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add meal' })).toHaveTextContent('Add meal'), {
      timeout: 3000,
    })
  }, 10000)

  it('describes a single-item meal in the singular', async () => {
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([soloSnack])
    renderPicker()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Browse past foods' }))
    expect(await screen.findByText(/1 item ·/)).toBeInTheDocument()
  })

  it('shows the API error message when adding a past meal fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add "Breakfast".', 500))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    expect(await screen.findByText('Could not add "Breakfast".')).toBeInTheDocument()
  })

  it('shows a generic error message when adding a past meal fails without an ApiError', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    expect(await screen.findByText('Could not add "Breakfast".')).toBeInTheDocument()
  })

  it('lets each ingredient of a past meal get a custom amount before logging', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    vi.mocked(endpoints.createEntry)
      .mockResolvedValueOnce({ id: 'e1' } as never)
      .mockResolvedValueOnce({ id: 'e2' } as never)
    vi.mocked(endpoints.createMealGroup).mockResolvedValue({} as never)
    const { onAdded } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Customize' }))

    const nutellaAmount = screen.getByLabelText(/Nutella/)
    await user.clear(nutellaAmount)
    await user.type(nutellaAmount, '10')
    const bananaAmount = screen.getByLabelText(/Banana/)
    await user.clear(bananaAmount)
    await user.type(bananaAmount, '200')

    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalledTimes(2))
    expect(endpoints.createEntry).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ name: 'Nutella', grams: 10, input_amount: 10 })
    )
    expect(endpoints.createEntry).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ name: 'Banana', grams: 200, input_amount: 200 })
    )
    expect(endpoints.createMealGroup).toHaveBeenCalledWith(['e1', 'e2'], 'Breakfast')
    expect(onAdded).toHaveBeenCalled()
    expect(await screen.findByText('Added ✓')).toBeInTheDocument()

    // Real timers - same 1500ms confirmation window as the other add paths.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add meal' })).toHaveTextContent('Add meal'), {
      timeout: 3000,
    })
  }, 10000)

  it('scales a customized ingredient by unit_to_grams for a non-gram, barcode-less item', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([soloSnack])
    vi.mocked(endpoints.createEntry).mockResolvedValueOnce({ id: 'e1' } as never)
    vi.mocked(endpoints.createMealGroup).mockResolvedValue({} as never)
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Snack')
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    // Left at its default (last-logged) amount - just confirms it scales by unit_to_grams.
    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    await waitFor(() =>
      expect(endpoints.createEntry).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Banana', grams: 106, input_unit: 'count', input_amount: 2, unit_to_grams: 53 })
      )
    )
  })

  it('cancels a Customize form without adding the meal', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Customize' })).toBeInTheDocument()
    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('does not submit a Customize form with any ingredient amount at zero or less', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Customize' }))

    const nutellaAmount = screen.getByLabelText(/Nutella/)
    await user.clear(nutellaAmount)
    // Bypasses the inputs' own `required`/`min` validation, isolating the component's own guard.
    fireEvent.submit(nutellaAmount.closest('form')!)

    expect(endpoints.createEntry).not.toHaveBeenCalled()
  })

  it('shows the API error message when a customized meal add fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new ApiError('Could not add "Breakfast".', 500))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    expect(await screen.findByText('Could not add "Breakfast".')).toBeInTheDocument()
  })

  it('shows a generic error message when a customized meal add fails without an ApiError', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
    vi.mocked(endpoints.createEntry).mockRejectedValue(new Error('boom'))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Breakfast')
    await user.click(screen.getByRole('button', { name: 'Customize' }))
    await user.click(screen.getByRole('button', { name: 'Add meal' }))

    expect(await screen.findByText('Could not add "Breakfast".')).toBeInTheDocument()
  })

  it('closes the picker, resetting query and any in-progress custom forms', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')
    await user.type(screen.getByPlaceholderText(/Search everything/), 'nut')

    await user.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.getByRole('button', { name: 'Browse past foods' })).toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Search everything/)).not.toBeInTheDocument()

    // Reopening starts fresh with an empty query, not the one typed before closing.
    vi.mocked(endpoints.fetchHistoryFoods).mockClear()
    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await waitFor(() => expect(endpoints.fetchHistoryFoods).toHaveBeenCalledWith(''))
  })

  it('shows the API error message when loading history fails', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockRejectedValue(new ApiError('Boom.', 500))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    expect(await screen.findByText('Boom.')).toBeInTheDocument()
  })

  it('shows a generic error message when loading history fails without an ApiError', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockRejectedValue(new Error('network down'))
    renderPicker()

    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    expect(await screen.findByText('Could not load your history.')).toBeInTheDocument()
  })

  it('shows a "no matches" message for a query with no results', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
    renderPicker()
    await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    await screen.findByText('Nutella')

    vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([])
    await user.type(screen.getByPlaceholderText(/Search everything/), 'xyz')

    expect(await screen.findByText('Nothing in your history matches.')).toBeInTheDocument()
  })

  describe('states the tests above leave unpinned', () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((res, rej) => {
        resolve = res
        reject = rej
      })
      return { promise, resolve, reject }
    }

    // Logged in grams but carrying a count conversion - the gram amount must be used as-is, never
    // scaled by unit_to_grams.
    const eggsInGrams: HistoryFood = {
      ...bananaFood,
      name: 'Eggs',
      barcode: '6000',
      suggested_unit: 'g',
      unit_to_grams: 50,
      last_input_amount: 120,
    }

    async function open(user: ReturnType<typeof userEvent.setup>) {
      await user.click(screen.getByRole('button', { name: 'Browse past foods' }))
    }

    it('fetches nothing while closed, even after its timers could have run', async () => {
      renderPicker()
      await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
      expect(endpoints.fetchHistoryFoods).not.toHaveBeenCalled()
      expect(endpoints.fetchHistoryGroups).not.toHaveBeenCalled()
    })

    it('shows only a loader while history loads', async () => {
      const user = userEvent.setup()
      const foods = deferred<HistoryFood[]>()
      vi.mocked(endpoints.fetchHistoryFoods).mockReturnValue(foods.promise)
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
      const { container } = renderPicker()
      await open(user)

      expect(await screen.findByText('Loading…')).toBeInTheDocument()
      expect(screen.queryByText(/Nothing logged yet/)).not.toBeInTheDocument()
      expect(screen.queryByText('Past foods')).not.toBeInTheDocument()
      expect(screen.queryByText('Past meals')).not.toBeInTheDocument()
      expect(container.querySelector('.form__banner')).not.toBeInTheDocument()

      await act(async () => foods.resolve([nutella]))
      expect(screen.queryByText('Loading…')).not.toBeInTheDocument()
      expect(screen.getByText('Past foods')).toBeInTheDocument()
    })

    it('shows the empty state only when there are neither foods nor meals', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
      const { unmount } = renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      expect(screen.queryByText(/Nothing logged yet/)).not.toBeInTheDocument()
      expect(screen.queryByText('Past foods')).not.toBeInTheDocument()
      unmount()

      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([])
      vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
      renderPicker()
      await open(user)
      await screen.findByText('Nutella')
      expect(screen.queryByText(/Nothing logged yet/)).not.toBeInTheDocument()
      expect(screen.queryByText('Past meals')).not.toBeInTheDocument()
    })

    it('trims the query and only fetches once typing settles', async () => {
      const user = userEvent.setup()
      renderPicker()
      await open(user)
      await waitFor(() => expect(endpoints.fetchHistoryFoods).toHaveBeenCalledWith(''))
      vi.mocked(endpoints.fetchHistoryFoods).mockClear()
      vi.mocked(endpoints.fetchHistoryGroups).mockClear()

      await user.type(screen.getByPlaceholderText(/Search everything/), ' nut ')
      await waitFor(() => expect(endpoints.fetchHistoryFoods).toHaveBeenCalled(), { timeout: 1000 })
      expect(vi.mocked(endpoints.fetchHistoryFoods).mock.calls).toEqual([['nut']])
      expect(vi.mocked(endpoints.fetchHistoryGroups).mock.calls).toEqual([['nut']])
    })

    it('describes each past food, brand or not', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella, bananaFood])
      const { container } = renderPicker()
      await open(user)
      await screen.findByText('Nutella')
      const metas = [...container.querySelectorAll('.entry-row__meta')].map((meta) => meta.textContent)
      expect(metas).toEqual(['Ferrero · 539 kcal/100g · last had 45g', 'Unbranded · 89 kcal/100g · last had 2count'])
    })

    it('describes each past meal with an exact, pluralized summary', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast, soloSnack])
      const { container } = renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      const metas = [...container.querySelectorAll('.entry-row__meta')].map((meta) => meta.textContent)
      expect(metas).toEqual(['2 items · 500 kcal · logged 2×', '1 item · 187 kcal · logged 1×'])
    })

    it('quick-adds a gram-logged food by its gram amount, whatever its unit conversion', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([eggsInGrams])
      vi.mocked(endpoints.createEntry).mockResolvedValue({} as never)
      renderPicker()
      await open(user)
      await screen.findByText('Eggs')
      await user.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() =>
        expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 120, input_amount: 120 }))
      )
    })

    it('custom-adds a gram-logged food by its gram amount too', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([eggsInGrams])
      vi.mocked(endpoints.createEntry).mockResolvedValue({} as never)
      renderPicker()
      await open(user)
      await screen.findByText('Eggs')
      await user.click(screen.getByRole('button', { name: 'Custom amount' }))
      fireEvent.change(screen.getByLabelText('Amount (grams)'), { target: { value: '30' } })
      await user.click(screen.getByRole('button', { name: 'Add' }))
      await waitFor(() =>
        expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 30, input_amount: 30 }))
      )
    })

    it('marks a food as busy while it is quick-added', async () => {
      const user = userEvent.setup()
      const add = deferred<never>()
      vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella, bananaFood])
      vi.mocked(endpoints.createEntry).mockReturnValue(add.promise)
      renderPicker()
      await open(user)
      await screen.findByText('Nutella')
      const [nutellaAdd, bananaAdd] = screen.getAllByRole('button', { name: 'Add' })
      await user.click(nutellaAdd)

      expect(nutellaAdd).toBeDisabled()
      expect(nutellaAdd.querySelector('.btn__spinner')).toBeInTheDocument()
      expect(bananaAdd).toBeEnabled()
      await act(async () => add.reject(new Error('x')))
      expect(nutellaAdd).toBeEnabled()
    })

    it.each([
      ['0007', '7'],
      ['100', '100'],
      ['0.5', '0.5'],
    ])('shows a custom amount entered as %s as %s', async (entered, shown) => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
      renderPicker()
      await open(user)
      await screen.findByText('Nutella')
      await user.click(screen.getByRole('button', { name: 'Custom amount' }))
      const amount = screen.getByLabelText('Amount (grams)')
      fireEvent.change(amount, { target: { value: entered } })
      expect(amount).toHaveDisplayValue(shown)
    })

    it('disables a custom add while it runs, shows no stray banner, and allows a retry', async () => {
      const user = userEvent.setup()
      const add = deferred<never>()
      vi.mocked(endpoints.fetchHistoryFoods).mockResolvedValue([nutella])
      vi.mocked(endpoints.createEntry).mockReturnValue(add.promise)
      const { container } = renderPicker()
      await open(user)
      await screen.findByText('Nutella')
      await user.click(screen.getByRole('button', { name: 'Custom amount' }))
      expect(container.querySelector('.form__banner')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Add' }))

      const addButton = screen.getByRole('button', { name: 'Add' })
      expect(addButton).toBeDisabled()
      expect(addButton.querySelector('.btn__spinner')).toBeInTheDocument()
      await act(async () => add.reject(new ApiError('Nope', 500)))
      expect(addButton).toBeEnabled()
      expect(addButton.querySelector('.btn__spinner')).not.toBeInTheDocument()
    })

    it('sends each item of a past meal with all of its details', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
      vi.mocked(endpoints.createEntry).mockResolvedValue({ id: 'e' } as never)
      vi.mocked(endpoints.createMealGroup).mockResolvedValue({} as never)
      renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      await user.click(screen.getByRole('button', { name: 'Add meal' }))

      await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalledTimes(2))
      const { grams, input_amount, ...details } = breakfast.items[0]
      expect(endpoints.createEntry).toHaveBeenNthCalledWith(1, {
        ...details,
        grams,
        input_amount,
        consumed_at: '2026-08-06T12:00:00',
      })
    })

    it('marks a past meal as busy while it is added', async () => {
      const user = userEvent.setup()
      const add = deferred<never>()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast, soloSnack])
      vi.mocked(endpoints.createEntry).mockReturnValue(add.promise)
      renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      const [breakfastAdd, snackAdd] = screen.getAllByRole('button', { name: 'Add meal' })
      await user.click(breakfastAdd)

      expect(breakfastAdd).toBeDisabled()
      expect(breakfastAdd.querySelector('.btn__spinner')).toBeInTheDocument()
      expect(snackAdd).toBeEnabled()
      await act(async () => add.reject(new Error('x')))
      expect(breakfastAdd).toBeEnabled()
    })

    it('labels each ingredient field with its brand when it has one, and focuses the first', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
      renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      await user.click(screen.getByRole('button', { name: 'Customize' }))

      const labels = [...document.querySelectorAll('label[for^="history-group-amount-"]')].map((l) => l.textContent)
      expect(labels).toEqual(['Nutella (Ferrero) · Amount (grams)', 'Banana · Amount (grams)'])
      expect(screen.getByLabelText(/Nutella/)).toHaveFocus()
    })

    it.each([
      ['0007', '7'],
      ['100', '100'],
      ['0.5', '0.5'],
    ])('shows an ingredient amount entered as %s as %s', async (entered, shown) => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
      renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      await user.click(screen.getByRole('button', { name: 'Customize' }))
      const banana = screen.getByLabelText(/Banana/)
      fireEvent.change(banana, { target: { value: entered } })
      expect(banana).toHaveDisplayValue(shown)
      expect(screen.getByLabelText(/Nutella/)).toHaveDisplayValue('30')
    })

    it('only enables adding a customized meal when every ingredient has an amount above zero', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
      renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      await user.click(screen.getByRole('button', { name: 'Customize' }))
      const add = screen.getByRole('button', { name: 'Add meal' })
      expect(add).toBeEnabled()

      fireEvent.change(screen.getByLabelText(/Banana/), { target: { value: '0' } })
      expect(add).toBeDisabled()
      fireEvent.change(screen.getByLabelText(/Banana/), { target: { value: '' } })
      expect(add).toBeDisabled()
    })

    it('customizes a gram-logged ingredient by its gram amount, whatever its unit conversion', async () => {
      const user = userEvent.setup()
      const eggsMeal: HistoryGroup = {
        ...soloSnack,
        name: 'Eggs',
        items: [{ ...soloSnack.items[0], input_unit: 'g', unit_to_grams: 50 }],
      }
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([eggsMeal])
      vi.mocked(endpoints.createEntry).mockResolvedValue({ id: 'e' } as never)
      vi.mocked(endpoints.createMealGroup).mockResolvedValue({} as never)
      renderPicker()
      await open(user)
      await screen.findByText('Eggs')
      await user.click(screen.getByRole('button', { name: 'Customize' }))
      fireEvent.change(screen.getByLabelText(/Banana/), { target: { value: '30' } })
      await user.click(screen.getByRole('button', { name: 'Add meal' }))
      await waitFor(() =>
        expect(endpoints.createEntry).toHaveBeenCalledWith(expect.objectContaining({ grams: 30, input_amount: 30 }))
      )
    })

    it('disables a customized meal add while it runs, with no stray banner, and allows a retry', async () => {
      const user = userEvent.setup()
      const add = deferred<never>()
      vi.mocked(endpoints.fetchHistoryGroups).mockResolvedValue([breakfast])
      vi.mocked(endpoints.createEntry).mockReturnValue(add.promise)
      const { container } = renderPicker()
      await open(user)
      await screen.findByText('Breakfast')
      await user.click(screen.getByRole('button', { name: 'Customize' }))
      expect(container.querySelector('.form__banner')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Add meal' }))

      const addButton = screen.getByRole('button', { name: 'Add meal' })
      expect(addButton).toBeDisabled()
      expect(addButton.querySelector('.btn__spinner')).toBeInTheDocument()
      await act(async () => add.reject(new ApiError('Nope', 500)))
      expect(addButton).toBeEnabled()
      expect(addButton.querySelector('.btn__spinner')).not.toBeInTheDocument()
    })
  })
})
