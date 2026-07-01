import Anthropic from '@anthropic-ai/sdk'

export async function analyzeLyricsForBrief(lyricsMarkdown: string, apiKey: string): Promise<string> {
  if (!lyricsMarkdown.trim()) throw new Error('No lyrics provided')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    system: 'You are a creative director for a music artist campaign. Be specific and grounded in the actual lyrics. Avoid generic music marketing language.',
    messages: [{
      role: 'user',
      content: `Analyze these song lyrics and produce a concise creative brief for a 29-day social media campaign.

Return plain text with these five sections:
**Key Imagery:** 2-3 specific visual motifs from the lyrics — concrete images, not abstract concepts
**Emotional Arc:** The emotional journey — what the song moves through
**Visual Tone:** Color palette, lighting, aesthetic feel (e.g. "warm golden hour, grainy film, intimate spaces")
**Hooks to Build Around:** 2-3 specific lyric lines that are the strongest content anchors (quote them exactly)
**Campaign Themes:** 3-4 recurring themes across the 29 days

Lyrics:
${lyricsMarkdown}`
    }]
  })

  const textBlock = response.content.find(c => c.type === 'text')
  if (!textBlock || textBlock.type !== 'text') throw new Error('Brief analysis: no text response')
  return textBlock.text
}
