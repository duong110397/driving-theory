import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError, hasCsrfToken, setUnauthorizedHandler } from '../api/client'
import { authApi, type Credentials, type Registration } from './api'
import { AuthContext, type AuthContextValue, type AuthState } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' })
  const [reloadKey, setReloadKey] = useState(0)

  // Resolve the current session on startup (and on manual reload).
  useEffect(() => {
    const controller = new AbortController()
    ;(async () => {
      try {
        await authApi.ensureCsrf()
        const user = await authApi.me(controller.signal)
        setState({ status: 'authenticated', user })
      } catch (err) {
        if (controller.signal.aborted) return
        if (err instanceof ApiError && err.status === 401) {
          setState({ status: 'anonymous' })
        } else {
          setState({ status: 'error', message: err instanceof Error ? err.message : String(err) })
        }
      }
    })()
    return () => controller.abort()
  }, [reloadKey])

  // Any 401 from the API means the session is gone (expired, logged out elsewhere).
  useEffect(() => {
    setUnauthorizedHandler(() => setState({ status: 'anonymous' }))
    return () => setUnauthorizedHandler(null)
  }, [])

  const login = useCallback(async (credentials: Credentials) => {
    if (!hasCsrfToken()) {
      await authApi.ensureCsrf()
    }
    const user = await authApi.login(credentials)
    setState({ status: 'authenticated', user })
  }, [])

  const register = useCallback(async (registration: Registration) => {
    if (!hasCsrfToken()) {
      await authApi.ensureCsrf()
    }
    // The backend logs the new account in, so the session is already active.
    const user = await authApi.register(registration)
    setState({ status: 'authenticated', user })
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch (err) {
      // 401: the session was already gone, which is the outcome we want anyway.
      if (!(err instanceof ApiError && err.status === 401)) throw err
    }
    setState({ status: 'anonymous' })
  }, [])

  const reload = useCallback(() => {
    setState({ status: 'loading' })
    setReloadKey((k) => k + 1)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ state, login, register, logout, reload }),
    [state, login, register, logout, reload],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
