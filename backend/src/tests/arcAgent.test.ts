import { describe, it, expect, vi } from 'vitest'
import { runArcAgent } from '../agents/arcAgent.js'
import type { Campaign } from '@prisma/client'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'submit_arc',
          input: {
            preTheme: 'longing',
            dropDayTheme: 'arrival',
            postTheme: 'remembrance',
            motifs: ['think about us']
          }
        }],
        stop_reason: 'tool_use',
      })
    }
  }))
}))

const mockCampaign = {
  id: 'c1', title: 'Think About Us', artist: 'Test', label: 'Test',
  brandTone: 'warm', brandIdentity: 'indie', releaseDate: new Date('2026-09-01'),
  creativeBrief: '**Key Imagery:** Empty chairs\n**Visual Tone:** Golden hour',
  contentOrientation: 'VERTICAL', contentDuration: 'SHORT_FORM', contentResolution: '1080p',
} as unknown as Campaign

const mockLyrics = { allLines: ['think about us', 'while you sleep'], sections: [] }

describe('runArcAgent', () => {
  it('includes creative brief in the prompt when provided', async () => {
    const Anthropic = (await import('@anthropic-ai/sdk')).default as any
    await runArcAgent(mockCampaign, mockLyrics, 'test-key', mockCampaign.creativeBrief, {
      orientation: 'VERTICAL', duration: 'SHORT_FORM', resolution: '1080p'
    })
    const createSpy = Anthropic.mock.results[0]?.value?.messages?.create
    const callArgs = createSpy?.mock?.calls?.[0]?.[0]
    expect(callArgs?.system).toContain('CREATIVE DIRECTOR')
    expect(callArgs?.system).toContain('Empty chairs')
  })

  it('works without creative brief (backwards compatible)', async () => {
    const result = await runArcAgent(mockCampaign, mockLyrics, 'test-key')
    expect(result.preTheme).toBe('longing')
  })
})
