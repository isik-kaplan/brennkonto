import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { MealName } from '../../src/api/types'
import Meals from '../../src/pages/Meals'

vi.mock('../../src/api/endpoints')

const breakfast: MealName = {
  name: 'Breakfast',
  times_logged: 3,
  last_logged_at: '2026-08-20T08:00:00Z',
  items: ['Nutella', 'Banana'],
}

function renderMeals() {
  return render(
    <MemoryRouter>
      <Meals />
    </MemoryRouter>
  )
}

beforeEach(() => {
  vi.mocked(endpoints.fetchMealNames).mockReset().mockResolvedValue([])
  vi.mocked(endpoints.renameMealName).mockReset()
  vi.mocked(endpoints.removeMealName).mockReset()
})

describe('Meals', () => {
  it('links back to Settings', async () => {
    renderMeals()
    const link = await screen.findByRole('link', { name: '← Back to Settings' })
    expect(link).toHaveAttribute('href', '/settings')
  })

  it('shows an empty state when there are no named meals yet', async () => {
    renderMeals()
    expect(await screen.findByText(/No named meals yet/)).toBeInTheDocument()
  })

  it('lists meals with their ingredients, times logged, and last-logged date', async () => {
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([breakfast])
    renderMeals()

    expect(await screen.findByText('Breakfast')).toBeInTheDocument()
    expect(screen.getByText(/Nutella, Banana/)).toBeInTheDocument()
    expect(screen.getByText(/logged 3×/)).toBeInTheDocument()
  })

  it('renames a meal', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames)
      .mockResolvedValueOnce([breakfast])
      .mockResolvedValueOnce([{ ...breakfast, name: 'Morning meal' }])
    vi.mocked(endpoints.renameMealName).mockResolvedValue(undefined)
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Rename Breakfast' }))
    const input = screen.getByLabelText('Meal name')
    await user.clear(input)
    await user.type(input, 'Morning meal')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(endpoints.renameMealName).toHaveBeenCalledWith('Breakfast', 'Morning meal')
    expect(await screen.findByText('Morning meal')).toBeInTheDocument()
  })

  it('removes a meal after confirming, without touching individual entries', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValueOnce([breakfast]).mockResolvedValueOnce([])
    vi.mocked(endpoints.removeMealName).mockResolvedValue(undefined)
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Remove Breakfast' }))
    expect(screen.getByText(/Nothing you've logged is deleted/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    expect(endpoints.removeMealName).toHaveBeenCalledWith('Breakfast')
    await waitFor(() => expect(screen.queryByText('Breakfast')).not.toBeInTheDocument())
  })

  it('cancels a remove without calling the API', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([breakfast])
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Remove Breakfast' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(endpoints.removeMealName).not.toHaveBeenCalled()
    expect(screen.getByText('Breakfast')).toBeInTheDocument()
  })

  it('shows the API error message on a failed rename', async () => {
    const user = userEvent.setup()
    vi.mocked(endpoints.fetchMealNames).mockResolvedValue([breakfast])
    vi.mocked(endpoints.renameMealName).mockRejectedValue(new ApiError('A meal needs a name.', 400))
    renderMeals()

    await user.click(await screen.findByRole('button', { name: 'Rename Breakfast' }))
    const input = screen.getByLabelText('Meal name')
    await user.clear(input)
    await user.type(input, 'Brekkie')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('A meal needs a name.')).toBeInTheDocument()
  })
})
