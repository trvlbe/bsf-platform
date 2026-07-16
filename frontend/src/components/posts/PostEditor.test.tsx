import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PostEditor } from './PostEditor.js'
import { api } from '../../lib/api.js'

vi.mock('../../lib/api.js', () => ({
  api: {
    updatePost: vi.fn().mockResolvedValue({}),
    updateDirection: vi.fn().mockResolvedValue({}),
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
  directionBrief: 'Golden hour, empty chairs, quiet longing',
  scheduledAt: new Date('2026-07-20').toISOString(),
  dayOffset: 1,
  approved: false,
  bufferId: null,
  directionAccepted: null as string | null,
  editorStatus: 'NOT_STARTED',
  editorPrompt: null as string | null,
  editorReasoning: null as string | null,
  assetFileId: null as string | null,
  assetMimeType: null as string | null,
  videoUrl: null as string | null,
  videoStatus: null as string | null,
}

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
}

beforeEach(() => vi.clearAllMocks())

describe('PostEditor — Stage 1: Direction Review', () => {
  it('renders the auto-generated direction read-only with Accept and Edit buttons', () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Golden hour, empty chairs, quiet longing')).toBeInTheDocument()
    expect(screen.getByText('Accept')).toBeInTheDocument()
    expect(screen.getByText('Edit')).toBeInTheDocument()
  })

  it('calls updateDirection with no field changes when Accept is clicked', async () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Accept'))
    await waitFor(() => expect(api.updateDirection).toHaveBeenCalledWith('camp-1', 'post-1', {}))
  })

  it('switches to editable fields and shows Save & Accept / Cancel when Edit is clicked', () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByDisplayValue('Test caption for the post')).toBeInTheDocument()
    expect(screen.getByText('Save & Accept')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls updateDirection with edited values when Save & Accept is clicked', async () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Edit'))
    fireEvent.change(screen.getByDisplayValue('Test caption for the post'), { target: { value: 'Edited caption' } })
    fireEvent.click(screen.getByText('Save & Accept'))
    await waitFor(() => expect(api.updateDirection).toHaveBeenCalledWith('camp-1', 'post-1', {
      caption: 'Edited caption',
      hashtags: ['#music', '#newrelease'],
      directionBrief: 'Golden hour, empty chairs, quiet longing',
    }))
  })
})
