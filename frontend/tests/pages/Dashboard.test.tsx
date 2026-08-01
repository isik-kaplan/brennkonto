import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { DailyStats } from '../../src/api/types'
import { toISODate } from '../../src/lib/dates'
import Dashboard from '../../src/pages/Dashboard'

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
      id: 1,
      name: 'Banana',
      brand: null,
      barcode: null,
      grams: 120,
      calories_per_100g: 89,
      protein_per_100g: 1.1,
      carbs_per_100g: 22.8,
      fat_per_100g: 0.3,
      calories: 106.8,
      protein_g: 1.32,
      carbs_g: 27.36,
      fat_g: 0.36,
      consumed_at: today,
      created_at: `${today}T12:00:00Z`,
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

    expect(endpoints.deleteEntry).toHaveBeenCalledWith(1)
    await waitFor(() => expect(endpoints.fetchDailyStats).toHaveBeenCalledTimes(2))
  })

  it('links to the log food page', async () => {
    vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(stats)
    renderDashboard()
    await waitFor(() => expect(screen.getByText('Banana')).toBeInTheDocument())
    expect(screen.getByRole('link', { name: '+ Log food' })).toHaveAttribute('href', '/log')
  })
})
