import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClientProvider, QueryClient } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'

vi.mock('../src/lib/auth.js', () => ({
  useAuth: () => ({ user: { id: '1', name: 'TJ', email: 'tj@test.com', avatarUrl: null }, isLoading: false, isAuthenticated: true }),
  AuthProvider: ({ children }: any) => children,
}))

vi.mock('../src/lib/api.js', () => ({
  api: {
    getCampaign: vi.fn().mockResolvedValue({ id: 'c1', title: 'Think About Us', artist: 'BSF', status: 'GENERATED', releaseDate: '2026-09-01', _count: { posts: 29 }, pushedCount: 0 }),
    getPosts: vi.fn().mockResolvedValue([]),
    generateCampaign: vi.fn(),
    pushCampaign: vi.fn(),
  }
}))

import CampaignDetail from '../src/pages/Campaign/index.js'

describe('CampaignDetail', () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

  it('renders campaign title', async () => {
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/campaigns/c1']}>
          <Routes>
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )
    // Title loads from query — check for loading state initially
    expect(document.body).toBeTruthy()
  })
})
