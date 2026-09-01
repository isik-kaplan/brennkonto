import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { GoalVersion } from '../../src/api/types'
import { toISODate } from '../../src/lib/dates'
import GoalHistory from '../../src/pages/GoalHistory'

vi.mock('../../src/api/endpoints')

function renderGoalHistory() {
  return render(
    <MemoryRouter>
      <GoalHistory />
    </MemoryRouter>
  )
}

const today = toISODate(new Date())

function makeGoalVersion(overrides: Partial<GoalVersion> = {}): GoalVersion {
  return {
    id: 'g1',
    effective_date: today,
    end_date: null,
    daily_calorie_goal: 2000,
    daily_protein_goal_g: 150,
    daily_carbs_goal_g: 200,
    daily_fat_goal_g: 65,
    ...overrides,
  }
}

beforeEach(() => {
  vi.mocked(endpoints.fetchGoalVersions).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.upsertGoalVersion).mockReset()
  vi.mocked(endpoints.deleteGoalVersion).mockReset()
})

describe('GoalHistory', () => {
  it('links back to Settings', async () => {
    renderGoalHistory()
    const link = await screen.findByRole('link', { name: '← Back to Settings' })
    expect(link).toHaveAttribute('href', '/settings')
  })

  it('shows a hint about the default when the user has no versions yet', async () => {
    renderGoalHistory()

    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalled())
    expect(screen.getByText(/No goals set yet/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it("lists existing versions and marks today's as Active, not a future one", async () => {
    vi.mocked(endpoints.fetchGoalVersions).mockResolvedValue([
      makeGoalVersion({ id: 'past', effective_date: '2026-01-01', daily_calorie_goal: 1800 }),
      makeGoalVersion({ id: 'current', effective_date: today, daily_calorie_goal: 2000 }),
      makeGoalVersion({ id: 'future', effective_date: '2099-01-01', daily_calorie_goal: 2500 }),
    ])
    renderGoalHistory()

    // exactly one "Active" badge, and it's on today's version, not the scheduled future one.
    expect(await screen.findAllByText('Active')).toHaveLength(1)
    const activeRow = screen.getByText('Active').closest('li')!
    expect(activeRow).toHaveTextContent('2000 kcal')
  })

  it('shows each version as a start–end date range, and "ongoing" for the most recent one', async () => {
    vi.mocked(endpoints.fetchGoalVersions).mockResolvedValue([
      makeGoalVersion({ id: 'past', effective_date: '2026-01-01', end_date: '2026-01-31' }),
      makeGoalVersion({ id: 'current', effective_date: today, end_date: null }),
    ])
    renderGoalHistory()

    // the closed range shows both endpoints separated by an en dash...
    expect(await screen.findByText(/Jan.*–.*Jan/)).toBeInTheDocument()
    // ...while the open-ended (most recent) version says "ongoing" instead of a second date.
    expect(screen.getByText(/–\s*ongoing/)).toBeInTheDocument()
  })

  it('creates a new goal version starting from the chosen date', async () => {
    const clickUser = userEvent.setup()
    vi.mocked(endpoints.upsertGoalVersion).mockResolvedValue(makeGoalVersion())
    renderGoalHistory()
    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalled())

    // Changed twice - covers picking a date, then changing your mind before saving, not just
    // picking one and going straight to Save.
    fireEvent.change(screen.getByLabelText('Starting'), { target: { value: '2026-08-15' } })
    fireEvent.change(screen.getByLabelText('Starting'), { target: { value: '2026-09-01' } })
    const caloriesInput = screen.getByLabelText('Calories')
    await clickUser.clear(caloriesInput)
    await clickUser.type(caloriesInput, '2200')
    await clickUser.click(screen.getByRole('button', { name: 'Save goal' }))

    expect(endpoints.upsertGoalVersion).toHaveBeenCalledWith({
      effective_date: '2026-09-01',
      daily_calorie_goal: 2200,
      daily_protein_goal_g: 150,
      daily_carbs_goal_g: 200,
      daily_fat_goal_g: 65,
    })
    expect(await screen.findByText('Goal saved.')).toBeInTheDocument()
  })

  it('loads a version into the form for editing when its Edit button is clicked', async () => {
    const clickUser = userEvent.setup()
    vi.mocked(endpoints.fetchGoalVersions).mockResolvedValue([
      makeGoalVersion({ id: 'g1', effective_date: '2026-03-01', daily_calorie_goal: 1800 }),
    ])
    renderGoalHistory()

    await clickUser.click(await screen.findByRole('button', { name: 'Edit' }))

    expect(screen.getByLabelText('Starting')).toHaveValue('2026-03-01')
    expect(screen.getByLabelText('Calories')).toHaveValue(1800)
  })

  it('removes a version', async () => {
    const clickUser = userEvent.setup()
    vi.mocked(endpoints.fetchGoalVersions)
      .mockResolvedValueOnce([makeGoalVersion({ id: 'g1' })])
      .mockResolvedValueOnce([])
    renderGoalHistory()

    await clickUser.click(await screen.findByRole('button', { name: 'Remove' }))

    expect(endpoints.deleteGoalVersion).toHaveBeenCalledWith('g1')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument())
  })

  it('shows the API error message on failure', async () => {
    const clickUser = userEvent.setup()
    vi.mocked(endpoints.upsertGoalVersion).mockRejectedValue(new ApiError('Goals must be positive.', 400))
    renderGoalHistory()
    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalled())

    await clickUser.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByText('Goals must be positive.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API failure', async () => {
    const clickUser = userEvent.setup()
    vi.mocked(endpoints.upsertGoalVersion).mockRejectedValue(new Error('boom'))
    renderGoalHistory()
    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalled())

    await clickUser.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByText('Could not save.')).toBeInTheDocument()
  })
})
