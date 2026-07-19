import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockUpdate = vi.fn().mockResolvedValue({})

vi.mock('../lib/db.js', () => ({
  prisma: { post: { findMany: mockFindMany, update: mockUpdate } },
}))

const { pollAllPendingPosts, createVideoJob } = await import('../lib/higgsfield.js')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HIGGSFIELD_API_KEY = 'key'
  process.env.HIGGSFIELD_API_SECRET = 'secret'
})

describe('createVideoJob', () => {
  it('extracts the job-set id from the real Higgsfield create-job response shape', async () => {
    // Real response captured from a live POST /v1/image2video/dop call — the API
    // returns the job-set id at the top-level `id` field, not `request_id`.
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'a42acdf8-59c6-4b4e-9acb-0d50c5c6d884',
        type: 'image2video',
        created_at: '2026-07-19T16:16:27.996476Z',
        jobs: [{ id: 'b1efa7c3-846c-4810-b2ab-7d9d203d67e6', job_set_type: 'image2video', status: 'queued', results: null }],
        input_params: { prompt: 'test', model: 'dop-turbo' },
      }),
    }))

    const { requestId } = await createVideoJob('https://drive.example/image.jpg', 'slow zoom')

    expect(requestId).toBe('a42acdf8-59c6-4b4e-9acb-0d50c5c6d884')
  })
})

describe('pollAllPendingPosts', () => {
  it('approves a completed post when autoApproveOnEditorSuccess is true', async () => {
    mockFindMany.mockResolvedValue([{ id: 'post-1', videoJobId: 'job-1', autoApproveOnEditorSuccess: true }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', video: { url: 'https://cdn.example/video.mp4' } }),
    }))

    await pollAllPendingPosts()

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { videoStatus: 'READY', videoUrl: 'https://cdn.example/video.mp4', editorStatus: 'READY', approved: true },
    })
  })

  it('does not approve a completed post when autoApproveOnEditorSuccess is false', async () => {
    mockFindMany.mockResolvedValue([{ id: 'post-1', videoJobId: 'job-1', autoApproveOnEditorSuccess: false }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'completed', video: { url: 'https://cdn.example/video.mp4' } }),
    }))

    await pollAllPendingPosts()

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { videoStatus: 'READY', videoUrl: 'https://cdn.example/video.mp4', editorStatus: 'READY', approved: false },
    })
  })

  it('never approves a failed job regardless of the flag', async () => {
    mockFindMany.mockResolvedValue([{ id: 'post-1', videoJobId: 'job-1', autoApproveOnEditorSuccess: true }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'failed' }) }))

    await pollAllPendingPosts()

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { videoStatus: 'FAILED', editorStatus: 'FAILED' },
    })
  })
})
