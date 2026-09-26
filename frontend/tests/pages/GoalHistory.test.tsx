import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
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

  it('paints nothing about goals until they have loaded', () => {
    // A server render runs no effects - the first frame, before the load even starts.
    const html = renderToString(
      <MemoryRouter>
        <GoalHistory />
      </MemoryRouter>
    )
    expect(html).not.toContain('No goals set yet')
  })

  it('hides the list and the hint while reloading after a change', async () => {
    const clickUser = userEvent.setup()
    let finishReload!: (versions: GoalVersion[]) => void
    vi.mocked(endpoints.fetchGoalVersions)
      .mockResolvedValueOnce([makeGoalVersion({ id: 'g1' })])
      .mockReturnValueOnce(new Promise((resolve) => (finishReload = resolve)))
    vi.mocked(endpoints.deleteGoalVersion).mockResolvedValue(undefined)
    renderGoalHistory()

    await clickUser.click(await screen.findByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument()
    expect(screen.queryByText(/No goals set yet/)).not.toBeInTheDocument()

    await act(async () => finishReload([]))
    expect(screen.getByText(/No goals set yet/)).toBeInTheDocument()
    expect(document.querySelector('.entry-list')).not.toBeInTheDocument()
  })

  it('shows no hint alongside existing goals, and no Active badge when every goal is still in the future', async () => {
    vi.mocked(endpoints.fetchGoalVersions).mockResolvedValue([makeGoalVersion({ effective_date: '2999-01-01' })])
    renderGoalHistory()
    await screen.findByRole('button', { name: 'Remove' })
    expect(screen.queryByText(/No goals set yet/)).not.toBeInTheDocument()
    expect(screen.queryByText('Active')).not.toBeInTheDocument()
  })

  it('saves every macro goal from the form', async () => {
    const clickUser = userEvent.setup()
    vi.mocked(endpoints.upsertGoalVersion).mockResolvedValue(makeGoalVersion())
    renderGoalHistory()
    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalled())

    fireEvent.change(screen.getByLabelText('Protein (g)'), { target: { value: '160' } })
    fireEvent.change(screen.getByLabelText('Carbs (g)'), { target: { value: '210' } })
    fireEvent.change(screen.getByLabelText('Fat (g)'), { target: { value: '70' } })
    await clickUser.click(screen.getByRole('button', { name: 'Save goal' }))

    expect(endpoints.upsertGoalVersion).toHaveBeenCalledWith(
      expect.objectContaining({ daily_protein_goal_g: 160, daily_carbs_goal_g: 210, daily_fat_goal_g: 70 })
    )
  })

  it('styles a saved message as a success and a failure as an error', async () => {
    const clickUser = userEvent.setup()
    vi.mocked(endpoints.upsertGoalVersion)
      .mockResolvedValueOnce(makeGoalVersion())
      .mockRejectedValueOnce(new ApiError('Nope', 400))
    renderGoalHistory()
    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalled())

    await clickUser.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByText('Goal saved.')).toHaveClass('form__banner--success')
    await clickUser.click(screen.getByRole('button', { name: 'Save goal' }))
    expect(await screen.findByText('Nope')).not.toHaveClass('form__banner--success')
  })

  it('disables saving while it runs, and re-enables it after a failure', async () => {
    let fail!: (error: Error) => void
    vi.mocked(endpoints.upsertGoalVersion).mockReturnValue(new Promise((_, reject) => (fail = reject)))
    renderGoalHistory()
    await waitFor(() => expect(endpoints.fetchGoalVersions).toHaveBeenCalled())
    const button = screen.getByRole('button', { name: 'Save goal' })
    fireEvent.submit(button.closest('form')!)

    await waitFor(() => expect(button).toBeDisabled())
    expect(button.querySelector('.btn__spinner')).toBeInTheDocument()
    await act(async () => fail(new ApiError('Nope', 400)))
    expect(button).toBeEnabled()
    expect(button.querySelector('.btn__spinner')).not.toBeInTheDocument()
  })
})
