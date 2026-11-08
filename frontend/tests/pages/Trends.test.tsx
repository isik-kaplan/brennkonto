import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import * as endpoints from '../../src/api/endpoints'
import type { RangeStats, RangeStatsPoint } from '../../src/api/types'
import Trends from '../../src/pages/Trends'
import { LocationProbe, currentSearch } from '../testUtils/locationProbe'

vi.mock('../../src/api/endpoints')

// Saturday 7 November 2026, so the current week (from Monday 2 Nov) and month are both partial.
const TODAY = '2026-11-07'

function makePoint(overrides: Partial<RangeStatsPoint> = {}): RangeStatsPoint {
  return {
    period_label: '',
    period_start: TODAY,
    period_end: TODAY,
    calories: 1800,
    protein_g: 140,
    carbs_g: 190,
    fat_g: 60,
    days_logged: 1,
    calorie_goal: 2000,
    protein_goal_g: 150,
    carbs_goal_g: 200,
    fat_goal_g: 50,
    ...overrides,
  }
}

function makeRangeStats(overrides: Partial<RangeStats> = {}): RangeStats {
  return {
    points: [makePoint()],
    average_calories: 1800,
    average_protein_g: 140,
    average_carbs_g: 190,
    average_fat_g: 60,
    days_in_range: 7,
    days_logged: 1,
    ...overrides,
  }
}

const fetchMock = () => vi.mocked(endpoints.fetchRangeStats)
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const summary = () => document.querySelector('.trend-summary')!.textContent

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 10, 7, 12))
  fetchMock().mockReset()
  fetchMock().mockResolvedValue(makeRangeStats())
})

afterEach(() => {
  vi.useRealTimers()
})

function renderTrends(url = '/trends') {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Trends />
      <LocationProbe />
    </MemoryRouter>
  )
}

async function renderLoaded() {
  renderTrends()
  await screen.findByText('Average per logged day')
}

