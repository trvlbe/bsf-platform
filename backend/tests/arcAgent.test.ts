import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'submit_arc',
          input: {
            preTheme: 'longing and anticipation',
            dropDayTheme: 'cathartic release',
            postTheme: 'reflective nostalgia',
            motifs: ['I keep thinking about us', 'summer heat']
          }
        }]
      })
    }
  }))
}))

import { runArcAgent } from '../src/agents/arcAgent.js'
import type { Campaign } from '@prisma/client'
import type { ParsedLyrics } from '../src/types.js'

const mockCampaign = {
  id: 'c1',
  title: 'Think About Us',
  artist: 'Blue Sky Fable',
  brandTone: 'warm',
  brandIdentity: 'indie',
  releaseDate: new Date('2026-09-01'),
} as Campaign

const mockLyrics: ParsedLyrics = {
  sections: [{ name: 'Verse 1', lines: ['I keep thinking about us', 'In the summer heat'] }],
  allLines: ['I keep thinking about us', 'In the summer heat']
}

describe('arcAgent', () => {
  it('returns arc with all required fields', async () => {
    const arc = await runArcAgent(mockCampaign, mockLyrics)
    expect(arc.preTheme).toContain('longing')
    expect(arc.dropDayTheme).toBeTruthy()
    expect(arc.postTheme).toBeTruthy()
    expect(arc.motifs).toHaveLength(2)
  })

  it('throws when Claude returns no tool call', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    ;(Anthropic as any).mockImplementation(() => ({
      messages: { create: vi.fn().mockResolvedValue({ content: [] }) }
    }))
    await expect(runArcAgent(mockCampaign, mockLyrics)).rejects.toThrow()
  })
})
