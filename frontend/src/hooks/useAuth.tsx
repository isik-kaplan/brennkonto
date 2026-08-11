import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

import { ApiError, NetworkError } from '../api/client'
import * as endpoints from '../api/endpoints'
import type { User } from '../api/types'

interface AuthContextValue {
  user: User | null
  isLoading: boolean
  // True only when the initial auth check couldn't reach the server at all (NetworkError) - a
  // normal 401 (not logged in) is not "offline", it's just "logged out", and still routes to
  // /login as usual.
  isOffline: boolean
  retryConnection: () => void
  login: (identifier: string, password: string) => Promise<void>
  register: (email: string, password: string, displayName: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: User) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOffline, setIsOffline] = useState(false)

  const checkAuth = useCallback(() => {
    setIsLoading(true)
    setIsOffline(false)
    endpoints
      .fetchCurrentUser()
      .then(setUser)
      .catch((error) => {
        if (error instanceof NetworkError) {
          setIsOffline(true)
          return
        }
        if (!(error instanceof ApiError && error.status === 401)) {
          console.error(error)
        }
      })
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const login = useCallback(async (identifier: string, password: string) => {
    setUser(await endpoints.login(identifier, password))
  }, [])

  const register = useCallback(async (email: string, password: string, displayName: string) => {
    setUser(await endpoints.register(email, password, displayName))
  }, [])

  const logout = useCallback(async () => {
    await endpoints.logout()
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isOffline, retryConnection: checkAuth, login, register, logout, setUser }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
