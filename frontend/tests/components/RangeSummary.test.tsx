import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { RangeStats } from '../../src/api/types'
import RangeSummary from '../../src/components/RangeSummary'
import { addDays, toISODate } from '../../src/lib/dates'

vi.mock('../../src/api/endpoints')

const today = toISODate(new Date())

function makeRangeStats(overrides: Partial<RangeStats> = {}): RangeStats {
  return {
    points: [],
    average_calories: 1800,
    average_protein_g: 140,
    average_carbs_g: 190,
    average_fat_g: 60,
    total_calories: 12600,
    days_in_range: 7,
    days_logged: 5,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(endpoints.fetchRangeStats).mockReset()
})

describe('RangeSummary', () => {
  it('shows a loading state before the range resolves', async () => {
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<RangeSummary defaultPreset="week" />)

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('1800')).toBeInTheDocument())
  })

  it('loads the default preset, day-grouped, and renders the averages', async () => {
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<RangeSummary defaultPreset="week" />)

    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -6), today, 'day'))
    expect(screen.getByRole('button', { name: 'Last week' })).toHaveClass('is-active')
    expect(screen.getByText('1800')).toBeInTheDocument()
    expect(screen.getByText('140g')).toBeInTheDocument()
    expect(screen.getByText('190g')).toBeInTheDocument()
    expect(screen.getByText('60g')).toBeInTheDocument()
    expect(screen.getByText('12600')).toBeInTheDocument()
    expect(screen.getByText('5 / 7')).toBeInTheDocument()
  })

  it('opens on the Settings-configured default preset, not always "week"', async () => {
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<RangeSummary defaultPreset="6months" />)

    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -181), today, 'month'))
    expect(screen.getByRole('button', { name: 'Last 6 months' })).toHaveClass('is-active')
  })

  it('switching preset reloads with that range and grouping', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<RangeSummary defaultPreset="week" />)
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Last month' }))
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith(addDays(today, -29), today, 'day'))
    expect(screen.getByRole('button', { name: 'Last month' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Last week' })).not.toHaveClass('is-active')
  })

  it('the custom preset reveals start/end inputs and reloads on change', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchRangeStats).mockResolvedValue(makeRangeStats())
    render(<RangeSummary defaultPreset="week" />)
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledTimes(1))

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    expect(screen.getByLabelText('Start date')).toBeInTheDocument()
    expect(screen.getByLabelText('End date')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } })
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith('2026-01-01', today, 'month'))

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-15' } })
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith('2026-01-01', '2026-01-15', 'day'))
  })
})
