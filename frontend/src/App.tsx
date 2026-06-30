import { RouterProvider } from 'react-router'
import { router } from './router.js'
import { AuthProvider } from './lib/auth.js'

export default function App() {
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  )
}
