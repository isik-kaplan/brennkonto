import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { describe, expect, it, vi } from 'vitest'

import { ApiError, NetworkError } from '../../src/api/client'
import { useAuth } from '../../src/hooks/useAuth'
import Register from '../../src/pages/Register'

vi.mock('../../src/hooks/useAuth')

function renderRegister(register = vi.fn()) {
  vi.mocked(useAuth).mockReturnValue({
    user: null,
    isLoading: false,
    isOffline: false,
    retryConnection: vi.fn(),
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

  it('shows the "can\'t connect" message when the request never reaches the server', async () => {
    const user = userEvent.setup()
    renderRegister(vi.fn().mockRejectedValue(new NetworkError()))

    await user.type(screen.getByLabelText('Name'), 'Ada')
    await user.type(screen.getByLabelText('Email'), 'ada@brennkonto.local')
    await user.type(screen.getByLabelText('Password'), 'correcthorsebattery')
    await user.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText("Can't connect. Check your connection and try again.")).toBeInTheDocument()
  })

  it('links to the login page', () => {
    renderRegister()
    expect(screen.getByRole('link', { name: 'Log in' })).toHaveAttribute('href', '/login')
  })

  it('starts every field as an empty string', async () => {
    const action = vi.fn().mockResolvedValue(undefined)
    renderRegister(action)
    // The password alone - the other fields are still their initial empty strings, not undefined.
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter222' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Create account' }).closest('form')!)
    expect(action).toHaveBeenCalledWith('', 'hunter222', '')
    await screen.findByText('Landed on dashboard')
  })

  it('shows no error banner until something fails', () => {
    renderRegister()
    expect(document.querySelector('.form__banner')).not.toBeInTheDocument()
  })

  it('disables submitting while the request runs, and re-enables it after a failure', async () => {
    let fail!: (error: Error) => void
    renderRegister(vi.fn().mockReturnValue(new Promise((_, reject) => (fail = reject))))
    const button = screen.getByRole('button', { name: 'Create account' })
    fireEvent.submit(button.closest('form')!)

    await waitFor(() => expect(button).toBeDisabled())
    expect(button.querySelector('.btn__spinner')).toBeInTheDocument()
    await act(async () => fail(new ApiError('Nope', 400)))
    expect(button).toBeEnabled()
    expect(button.querySelector('.btn__spinner')).not.toBeInTheDocument()
  })
})
