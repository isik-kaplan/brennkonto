import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
