import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() })) },
    drive: vi.fn().mockReturnValue({
      files: {
        get: vi.fn().mockResolvedValue({ data: { stream: null } })
      }
    }),
  }
}))

vi.mock('music-metadata', () => ({
  parseStream: vi.fn().mockResolvedValue({
    common: { bpm: 128 },
    format: { duration: 213.5 },
  })
}))

const mockMessagesCreate = vi.fn().mockResolvedValue({
  content: [{
    type: 'text',
    text: JSON.stringify({
      sections: [
        { label: 'intro', startSecs: 0, durationSecs: 15, description: 'instrumental' },
        { label: 'verse 1', startSecs: 15, durationSecs: 30, description: 'vocals enter' },
      ],
      energyNotes: 'high energy throughout',
      hookMoment: 'chorus at ~0:45',
    })
  }],
  stop_reason: 'end_turn',
})

const mockAnthropicInstance = { messages: { create: mockMessagesCreate } }

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => mockAnthropicInstance)
}))

describe('analyzeMusicUrl — Spotify path', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SPOTIFY_CLIENT_ID = 'test-id'
    process.env.SPOTIFY_CLIENT_SECRET = 'test-secret'
  })

  it('extracts Spotify track ID from URL', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ access_token: 'sp-token' }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ tempo: 128.4, duration_ms: 213000, key: 7, mode: 1, time_signature: 4, energy: 0.8, valence: 0.6, danceability: 0.7 }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ sections: [{ start: 0, duration: 15, loudness: -5.2, tempo: 128 }] }) })
    vi.stubGlobal('fetch', fetchMock)

    const { analyzeMusicUrl } = await import('../lib/musicAnalyzer.js')
    const result = await analyzeMusicUrl(
      'https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh',
      'google-token',
      'anthropic-key',
    )

    expect(result.source).toBe('spotify')
    expect(result.bpm).toBe(128)
    expect(result.key).toBe('G major')
    expect(result.timeSignature).toBe('4/4')
    expect(result.durationSecs).toBe(213)
    expect(result.sections).toHaveLength(1)
    expect(result.energyNotes).toContain('80%')
  })
})

describe('analyzeMusicUrl — Drive path', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns SongAnalysis with sections from Claude inference', async () => {
    const { analyzeMusicUrl } = await import('../lib/musicAnalyzer.js')
    const result = await analyzeMusicUrl(
      'https://drive.google.com/file/d/FILEID123/view',
      'google-token',
      'anthropic-key',
      '## Verse 1\nthink about us',
    )

    expect(result.source).toBe('drive')
    expect(result.bpm).toBe(128)
    expect(result.durationSecs).toBe(214) // Math.round(213.5)
    expect(result.sections).toHaveLength(2)
    expect(result.sections[0]?.label).toBe('intro')
    expect(result.hookMoment).toBe('chorus at ~0:45')
  })

  it('returns empty sections gracefully if Claude returns malformed JSON', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    const instance = new Anthropic()
    instance.messages.create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not valid json at all' }],
      stop_reason: 'end_turn',
    })

    const { analyzeMusicUrl } = await import('../lib/musicAnalyzer.js')
    const result = await analyzeMusicUrl(
      'https://drive.google.com/file/d/FILEID999/view',
      'google-token',
      'anthropic-key',
    )
    expect(result.sections).toEqual([])
  })
})
