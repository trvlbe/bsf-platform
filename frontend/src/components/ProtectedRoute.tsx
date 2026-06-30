import { Navigate } from 'react-router'
import { useAuth } from '../lib/auth.js'

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) return <div className="min-h-screen bg-paper flex items-center justify-center"><div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" /></div>
  if (!user) return <Navigate to="/" replace />
  return <>{children}</>
}
