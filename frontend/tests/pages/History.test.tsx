import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { DailyStats } from '../../src/api/types'
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
})
