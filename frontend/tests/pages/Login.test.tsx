import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ApiError, NetworkError } from '../../src/api/client'
import { useAuth } from '../../src/hooks/useAuth'
import Login from '../../src/pages/Login'

vi.mock('../../src/hooks/useAuth')

function renderLogin(login = vi.fn()) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isLoading: false,
    isOffline: false,
    retryConnection: vi.fn(),
    login,
    register: vi.fn(),
    logout: vi.fn(),
    setUser: vi.fn(),
  })
  render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<div>Landed on dashboard</div>} />
      </Routes>
    </MemoryRouter>
  )
  return { login }
}

describe('Login', () => {
  it('submits the entered email and password and navigates home on success', async () => {
    const user = userEvent.setup()
    const { login } = renderLogin(vi.fn().mockResolvedValue(undefined))

    await user.type(screen.getByLabelText('Email / Username'), 'demo@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'hunter22')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(login).toHaveBeenCalledWith('demo@brennkonto.local', 'hunter22')
    await waitFor(() => expect(screen.getByText('Landed on dashboard')).toBeInTheDocument())
  })

  it('shows the server error message on failure', async () => {
    const user = userEvent.setup()
    renderLogin(vi.fn().mockRejectedValue(new ApiError('Invalid email or password.', 401)))

    await user.type(screen.getByLabelText('Email / Username'), 'demo@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Invalid email or password.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API failure', async () => {
    const user = userEvent.setup()
    renderLogin(vi.fn().mockRejectedValue(new Error('network down')))

    await user.type(screen.getByLabelText('Email / Username'), 'demo@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
  })

  it('shows the "can\'t connect" message when the login request never reaches the server', async () => {
    const user = userEvent.setup()
    renderLogin(vi.fn().mockRejectedValue(new NetworkError()))

    await user.type(screen.getByLabelText('Email / Username'), 'demo@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Log in' }))

    expect(await screen.findByText("Can't connect. Check your connection and try again.")).toBeInTheDocument()
  })
})
