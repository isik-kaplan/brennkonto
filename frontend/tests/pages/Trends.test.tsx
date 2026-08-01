import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { RangeStats, User } from '../../src/api/types'
import { useAuth } from '../../src/hooks/useAuth'
import { addDays, toISODate } from '../../src/lib/dates'
import Trends from '../../src/pages/Trends'

vi.mock('../../src/api/endpoints')
vi.mock('../../src/hooks/useAuth')

const today = toISODate(new Date())

const user: User = {
  id: '1',
  email: 'demo@brennkonto.local',
  username: null,
  display_name: 'Demo',
  daily_calorie_goal: 2000,
  daily_protein_goal_g: 150,
  daily_carbs_goal_g: 200,
  daily_fat_goal_g: 65,
  updated_at: null,
}

function makeRangeStats(overrides: Partial<RangeStats> = {}): RangeStats {
  return {
    points: [
      {
        period_label: 'Sat 01 Aug',
        period_start: today,
        period_end: today,
        calories: 1800,
        protein_g: 140,
        carbs_g: 190,
        fat_g: 60,
        days_logged: 1,
      },
    ],
    average_calories: 1800,
    average_protein_g: 140,
    average_carbs_g: 190,
    average_fat_g: 60,
    total_calories: 1800,
    days_in_range: 7,
    days_logged: 1,
    ...overrides,
  }
}

function mockAuth(withUser: User | null = user) {
  vi.mocked(useAuth).mockReturnValue({
    user: withUser,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  })
}

beforeEach(() => {
  vi.mocked(endpoints.fetchRangeStats).mockReset()
  mockAuth()
})

describe('Trends', () => {
  it('loads the default 7-day/day-grouped range, its previous period, and renders averages', async () => {
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<Trends />)

    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -6), today, 'day'))
    // the previous 7-day period ends the day before the current one starts
    expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -13), addDays(today, -7), 'day')
    expect(screen.getByText('1800')).toBeInTheDocument()
    expect(screen.getByText('Logged 1 of 7 days in range. Dashed line marks your daily goal.')).toBeInTheDocument()
  })

  it('shows a positive delta against the previous period', async () => {
    vi.mocked(endpoints.fetchRangeStats)
      .mockResolvedValueOnce(makeRangeStats({ average_calories: 1900 }))
      .mockResolvedValueOnce(makeRangeStats({ average_calories: 1800, days_logged: 5 }))
    render(<Trends />)

    expect(await screen.findByText('+100 vs the previous period')).toBeInTheDocument()
  })

  it('shows a negative delta against the previous period', async () => {
    vi.mocked(endpoints.fetchRangeStats)
      .mockResolvedValueOnce(makeRangeStats({ average_calories: 1700 }))
      .mockResolvedValueOnce(makeRangeStats({ average_calories: 1800, days_logged: 5 }))
    render(<Trends />)

    expect(await screen.findByText('-100 vs the previous period')).toBeInTheDocument()
  })

  it('shows an unchanged delta against the previous period', async () => {
    vi.mocked(endpoints.fetchRangeStats)
      .mockResolvedValueOnce(makeRangeStats({ average_calories: 1800 }))
      .mockResolvedValueOnce(makeRangeStats({ average_calories: 1800, days_logged: 5 }))
    render(<Trends />)

    expect(await screen.findByText('Same as the previous period')).toBeInTheDocument()
  })

  it('hides the delta when the previous period has no logged days', async () => {
    vi.mocked(endpoints.fetchRangeStats)
      .mockResolvedValueOnce(makeRangeStats())
      .mockResolvedValueOnce(makeRangeStats({ days_logged: 0 }))
    render(<Trends />)

    await screen.findByText('1800')
    expect(screen.queryByText(/vs the previous period/)).not.toBeInTheDocument()
  })

  it('marks the chart sparse when few days are logged', async () => {
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats({ days_logged: 1, days_in_range: 7 }))
    render(<Trends />)
    await waitFor(() => expect(document.querySelector('.chart__placeholder')).toBeInTheDocument())
  })

  it('does not mark the chart sparse once enough days are logged', async () => {
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats({ days_logged: 7, days_in_range: 7 }))
    render(<Trends />)
    await screen.findByText('1800')
    expect(document.querySelector('.chart__placeholder')).not.toBeInTheDocument()
  })

  it('switching to the 90-day preset defaults grouping to week', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<Trends />)
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole('button', { name: '90d' }))
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -89), today, 'week'))
    expect(screen.getByRole('button', { name: '90d' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Week' })).toHaveClass('is-active')
  })

  it('switching group-by independently of the preset reloads with the new grouping', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<Trends />)
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole('button', { name: 'Month' }))
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -6), today, 'month'))
  })

  it('the custom preset reveals start/end inputs and reloads on change', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<Trends />)
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledTimes(2))

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText('Start date')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } })
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith('2026-01-01', today, 'day'))

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-15' } })
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith('2026-01-01', '2026-01-15', 'day'))
  })

  it('renders the by-period breakdown with singular and plural "day(s) logged"', async () => {
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(
      makeRangeStats({
        points: [
          {
            period_label: 'Week of Jul 27',
            period_start: '2026-07-27',
            period_end: '2026-08-02',
            calories: 1800,
            protein_g: 140,
            carbs_g: 190,
            fat_g: 60,
            days_logged: 1,
          },
          {
            period_label: 'Week of Aug 03',
            period_start: '2026-08-03',
            period_end: '2026-08-09',
            calories: 2000,
            protein_g: 150,
            carbs_g: 200,
            fat_g: 65,
            days_logged: 3,
          },
        ],
      })
    )
    render(<Trends />)

    expect(await screen.findByText(/1 day logged/)).toBeInTheDocument()
    expect(screen.getByText(/3 days logged/)).toBeInTheDocument()
  })

  it('passes no goal line when there is no authenticated user', async () => {
    mockAuth(null)
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<Trends />)

    await waitFor(() => expect(screen.getByText('1800')).toBeInTheDocument())
    expect(document.querySelector('.chart__bar-goal')).not.toBeInTheDocument()
  })
})
