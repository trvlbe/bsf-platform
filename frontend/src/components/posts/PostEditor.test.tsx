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
    sendToEditor: vi.fn().mockResolvedValue({}),
    getPost: vi.fn(),
    regeneratePost: vi.fn().mockResolvedValue({}),
    getAssets: vi.fn().mockResolvedValue([{ id: 'file-1', name: 'a.jpg', mimeType: 'image/jpeg', webViewLink: 'x' }]),
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

const STAGE2_POST = { ...BASE_POST, directionAccepted: '2026-07-16T00:00:00.000Z', editorStatus: 'NOT_STARTED' }
const STAGE2_PENDING_POST = { ...STAGE2_POST, editorStatus: 'PENDING' }

const STAGE3_READY_POST = {
  ...BASE_POST,
  directionAccepted: '2026-07-16T00:00:00.000Z',
  editorStatus: 'READY',
  editorReasoning: 'Best fits the empty-chairs imagery in the brief.',
  editorPrompt: 'Slow zoom into empty chairs, golden hour haze',
  assetFileId: 'file-1',
  assetMimeType: 'image/jpeg',
}
const STAGE3_FAILED_POST = { ...BASE_POST, directionAccepted: '2026-07-16T00:00:00.000Z', editorStatus: 'FAILED' }

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

  it('shows copy that accepting approves what is sent to the editor agent', () => {
    render(wrap(<PostEditor post={BASE_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Accepting approves this direction to be sent to the editor agent.')).toBeInTheDocument()
  })
})

describe('PostEditor — Stage 2: Send to Editor', () => {
  it('renders the accepted directionBrief read-only with a Send to Editor Agent button', () => {
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Golden hour, empty chairs, quiet longing')).toBeInTheDocument()
    expect(screen.getByText('Send to Editor Agent →')).toBeInTheDocument()
    expect(screen.queryByText('Accept')).not.toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
  })

  it('calls sendToEditor when the button is clicked', async () => {
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    await waitFor(() => expect(screen.getByText('Send to Editor Agent →')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Send to Editor Agent →'))
    await waitFor(() => expect(api.sendToEditor).toHaveBeenCalledWith('camp-1', 'post-1'))
  })

  it('shows a working indicator and hides the Send button while editorStatus is PENDING', () => {
    ;(api.getPost as any).mockResolvedValue(STAGE2_PENDING_POST)
    render(wrap(<PostEditor post={STAGE2_PENDING_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Editor agent is working…')).toBeInTheDocument()
    expect(screen.queryByText('Send to Editor Agent →')).not.toBeInTheDocument()
  })

  it('disables Send to Editor Agent and explains why when the campaign has no image assets', async () => {
    ;(api.getAssets as any).mockResolvedValueOnce([])
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    await waitFor(() => expect(screen.getByText(/No verified image assets/)).toBeInTheDocument())
    expect(screen.getByText('Send to Editor Agent →')).toBeDisabled()
  })

  it('shows copy that a successful run is automatically approved', () => {
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('A successful result is automatically approved for push.')).toBeInTheDocument()
  })

  it('shows "Approved ✓" immediately after Send to Editor Agent succeeds, with no manual Approve click', async () => {
    ;(api.sendToEditor as any).mockResolvedValueOnce({ ...STAGE2_POST, editorStatus: 'READY', approved: true, editorReasoning: 'good fit' })
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    await waitFor(() => expect(screen.getByText('Send to Editor Agent →')).not.toBeDisabled())
    fireEvent.click(screen.getByText('Send to Editor Agent →'))
    await waitFor(() => expect(screen.getByText('Approved ✓')).toBeInTheDocument())
    expect(screen.getByText('Push →')).not.toBeDisabled()
  })
})

describe('PostEditor — Stage 3: Review', () => {
  it('shows the reasoning, motion prompt, and Regenerate control when READY', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Best fits the empty-chairs imagery in the brief.')).toBeInTheDocument()
    expect(screen.getByText('Slow zoom into empty chairs, golden hour haze')).toBeInTheDocument()
    expect(screen.getByText('Regenerate ↺')).toBeInTheDocument()
  })

  it('shows a failure message and only Regenerate when FAILED', () => {
    render(wrap(<PostEditor post={STAGE3_FAILED_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText(/Editor agent failed/)).toBeInTheDocument()
    expect(screen.getByText('Regenerate ↺')).toBeInTheDocument()
    expect(screen.getByText('Approve')).toBeDisabled()
  })

  it('calls regeneratePost with feedback text when Regenerate is clicked', async () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    await waitFor(() => expect(screen.getByText('Regenerate ↺')).not.toBeDisabled())
    fireEvent.change(screen.getByPlaceholderText('Feedback for regenerate (optional)'), { target: { value: 'Too static — add movement' } })
    fireEvent.click(screen.getByText('Regenerate ↺'))
    await waitFor(() => expect(api.regeneratePost).toHaveBeenCalledWith('camp-1', 'post-1', 'Too static — add movement'))
  })

  it('disables Regenerate and explains why when the campaign has no image assets', async () => {
    ;(api.getAssets as any).mockResolvedValueOnce([])
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    await waitFor(() => expect(screen.getByText(/No verified image assets/)).toBeInTheDocument())
    expect(screen.getByText('Regenerate ↺')).toBeDisabled()
  })

  it('shows Approve button when post is not approved', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approve')).toBeInTheDocument()
  })

  it('Push button is disabled when post is not approved', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Push →')).toBeDisabled()
  })

  it('calls approvePost when Approve clicked', async () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(api.approvePost).toHaveBeenCalledWith('camp-1', 'post-1'))
  })

  it('shows "Approved ✓" badge when post.approved is true', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approved ✓')).toBeInTheDocument()
  })

  it('Push button is enabled when post.approved is true', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Push →')).not.toBeDisabled()
  })

  it('does not show Push button when post already has a bufferId', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true, bufferId: 'buf-123' }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.queryByText('Push →')).not.toBeInTheDocument()
  })

  it('re-disables Push and re-shows Approve after a regenerate clears approval, even though this component already approved it once', async () => {
    ;(api.approvePost as any).mockResolvedValueOnce({ ...STAGE3_READY_POST, approved: true })
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))

    fireEvent.click(screen.getByText('Approve'))
    await waitFor(() => expect(screen.getByText('Approved ✓')).toBeInTheDocument())
    expect(screen.getByText('Push →')).not.toBeDisabled()

    ;(api.regeneratePost as any).mockResolvedValueOnce({ ...STAGE3_READY_POST, approved: false, editorStatus: 'READY' })
    fireEvent.click(screen.getByText('Regenerate ↺'))

    await waitFor(() => expect(screen.getByText('Approve')).toBeInTheDocument())
    expect(screen.getByText('Push →')).toBeDisabled()
  })

  it('shows review-before-approving copy when READY but not yet approved', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Review before approving.')).toBeInTheDocument()
  })

  it('shows approved-for-push copy once approved', () => {
    render(wrap(<PostEditor post={{ ...STAGE3_READY_POST, approved: true }} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approved for push.')).toBeInTheDocument()
  })
})

describe('PostEditor — Approve gate', () => {
  it('disables Approve when editorStatus is not READY', () => {
    render(wrap(<PostEditor post={STAGE2_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approve')).toBeDisabled()
  })

  it('enables Approve when editorStatus is READY', () => {
    render(wrap(<PostEditor post={STAGE3_READY_POST} campaignId="camp-1" onClose={() => {}} />))
    expect(screen.getByText('Approve')).not.toBeDisabled()
  })
})
