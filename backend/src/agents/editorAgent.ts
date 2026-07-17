import Anthropic from '@anthropic-ai/sdk'
import type { SongAnalysis } from '../lib/musicAnalyzer.js'
import type { DriveFile } from '../lib/driveClient.js'

export interface EditorDecision {
  assetFileId: string | null
  motionPrompt: string | null
  reasoning: string
}

export interface EditorAgentInput {
  lyricSource: string
  songAnalysis: SongAnalysis | null
  caption: string
  hashtags: string[]
  directionBrief: string
  assets: DriveFile[]
  previousPrompt?: string | null
  feedback?: string | null
}

export const EDITOR_SYSTEM = `You are a viral video editor for music social content. Given a post's creative direction, its song's musical structure, and a list of available images, pick the single best image and write a motion prompt that will drive an image-to-video AI model. Prioritize whatever makes the clip stop a scroll and earn a share — cinematic movement, emotional specificity, tasteful sync to the song's hook moment when relevant. If at least one image is available, you MUST choose one — lean into creative reinterpretation of whatever's on hand rather than declining. Only return assetFileId: null when the assets list is completely empty.`

const SUBMIT_EDIT_DECISION_TOOL: Anthropic.Tool = {
  name: 'submit_edit_decision',
  description: 'Submit the creative decision for this post\'s video generation',
  input_schema: {
    type: 'object' as const,
    properties: {
      assetFileId: { type: ['string', 'null'], description: 'Chosen Drive file ID from the available assets. Only null if the assets list is completely empty — if any assets are available, you must choose one.' },
      motionPrompt: { type: ['string', 'null'], description: 'Higgsfield motion prompt describing camera movement and mood; required if assetFileId is set, otherwise null' },
      reasoning: { type: 'string', description: 'One-line justification for this choice, shown to the user' },
    },
    required: ['assetFileId', 'reasoning'],
  },
}

export async function runEditorAgent(input: EditorAgentInput, apiKey?: string): Promise<EditorDecision> {
  const client = new Anthropic({ ...(apiKey ? { apiKey } : {}) })

  const assetsLine = input.assets.length > 0
    ? input.assets.map(a => `- ${a.id}: ${a.name} (${a.mimeType})`).join('\n')
    : 'No image assets available in this campaign.'

  const musicLine = input.songAnalysis
    ? `Music: ${input.songAnalysis.bpm ?? '?'}bpm, hook at ${input.songAnalysis.hookMoment}, sections: ${input.songAnalysis.sections.map(s => `${s.label}@${s.startSecs}s`).join(', ')}`
    : 'No song analysis available.'

  const regenerateLine = input.feedback
    ? `\n\nThis is a regenerate attempt. Previous motion prompt: "${input.previousPrompt}". User feedback: "${input.feedback}". Steer away from what didn't work.`
    : ''

  const prompt = `Lyric: "${input.lyricSource}"
Caption: ${input.caption}
Hashtags: ${input.hashtags.join(', ')}
Creative direction: ${input.directionBrief}
${musicLine}

Available assets:
${assetsLine}${regenerateLine}

Pick the single best asset for this post's video from the list above. Only return null if the assets list is empty — if any assets are listed, you must choose one, even if it's an imperfect fit; lean into creative reinterpretation rather than declining. Write a motion prompt that will drive Higgsfield's image-to-video generation. Reference the hook moment timing if relevant.`

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    system: EDITOR_SYSTEM,
    tools: [SUBMIT_EDIT_DECISION_TOOL],
    tool_choice: { type: 'any' },
    messages: [{ role: 'user', content: prompt }],
  })

  const toolCall = response.content.find(c => c.type === 'tool_use' && c.name === 'submit_edit_decision')
  if (!toolCall || toolCall.type !== 'tool_use') throw new Error('Editor agent: no submit_edit_decision call')

  const decision = toolCall.input as EditorDecision
  if (decision.assetFileId && !decision.motionPrompt) {
    throw new Error('Editor agent: motionPrompt required when assetFileId is set')
  }
  if (!decision.assetFileId && input.assets.length > 0) {
    throw new Error('Editor agent: chose caption-only despite available assets')
  }
  return decision
}
