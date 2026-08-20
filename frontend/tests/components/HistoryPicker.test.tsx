import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  it('starts collapsed and does not load anything until opened', () => {
    renderPicker()
    expect(screen.getByRole('button', { name: 'Browse past foods' })).toBeInTheDocument()
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
  })
})
