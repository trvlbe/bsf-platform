import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Anthropic before importing the parser
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'tool_use',
          name: 'submit_lyrics',
          input: {
            formatted: `## Verse 1\nI keep thinking about us\nSomewhere in the summer heat\n\n## Chorus\nThink about us, think about us\nEvery single night`
          }
        }]
      })
    }
  }))
}))

import { parseLyricsFromRawText } from '../src/lib/claudeLyricsParser.js'
import { parseMarkdownLyrics } from '../src/lib/markdownLyricsParser.js'

describe('claudeLyricsParser', () => {
  it('returns formatted markdown with ## Section headers', async () => {
    const rawText = `Verse 1\nI keep thinking about us\nSomewhere in the summer heat\n\nChorus\nThink about us, think about us\nEvery single night`
    const result = await parseLyricsFromRawText(rawText)
    expect(result).toContain('## Verse 1')
    expect(result).toContain('## Chorus')
    expect(result).toContain('I keep thinking about us')
  })

  it('parseMarkdownLyrics extracts sections', () => {
    const markdown = `## Verse 1\nLine one\nLine two\n\n## Chorus\nLine three`
    const parsed = parseMarkdownLyrics(markdown)
    expect(parsed.sections).toHaveLength(2)
    expect(parsed.sections[0].name).toBe('Verse 1')
    expect(parsed.sections[0].lines).toEqual(['Line one', 'Line two'])
    expect(parsed.sections[1].name).toBe('Chorus')
  })

  it('throws when Claude returns no tool call', async () => {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    ;(Anthropic as any).mockImplementation(() => ({
      messages: { create: vi.fn().mockResolvedValue({ content: [{ type: 'text', text: 'bad' }] }) }
    }))
    await expect(parseLyricsFromRawText('some text')).rejects.toThrow()
  })
})
