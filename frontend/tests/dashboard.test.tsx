import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'

vi.mock('../src/lib/auth.js', () => ({
  useAuth: () => ({ user: { id: '1', name: 'TJ Travelbee', email: 'tj@test.com', avatarUrl: null }, isLoading: false, isAuthenticated: true }),
  AuthProvider: ({ children }: any) => children,
}))

vi.mock('../src/lib/api.js', () => ({
  api: {
    getCampaigns: vi.fn().mockResolvedValue([
      { id: 'c1', title: 'Think About Us', artist: 'BSF', status: 'GENERATED', releaseDate: '2026-09-01', _count: { posts: 29 }, pushedCount: 0 }
    ]),
  }
}))

import Dashboard from '../src/pages/Dashboard.js'

describe('Dashboard', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  it('renders the page title', () => {
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Dashboard /></MemoryRouter>
      </QueryClientProvider>
    )
    expect(screen.getByText(/dashboard/i)).toBeTruthy()
  })

  it('renders metric tiles', () => {
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><Dashboard /></MemoryRouter>
      </QueryClientProvider>
    )
    expect(screen.getByText(/active campaigns/i)).toBeTruthy()
    expect(screen.getByText(/posts generated/i)).toBeTruthy()
  })
})
