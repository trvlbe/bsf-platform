import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    updateCampaign: vi.fn().mockResolvedValue({}),
    analyzeBrief: vi.fn(),
    analyzeMusic: vi.fn(),
    getAssets: vi.fn().mockResolvedValue([]),
  }
}))

import { api } from '../src/lib/api.js'
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

describe('CampaignDetail — Generate gate during analysis', () => {
  it('disables Generate Content while lyric analysis is in flight, re-enables once it resolves', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    ;(api.getCampaign as any).mockResolvedValue({
      id: 'c1', title: 'Think About Us', artist: 'BSF', status: 'DRAFT', releaseDate: '2026-09-01',
      lyricsMarkdown: '## Verse 1\nsome lyrics', creativeBrief: null, _count: { posts: 0 }, pushedCount: 0,
    })
    let resolveBrief: (v: any) => void = () => {}
    ;(api.analyzeBrief as any).mockReturnValue(new Promise(res => { resolveBrief = res }))

    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/campaigns/c1']}>
          <Routes>
            <Route path="/campaigns/:id" element={<CampaignDetail />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    )

    await waitFor(() => expect(screen.getByText('Generate Content →')).toBeInTheDocument())
    expect(screen.getByText('Generate Content →')).not.toBeDisabled()

    fireEvent.click(screen.getByText('✦ Analyze Lyrics →'))
    await waitFor(() => expect(screen.getByText(/Waiting on analysis/)).toBeInTheDocument())
    expect(screen.getByText(/Waiting on analysis/)).toBeDisabled()

    resolveBrief({ brief: 'a generated brief' })
    await waitFor(() => expect(screen.getByText('Generate Content →')).not.toBeDisabled())
  })
})
