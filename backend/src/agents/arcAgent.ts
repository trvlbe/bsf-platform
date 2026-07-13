import Anthropic from '@anthropic-ai/sdk'
import type { Campaign } from '@prisma/client'
import type { ParsedLyrics } from '../types.js'
import type { DriveFile } from '../lib/driveClient.js'
import type { SongAnalysis } from '../lib/musicAnalyzer.js'

export interface ArcResult {
  preTheme: string
  dropDayTheme: string
  postTheme: string
  motifs: string[]
  rawJson: string
}

export interface ContentFormat {
  orientation: string
  duration: string
  resolution: string
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
      motifs: { type: 'array', items: { type: 'string' }, description: 'Key lyric lines (exact quotes) that anchor the arc — selected for high shareability and emotional rawness' }
    },
    required: ['preTheme', 'dropDayTheme', 'postTheme', 'motifs']
  }
}

function buildSystemPrompt(creativeBrief?: string | null, format?: ContentFormat, assets?: DriveFile[], songAnalysis?: SongAnalysis): string {
  let system = `You are a music content strategist and creative director. Design campaign arcs that make people stop scrolling and start sharing.

VIRAL CREATIVE DIRECTION: Every theme must surface a specific "content moment" — not a genre label or vague emotion, but a concrete visual scene or feeling a viewer could recreate or relate to. Every motif must be an exact lyric line chosen for shareability: unexpected, emotionally raw, or so specific it feels like the listener's own secret.

Avoid generic phrases like "introspective journey" or "emotional ballad" — be concrete and scene-specific.`

  if (creativeBrief?.trim()) {
    system += `\n\nCREATIVE DIRECTOR'S BRIEF — let this shape the visual and emotional direction of all themes and motifs:\n${creativeBrief}`
  }

  if (format) {
    const formatNote = format.duration === 'SHORT_FORM'
      ? 'Content is short-form (≤60s) — themes should be punchy and immediately compelling.'
      : format.duration === 'MID_FORM'
      ? 'Content is mid-form (1–5min) — themes can support deeper narrative arcs.'
      : ''
    system += `\n\nCONTENT FORMAT: ${format.orientation} / ${format.duration} / ${format.resolution}. ${formatNote}`
  }

  if (assets && assets.length > 0) {
    system += `\n\nAVAILABLE ASSETS (${assets.length} files in campaign Drive folder):\n`
    system += assets.map(f => `- ${f.name} (${f.mimeType})`).join('\n')
    system += '\nReference these specific filenames in motifs and themes when relevant.'
  }

  if (songAnalysis) {
    let musicCtx = `\n\nMUSIC ANALYSIS (use this to time content to the song):`
    if (songAnalysis.bpm) musicCtx += `\nBPM: ${songAnalysis.bpm}`
    if (songAnalysis.key) musicCtx += ` | Key: ${songAnalysis.key}`
    if (songAnalysis.hookMoment) musicCtx += `\nHook moment: ${songAnalysis.hookMoment}`
    if (songAnalysis.sections.length > 0) {
      musicCtx += `\nSections: ${songAnalysis.sections.map(s => `${s.label}${s.startSecs != null ? ` @${s.startSecs}s` : ''}`).join(' → ')}`
    }
    system += musicCtx
  }

  return system
}

export const buildSystemPromptForTest = buildSystemPrompt

export async function runArcAgent(
  campaign: Campaign,
  lyrics: ParsedLyrics,
  apiKey?: string,
  creativeBrief?: string | null,
  format?: ContentFormat,
  assets?: DriveFile[],
  songAnalysis?: SongAnalysis,
): Promise<ArcResult> {
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}) })
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
    system: buildSystemPrompt(creativeBrief, format, assets, songAnalysis),
    tools: [SUBMIT_ARC_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }]
  })

  const toolCall = response.content.find(c => c.type === 'tool_use' && c.name === 'submit_arc')
  if (!toolCall || toolCall.type !== 'tool_use') throw new Error('Arc agent: no submit_arc call')

  const input = toolCall.input as Omit<ArcResult, 'rawJson'>
  return { ...input, rawJson: JSON.stringify(toolCall.input) }
}
