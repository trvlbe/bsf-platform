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
