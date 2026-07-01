import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

import { pushPost } from '../src/lib/buffer.js'
import type { Post } from '@prisma/client'

const mockPost = {
  id: 'p1',
  platform: 'TIKTOK',
  caption: 'Test caption',
  hashtags: ['#music'],
  scheduledAt: new Date('2026-08-25T19:00:00Z'),
  lyricSource: 'I keep thinking about us',
} as Post

const ACCESS_TOKEN = 'test-token'
const PROFILE_IDS = { TIKTOK: 'profile-123' }

describe('buffer', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ update: { id: 'buf_123' } })
    })
  })

  it('pushPost returns bufferId', async () => {
    const id = await pushPost(mockPost, ACCESS_TOKEN, PROFILE_IDS)
    expect(id).toBe('buf_123')
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.bufferapp.com/1/updates/create.json',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('throws when profile ID missing', async () => {
    await expect(pushPost(mockPost, ACCESS_TOKEN, {})).rejects.toThrow()
  })
})
