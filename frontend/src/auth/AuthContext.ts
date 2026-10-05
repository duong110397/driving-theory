import { createContext, useContext } from 'react'
import type { Credentials, User } from './api'

export type AuthState =
  | { status: 'loading' }
  | { status: 'authenticated'; user: User }
  | { status: 'anonymous' }
  | { status: 'error'; message: string }

export interface AuthContextValue {
  state: AuthState
  login: (credentials: Credentials) => Promise<void>
  logout: () => Promise<void>
  reload: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth must be used inside <AuthProvider>')
  }
  return ctx
}
