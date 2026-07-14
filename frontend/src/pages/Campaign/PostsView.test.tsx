import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostsView } from './PostsView.js'
import { api } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  api: {
    getPosts: vi.fn().mockResolvedValue([
      {
        id: 'p1', platform: 'INSTAGRAM', caption: 'Caption A', hashtags: [],
        lyricSource: 'lyric a', dayOffset: 0, approved: false, bufferId: null,
        scheduledAt: new Date().toISOString(), assetNote: '',
      },
      {
        id: 'p2', platform: 'TIKTOK', caption: 'Caption B', hashtags: [],
        lyricSource: 'lyric b', dayOffset: 1, approved: true, bufferId: null,
        scheduledAt: new Date().toISOString(), assetNote: '',
      },
      {
        id: 'p3', platform: 'FACEBOOK', caption: 'Caption C', hashtags: [],
        lyricSource: 'lyric c', dayOffset: 2, approved: true, bufferId: 'buf-123',
        scheduledAt: new Date().toISOString(), assetNote: '',
      },
    ]),
  },
}))

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

describe('PostsView — approval badges', () => {
  it('shows "Needs Review" for unapproved posts', async () => {
    render(wrap(<PostsView campaignId="camp-1" />))
    expect(await screen.findByText('Needs Review')).toBeInTheDocument()
  })

  it('shows "Approved" for approved-but-unpushed posts', async () => {
    render(wrap(<PostsView campaignId="camp-1" />))
    expect(await screen.findByText('Approved')).toBeInTheDocument()
  })

  it('shows "Pushed" for posts with a bufferId', async () => {
    render(wrap(<PostsView campaignId="camp-1" />))
    expect(await screen.findByText('Pushed')).toBeInTheDocument()
  })

  it('shows "Review →" action link in last column', async () => {
    render(wrap(<PostsView campaignId="camp-1" />))
    const links = await screen.findAllByText('Review →')
    expect(links.length).toBe(3)
  })
})
