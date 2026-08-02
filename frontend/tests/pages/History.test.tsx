import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
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
  vi.mocked(endpoints.updateEntry).mockReset()
  vi.mocked(endpoints.fetchArchivedEntries).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.restoreEntry).mockReset()
  vi.mocked(endpoints.permanentlyDeleteEntry).mockReset()
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
      id: '9',
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
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    }
    vi.mocked(endpoints.fetchDailyStats)
      .mockResolvedValueOnce(makeStats(today, [entry]))
      .mockResolvedValueOnce(makeStats(today, []))
    vi.mocked(endpoints.deleteEntry).mockResolvedValue(undefined)
    renderHistory()

    await waitFor(() => expect(screen.getByText('Oatmeal')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Delete Oatmeal' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(endpoints.deleteEntry).toHaveBeenCalledWith('9')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('edits when an entry was logged and reloads', async () => {
    const user = userEvent.setup()
    const entry = {
      id: '1',
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
      consumed_at: `${today}T08:00:00`,
      created_at: `${today}T08:00:00Z`,
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    }
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entry]))
    vi.mocked(endpoints.updateEntry).mockResolvedValue(entry)
    renderHistory()

    await waitFor(() => expect(screen.getByText('Eggs')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Edit when Eggs was logged' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(endpoints.updateEntry).toHaveBeenCalledWith('1', 100, expect.any(String))
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('groups two selected entries into a named meal', async () => {
    const user = userEvent.setup()
    const entryA = {
      id: '1',
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
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    }
    const entryB = { ...entryA, id: '2', name: 'Toast' }
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entryA, entryB]))
    vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'g1', name: 'Breakfast', entry_ids: ['1', '2'] })
    renderHistory()

    await waitFor(() => expect(screen.getByText('Toast')).toBeInTheDocument())
    // click twice on one to exercise the deselect branch too, before settling on the final pick
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Toast' }))
    await user.type(screen.getByPlaceholderText('Meal name (optional)'), 'Breakfast')
    await user.click(screen.getByRole('button', { name: 'Group selected' }))

    expect(endpoints.createMealGroup).toHaveBeenCalledWith(['1', '2'], 'Breakfast')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('groups selected entries with no name typed', async () => {
    const user = userEvent.setup()
    const entryA = {
      id: '1',
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
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    }
    const entryB = { ...entryA, id: '2', name: 'Toast' }
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entryA, entryB]))
    vi.mocked(endpoints.createMealGroup).mockResolvedValue({ id: 'g1', name: null, entry_ids: ['1', '2'] })
    renderHistory()

    await waitFor(() => expect(screen.getByText('Toast')).toBeInTheDocument())
    await user.click(screen.getByRole('checkbox', { name: 'Select Eggs' }))
    await user.click(screen.getByRole('checkbox', { name: 'Select Toast' }))
    await user.click(screen.getByRole('button', { name: 'Group selected' }))

    expect(endpoints.createMealGroup).toHaveBeenCalledWith(['1', '2'], null)
  })

  it('ungroups a meal', async () => {
    const user = userEvent.setup()
    const entry = {
      id: '1',
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
      updated_at: null,
      meal_group_id: 'g1',
      deleted_at: null,
    }
    const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1'] }]
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entry]))
    vi.mocked(endpoints.fetchMealGroups).mockReset().mockResolvedValue(groups)
    vi.mocked(endpoints.deleteMealGroup).mockResolvedValue(undefined)
    renderHistory()

    await waitFor(() => expect(screen.getByText('Breakfast')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Ungroup' }))

    expect(endpoints.deleteMealGroup).toHaveBeenCalledWith('g1')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  function makeArchivedEntry(overrides: Partial<DailyStats['entries'][number]> = {}) {
    return {
      id: '3',
      name: 'Chips',
      brand: null,
      barcode: null,
      grams: 50,
      input_unit: 'g',
      input_amount: 50,
      unit_to_grams: 1,
      calories_per_100g: 500,
      protein_per_100g: 6,
      carbs_per_100g: 50,
      fat_per_100g: 30,
      calories: 250,
      protein_g: 3,
      carbs_g: 25,
      fat_g: 15,
      consumed_at: `${today}T08:00:00`,
      created_at: `${today}T08:00:00Z`,
      updated_at: null,
      meal_group_id: null,
      deleted_at: `${today}T09:00:00Z`,
      ...overrides,
    }
  }

  it('shows nothing-removed empty state when toggled with no archived entries', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    renderHistory()
    await waitFor(() => expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Show removed' }))
    expect(endpoints.fetchArchivedEntries).toHaveBeenCalledWith(today)
    await waitFor(() => expect(screen.getByText('Nothing removed on this day.')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Hide removed' }))
    expect(screen.queryByText('Nothing removed on this day.')).not.toBeInTheDocument()
  })

  it('lists archived entries and restores one', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchArchivedEntries).mockResolvedValue([makeArchivedEntry()])
    vi.mocked(endpoints.restoreEntry).mockResolvedValue(makeArchivedEntry({ deleted_at: null }))
    renderHistory()
    await waitFor(() => expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Show removed' }))
    await waitFor(() => expect(screen.getByText('Chips')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Restore' }))
    expect(endpoints.restoreEntry).toHaveBeenCalledWith('3')
    await waitFor(() => expect(endpoints.fetchArchivedEntries).toHaveBeenCalledTimes(2))
  })

  it('permanently deletes an archived entry after confirming', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchArchivedEntries).mockResolvedValue([makeArchivedEntry()])
    vi.mocked(endpoints.permanentlyDeleteEntry).mockResolvedValue(undefined)
    renderHistory()
    await waitFor(() => expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Show removed' }))
    await waitFor(() => expect(screen.getByText('Chips')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(screen.getByText('Permanently delete this entry?')).toBeInTheDocument()
    expect(endpoints.permanentlyDeleteEntry).not.toHaveBeenCalled()

    const dialog = screen.getByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Delete permanently' }))
    expect(endpoints.permanentlyDeleteEntry).toHaveBeenCalledWith('3')
    await waitFor(() => expect(endpoints.fetchArchivedEntries).toHaveBeenCalledTimes(2))
  })

  it('cancels the permanent-delete confirmation without deleting', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchArchivedEntries).mockResolvedValue([makeArchivedEntry()])
    renderHistory()
    await waitFor(() => expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Show removed' }))
    await waitFor(() => expect(screen.getByText('Chips')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(endpoints.permanentlyDeleteEntry).not.toHaveBeenCalled()
    expect(screen.queryByText('Permanently delete this entry?')).not.toBeInTheDocument()
  })

  it('reloads the archive after soft-deleting an entry while it is shown', async () => {
    const user = userEvent.setup()
    const entry = makeArchivedEntry({ id: '4', name: 'Oatmeal', deleted_at: null })
    vi.mocked(endpoints.fetchDailyStats)
      .mockResolvedValueOnce(makeStats(today, [entry]))
      .mockResolvedValueOnce(makeStats(today, []))
    vi.mocked(endpoints.deleteEntry).mockResolvedValue(undefined)
    renderHistory()
    await waitFor(() => expect(screen.getByText('Oatmeal')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: 'Show removed' }))
    await waitFor(() => expect(endpoints.fetchArchivedEntries).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Delete Oatmeal' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => expect(endpoints.fetchArchivedEntries).toHaveBeenCalledTimes(2))
  })
})
