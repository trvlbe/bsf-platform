import { describe, it, expect, vi } from 'vitest'

vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: vi.fn().mockResolvedValue({ status: 'ready', download_url: 'https://cdn.higgsfield.ai/video.mp4' })
}))

import { checkJobStatus } from '../src/lib/higgsfield.js'

describe('higgsfield', () => {
  it('returns ready status with download url', async () => {
    process.env.HIGGSFIELD_API_KEY = 'test-key'
    const result = await checkJobStatus('job-123')
    expect(result.status).toBe('ready')
    expect(result.downloadUrl).toBe('https://cdn.higgsfield.ai/video.mp4')
  })
})
