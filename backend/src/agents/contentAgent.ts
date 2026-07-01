import Anthropic from '@anthropic-ai/sdk'
import type { Campaign } from '@prisma/client'
import type { ParsedLyrics } from '../types.js'
import type { ArcResult } from './arcAgent.js'
import type { PostSlot } from '../lib/calendarBuilder.js'

export interface PostDraft {
  platform: string
  caption: string
  hashtags: string[]
  lyricSource: string
  assetNote: string
}

const SUBMIT_POSTS_TOOL: Anthropic.Tool = {
  name: 'submit_posts',
  description: 'Submit the social media posts for this day',
  input_schema: {
    type: 'object' as const,
    properties: {
      posts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            platform: { type: 'string' },
            caption: { type: 'string' },
            hashtags: { type: 'array', items: { type: 'string' } },
            lyricSource: { type: 'string', description: 'Exact lyric line this post is rooted in' },
            assetNote: { type: 'string', description: 'Visual asset guidance for social team' }
          },
          required: ['platform', 'caption', 'hashtags', 'lyricSource', 'assetNote']
        }
      }
    },
    required: ['posts']
  }
}

export async function runContentAgent(
  campaign: Campaign,
  arc: ArcResult,
  lyrics: ParsedLyrics,
  slots: PostSlot[],
  dayOffset: number,
  apiKey?: string,
): Promise<PostDraft[]> {
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}) })
  const phase = dayOffset < 0 ? 'pre-release' : dayOffset === 0 ? 'release day' : 'post-release'
  const theme = dayOffset < 0 ? arc.preTheme : dayOffset === 0 ? arc.dropDayTheme : arc.postTheme
  const daySlots = slots.filter(s => s.dayOffset === dayOffset)
  const platforms = daySlots.map(s => s.platform)
  const lyricSample = lyrics.allLines.slice(0, 20).join('\n')

  const prompt = `Campaign: "${campaign.title}" by ${campaign.artist}
Day: ${dayOffset} (${phase})
Platforms today: ${platforms.join(', ')}
Phase theme: ${theme}
Key motifs: ${arc.motifs.join(' | ')}
Brand tone: ${campaign.brandTone}

Lyrics:
${lyricSample}

Write one post per platform. Each post MUST include an exact lyric quote in lyricSource. No paraphrasing.`

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: `You write social media posts for music releases. Every post must be rooted in an EXACT lyric line — copy it verbatim into lyricSource. Never paraphrase. Write platform-appropriate captions. Hashtags: 5-8 relevant tags.`,
    tools: [SUBMIT_POSTS_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }]
  })

  const toolCall = response.content.find(c => c.type === 'tool_use' && c.name === 'submit_posts')
  if (!toolCall || toolCall.type !== 'tool_use') throw new Error('Content agent: no submit_posts call')

  return (toolCall.input as { posts: PostDraft[] }).posts
}
