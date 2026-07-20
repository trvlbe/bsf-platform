import Anthropic from '@anthropic-ai/sdk'
import type { Campaign } from '@prisma/client'
import type { ParsedLyrics } from '../types.js'
import type { ArcResult, ContentFormat } from './arcAgent.js'
import type { PostSlot } from '../lib/calendarBuilder.js'
import type { DriveFile } from '../lib/driveClient.js'
import type { SongAnalysis } from '../lib/musicAnalyzer.js'

export interface PostDraft {
  platform: string
  caption: string
  hashtags: string[]
  lyricSource: string
  assetNote: string
  youtubeTitlePhrase: string
}

export const VIRAL_SYSTEM = `You are a viral music content strategist. Your posts stop scrolls and earn shares.

VIRAL STRUCTURE (required for every post):
1. HOOK (line 1): Must earn the watch in under 2 seconds. Use one of: bold emotional statement, surprising question, pattern interrupt, or unexpected specific detail. NEVER start with the artist name, album title, "Introducing", "Check out", "New music", or "Out now" — these are scroll-past death.
2. ANCHOR: Root the post in an exact lyric line — the rawer and more specific, the better. Quote it verbatim in lyricSource.
3. PAYOFF: Deliver the emotional punch. Make the audience feel something they want to send to a friend.

PLATFORM VOICE:
- TIKTOK: Raw, authentic, lowercase preferred. Sound-on assumption. "this song—" energy. Max 150 chars.
- INSTAGRAM: Visual-first language. "the feeling of—" energy. Slightly more polished. Max 200 chars.
- YOUTUBE: Storytelling hook. Why this song matters. 2-3 sentences OK.
- FACEBOOK: Warm, community feel. Share-worthy story angle.

Write like a fan who can't stop thinking about this song, not a press release.`

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
            lyricSource: { type: 'string', description: 'Exact lyric line this post is rooted in — verbatim, no paraphrasing' },
            assetNote: { type: 'string', description: 'Specific filename from available assets OR a concrete visual description. If music analysis shows a hook moment, reference it for editing timing.' },
            youtubeTitlePhrase: { type: 'string', description: 'A short (3-6 word) contextual phrase describing this specific post, used to build a YouTube video title. Generate one for every post regardless of platform.' }
          },
          required: ['platform', 'caption', 'hashtags', 'lyricSource', 'assetNote', 'youtubeTitlePhrase']
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
  format?: ContentFormat,
  assets?: DriveFile[],
  songAnalysis?: SongAnalysis,
): Promise<PostDraft[]> {
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}) })
  const phase = dayOffset < 0 ? 'pre-release' : dayOffset === 0 ? 'release day' : 'post-release'
  const theme = dayOffset < 0 ? arc.preTheme : dayOffset === 0 ? arc.dropDayTheme : arc.postTheme
  const daySlots = slots.filter(s => s.dayOffset === dayOffset)
  const platforms = daySlots.map(s => s.platform)
  const lyricSample = lyrics.allLines.slice(0, 20).join('\n')

  const formatGuidance = format?.duration === 'SHORT_FORM'
    ? 'Content is short-form (≤60s) — write punchy captions, 1-2 lines max. Hook must land immediately.'
    : format?.duration === 'MID_FORM'
    ? 'Content is mid-form (1–5min) — write richer captions, 2-4 lines. Can develop a mini narrative arc.'
    : ''

  const assetsLine = assets && assets.length > 0 ? `\nAvailable assets: ${assets.map(f => f.name).join(', ')}` : ''
  const musicLine = songAnalysis
    ? `\nMusic: ${songAnalysis.bpm ?? '?'}bpm, hook at ${songAnalysis.hookMoment}`
    : ''

  const prompt = `Campaign: "${campaign.title}" by ${campaign.artist}
Day: ${dayOffset} (${phase})
Platforms today: ${platforms.join(', ')}
Phase theme: ${theme}
Key motifs: ${arc.motifs.join(' | ')}
Brand tone: ${campaign.brandTone}
${formatGuidance ? `\nFormat: ${formatGuidance}` : ''}${assetsLine}${musicLine}

Lyrics:
${lyricSample}

Write one post per platform. Each post MUST include an exact lyric quote in lyricSource. No paraphrasing. Each post also needs a short 3-6 word youtubeTitlePhrase capturing this specific post's visual/emotional angle (e.g. "golden hour driving", "empty chairs at 2am") — generate one even for non-YouTube platforms.`

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: VIRAL_SYSTEM,
    tools: [SUBMIT_POSTS_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }]
  })

  const toolCall = response.content.find(c => c.type === 'tool_use' && c.name === 'submit_posts')
  if (!toolCall || toolCall.type !== 'tool_use') throw new Error('Content agent: no submit_posts call')

  return (toolCall.input as { posts: PostDraft[] }).posts
}
