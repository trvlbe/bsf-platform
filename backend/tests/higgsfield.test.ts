import { describe, it, expect, vi, beforeEach } from 'vitest'

import { checkJobStatus } from '../src/lib/higgsfield.js'

vi.mock('../src/lib/db.js', () => ({
  prisma: {
    post: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
  },
}))

describe('higgsfield', () => {
  beforeEach(() => {
    process.env.HIGGSFIELD_API_KEY = 'test-key'
    process.env.HIGGSFIELD_API_SECRET = 'test-secret'
  })

  it('returns completed status with video url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'completed', video: { url: 'https://cdn.higgsfield.ai/video.mp4' } })
    }))

    const result = await checkJobStatus('job-123')
    expect(result.status).toBe('completed')
    expect(result.videoUrl).toBe('https://cdn.higgsfield.ai/video.mp4')
  })

  it('returns failed status with no video url', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'failed' })
    }))

    const result = await checkJobStatus('job-456')
    expect(result.status).toBe('failed')
    expect(result.videoUrl).toBeUndefined()
  })
})

describe('pollAllPendingPosts', () => {
  beforeEach(() => {
    process.env.HIGGSFIELD_API_KEY = 'test-key'
    process.env.HIGGSFIELD_API_SECRET = 'test-secret'
  })

  it('sets videoStatus and editorStatus to READY on completion', async () => {
    const { prisma } = await import('../src/lib/db.js')
    ;(prisma.post.findMany as any).mockResolvedValue([{ id: 'post-1', videoJobId: 'job-1' }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'completed', video: { url: 'https://cdn.higgsfield.ai/v.mp4' } })
    }))
    const { pollAllPendingPosts } = await import('../src/lib/higgsfield.js')
    await pollAllPendingPosts()
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-1' },
      data: { videoStatus: 'READY', videoUrl: 'https://cdn.higgsfield.ai/v.mp4', editorStatus: 'READY' },
    })
  })

  it('sets videoStatus and editorStatus to FAILED on failure', async () => {
    const { prisma } = await import('../src/lib/db.js')
    ;(prisma.post.findMany as any).mockResolvedValue([{ id: 'post-2', videoJobId: 'job-2' }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'failed' })
    }))
    const { pollAllPendingPosts } = await import('../src/lib/higgsfield.js')
    await pollAllPendingPosts()
    expect(prisma.post.update).toHaveBeenCalledWith({
      where: { id: 'post-2' },
      data: { videoStatus: 'FAILED', editorStatus: 'FAILED' },
    })
  })

  it('does not touch editorStatus while still in_progress', async () => {
    const { prisma } = await import('../src/lib/db.js')
    ;(prisma.post.findMany as any).mockResolvedValue([{ id: 'post-3', videoJobId: 'job-3' }])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ status: 'in_progress' })
    }))
    const { pollAllPendingPosts } = await import('../src/lib/higgsfield.js')
    await pollAllPendingPosts()
    expect(prisma.post.update).toHaveBeenCalledWith({ where: { id: 'post-3' }, data: { videoStatus: 'PROCESSING' } })
  })
})
