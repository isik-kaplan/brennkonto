import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import App from '../src/App'
import type { User } from '../src/api/types'
import { useAuth } from '../src/hooks/useAuth'

vi.mock('../src/hooks/useAuth')
vi.mock('../src/pages/Login', () => ({ default: () => <div>Login page</div> }))
vi.mock('../src/pages/Register', () => ({ default: () => <div>Register page</div> }))
vi.mock('../src/pages/Dashboard', () => ({ default: () => <div>Dashboard page</div> }))
vi.mock('../src/pages/LogFood', () => ({ default: () => <div>Log food page</div> }))
vi.mock('../src/pages/History', () => ({ default: () => <div>History page</div> }))
vi.mock('../src/pages/Trends', () => ({ default: () => <div>Trends page</div> }))
vi.mock('../src/pages/Settings', () => ({ default: () => <div>Settings page</div> }))

const user: User = {
  id: 1,
  email: 'demo@brennkonto.local',
  display_name: 'Demo',
  daily_calorie_goal: 2000,
  daily_protein_goal_g: 150,
  daily_carbs_goal_g: 200,
  daily_fat_goal_g: 65,
}

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
    ...overrides,
  })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>
  )
}

describe('App routing', () => {
  it('shows a loader on a protected route while auth is loading', () => {
    mockAuth({ isLoading: true })
    renderAt('/')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('shows a loader on a guest route while auth is loading', () => {
    mockAuth({ isLoading: true })
    renderAt('/login')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
  })

  it('redirects an unauthenticated user away from a protected route to /login', () => {
    mockAuth({ user: null })
    renderAt('/log')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it('renders a guest route for an unauthenticated user', () => {
    mockAuth({ user: null })
    renderAt('/register')
    expect(screen.getByText('Register page')).toBeInTheDocument()
  })

  it('renders a protected route for an authenticated user', () => {
    mockAuth({ user })
    renderAt('/trends')
    expect(screen.getByText('Trends page')).toBeInTheDocument()
  })

  it('redirects an authenticated user away from a guest route to /', () => {
    mockAuth({ user })
    renderAt('/login')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('redirects an unknown path to /', () => {
    mockAuth({ user })
    renderAt('/does-not-exist')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })
})
