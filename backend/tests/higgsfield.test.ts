import { describe, it, expect, vi, beforeEach } from 'vitest'

import { checkJobStatus } from '../src/lib/higgsfield.js'

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
