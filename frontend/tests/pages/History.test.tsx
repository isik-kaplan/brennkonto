import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { DailyStats, MealGroup } from '../../src/api/types'
import { addDays, toISODate } from '../../src/lib/dates'
import History from '../../src/pages/History'

vi.mock('../../src/api/endpoints')

const today = toISODate(new Date())
const yesterday = addDays(today, -1)

function makeStats(date: string, entries: DailyStats['entries'] = []): DailyStats {
  return {
    date,
    calories: 500,
    protein_g: 30,
    carbs_g: 40,
    fat_g: 10,
    calorie_goal: 2000,
    protein_goal_g: 150,
    carbs_goal_g: 200,
    fat_goal_g: 65,
    entries,
  }
}

beforeEach(() => {
  vi.mocked(endpoints.fetchDailyStats).mockReset()
  vi.mocked(endpoints.deleteEntry).mockReset()
  vi.mocked(endpoints.fetchMealGroups).mockReset().mockResolvedValue([])
})

function renderHistory() {
  return render(
    <MemoryRouter>
      <History />
    </MemoryRouter>
  )
}

describe('History', () => {
  it('loads today by default with Next disabled', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today))
    renderHistory()

    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledWith(today))
    expect(screen.getByRole('button', { name: 'Next day' })).toBeDisabled()
  })

  it('shows the today-flavored empty message and a log-food link when nothing is logged', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    renderHistory()

    await waitFor(() => expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '+ Log food' })).toHaveAttribute('href', '/log')
  })

  it('going to a past day shows the past-flavored empty message with no log-food link', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    renderHistory()
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledWith(today))

    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(yesterday, []))
    await user.click(screen.getByRole('button', { name: 'Previous day' }))

    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledWith(yesterday))
    expect(screen.getByText('Nothing was logged on this day.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: '+ Log food' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next day' })).toBeEnabled()
  })

  it('Next moves forward a day', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(yesterday, []))
    renderHistory()
    // native date inputs don't respond well to userEvent.type() keystroke-by-keystroke in jsdom -
    // a direct change event is the standard way to drive them in tests.
    const dateInput = screen.getByLabelText('Date') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: yesterday } })
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledWith(yesterday))

    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    await user.click(screen.getByRole('button', { name: 'Next day' }))
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledWith(today))
  })

  it('deletes an entry and reloads the selected day', async () => {
    const user = userEvent.setup()
    const entry = {
      id: 9,
      name: 'Oatmeal',
      brand: null,
      barcode: null,
      grams: 80,
      input_unit: 'g',
      input_amount: 80,
      unit_to_grams: 1,
      calories_per_100g: 379,
      protein_per_100g: 13.2,
      carbs_per_100g: 67.7,
      fat_per_100g: 6.5,
      calories: 303.2,
      protein_g: 10.56,
      carbs_g: 54.16,
      fat_g: 5.2,
      consumed_at: today,
      created_at: `${today}T08:00:00Z`,
      meal_group_id: null,
    }
    vi.mocked(endpoints.fetchDailyStats)
      .mockResolvedValueOnce(makeStats(today, [entry]))
      .mockResolvedValueOnce(makeStats(today, []))
    vi.mocked(endpoints.deleteEntry).mockResolvedValue(undefined)
    renderHistory()

    await waitFor(() => expect(screen.getByText('Oatmeal')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Delete Oatmeal' }))

    expect(endpoints.deleteEntry).toHaveBeenCalledWith(9)
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('groups two selected entries into a named meal', async () => {
    const user = userEvent.setup()
    const entryA = {
      id: 1,
      name: 'Eggs',
      brand: null,
      barcode: null,
      grams: 100,
      input_unit: 'g',
      input_amount: 100,
      unit_to_grams: 1,
      calories_per_100g: 155,
      protein_per_100g: 13,
      carbs_per_100g: 1.1,
      fat_per_100g: 11,
      calories: 155,
      protein_g: 13,
      carbs_g: 1.1,
      fat_g: 11,
      consumed_at: today,
      created_at: `${today}T08:00:00Z`,
      meal_group_id: null,
    }
    const entryB = { ...entryA, id: 2, name: 'Toast' }
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entryA, entryB]))
    vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'g1', name: 'Breakfast', entry_ids: [1, 2] })
    renderHistory()

    await waitFor(() => expect(screen.getByText('Toast')).toBeInTheDocument())
    // click twice on one to exercise the deselect branch too, before settling on the final pick
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Toast' }))
    await user.type(screen.getByPlaceholderText('Meal name (optional)'), 'Breakfast')
    await user.click(screen.getByRole('button', { name: 'Group selected' }))

    expect(endpoints.createMealGroup).toHaveBeenCalledWith([1, 2], 'Breakfast')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('groups selected entries with no name typed', async () => {
    const user = userEvent.setup()
    const entryA = {
      id: 1,
      name: 'Eggs',
      brand: null,
      barcode: null,
      grams: 100,
      input_unit: 'g',
      input_amount: 100,
      unit_to_grams: 1,
      calories_per_100g: 155,
      protein_per_100g: 13,
      carbs_per_100g: 1.1,
      fat_per_100g: 11,
      calories: 155,
      protein_g: 13,
      carbs_g: 1.1,
      fat_g: 11,
      consumed_at: today,
      created_at: `${today}T08:00:00Z`,
      meal_group_id: null,
    }
    const entryB = { ...entryA, id: 2, name: 'Toast' }
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entryA, entryB]))
    vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'g1', name: null, entry_ids: [1, 2] })
    renderHistory()

    await waitFor(() => expect(screen.getByText('Toast')).toBeInTheDocument())
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Toast' }))
    await user.click(screen.getByRole('button', { name: 'Group selected' }))

    expect(endpoints.createMealGroup).toHaveBeenCalledWith([1, 2], null)
  })

  it('ungroups a meal', async () => {
    const user = userEvent.setup()
    const entry = {
      id: 1,
      name: 'Eggs',
      brand: null,
      barcode: null,
      grams: 100,
      input_unit: 'g',
      input_amount: 100,
      unit_to_grams: 1,
      calories_per_100g: 155,
      protein_per_100g: 13,
      carbs_per_100g: 1.1,
      fat_per_100g: 11,
      calories: 155,
      protein_g: 13,
      carbs_g: 1.1,
      fat_g: 11,
      consumed_at: today,
      created_at: `${today}T08:00:00Z`,
      meal_group_id: 'g1',
    }
    const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: [1] }]
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entry]))
    vi.mocked(endpoints.fetchMealGroups).mockReset().mockResolvedValue(groups)
    vi.mocked(endpoints.deleteMealGroup).mockResolvedValue(undefined)
    renderHistory()

    await waitFor(() => expect(screen.getByText('Breakfast')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Ungroup' }))

    expect(endpoints.deleteMealGroup).toHaveBeenCalledWith('g1')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })
})
