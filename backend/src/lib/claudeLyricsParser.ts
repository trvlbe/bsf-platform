import Anthropic from '@anthropic-ai/sdk'

const SUBMIT_LYRICS_TOOL: Anthropic.Tool = {
  name: 'submit_lyrics',
  description: 'Submit the formatted lyrics markdown',
  input_schema: {
    type: 'object' as const,
    properties: {
      formatted: {
        type: 'string',
        description: 'Full lyrics formatted with ## Section headers'
      }
    },
    required: ['formatted']
  }
}

const SYSTEM_PROMPT = `You are a music lyrics formatter. Given raw lyrics text from a Google Doc, produce clean markdown with ## Section headers (e.g., ## Verse 1, ## Chorus, ## Bridge, ## Outro, ## Verse 2, etc.). Rules:
1. Preserve every lyric word exactly — no changes, no paraphrasing
2. Use ## for section headers only — not for lines
3. Blank line between sections
4. Blank line between header and first lyric line
5. Call submit_lyrics with the formatted result — no explanation, no preamble`

export async function parseLyricsFromRawText(rawText: string, apiKey?: string): Promise<string> {
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}) })
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [SUBMIT_LYRICS_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: rawText }]
  })

  const toolCall = response.content.find(c => c.type === 'tool_use' && c.name === 'submit_lyrics')
  if (!toolCall || toolCall.type !== 'tool_use') {
    throw new Error('Claude did not call submit_lyrics')
  }
  return (toolCall.input as { formatted: string }).formatted
}
