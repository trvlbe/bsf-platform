import { describe, it, expect, vi, beforeEach } from 'vitest'

const { pushPost, buildYoutubeTitle } = await import('../lib/buffer.js')

const basePost = {
  id: 'post-1',
  platform: 'TIKTOK',
  caption: 'Test caption',
  hashtags: ['#music', '#newrelease'],
  scheduledAt: new Date('2026-10-01T18:00:00.000Z'),
  videoUrl: null as string | null,
  youtubeTitlePhrase: null as string | null,
} as any

function mockSuccess() {
  return vi.fn().mockResolvedValue({
    json: async () => ({ data: { createPost: { post: { id: 'buffer-post-123' } } } }),
  })
}

beforeEach(() => vi.unstubAllGlobals())

describe('buildYoutubeTitle', () => {
  it('composes title with campaign, sequence, and phrase', () => {
    expect(buildYoutubeTitle('Think About Us', 47, 'golden hour driving'))
      .toBe('Think About Us #47: golden hour driving')
  })

  it('falls back to just campaign and sequence when phrase is null', () => {
    expect(buildYoutubeTitle('Think About Us', 47, null))
      .toBe('Think About Us #47')
  })

  it('truncates to 100 characters when the composed string is too long', () => {
    const longPhrase = 'a'.repeat(120)
    const result = buildYoutubeTitle('Think About Us', 1, longPhrase)
    expect(result.length).toBe(100)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('pushPost', () => {
  it('resolves with the post id on success', async () => {
    vi.stubGlobal('fetch', mockSuccess())

    const result = await pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    expect(result).toBe('buffer-post-123')
  })

  it('throws with the MutationError message when createPost returns one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ data: { createPost: { message: 'Invalid channel id' } } }),
    }))

    await expect(pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1))
      .rejects.toThrow('Invalid channel id')
  })

  it('throws with the top-level GraphQL error message when present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ errors: [{ message: 'Invalid API key' }] }),
    }))

    await expect(pushPost(basePost, 'bad-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1))
      .rejects.toThrow('Invalid API key')
  })

  it('throws when there is no channel id for the post platform', async () => {
    await expect(pushPost(basePost, 'test-api-key', {}, 'Think About Us', 1))
      .rejects.toThrow('No Buffer channel ID for platform TIKTOK')
  })

  it('includes a video asset in the request body when videoUrl is set', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, videoUrl: 'https://cdn.example/video.mp4' }, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.assets).toEqual([{ video: { url: 'https://cdn.example/video.mp4' } }])
  })

  it('omits the assets key entirely when videoUrl is null', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.assets).toBeUndefined()
  })

  it('sets YouTube metadata: title, categoryId, isAiGenerated', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, platform: 'YOUTUBE', youtubeTitlePhrase: 'golden hour driving' }, 'test-api-key', { YOUTUBE: 'channel-2' }, 'Think About Us', 47)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({
      youtube: { title: 'Think About Us #47: golden hour driving', categoryId: '10', isAiGenerated: true },
    })
  })

  it('sets Instagram metadata: type reel, isAiGenerated', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, platform: 'INSTAGRAM' }, 'test-api-key', { INSTAGRAM: 'channel-3' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({ instagram: { type: 'reel', isAiGenerated: true } })
  })

  it('sets Facebook metadata: type reel, no isAiGenerated key', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost({ ...basePost, platform: 'FACEBOOK' }, 'test-api-key', { FACEBOOK: 'channel-4' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({ facebook: { type: 'reel' } })
  })

  it('sets TikTok metadata: isAiGenerated only', async () => {
    const fetchMock = mockSuccess()
    vi.stubGlobal('fetch', fetchMock)

    await pushPost(basePost, 'test-api-key', { TIKTOK: 'channel-1' }, 'Think About Us', 1)

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.variables.input.metadata).toEqual({ tiktok: { isAiGenerated: true } })
  })
})
