import { createBrowserRouter } from 'react-router'
import Login from './pages/Login.js'
import { ProtectedRoute } from './components/ProtectedRoute.js'
import Dashboard from './pages/Dashboard.js'
import NewCampaign from './pages/NewCampaign.js'

const PlaceholderPage = ({ title }: { title: string }) => (
  <div className="p-8 font-display text-2xl uppercase text-charcoal-900">{title}</div>
)

export const router = createBrowserRouter([
  { path: '/', element: <Login /> },
  { path: '/dashboard', element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
  { path: '/campaigns/new', element: <ProtectedRoute><NewCampaign /></ProtectedRoute> },
  { path: '/campaigns/:id', element: <ProtectedRoute><PlaceholderPage title="Campaign Detail" /></ProtectedRoute> },
  { path: '/settings', element: <ProtectedRoute><PlaceholderPage title="Settings" /></ProtectedRoute> },
])
