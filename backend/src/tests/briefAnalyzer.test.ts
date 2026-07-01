import { describe, it, expect, vi } from 'vitest'
import { analyzeLyricsForBrief } from '../lib/briefAnalyzer.js'

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: '**Key Imagery:** Empty chairs\n**Emotional Arc:** Longing to hope' }],
        stop_reason: 'end_turn',
      })
    }
  }))
}))

describe('analyzeLyricsForBrief', () => {
  it('returns plain text brief from Claude', async () => {
    const result = await analyzeLyricsForBrief('## Verse 1\nThink about us', 'test-key')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(10)
  })

  it('throws if lyricsMarkdown is empty', async () => {
    await expect(analyzeLyricsForBrief('', 'test-key')).rejects.toThrow('No lyrics provided')
  })
})
