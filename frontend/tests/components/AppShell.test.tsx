import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { User } from '../../src/api/types'
import AppShell from '../../src/components/AppShell'
import { useAuth } from '../../src/hooks/useAuth'

vi.mock('../../src/hooks/useAuth')

const user: User = {
  id: '1',
  email: 'demo@brennkonto.local',
  username: null,
  display_name: 'Demo User',
  daily_calorie_goal: 2000,
  daily_protein_goal_g: 150,
  daily_carbs_goal_g: 200,
  daily_fat_goal_g: 65,
  updated_at: null,
}

function renderShell(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<div>Today page</div>} />
          <Route path="/log" element={<div>Log page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('AppShell', () => {
  it('renders the brand, nav links, current user, and routed page content', () => {
    vi.mocked(useAuth).mockReturnValue({
      user,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    })
    renderShell('/')

    expect(screen.getAllByText('brennkonto').length).toBeGreaterThan(0)
    expect(screen.getByText('Demo User')).toBeInTheDocument()
    expect(screen.getByText('Today page')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Log food' }).length).toBe(2)
  })

  it('marks the current route active in both the floating nav and the tab bar', () => {
    vi.mocked(useAuth).mockReturnValue({
      user,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      setUser: vi.fn(),
    })
    renderShell('/log')

    const links = screen.getAllByRole('link', { name: 'Log food' })
    for (const link of links) {
      expect(link).toHaveClass('is-active')
    }
    const todayLinks = screen.getAllByRole('link', { name: 'Today' })
    for (const link of todayLinks) {
      expect(link).not.toHaveClass('is-active')
    }
  })

  it('calls logout when a logout button is clicked', async () => {
    const logout = vi.fn()
    vi.mocked(useAuth).mockReturnValue({
      user,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout,
      setUser: vi.fn(),
    })
    const userEventInstance = userEvent.setup()
    renderShell('/')

    // there are two logout buttons - one in the desktop floating nav, one in the mobile topbar -
    // click both to cover each one's own onClick closure.
    for (const button of screen.getAllByRole('button', { name: 'Log out' })) {
      await userEventInstance.click(button)
    }
    expect(logout).toHaveBeenCalledTimes(2)
  })
})
