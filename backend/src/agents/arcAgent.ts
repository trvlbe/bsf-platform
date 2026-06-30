import Anthropic from '@anthropic-ai/sdk'
import type { Campaign } from '@prisma/client'
import type { ParsedLyrics } from '../types.js'

export interface ArcResult {
  preTheme: string
  dropDayTheme: string
  postTheme: string
  motifs: string[]
  rawJson: string
}

const SUBMIT_ARC_TOOL: Anthropic.Tool = {
  name: 'submit_arc',
  description: 'Submit the campaign arc for this release',
  input_schema: {
    type: 'object' as const,
    properties: {
      preTheme: { type: 'string', description: 'Emotional theme for pre-release content (days -14 to -1)' },
      dropDayTheme: { type: 'string', description: 'Theme for the release day (day 0)' },
      postTheme: { type: 'string', description: 'Theme for post-release content (days +1 to +14)' },
      motifs: { type: 'array', items: { type: 'string' }, description: 'Key lyric lines (exact quotes) that anchor the arc' }
    },
    required: ['preTheme', 'dropDayTheme', 'postTheme', 'motifs']
  }
}

export async function runArcAgent(campaign: Campaign, lyrics: ParsedLyrics): Promise<ArcResult> {
  const client = new Anthropic()
  const lyricSample = lyrics.allLines.slice(0, 30).join('\n')
  const prompt = `Campaign: "${campaign.title}" by ${campaign.artist}
Brand tone: ${campaign.brandTone}
Brand identity: ${campaign.brandIdentity}
Release date: ${campaign.releaseDate.toISOString().split('T')[0]}

Lyrics sample:
${lyricSample}

Design a 29-day campaign arc (14 pre-release, drop day, 14 post-release) rooted in these lyrics.`

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: 'You are a music content strategist. Design campaign arcs that let the lyrics speak for themselves. Every theme must be grounded in specific lyric lines.',
    tools: [SUBMIT_ARC_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }]
  })

  const toolCall = response.content.find(c => c.type === 'tool_use' && c.name === 'submit_arc')
  if (!toolCall || toolCall.type !== 'tool_use') throw new Error('Arc agent: no submit_arc call')

  const input = toolCall.input as Omit<ArcResult, 'rawJson'>
  return { ...input, rawJson: JSON.stringify(toolCall.input) }
}