describe('Trends', () => {
  it('opens on the interval and count in the URL', async () => {
    renderTrends('/trends?interval=week&count=26')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-05-11', TODAY, 'week'))
    expect(screen.getByRole('button', { name: 'Weeks' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '26' })).toHaveClass('is-active')
    expect(screen.queryByLabelText('Number of weeks')).not.toBeInTheDocument()
  })

  it('opens Other for a count from the URL that is not a preset', async () => {
    renderTrends('/trends?interval=month&count=9')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-03-01', TODAY, 'month'))
    expect(screen.getByRole('button', { name: 'Other' })).toHaveClass('is-active')
    expect(screen.getByLabelText('Number of months')).toHaveValue(9)
  })

  it.each(['interval=fortnight', 'count=0', 'count=731', 'count=2.5'])(
    'falls back to the last 7 days for %s',
    async (query) => {
      renderTrends(`/trends?${query}`)
      await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-11-01', TODAY, 'day'))
      expect(screen.getByRole('button', { name: '7' })).toHaveClass('is-active')
    }
  )

  it('opens on the custom range and grouping in the URL', async () => {
    renderTrends('/trends?interval=custom&start=2026-01-01&end=2026-06-30&group=month')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-01-01', '2026-06-30', 'month'))
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-01-01')
    expect(screen.getByLabelText('End date')).toHaveValue('2026-06-30')
  })

  it.each([
    ['start=bogus&end=bogus', '2026-10-09', TODAY],
    ['start=2026-10-20&end=2026-10-10', '2026-09-11', '2026-10-10'],
    ['start=2026-10-10&end=2026-10-10', '2026-10-10', '2026-10-10'],
  ])('falls back to a sane custom range for %s', async (query, start, end) => {
    renderTrends(`/trends?interval=custom&${query}&group=nope`)
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith(start, end, 'day'))
  })

  it('writes the range to the URL, keeping only the chosen interval params', async () => {
    await renderLoaded()
    expect(currentSearch().toString()).toBe('')

    click('Weeks')
    click('26')
    expect(currentSearch().toString()).toBe('interval=week&count=26')

    click('Other')
    fireEvent.change(screen.getByLabelText('Number of weeks'), { target: { value: '9' } })
    expect(currentSearch().get('count')).toBe('9')

    click('Custom')
    expect(currentSearch().toString()).toBe('interval=custom')
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-01-01' } })
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-30' } })
    click('Months')
    expect(currentSearch().toString()).toBe('interval=month')
  })

  it('writes the custom grouping and dates to the URL', async () => {
    renderTrends('/trends?interval=custom&start=2026-01-01')
    await screen.findByLabelText('Start date')
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-30' } })
    expect(currentSearch().get('end')).toBe('2026-06-30')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-01-01', '2026-06-30', 'week'))
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '' } })
    expect(currentSearch().has('start')).toBe(false)
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '' } })
    expect(currentSearch().has('end')).toBe(false)
  })

  it('opens on the last 7 days, compared with the 7 before', async () => {
    await renderLoaded()
    expect(fetchMock()).toHaveBeenCalledWith('2026-11-01', TODAY, 'day')
    expect(fetchMock()).toHaveBeenCalledWith('2026-10-25', '2026-10-31', 'day')
    expect(screen.getByRole('button', { name: 'Days' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: 'Weeks' })).not.toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '7' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '30' })).not.toHaveClass('is-active')
    expect(screen.getByText('days', { exact: true })).toBeInTheDocument()
  })

  it('offers day counts and fetches the chosen one', async () => {
    await renderLoaded()
    click('365')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2025-11-08', TODAY, 'day'))
    expect(screen.getByRole('button', { name: '365' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '7' })).not.toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '90' })).toBeInTheDocument()
  })

  it('counts whole calendar weeks, comparing with the weeks before them', async () => {
    await renderLoaded()
    click('Weeks')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-08-17', TODAY, 'week'))
    expect(fetchMock()).toHaveBeenCalledWith('2026-05-25', '2026-08-16', 'week')
    expect(screen.getByRole('button', { name: '12' })).toHaveClass('is-active')
    expect(screen.getByRole('group', { name: 'How many weeks' })).toBeInTheDocument()
    expect(screen.getByText('weeks', { exact: true })).toBeInTheDocument()
    click('52')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2025-11-10', TODAY, 'week'))
    expect(screen.getByRole('button', { name: '4' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '26' })).toBeInTheDocument()
  })

  it('counts whole calendar months, comparing with the months before them', async () => {
    await renderLoaded()
    click('Months')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-06-01', TODAY, 'month'))
    expect(fetchMock()).toHaveBeenCalledWith('2025-12-01', '2026-05-31', 'month')
    expect(screen.getByRole('button', { name: '6' })).toHaveClass('is-active')
    for (const name of ['3', '12', '24']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
  })

  it('takes any count within the interval limit through Other', async () => {
    await renderLoaded()
    click('Months')
    await screen.findByText('Months', { selector: 'h2' })
    expect(screen.queryByLabelText('Number of months')).not.toBeInTheDocument()

    click('Other')
    expect(screen.getByRole('button', { name: 'Other' })).toHaveClass('is-active')
    expect(screen.getByRole('button', { name: '6' })).not.toHaveClass('is-active')
    const input = screen.getByLabelText('Number of months')
    expect(input).toHaveValue(6)
    expect(input).toHaveAttribute('max', '60')

    fireEvent.change(input, { target: { value: '9' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-03-01', TODAY, 'month'))
    fireEvent.change(input, { target: { value: '60' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2021-12-01', TODAY, 'month'))
    fireEvent.change(input, { target: { value: '1' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-11-01', TODAY, 'month'))

    fetchMock().mockClear()
    for (const value of ['0', '61', '2.5', '']) {
      fireEvent.change(input, { target: { value } })
      expect(input).toHaveValue(value === '' ? null : Number(value))
    }
    await act(async () => {})
    expect(fetchMock()).not.toHaveBeenCalled()

    click('12')
    expect(screen.queryByLabelText('Number of months')).not.toBeInTheDocument()
    click('Other')
    expect(screen.getByLabelText('Number of months')).toHaveValue(12)
  })

  it('resets the count to the new interval default when switching interval', async () => {
    await renderLoaded()
    click('Weeks')
    click('Other')
    fireEvent.change(screen.getByLabelText('Number of weeks'), { target: { value: '9' } })
    click('Days')
    expect(screen.getByRole('button', { name: '7' })).toHaveClass('is-active')
    expect(screen.queryByLabelText('Number of days')).not.toBeInTheDocument()
    click('Other')
    expect(screen.getByLabelText('Number of days')).toHaveValue(7)
    expect(screen.getByLabelText('Number of days')).toHaveAttribute('max', '730')
    click('Weeks')
    click('Other')
    expect(screen.getByLabelText('Number of weeks')).toHaveAttribute('max', '156')
  })

  it('uses a custom date range, compared with as many days before it', async () => {
    await renderLoaded()
    click('Custom')
    expect(screen.queryByRole('button', { name: 'Other' })).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-10-09', TODAY, 'day'))
    expect(fetchMock()).toHaveBeenCalledWith('2026-09-09', '2026-10-08', 'day')
    expect(screen.getByLabelText('Start date')).toHaveAttribute('max', TODAY)
    expect(screen.getByLabelText('End date')).toHaveAttribute('min', '2026-10-09')
    expect(screen.getByLabelText('End date')).toHaveAttribute('max', TODAY)

    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-10-31' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-10-09', '2026-10-31', 'day'))
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-20' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-10-20', '2026-10-31', 'day'))
    expect(fetchMock()).toHaveBeenCalledWith('2026-10-08', '2026-10-19', 'day')
  })

  it('counts whole calendar years, comparing with the years before them', async () => {
    await renderLoaded()
    click('Years')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2025-01-01', TODAY, 'year'))
    expect(fetchMock()).toHaveBeenCalledWith('2023-01-01', '2024-12-31', 'year')
    expect(screen.getByRole('button', { name: '2' })).toHaveClass('is-active')
    for (const name of ['3', '5']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Years' })).toBeInTheDocument()
    click('Other')
    expect(screen.getByLabelText('Number of years')).toHaveAttribute('max', '10')
  })

  it('offers a custom range every grouping, disabling the ones that would not draw a comparison', async () => {
    await renderLoaded()
    click('Custom')
    const groupBy = () => within(screen.getByRole('group', { name: 'Group by' }))
    const option = (name: string) => groupBy().getByRole('button', { name })
    await screen.findByRole('group', { name: 'Group by' })

    // 30 days, Oct 9 - Nov 7: two months, but all within one year.
    expect(option('Days')).toHaveClass('is-active')
    expect(option('Weeks')).not.toHaveClass('is-active')
    expect(option('Days')).toBeEnabled()
    expect(option('Weeks')).toBeEnabled()
    expect(option('Months')).toBeEnabled()
    expect(option('Years')).toBeDisabled()
    expect(option('Years')).toHaveAttribute('title', 'This range is too short to group by year')
    expect(option('Months')).not.toHaveAttribute('title')

    fireEvent.click(option('Months'))
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-10-09', TODAY, 'month'))
    expect(option('Months')).toHaveClass('is-active')

    // Into last year: years open up, and the picked grouping holds.
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2025-12-01' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2025-12-01', TODAY, 'month'))
    expect(option('Years')).toBeEnabled()
    fireEvent.click(option('Years'))
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2025-12-01', TODAY, 'year'))

    // Back inside one year, years no longer fit: the range's own default takes over.
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-11-01' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-11-01', TODAY, 'day'))
    expect(option('Months')).toBeDisabled()
    fireEvent.click(option('Days'))

    // Past 730 days, days would be hairlines: disabled, and the default is months.
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2024-11-07' } })
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2024-11-07', TODAY, 'month'))
    expect(option('Days')).toBeDisabled()
    expect(option('Days')).toHaveAttribute('title', 'This range is too long to group by day')
  })

  it('never offers the grouping switch outside a custom range', async () => {
    await renderLoaded()
    click('30')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-10-09', TODAY, 'day'))
    await screen.findByText('Average per logged day')
    expect(screen.queryByRole('group', { name: 'Group by' })).not.toBeInTheDocument()
  })

  it('summarises the range per logged day against the latest goals', async () => {
    fetchMock().mockResolvedValue(
      makeRangeStats({
        points: [
          makePoint({ period_start: '2026-11-05', calorie_goal: 2400 }),
          makePoint({ period_start: '2026-11-06', calorie_goal: 2500 }),
          makePoint({ calorie_goal: 2000 }),
        ],
        average_calories: 1800.4,
        average_protein_g: 75,
        average_carbs_g: 250,
        days_logged: 6,
        days_in_range: 7,
      })
    )
    await renderLoaded()
    expect(summary()).toContain('1800kcal')
    expect(summary()).toContain('Goal 2000')
    expect(summary()).toContain('Logged 6 of 7 days')
    expect(summary()).toContain('Protein75g / 150g')
    const fills = [...document.querySelectorAll<HTMLElement>('.macro-bar__fill')]
    expect(fills.map((fill) => fill.style.width)).toEqual(['50%', '100%', '100%'])
    expect(fills[0]).toHaveClass('macro-bar__fill--protein')
  })

  it('leaves goals out of the summary when nothing was logged', async () => {
    fetchMock().mockResolvedValue(
      makeRangeStats({ points: [], average_calories: 0, average_protein_g: 0, days_logged: 0 })
    )
    await renderLoaded()
    expect(summary()).not.toContain('Goal')
    expect(summary()).not.toContain('/')
    const fills = [...document.querySelectorAll<HTMLElement>('.macro-bar__fill')]
    expect(fills.map((fill) => fill.style.width)).toEqual(['0%', '0%', '0%'])
  })

  it.each([
    [1900, '+100 vs the previous period'],
    [1700, '-100 vs the previous period'],
    [1800, 'Same as the previous period'],
  ])('compares an average of %i with the previous period', async (current, text) => {
    fetchMock().mockImplementation(async (start) =>
      start === '2026-11-01' ? makeRangeStats({ average_calories: current }) : makeRangeStats({ days_logged: 1 })
    )
    await renderLoaded()
    expect(screen.getByText(text)).toBeInTheDocument()
  })

  it('skips the comparison when the previous period has nothing logged', async () => {
    fetchMock().mockImplementation(async (start) =>
      start === '2026-11-01' ? makeRangeStats() : makeRangeStats({ days_logged: 0 })
    )
    await renderLoaded()
    expect(document.querySelector('.stat-tile__delta')).not.toBeInTheDocument()
  })

  it('charts every day in the range, including the ones with nothing logged', async () => {
    await renderLoaded()
    expect(document.querySelectorAll('.trend-chart__col')).toHaveLength(7)
    expect(document.querySelectorAll('.trend-chart__bar')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Sat, Nov 7: 1800 kcal' })).toBeInTheDocument()
    // A list of days would repeat the chart, so it only appears for weeks and months.
    expect(screen.queryByRole('heading', { name: 'Days' })).not.toBeInTheDocument()
  })

  it('lists weeks newest first, per logged day, with gaps and singular days spelled out', async () => {
    fetchMock().mockResolvedValue(
      makeRangeStats({
        points: [
          makePoint({
            period_start: '2026-10-26',
            calories: 4000,
            protein_g: 300,
            carbs_g: 400,
            fat_g: 100,
            days_logged: 2,
          }),
        ],
      })
    )
    await renderLoaded()
    click('Custom')
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-10-18' } })
    fireEvent.click(
      within(await screen.findByRole('group', { name: 'Group by' })).getByRole('button', { name: 'Weeks' })
    )
    await screen.findByRole('heading', { name: 'Weeks' })
    const rows = [...document.querySelectorAll('.trend-periods__row')].map((row) => row.textContent)
    expect(rows).toEqual([
      'Nov 2 – Nov 70 of 6 days logged—',
      'Oct 26 – Nov 12 of 7 days logged · P 150g · C 200g · F 50g per day2000kcal / day',
      'Oct 19 – Oct 250 of 7 days logged—',
      'Oct 180 of 1 day logged—',
    ])
  })

  it('lists months under their own heading', async () => {
    await renderLoaded()
    click('Months')
    expect(await screen.findByRole('heading', { name: 'Months' })).toBeInTheDocument()
  })

  it('shows the loader until the current request answers, ignoring a slower earlier one', async () => {
    const pending: Record<string, (stats: RangeStats) => void> = {}
    fetchMock().mockImplementation(
      (start, _end, groupBy) => new Promise((resolve) => (pending[`${start}|${groupBy}`] = resolve))
    )
    renderTrends()
    expect(screen.getByText('Loading…')).toBeInTheDocument()

    click('Weeks')
    await act(async () => {
      pending['2026-08-17|week'](makeRangeStats({ average_calories: 1500 }))
      pending['2026-05-25|week'](makeRangeStats())
    })
    expect(await screen.findByText('1500')).toBeInTheDocument()

    await act(async () => {
      pending['2026-11-01|day'](makeRangeStats({ average_calories: 999 }))
      pending['2026-10-25|day'](makeRangeStats())
    })
    expect(screen.getByText('1500')).toBeInTheDocument()
    expect(screen.queryByText('999')).not.toBeInTheDocument()

    click('Days')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('resets the chart selection when the range changes', async () => {
    fetchMock().mockResolvedValue(makeRangeStats({ points: [makePoint({ period_start: '2026-11-01' }), makePoint()] }))
    await renderLoaded()
    fireEvent.click(screen.getByRole('button', { name: 'Sun, Nov 1: 1800 kcal' }))
    expect(screen.getByRole('button', { name: 'Sun, Nov 1: 1800 kcal' })).toHaveClass('is-active')
    click('30')
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledWith('2026-10-09', TODAY, 'day'))
    expect(await screen.findByRole('button', { name: 'Sat, Nov 7: 1800 kcal' })).toHaveClass('is-active')
  })
})
