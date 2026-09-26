import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import App, { RequireAuth, RequireGuest } from '../src/App'
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
vi.mock('../src/pages/Meals', () => ({ default: () => <div>Meals page</div> }))

const user: User = {
  id: '1',
  email: 'demo@brennkonto.local',
  username: null,
  display_name: 'Demo',
  updated_at: null,
}

function mockAuth(overrides: Partial<ReturnType<typeof useAuth>>) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isLoading: false,
    isOffline: false,
    retryConnection: vi.fn(),
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

  it('shows a loader, not the page, on a protected route while auth reloads with a user already set', () => {
    mockAuth({ isLoading: true, user })
    renderAt('/trends')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Trends page')).not.toBeInTheDocument()
  })

  it('shows "Can\'t connect", not the page, on a protected route when offline with a user set', () => {
    mockAuth({ isOffline: true, user })
    renderAt('/trends')
    expect(screen.getByText("Can't connect")).toBeInTheDocument()
    expect(screen.queryByText('Trends page')).not.toBeInTheDocument()
  })

  it('shows a loader, not the page, on a guest route while auth reloads with a user set', () => {
    mockAuth({ isLoading: true, user })
    renderAt('/login')
    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByText('Dashboard page')).not.toBeInTheDocument()
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

  it('serves Meals at /meals', () => {
    mockAuth({ user })
    renderAt('/meals')
    expect(screen.getByText('Meals page')).toBeInTheDocument()
  })

  it('redirects the old /settings/meals path to /meals', () => {
    mockAuth({ user })
    renderAt('/settings/meals')
    expect(screen.getByText('Meals page')).toBeInTheDocument()
  })

  it('redirects an unknown path to /', () => {
    mockAuth({ user })
    renderAt('/does-not-exist')
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('shows "Can\'t connect" instead of redirecting a protected route when offline', () => {
    mockAuth({ isOffline: true })
    renderAt('/log')
    expect(screen.getByText("Can't connect")).toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()
  })

  it('shows "Can\'t connect" instead of a guest route when offline', () => {
    mockAuth({ isOffline: true })
    renderAt('/login')
    expect(screen.getByText("Can't connect")).toBeInTheDocument()
  })

  it('retries the auth check from the "Can\'t connect" screen', async () => {
    const userEventInstance = userEvent.setup()
    const retryConnection = vi.fn()
    mockAuth({ isOffline: true, retryConnection })
    renderAt('/')

    await userEventInstance.click(screen.getByRole('button', { name: 'Retry' }))
    expect(retryConnection).toHaveBeenCalled()
  })
})

// Each guard on its own, redirecting to a plain page - through App, a guard that always redirected
// would bounce between the two forever instead of failing.
describe('route guards in isolation', () => {
  function renderGuarded(guarded: 'auth' | 'guest') {
    const Guard = guarded === 'auth' ? RequireAuth : RequireGuest
    return render(
      <MemoryRouter initialEntries={['/guarded']}>
        <Routes>
          <Route
            path="/guarded"
            element={
              <Guard>
                <div>Guarded page</div>
              </Guard>
            }
          />
          <Route path="/login" element={<div>Login redirect</div>} />
          <Route path="/" element={<div>Home redirect</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('RequireAuth lets a signed-in user through', () => {
    mockAuth({ user })
    renderGuarded('auth')
    expect(screen.getByText('Guarded page')).toBeInTheDocument()
  })

  it('RequireAuth sends everyone else to /login', () => {
    mockAuth({ user: null })
    renderGuarded('auth')
    expect(screen.getByText('Login redirect')).toBeInTheDocument()
  })

  it('RequireGuest lets a signed-out visitor through', () => {
    mockAuth({ user: null })
    renderGuarded('guest')
    expect(screen.getByText('Guarded page')).toBeInTheDocument()
  })

  it('RequireGuest sends a signed-in user home', () => {
    mockAuth({ user })
    renderGuarded('guest')
    expect(screen.getByText('Home redirect')).toBeInTheDocument()
  })
})
