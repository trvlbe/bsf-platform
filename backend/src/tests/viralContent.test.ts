import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', async () => {
  const contentMock = vi.fn().mockResolvedValue({
    content: [{
      type: 'tool_use',
      name: 'submit_posts',
      input: { posts: [{ platform: 'TIKTOK', caption: 'test', hashtags: [], lyricSource: 'think about us', assetNote: 'close-up' }] }
    }],
    stop_reason: 'tool_use',
  })
  const arcMock = vi.fn().mockResolvedValue({
    content: [{
      type: 'tool_use',
      name: 'submit_arc',
      input: { preTheme: 'longing', dropDayTheme: 'arrival', postTheme: 'remembrance', motifs: ['think about us'] }
    }],
    stop_reason: 'tool_use',
  })
  const createMock = vi.fn().mockImplementation((args: any) => {
    if (args.tools?.[0]?.name === 'submit_arc') return arcMock(args)
    return contentMock(args)
  })
  return {
    default: vi.fn().mockImplementation(() => ({ messages: { create: createMock } }))
  }
})

describe('viral content prompts', () => {
  it('arc agent buildSystemPrompt contains VIRAL CREATIVE DIRECTION', async () => {
    const { runArcAgent } = await import('../agents/arcAgent.js')
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    const mockCampaign = {
      id: 'c1', title: 'T', artist: 'A', label: 'L', brandTone: 'warm', brandIdentity: 'indie',
      releaseDate: new Date('2026-09-01'),
      creativeBrief: null,
    } as any
    const mockLyrics = { allLines: ['think about us'], sections: [] }
    await runArcAgent(mockCampaign, mockLyrics, 'test-key')
    const instance = Anthropic.mock.results[Anthropic.mock.results.length - 1]?.value
    const callArgs = instance?.messages?.create?.mock?.calls?.[0]?.[0]
    expect(callArgs?.system).toContain('VIRAL CREATIVE DIRECTION')
    expect(callArgs?.system).toContain('content moment')
  })

  it('content agent system contains VIRAL STRUCTURE and HOOK requirement', async () => {
    const { runContentAgent } = await import('../agents/contentAgent.js')
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    const mockCampaign = {
      id: 'c1', title: 'T', artist: 'A', label: 'L', brandTone: 'warm', brandIdentity: 'indie',
      releaseDate: new Date('2026-09-01'),
    } as any
    const mockArc = { preTheme: 'longing', dropDayTheme: 'arrival', postTheme: 'remembrance', motifs: ['think about us'], rawJson: '{}' }
    const mockLyrics = { allLines: ['think about us'], sections: [] }
    const mockSlots = [{ dayOffset: -1, platform: 'TIKTOK', scheduledAt: new Date() }]
    await runContentAgent(mockCampaign, mockArc, mockLyrics, mockSlots, -1, 'test-key')
    const instance = Anthropic.mock.results[Anthropic.mock.results.length - 1]?.value
    const callArgs = instance?.messages?.create?.mock?.calls?.[0]?.[0]
    expect(callArgs?.system).toContain('VIRAL STRUCTURE')
    expect(callArgs?.system).toContain('HOOK')
    expect(callArgs?.system).toContain('TIKTOK')
  })

  it('content agent system contains platform voice rules for INSTAGRAM and YOUTUBE', async () => {
    const { runContentAgent } = await import('../agents/contentAgent.js')
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    const mockCampaign = {
      id: 'c1', title: 'T', artist: 'A', label: 'L', brandTone: 'warm', brandIdentity: 'indie',
      releaseDate: new Date('2026-09-01'),
    } as any
    const mockArc = { preTheme: 'longing', dropDayTheme: 'arrival', postTheme: 'remembrance', motifs: ['test'], rawJson: '{}' }
    const mockLyrics = { allLines: ['test'], sections: [] }
    const mockSlots = [{ dayOffset: 0, platform: 'INSTAGRAM', scheduledAt: new Date() }]
    await runContentAgent(mockCampaign, mockArc, mockLyrics, mockSlots, 0, 'test-key')
    const instance = Anthropic.mock.results[Anthropic.mock.results.length - 1]?.value
    const callArgs = instance?.messages?.create?.mock?.calls?.[0]?.[0]
    expect(callArgs?.system).toContain('INSTAGRAM')
    expect(callArgs?.system).toContain('YOUTUBE')
  })
})

describe('songAnalysis wired into prompts', () => {
  it('arc agent injects BPM and hookMoment into system prompt', async () => {
    const { runArcAgent } = await import('../agents/arcAgent.js')
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    const mockCampaign = {
      id: 'c1', title: 'T', artist: 'A', label: 'L', brandTone: 'warm', brandIdentity: 'indie',
      releaseDate: new Date('2026-09-01'), creativeBrief: null,
    } as any
    const mockLyrics = { allLines: ['think about us'], sections: [] }
    const mockSongAnalysis = {
      bpm: 128, durationSecs: 213, key: 'G major', timeSignature: '4/4',
      sections: [
        { label: 'intro', startSecs: 0, durationSecs: 15, description: 'instrumental' },
        { label: 'chorus', startSecs: 45, durationSecs: 20, description: 'hook' },
      ],
      energyNotes: 'high energy', hookMoment: 'chorus at 45s', source: 'spotify' as const,
    }
    await runArcAgent(mockCampaign, mockLyrics, 'test-key', null, undefined, undefined, mockSongAnalysis)
    const instance = Anthropic.mock.results[Anthropic.mock.results.length - 1]?.value
    const callArgs = instance?.messages?.create?.mock?.calls?.[0]?.[0]
    expect(callArgs?.system).toContain('MUSIC ANALYSIS')
    expect(callArgs?.system).toContain('128')
    expect(callArgs?.system).toContain('chorus at 45s')
    expect(callArgs?.system).toContain('intro @0s')
  })

  it('content agent injects bpm and hookMoment into user prompt', async () => {
    const { runContentAgent } = await import('../agents/contentAgent.js')
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    const mockCampaign = {
      id: 'c1', title: 'T', artist: 'A', label: 'L', brandTone: 'warm', brandIdentity: 'indie',
      releaseDate: new Date('2026-09-01'),
    } as any
    const mockArc = { preTheme: 'longing', dropDayTheme: 'arrival', postTheme: 'remembrance', motifs: ['test'], rawJson: '{}' }
    const mockLyrics = { allLines: ['test'], sections: [] }
    const mockSlots = [{ dayOffset: -1, platform: 'TIKTOK', scheduledAt: new Date() }]
    const mockSongAnalysis = {
      bpm: 95, durationSecs: 190, key: 'C minor', timeSignature: '4/4',
      sections: [], energyNotes: 'moderate', hookMoment: 'bridge at ~2:10', source: 'drive' as const,
    }
    await runContentAgent(mockCampaign, mockArc, mockLyrics, mockSlots, -1, 'test-key', undefined, undefined, mockSongAnalysis)
    const instance = Anthropic.mock.results[Anthropic.mock.results.length - 1]?.value
    const callArgs = instance?.messages?.create?.mock?.calls?.[0]?.[0]
    const userMsg = callArgs?.messages?.[0]?.content as string
    expect(userMsg).toContain('95')
    expect(userMsg).toContain('bridge at ~2:10')
  })
})
