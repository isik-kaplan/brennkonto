import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    const presets = within(screen.getByRole('group', { name: 'Summary range' })).getAllByRole('button')
    expect(presets.map((button) => button.textContent)).toEqual([
      'Last week',
      'Last 2 weeks',
      'Last month',
      'Last 6 months',
      'Custom',
    ])
    expect(screen.getByText('1800')).toBeInTheDocument()
    expect(screen.getByText('140g')).toBeInTheDocument()
    expect(screen.getByText('190g')).toBeInTheDocument()
    expect(screen.getByText('60g')).toBeInTheDocument()
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

    expect(screen.queryByLabelText('Start date')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Custom' })).not.toHaveClass('is-active')
    await user.click(screen.getByRole('button', { name: 'Custom' }))
    // The custom range opens on the preset it replaced, not blank.
    expect(screen.getByLabelText('Start date')).toHaveValue(addDays(today, -6))
    expect(screen.getByRole('button', { name: 'Custom' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Last week' })).not.toHaveClass('is-active')
    expect(screen.getByLabelText('Start date')).toBeInTheDocument()
    expect(screen.getByLabelText('End date')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } })
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith('2026-01-01', today, 'month'))

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-01-15' } })
    await waitFor(() => expect(endpoints.fetchRangeStats).toHaveBeenCalledWith('2026-01-01', '2026-01-15', 'day'))
  })

  it('swaps the averages for the loader while a new range loads', async () => {
    const user = userEvent.setup()
    let finish!: (stats: RangeStats) => void
    vi.mocked(endpoints.fetchRangeStats)
      .mockResolvedValueOnce(makeRangeStats())
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
    render(<RangeSummary defaultPreset="week" />)
    await screen.findByText('1800')

    await user.click(screen.getByRole('button', { name: 'Last month' }))
    expect(await screen.findByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('1800')).not.toBeInTheDocument()

    await act(async () => finish(makeRangeStats({ average_calories: 2100 })))
    expect(screen.getByText('2100')).toBeInTheDocument()
  })
})
