import { describe, it, expect, vi } from 'vitest'
import { runEditorAgent } from '../agents/editorAgent.js'

const mockCreate = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate }
  }))
}))

const baseInput = {
  lyricSource: 'think about us',
  songAnalysis: {
    bpm: 120, durationSecs: 180, key: 'A minor', timeSignature: '4/4',
    sections: [{ label: 'chorus', startSecs: 45, durationSecs: 15, description: 'hook' }],
    energyNotes: 'builds steadily', hookMoment: 'chorus at ~0:45', source: 'drive' as const,
  },
  caption: 'this song—',
  hashtags: ['#indiemusic'],
  directionBrief: 'Golden hour, empty chairs, quiet longing',
  assets: [
    { id: 'file-1', name: 'chairs.jpg', mimeType: 'image/jpeg', webViewLink: 'https://x' },
    { id: 'file-2', name: 'crowd.jpg', mimeType: 'image/jpeg', webViewLink: 'https://x' },
  ],
}

describe('runEditorAgent', () => {
  it('returns the agent\'s asset + motion prompt decision', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: 'file-1', motionPrompt: 'Slow zoom into empty chairs, golden hour haze', reasoning: 'Best fits the empty-chairs imagery in the brief.' },
      }],
      stop_reason: 'tool_use',
    })
    const result = await runEditorAgent(baseInput, 'test-key')
    expect(result.assetFileId).toBe('file-1')
    expect(result.motionPrompt).toBe('Slow zoom into empty chairs, golden hour haze')
    expect(result.reasoning).toBe('Best fits the empty-chairs imagery in the brief.')
  })

  it('returns null assetFileId for a caption-only decision', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: null, motionPrompt: null, reasoning: 'No available asset fits the brief — caption-only.' },
      }],
      stop_reason: 'tool_use',
    })
    const result = await runEditorAgent({ ...baseInput, assets: [] }, 'test-key')
    expect(result.assetFileId).toBeNull()
    expect(result.motionPrompt).toBeNull()
  })

  it('throws if assetFileId is set but motionPrompt is missing', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: 'file-1', motionPrompt: null, reasoning: 'incomplete' },
      }],
      stop_reason: 'tool_use',
    })
    await expect(runEditorAgent(baseInput, 'test-key')).rejects.toThrow('motionPrompt required')
  })

  it('includes previous prompt and feedback in the regenerate prompt', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{
        type: 'tool_use',
        name: 'submit_edit_decision',
        input: { assetFileId: 'file-2', motionPrompt: 'Handheld pan across the crowd', reasoning: 'Feedback asked for more movement.' },
      }],
      stop_reason: 'tool_use',
    })
    await runEditorAgent({ ...baseInput, previousPrompt: 'Slow zoom into empty chairs', feedback: 'Too static — add movement' }, 'test-key')
    const promptArg = mockCreate.mock.calls[0][0].messages[0].content
    expect(promptArg).toContain('Too static — add movement')
    expect(promptArg).toContain('Slow zoom into empty chairs')
  })
})
