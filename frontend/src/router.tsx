import { createBrowserRouter } from 'react-router'
import Login from './pages/Login.js'
import { ProtectedRoute } from './components/ProtectedRoute.js'
import Dashboard from './pages/Dashboard.js'
import NewCampaign from './pages/NewCampaign.js'
import CampaignDetail from './pages/Campaign/index.js'
import Settings from './pages/Settings.js'

export const router = createBrowserRouter([
  { path: '/', element: <Login /> },
  { path: '/dashboard', element: <ProtectedRoute><Dashboard /></ProtectedRoute> },
  { path: '/campaigns/new', element: <ProtectedRoute><NewCampaign /></ProtectedRoute> },
  { path: '/campaigns/:id', element: <ProtectedRoute><CampaignDetail /></ProtectedRoute> },
  { path: '/settings', element: <ProtectedRoute><Settings /></ProtectedRoute> },
])
