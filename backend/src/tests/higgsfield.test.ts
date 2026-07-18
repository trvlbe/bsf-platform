import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFindMany = vi.fn()
const mockUpdate = vi.fn().mockResolvedValue({})

vi.mock('../lib/db.js', () => ({
  prisma: { post: { findMany: mockFindMany, update: mockUpdate } },
}))

const { pollAllPendingPosts } = await import('../lib/higgsfield.js')

beforeEach(() => {
  vi.clearAllMocks()
  process.env.HIGGSFIELD_API_KEY = 'key'
  process.env.HIGGSFIELD_API_SECRET = 'secret'
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
