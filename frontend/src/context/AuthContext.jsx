import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { authApi, tokenStore } from '../lib/api'

const AuthContext = createContext(null)

/**
 * Auth provider.
 *
 * On boot it validates any stored token against `GET /api/auth/me`. That single
 * round-trip is what makes the app "work from any device": the token is the
 * session, and a token that no longer resolves logs the user out cleanly instead
 * of rendering a broken dashboard.
 */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [stats, setStats] = useState(null)
  const [booting, setBooting] = useState(true)

  const applySession = useCallback((payload) => {
    tokenStore.set(payload.tokens)
    setUser(payload.user)
    setStats(payload.stats || null)
    return payload.user
  }, [])

  const signOut = useCallback(async () => {
    await authApi.logout()
    tokenStore.clear()
    setUser(null)
    setStats(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!tokenStore.access) return null
    try {
      const data = await authApi.me()
      setUser(data.user)
      setStats(data.stats)
      return data.user
    } catch {
      tokenStore.clear()
      setUser(null)
      setStats(null)
      return null
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!tokenStore.access) {
        setBooting(false)
        return
      }
      try {
        const data = await authApi.me()
        if (!cancelled) {
          setUser(data.user)
          setStats(data.stats)
        }
      } catch {
        tokenStore.clear()
      } finally {
        if (!cancelled) setBooting(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(
    async (email, password) => applySession(await authApi.login({ email, password })),
    [applySession],
  )

  const signUp = useCallback(
    async (payload) => applySession(await authApi.register(payload)),
    [applySession],
  )

  const value = useMemo(
    () => ({
      user,
      stats,
      booting,
      isAuthenticated: Boolean(user),
      isModerator: Boolean(user?.is_moderator),
      signIn,
      signUp,
      signOut,
      refresh,
      setUser,
      setStats,
    }),
    [user, stats, booting, signIn, signUp, signOut, refresh],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}
