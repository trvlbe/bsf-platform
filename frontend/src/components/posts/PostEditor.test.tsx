import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostEditor } from './PostEditor.js'
import { api } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  api: {
    updatePost: vi.fn().mockResolvedValue({}),
    approvePost: vi.fn().mockResolvedValue({ approved: true }),
    pushPost: vi.fn().mockResolvedValue({}),
  },
}))

const BASE_POST = {
  id: 'post-1',
  campaignId: 'camp-1',
  platform: 'INSTAGRAM' as const,
  caption: 'Test caption for the post',
  hashtags: ['#music', '#newrelease'],
  lyricSource: 'Test lyric quote',
  assetNote: 'Use hero image',
  scheduledAt: new Date('2026-07-20').toISOString(),
  dayOffset: 1,
  approved: false,
  bufferId: null,
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('PostEditor — approval gate', () => {
  it('shows Approve button when post is not approved', () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approve')).toBeInTheDocument()
  })

  it('Push button is disabled when post is not approved', () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Push →')).toBeDisabled()
  })

  it('calls approvePost when Approve clicked', async () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(api.approvePost).toHaveBeenCalledWith('camp-1', 'post-1'))
  })

  it('shows "Approved ✓" badge when post.approved is true', () => {
    render(wrap(<PostEditor post={{ ...BASE_POST, approved: true }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approved ✓')).toBeInTheDocument()
  })

  it('Push button is enabled when post.approved is true', () => {
    render(wrap(<PostEditor post={{ ...BASE_POST, approved: true }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Push →')).not.toBeDisabled()
  })

  it('does not show Push button when post already has a bufferId', () => {
    render(wrap(<PostEditor post={{ ...BASE_POST, approved: true, bufferId: 'buf-123' }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.queryByText('Push →')).not.toBeInTheDocument()
  })
})
