import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { DailyStats, MealGroup } from '../../src/api/types'
import { toISODate } from '../../src/lib/dates'
import Dashboard from '../../src/pages/Dashboard'
import { dragEntryOnto, stubRects } from '../testUtils/dragAndDrop'

vi.mock('../../src/api/endpoints')

const today = toISODate(new Date())

const stats: DailyStats = {
  date: today,
  calories: 500,
  protein_g: 30,
  carbs_g: 40,
  fat_g: 10,
  calorie_goal: 2000,
  protein_goal_g: 150,
  carbs_goal_g: 200,
  fat_goal_g: 65,
  entries: [
    {
      id: '1',
      name: 'Banana',
      brand: null,
      barcode: null,
      grams: 120,
      input_unit: 'g',
      input_amount: 120,
      unit_to_grams: 1,
      calories_per_100g: 89,
      protein_per_100g: 1.1,
      carbs_per_100g: 22.8,
      fat_per_100g: 0.3,
      calories: 106.8,
      protein_g: 1.32,
      carbs_g: 27.36,
      fat_g: 0.36,
      consumed_at: `${today}T12:00:00`,
      created_at: `${today}T12:00:00Z`,
      updated_at: null,
      meal_group_id: 'g1',
      deleted_at: null,
    },
  ],
}

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.mocked(endpoints.fetchDailyStats).mockReset()
  vi.mocked(endpoints.deleteEntry).mockReset()
  vi.mocked(endpoints.fetchMealGroups).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.updateEntry).mockReset()
  vi.mocked(endpoints.moveEntryToGroup).mockReset()
  vi.mocked(endpoints.updateMealGroup).mockReset()
  vi.mocked(endpoints.deleteMealGroup).mockReset()
})

describe('Dashboard', () => {
  it('shows a loader, then the macro summary and logged entries', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(stats)
    renderDashboard()

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument())
    expect(screen.getByText('1500 left')).toBeInTheDocument()
    expect(endpoints.fetchDailyStats).toHaveBeenCalledWith(today)
  })

  it('shows the empty state when nothing is logged yet', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue({ ...stats, entries: [] })
    renderDashboard()
    await waitFor(() =>
      expect(screen.getByText('Nothing logged yet today - start with the button above.')).toBeInTheDocument()
    )
  })

  it('deletes an entry and reloads the day', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats)
      .mockResolvedValueOnce(stats)
      .mockResolvedValueOnce({ ...stats, entries: [] })
    vi.mocked(endpoints.deleteEntry).mockResolvedValue(undefined)
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Delete Banana' }))
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(endpoints.deleteEntry).toHaveBeenCalledWith('1')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('edits when an entry was logged and reloads', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(stats)
    vi.mocked(endpoints.updateEntry).mockResolvedValue(stats.entries[0])
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Edit when Banana was logged' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(endpoints.updateEntry).toHaveBeenCalledWith('1', 120, expect.any(String))
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('links to the log food page', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(stats)
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '+ Log food' })).toHaveAttribute('href', '/log')
  })

  it('renames a meal group', async () => {
    const user = userEvent.setup()
    const groupedStats: DailyStats = { ...stats, entries: [{ ...stats.entries[0], meal_group_id: 'g1' }] }
    const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1'] }]
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(groupedStats)
    vi.mocked(endpoints.fetchMealGroups).mockReset().mockResolvedValue(groups)
    vi.mocked(endpoints.updateMealGroup).mockResolvedValue({ ...groups[0], name: 'Brunch' })
    renderDashboard()

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
    const groupedStats: DailyStats = { ...stats, entries: [{ ...stats.entries[0], meal_group_id: 'g1' }] }
    const groups: MealGroup[] = [{ id: 'g1', name: 'Breakfast', entry_ids: ['1'] }]
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(groupedStats)
    vi.mocked(endpoints.fetchMealGroups).mockReset().mockResolvedValue(groups)
    vi.mocked(endpoints.deleteMealGroup).mockResolvedValue(undefined)
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Breakfast')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Ungroup' }))

    expect(endpoints.deleteMealGroup).toHaveBeenCalledWith('g1')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  // Runs last in this file - @dnd-kit defers some of its internal document-listener cleanup by
  // 50ms after a drag ends, which has been observed to bleed into whichever test runs right
  // after a drag simulation.
  it('drags one entry onto another to merge them into a group', async () => {
    const twoEntryStats: DailyStats = {
      ...stats,
      entries: [stats.entries[0], { ...stats.entries[0], id: '2', name: 'Toast', meal_group_id: 'g2' }],
    }
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(twoEntryStats)
    vi.mocked(endpoints.moveEntryToGroup).mockResolvedValue(twoEntryStats.entries[0])
    renderDashboard()

    await waitFor(() => expect(screen.getByText('Toast')).toBeInTheDocument())
    const banana = screen.getByText('Banana').closest('li')!
    const toast = screen.getByText('Toast').closest('li')!
    stubRects(banana, toast)
    dragEntryOnto(banana, toast)

    expect(endpoints.moveEntryToGroup).toHaveBeenCalledWith('1', 'g2')
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })
})
