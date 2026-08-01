import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import { useAuth } from '../../src/hooks/useAuth'
import Register from '../../src/pages/Register'

vi.mock('../../src/hooks/useAuth')

function renderRegister(register = vi.fn()) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isLoading: false,
    login: vi.fn(),
    register,
    logout: vi.fn(),
    setUser: vi.fn(),
  })
  render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<Register />} />
        <Route path="/" element={<div>Landed on dashboard</div>} />
      </Routes>
    </MemoryRouter>
  )
  return { register }
}

describe('Register', () => {
  it('submits name, email, and password and navigates home on success', async () => {
    const user = userEvent.setup()
    const { register } = renderRegister(vi.fn().mockResolvedValue(undefined))

    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace')
    await user.type(screen.getByLabelText('Email'), 'ada@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'correcthorsebattery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(register).toHaveBeenCalledWith('ada@brennkonto.local', 'correcthorsebattery', 'Ada Lovelace')
    await waitFor(() => expect(screen.getByText('Landed on dashboard')).toBeInTheDocument())
  })

  it('shows the server error message on failure', async () => {
    const user = userEvent.setup()
    renderRegister(vi.fn().mockRejectedValue(new ApiError('An account with this email already exists.', 403)))

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'correcthorsebattery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('An account with this email already exists.')).toBeInTheDocument()
  })

  it('shows a generic error message for a non-API failure', async () => {
    const user = userEvent.setup()
    renderRegister(vi.fn().mockRejectedValue(new Error('network down')))

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'correcthorsebattery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument()
  })

  it('links to the login page', () => {
    renderRegister()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })
})
