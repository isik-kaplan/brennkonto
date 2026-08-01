import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { User } from '../../src/api/types'
import { useAuth } from '../../src/hooks/useAuth'
import Settings from '../../src/pages/Settings'

vi.mock('../../src/api/endpoints')
vi.mock('../../src/hooks/useAuth')

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

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  const value = {
    user,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
    ...overrides,
  }
  vi.mocked(useAuth).mockReturnValue(value)
  return value
}

beforeEach(() => {
  vi.mocked(endpoints.updateProfile).mockReset()
  vi.mocked(endpoints.updateGoals).mockReset()
  vi.mocked(endpoints.changePassword).mockReset()
})

describe('Settings', () => {
  it('renders nothing when there is no authenticated user', () => {
    mockAuth({ user: null })
    const { container } = render(<Settings />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the signed-in email and logs out from the session card', async () => {
    const clickUser = userEvent.setup()
    const auth = mockAuth()
    render(<Settings />)

    expect(screen.getByText('Signed in as demo@brennkonto.local.')).toBeInTheDocument()
    await clickUser.click(screen.getByRole('button', { name: 'Log out' }))
    expect(auth.logout).toHaveBeenCalled()
  })

  describe('ProfileCard', () => {
    it('saves a new display name and calls onSaved', async () => {
      const clickUser = userEvent.setup()
      const auth = mockAuth()
      const updated = { ...user, display_name: 'New Name' }
      vi.mocked(endpoints.updateProfile).mockResolvedValue(updated)
      render(<Settings />)

      const nameInput = screen.getByLabelText('Name')
      await clickUser.clear(nameInput)
      await clickUser.type(nameInput, 'New Name')
      await clickUser.click(screen.getByRole('button', { name: 'Save' }))

      expect(endpoints.updateProfile).toHaveBeenCalledWith('New Name')
      expect(await screen.findByText('Saved.')).toBeInTheDocument()
      expect(auth.setUser).toHaveBeenCalledWith(updated)
    })

    it('shows the API error message on failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.updateProfile).mockRejectedValue(new ApiError('Name is required.', 400))
      render(<Settings />)

      await clickUser.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    })

    it('shows a generic error message for a non-API failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.updateProfile).mockRejectedValue(new Error('boom'))
      render(<Settings />)

      await clickUser.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Could not save.')).toBeInTheDocument()
    })
  })

  describe('GoalsCard', () => {
    it('saves updated goal numbers', async () => {
      const clickUser = userEvent.setup()
      const auth = mockAuth()
      const updated = { ...user, daily_calorie_goal: 2200 }
      vi.mocked(endpoints.updateGoals).mockResolvedValue(updated)
      render(<Settings />)

      const caloriesInput = screen.getByLabelText('Calories')
      await clickUser.clear(caloriesInput)
      await clickUser.type(caloriesInput, '2200')
      await clickUser.click(screen.getByRole('button', { name: 'Save goals' }))

      expect(endpoints.updateGoals).toHaveBeenCalledWith({
        daily_calorie_goal: 2200,
        daily_protein_goal_g: 150,
        daily_carbs_goal_g: 200,
        daily_fat_goal_g: 65,
      })
      expect(await screen.findByText('Goals updated.')).toBeInTheDocument()
      expect(auth.setUser).toHaveBeenCalledWith(updated)
    })

    it('shows the API error message on failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.updateGoals).mockRejectedValue(new ApiError('Goals must be positive.', 400))
      render(<Settings />)

      await clickUser.click(screen.getByRole('button', { name: 'Save goals' }))
      expect(await screen.findByText('Goals must be positive.')).toBeInTheDocument()
    })

    it('shows a generic error message for a non-API failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.updateGoals).mockRejectedValue(new Error('boom'))
      render(<Settings />)

      await clickUser.click(screen.getByRole('button', { name: 'Save goals' }))
      expect(await screen.findByText('Could not save.')).toBeInTheDocument()
    })
  })

  describe('PasswordCard', () => {
    it('changes the password and resets the form on success', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.changePassword).mockResolvedValue(user)
      render(<Settings />)

      const current = screen.getByLabelText('Current password') as HTMLInputElement
      const next = screen.getByLabelText('New password') as HTMLInputElement
      await clickUser.type(current, 'old-password')
      await clickUser.type(next, 'new-password-123')
      await clickUser.click(screen.getByRole('button', { name: 'Change password' }))

      expect(endpoints.changePassword).toHaveBeenCalledWith('old-password', 'new-password-123')
      expect(await screen.findByText('Password changed.')).toBeInTheDocument()
      expect(current.value).toBe('')
      expect(next.value).toBe('')
    })

    it('shows the API error message on failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.changePassword).mockRejectedValue(new ApiError('Current password is incorrect.', 401))
      render(<Settings />)

      await clickUser.type(screen.getByLabelText('Current password'), 'wrong')
      await clickUser.type(screen.getByLabelText('New password'), 'new-password-123')
      await clickUser.click(screen.getByRole('button', { name: 'Change password' }))

      expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    })

    it('shows a generic error message for a non-API failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.changePassword).mockRejectedValue(new Error('boom'))
      render(<Settings />)

      await clickUser.type(screen.getByLabelText('Current password'), 'wrong')
      await clickUser.type(screen.getByLabelText('New password'), 'new-password-123')
      await clickUser.click(screen.getByRole('button', { name: 'Change password' }))

      expect(await screen.findByText('Could not change password.')).toBeInTheDocument()
    })
  })
})
