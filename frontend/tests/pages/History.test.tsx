import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { DailyStats, FoodEntry, MealGroup, RangeStats } from '../../src/api/types'
import { addDays, toISODate } from '../../src/lib/dates'
import History from '../../src/pages/History'
import { dragEntryOnto, stubRects } from '../testUtils/dragAndDrop'

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

function makeRangeStats(overrides: Partial<RangeStats> = {}): RangeStats {
  return {
    points: [],
    average_calories: 0,
    average_protein_g: 0,
    average_carbs_g: 0,
    average_fat_g: 0,
    total_calories: 0,
    days_in_range: 14,
    days_logged: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(endpoints.fetchDailyStats).mockReset()
  vi.mocked(endpoints.deleteEntry).mockReset()
  vi.mocked(endpoints.fetchMealGroups).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.fetchRangeStats).mockReset().mockResolvedValue(makeRangeStats())
  vi.mocked(endpoints.updateEntry).mockReset()
  vi.mocked(endpoints.fetchArchivedEntries).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.restoreEntry).mockReset()
  vi.mocked(endpoints.permanentlyDeleteEntry).mockReset()
  vi.mocked(endpoints.moveEntryToGroup).mockReset()
  vi.mocked(endpoints.updateMealGroup).mockReset()
  vi.mocked(endpoints.deleteMealGroup).mockReset()
  // AddEntryPanel renders collapsed on every History test - only exercised directly by its own
  // describe block below, but the fetch is wired here so opening it never hits a real endpoint.
  vi.mocked(endpoints.fetchFavorites).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.searchFoods).mockReset()
  vi.mocked(endpoints.lookupBarcode).mockReset()
  vi.mocked(endpoints.createEntry).mockReset()
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

    expect(endpoints.updateEntry).toHaveBeenCalledWith('1', 100, expect.any(String), 100)
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('renames a meal group', async () => {
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
    vi.mocked(endpoints.updateMealGroup).mockResolvedValue({ ...groups[0], name: 'Brunch' })
    renderHistory()

    await waitFor(() => expect(screen.getByText('Breakfast')).toBeInTheDocument())
    await user.click(screen.getByText('Breakfast'))
    const input = screen.getByDisplayValue('Breakfast')
    await user.clear(input)
    await user.type(input, 'Brunch{Enter}')

    expect(endpoints.updateMealGroup).toHaveBeenCalledWith('g1', { name: 'Brunch' })
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
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

  it('shows the trailing goal-fulfillment chart, fetched for the 14 days ending on the viewed date', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(
      makeRangeStats({
        points: [
          {
            period_label: 'x',
            period_start: yesterday,
            period_end: yesterday,
            calories: 1000,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            days_logged: 1,
            calorie_goal: 2000,
            protein_goal_g: 150,
            carbs_goal_g: 200,
            fat_goal_g: 65,
          },
          {
            period_label: 'x',
            period_start: today,
            period_end: today,
            calories: 2400,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            days_logged: 1,
            calorie_goal: 2000,
            protein_goal_g: 150,
            carbs_goal_g: 200,
            fat_goal_g: 65,
          },
        ],
        days_logged: 2,
        days_in_range: 14,
      })
    )
    renderHistory()

    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -13), today, 'day'))
    expect(await screen.findByText('Last 14 days')).toBeInTheDocument()
    // All 4 metrics (Calories/Protein/Carbs/Fat) are on by default, so each of the 2 days
    // renders one grouped bar per metric: 1000/2000 -> 50%, 2400/2000 -> 120% for calories, etc.
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(8)
  })

  it('guards against a zero goal when computing fulfillment percentage', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(
      makeRangeStats({
        points: [
          {
            period_label: 'x',
            period_start: today,
            period_end: today,
            calories: 500,
            protein_g: 0,
            carbs_g: 0,
            fat_g: 0,
            days_logged: 1,
            calorie_goal: 0,
            protein_goal_g: 0,
            carbs_goal_g: 0,
            fat_goal_g: 0,
          },
        ],
        days_logged: 1,
        days_in_range: 14,
      })
    )
    renderHistory()

    expect(await screen.findByText('Last 14 days')).toBeInTheDocument()
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(4)
  })

  it('toggles a metric off and on, hiding and restoring its bars', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(
      makeRangeStats({
        points: [
          {
            period_label: 'x',
            period_start: today,
            period_end: today,
            calories: 1000,
            protein_g: 75,
            carbs_g: 100,
            fat_g: 30,
            days_logged: 1,
            calorie_goal: 2000,
            protein_goal_g: 150,
            carbs_goal_g: 200,
            fat_goal_g: 65,
          },
        ],
        days_logged: 1,
        days_in_range: 14,
      })
    )
    renderHistory()
    await screen.findByText('Last 14 days')
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(4)

    const proteinToggle = screen.getByRole('button', { name: 'Protein' })
    expect(proteinToggle).toHaveAttribute('aria-pressed', 'true')

    await user.click(proteinToggle)
    expect(proteinToggle).toHaveAttribute('aria-pressed', 'false')
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(3)

    await user.click(proteinToggle)
    expect(document.querySelectorAll('.chart__bar')).toHaveLength(4)
  })

  it('shows a prompt instead of a chart when every metric is toggled off', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(
      makeRangeStats({
        points: [
          {
            period_label: 'x',
            period_start: today,
            period_end: today,
            calories: 1000,
            protein_g: 75,
            carbs_g: 100,
            fat_g: 30,
            days_logged: 1,
            calorie_goal: 2000,
            protein_goal_g: 150,
            carbs_goal_g: 200,
            fat_goal_g: 65,
          },
        ],
        days_logged: 1,
        days_in_range: 14,
      })
    )
    renderHistory()
    await screen.findByText('Last 14 days')

    for (const label of ['Calories', 'Protein', 'Carbs', 'Fat']) {
      await user.click(screen.getByRole('button', { name: label }))
    }

    expect(document.querySelectorAll('.chart__bar')).toHaveLength(0)
    expect(screen.getByText('Pick at least one metric above to see its bars.')).toBeInTheDocument()
  })

  it('labels each bar with its logged amount without changing the % of goal shown', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(
      makeRangeStats({
        points: [
          {
            period_label: 'x',
            period_start: today,
            period_end: today,
            calories: 1000,
            protein_g: 75,
            carbs_g: 100,
            fat_g: 30,
            days_logged: 1,
            calorie_goal: 2000,
            protein_goal_g: 150,
            carbs_goal_g: 200,
            fat_goal_g: 65,
          },
        ],
        days_logged: 1,
        days_in_range: 14,
      })
    )
    renderHistory()
    await screen.findByText('Last 14 days')
    expect(screen.getByText(/% of each metric's own daily goal met/)).toBeInTheDocument()
    expect(document.querySelectorAll('.chart__bar-amount')).toHaveLength(0)
    // The goal line is always drawn - bars are always scaled as % of goal.
    expect(document.querySelector('.chart__bar-goal')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show amounts' }))
    expect(screen.getByText(/The logged amount is labeled above each bar\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hide amounts' })).toBeInTheDocument()
    expect(document.querySelector('.chart__bar-goal')).toBeInTheDocument()
    // 1000/2000 kcal, 75/150g protein, 100/200g carbs, 30/65g fat - queried from the chart's own
    // labels, not the page at large, since the daily stat tiles above can coincidentally show the
    // same numbers (e.g. today's mocked protein_g is also 30).
    const amountLabels = Array.from(document.querySelectorAll('.chart__bar-amount')).map((el) => el.textContent)
    expect(amountLabels).toEqual(['1000 kcal', '75g', '100g', '30g'])

    await user.click(screen.getByRole('button', { name: 'Hide amounts' }))
    expect(document.querySelectorAll('.chart__bar-amount')).toHaveLength(0)
  })

  const createdEntry: FoodEntry = {
    id: '99',
    name: 'Nutella',
    brand: 'Ferrero',
    barcode: '1',
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
    consumed_at: `${today}T08:00:00`,
    created_at: `${today}T08:00:00Z`,
    updated_at: null,
    meal_group_id: null,
    deleted_at: null,
  }

  describe('AddEntryPanel integration', () => {
    beforeEach(() => {
      vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, []))
    })

    it('reloads the day after adding an entry through the panel', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.searchFoods).mockResolvedValue([
        {
          barcode: '1',
          name: 'Nutella',
          brand: 'Ferrero',
          calories_per_100g: 539,
          protein_per_100g: 6.3,
          carbs_per_100g: 57.5,
          fat_per_100g: 30.9,
          suggested_unit: 'g',
          unit_to_grams: 1,
        },
      ])
      vi.mocked(endpoints.createEntry).mockResolvedValue(createdEntry)
      renderHistory()
      await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(1))

      await user.click(screen.getByRole('button', { name: '+ Add entry' }))
      await user.type(screen.getByLabelText('Product name'), 'nutella')
      await user.click(await screen.findByText('Nutella'))
      const amountInput = screen.getByLabelText('Amount (grams)')
      await user.clear(amountInput)
      await user.type(amountInput, '50')
      await user.click(screen.getByRole('button', { name: 'Save entry' }))

      await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
      // Archive isn't shown, so adding an entry must not also reload it.
      expect(endpoints.fetchArchivedEntries).not.toHaveBeenCalled()
    })

    it('also reloads the archive if it is currently shown', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchArchivedEntries).mockResolvedValue([])
      vi.mocked(endpoints.fetchFavorites).mockResolvedValue([
        {
          id: 'f1',
          barcode: '1',
          name: 'Nutella',
          brand: 'Ferrero',
          calories_per_100g: 539,
          protein_per_100g: 6.3,
          carbs_per_100g: 57.5,
          fat_per_100g: 30.9,
          default_input_unit: 'g',
          default_input_amount: 15,
          default_unit_to_grams: 1,
        },
      ])
      vi.mocked(endpoints.createEntry).mockResolvedValue(createdEntry)
      renderHistory()
      await waitFor(() => expect(screen.getByText('Nothing logged yet today.')).toBeInTheDocument())

      await user.click(screen.getByRole('button', { name: 'Show removed' }))
      await waitFor(() => expect(endpoints.fetchArchivedEntries).toHaveBeenCalledTimes(1))

      await user.click(screen.getByRole('button', { name: '+ Add entry' }))
      await user.click(await screen.findByRole('button', { name: 'Add' }))

      await waitFor(() => expect(endpoints.fetchArchivedEntries).toHaveBeenCalledTimes(2))
    })
  })

  describe('repeating an entry for today', () => {
    const nutellaEntry: FoodEntry = {
      id: '5',
      name: 'Nutella',
      brand: 'Ferrero',
      barcode: '1',
      grams: 30,
      input_unit: 'g',
      input_amount: 30,
      unit_to_grams: 1,
      calories_per_100g: 539,
      protein_per_100g: 6.3,
      carbs_per_100g: 57.5,
      fat_per_100g: 30.9,
      calories: 161.7,
      protein_g: 1.89,
      carbs_g: 17.25,
      fat_g: 9.27,
      consumed_at: `${yesterday}T08:00:00`,
      created_at: `${yesterday}T08:00:00Z`,
      updated_at: null,
      meal_group_id: null,
      deleted_at: null,
    }

    it('reloads today after repeating an entry while already viewing today', async () => {
      const user = userEvent.setup()
      const todaysEntry = { ...nutellaEntry, consumed_at: `${today}T08:00:00` }
      vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [todaysEntry]))
      vi.mocked(endpoints.createEntry).mockResolvedValue(createdEntry)
      renderHistory()

      await waitFor(() => expect(screen.getByText('Nutella')).toBeInTheDocument())
      await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(1))
      await user.click(screen.getByRole('button', { name: 'Repeat Nutella today' }))

      await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalled())
      await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
    })

    it('does not reload the viewed day after repeating an entry from a past day', async () => {
      const user = userEvent.setup()
      vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(yesterday, [nutellaEntry]))
      vi.mocked(endpoints.createEntry).mockResolvedValue(createdEntry)
      renderHistory()
      await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledWith(today))

      const dateInput = screen.getByLabelText('Date') as HTMLInputElement
      fireEvent.change(dateInput, { target: { value: yesterday } })
      await waitFor(() => expect(screen.getByText('Nutella')).toBeInTheDocument())
      await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))

      await user.click(screen.getByRole('button', { name: 'Repeat Nutella today' }))

      await waitFor(() => expect(endpoints.createEntry).toHaveBeenCalled())
      const [payload] = vi.mocked(endpoints.createEntry).mock.calls[0]
      expect(payload.consumed_at).toMatch(new RegExp(`^${today}T\\d{2}:\\d{2}:00$`))
      // Still viewing yesterday - a repeat always lands on today, which isn't on screen here, so
      // there's nothing for this view to refresh.
      expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2)
    })
  })

  // Runs last in this file - @dnd-kit defers some of its internal document-listener cleanup by
  // 50ms after a drag ends, which has been observed to bleed into whichever test runs right
  // after a drag simulation.
  it('drags one entry onto another to merge them into a group', async () => {
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
      meal_group_id: 'g1',
      deleted_at: null,
    }
    const entryB = { ...entryA, id: '2', name: 'Toast', meal_group_id: 'g2' }
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(makeStats(today, [entryA, entryB]))
    vi.mocked(endpoints.moveEntryToGroup).mockResolvedValue(entryA)
    renderHistory()

    await waitFor(() => expect(screen.getByText('Toast')).toBeInTheDocument())
    const eggs = screen.getByText('Eggs').closest('li')!
    const toast = screen.getByText('Toast').closest('li')!
    stubRects(eggs, toast)
    dragEntryOnto(eggs, toast)

    expect(endpoints.moveEntryToGroup).toHaveBeenCalledWith('1', 'g2')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })
})
