import { createContext, useContext, useEffect, useState } from 'react'
import { api } from './api.js'

interface User { id: string; email: string; name: string; avatarUrl: string | null }
interface AuthCtx { user: User | null; isLoading: boolean; isAuthenticated: boolean }

const AuthContext = createContext<AuthCtx>({ user: null, isLoading: true, isAuthenticated: false })

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    api.getMe()
      .then(u => { setUser(u); setIsLoading(false) })
      .catch(() => setIsLoading(false))
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() { return useContext(AuthContext) }
