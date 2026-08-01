import type { ReactNode } from 'react'

import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../src/api/client'
import * as endpoints from '../../src/api/endpoints'
import type { User } from '../../src/api/types'
import { AuthProvider, useAuth } from '../../src/hooks/useAuth'

vi.mock('../../src/api/endpoints')

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

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}

beforeEach(() => {
  vi.mocked(endpoints.fetchCurrentUser).mockReset()
  vi.mocked(endpoints.login).mockReset()
  vi.mocked(endpoints.register).mockReset()
  vi.mocked(endpoints.logout).mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => useAuth())).toThrow('useAuth must be used within an AuthProvider')
    spy.mockRestore()
  })

  it('loads the current user on mount', async () => {
    vi.mocked(endpoints.fetchCurrentUser).mockResolvedValue(user)
    const { result } = renderHook(() => useAuth(), { wrapper })

    expect(result.current.isLoading).toBe(true)
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toEqual(user)
  })

  it('silently treats a 401 on mount as logged-out', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(endpoints.fetchCurrentUser).mockRejectedValue(new ApiError('Not authorized', 401))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it('logs unexpected errors on mount', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(endpoints.fetchCurrentUser).mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useAuth(), { wrapper })

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.user).toBeNull()
    expect(spy).toHaveBeenCalled()
  })

  it('login sets the user', async () => {
    vi.mocked(endpoints.fetchCurrentUser).mockRejectedValue(new ApiError('Not authorized', 401))
    vi.mocked(endpoints.login).mockResolvedValue(user)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.login('demo@brennkonto.local', 'password')
    })
    expect(endpoints.login).toHaveBeenCalledWith('demo@brennkonto.local', 'password')
    expect(result.current.user).toEqual(user)
  })

  it('register sets the user', async () => {
    vi.mocked(endpoints.fetchCurrentUser).mockRejectedValue(new ApiError('Not authorized', 401))
    vi.mocked(endpoints.register).mockResolvedValue(user)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      await result.current.register('demo@brennkonto.local', 'password', 'Demo')
    })
    expect(endpoints.register).toHaveBeenCalledWith('demo@brennkonto.local', 'password', 'Demo')
    expect(result.current.user).toEqual(user)
  })

  it('logout clears the user', async () => {
    vi.mocked(endpoints.fetchCurrentUser).mockResolvedValue(user)
    vi.mocked(endpoints.logout).mockResolvedValue(undefined)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).toEqual(user))

    await act(async () => {
      await result.current.logout()
    })
    expect(endpoints.logout).toHaveBeenCalled()
    expect(result.current.user).toBeNull()
  })

  it('setUser updates the user directly', async () => {
    vi.mocked(endpoints.fetchCurrentUser).mockResolvedValue(user)
    const { result } = renderHook(() => useAuth(), { wrapper })
    await waitFor(() => expect(result.current.user).toEqual(user))

    const updated = { ...user, display_name: 'Updated' }
    act(() => {
      result.current.setUser(updated)
    })
    expect(result.current.user).toEqual(updated)
  })
})
