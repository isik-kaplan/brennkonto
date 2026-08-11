import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { DailyStats, User } from '../../src/api/types'
import { useAuth } from '../../src/hooks/useAuth'
import { ThemeProvider } from '../../src/hooks/useTheme'
import Settings from '../../src/pages/Settings'

vi.mock('../../src/api/endpoints')
vi.mock('../../src/hooks/useAuth')

function renderSettings() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <Settings />
      </ThemeProvider>
    </MemoryRouter>
  )
}

const user: User = {
  id: '1',
  email: 'demo@brennkonto.local',
  username: null,
  display_name: 'Demo',
  updated_at: null,
}

function makeDailyStats(overrides: Partial<DailyStats> = {}): DailyStats {
  return {
    date: '2026-08-01',
    calories: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    calorie_goal: 2000,
    protein_goal_g: 150,
    carbs_goal_g: 200,
    fat_goal_g: 65,
    entries: [],
    ...overrides,
  }
}

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>> = {}) {
  const value = {
    user,
    isLoading: false,
    isOffline: false,
    retryConnection: vi.fn(),
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
  vi.mocked(endpoints.changePassword).mockReset()
  vi.mocked(endpoints.fetchDailyStats).mockReset().mockResolvedValue(makeDailyStats())
})

describe('Settings', () => {
  it('renders nothing when there is no authenticated user', () => {
    mockAuth({ user: null })
    const { container } = renderSettings()
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the signed-in email and logs out from the session card', async () => {
    const clickUser = userEvent.setup()
    const auth = mockAuth()
    renderSettings()

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
      renderSettings()

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
      renderSettings()

      await clickUser.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Name is required.')).toBeInTheDocument()
    })

    it('shows a generic error message for a non-API failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.updateProfile).mockRejectedValue(new Error('boom'))
      renderSettings()

      await clickUser.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByText('Could not save.')).toBeInTheDocument()
    })
  })

  describe('GoalsCard', () => {
    it("shows today's goal numbers, fetched via daily stats", async () => {
      mockAuth()
      vi.mocked(endpoints.fetchDailyStats).mockResolvedValue(
        makeDailyStats({ calorie_goal: 2200, protein_goal_g: 160, carbs_goal_g: 220, fat_goal_g: 70 })
      )
      renderSettings()

      expect(await screen.findByText('2200 kcal · P160 C220 F70')).toBeInTheDocument()
    })

    it('links to the dedicated goal-management page rather than editing inline', async () => {
      mockAuth()
      renderSettings()

      const link = await screen.findByRole('link', { name: 'Manage goals →' })
      expect(link).toHaveAttribute('href', '/settings/goals')
    })
  })

  describe('PasswordCard', () => {
    it('changes the password and resets the form on success', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.changePassword).mockResolvedValue(user)
      renderSettings()

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
      renderSettings()

      await clickUser.type(screen.getByLabelText('Current password'), 'wrong')
      await clickUser.type(screen.getByLabelText('New password'), 'new-password-123')
      await clickUser.click(screen.getByRole('button', { name: 'Change password' }))

      expect(await screen.findByText('Current password is incorrect.')).toBeInTheDocument()
    })

    it('shows a generic error message for a non-API failure', async () => {
      const clickUser = userEvent.setup()
      mockAuth()
      vi.mocked(endpoints.changePassword).mockRejectedValue(new Error('boom'))
      renderSettings()

      await clickUser.type(screen.getByLabelText('Current password'), 'wrong')
      await clickUser.type(screen.getByLabelText('New password'), 'new-password-123')
      await clickUser.click(screen.getByRole('button', { name: 'Change password' }))

      expect(await screen.findByText('Could not change password.')).toBeInTheDocument()
    })
  })
})
