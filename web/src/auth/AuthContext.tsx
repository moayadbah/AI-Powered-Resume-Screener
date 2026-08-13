import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { setUnauthorizedHandler, tokenStore } from '../api/client'

interface AuthValue {
  token: string | null
  isAuthenticated: boolean
  signIn: (token: string) => void
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStore.get())

  const signIn = useCallback((next: string) => {
    tokenStore.set(next)
    setToken(next)
  }, [])

  const signOut = useCallback(() => {
    tokenStore.clear()
    setToken(null)
  }, [])

  // The 24h expiry means a 401 is a daily occurrence, not an edge case. Without
  // this the app sits on a spinner forever.
  useMemo(() => setUnauthorizedHandler(() => setToken(null)), [])

  const value = useMemo<AuthValue>(
    () => ({ token, isAuthenticated: token !== null, signIn, signOut }),
    [token, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
