import Anthropic from '@anthropic-ai/sdk'
import * as mm from 'music-metadata'
import { getDriveClient, extractFileId } from './driveClient.js'

export interface SongSection {
  label: string
  startSecs: number | null
  durationSecs: number | null
  description: string
}

export interface SongAnalysis {
  bpm: number | null
  durationSecs: number | null
  key: string | null
  timeSignature: string | null
  sections: SongSection[]
  energyNotes: string
  hookMoment: string
  source: 'spotify' | 'drive'
}

function extractSpotifyTrackId(url: string): string | null {
  const match = url.match(/track\/([A-Za-z0-9]+)/)
  return match ? match[1] : null
}

async function getSpotifyToken(clientId: string, clientSecret: string): Promise<string> {
  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: `Basic ${creds}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  })
  const data = await res.json() as { access_token: string }
  return data.access_token
}

export async function analyzeMusicUrl(
  musicUrl: string,
  accessToken: string,
  anthropicApiKey: string,
  lyricsMarkdown?: string | null,
): Promise<SongAnalysis> {
  if (musicUrl.includes('spotify.com')) {
    return analyzeSpotify(musicUrl, anthropicApiKey)
  }
  return analyzeDriveFile(musicUrl, accessToken, anthropicApiKey, lyricsMarkdown)
}

async function analyzeSpotify(spotifyUrl: string, anthropicApiKey: string): Promise<SongAnalysis> {
  const trackId = extractSpotifyTrackId(spotifyUrl)
  if (!trackId) throw new Error('Cannot extract Spotify track ID from URL')

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET required in env')

  const spotifyToken = await getSpotifyToken(clientId, clientSecret)

  const [featuresRes, analysisRes] = await Promise.all([
    fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    }),
    fetch(`https://api.spotify.com/v1/audio-analysis/${trackId}`, {
      headers: { Authorization: `Bearer ${spotifyToken}` },
    }),
  ])

  if (!featuresRes.ok) {
    const err = await featuresRes.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Spotify audio-features error ${featuresRes.status}: ${err?.error?.message ?? 'unknown'}`)
  }
  if (!analysisRes.ok) {
    const err = await analysisRes.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Spotify audio-analysis error ${analysisRes.status}: ${err?.error?.message ?? 'unknown'}`)
  }

  const features = await featuresRes.json() as {
    tempo: number; duration_ms: number; key: number; mode: number;
    time_signature: number; energy: number; valence: number; danceability: number
  }
  const analysis = await analysisRes.json() as {
    sections: Array<{ start: number; duration: number; loudness: number; tempo: number }>
  }

  const sections: SongSection[] = (analysis.sections ?? []).map((s, i) => ({
    label: `section ${i + 1}`,
    startSecs: Math.round(s.start),
    durationSecs: Math.round(s.duration),
    description: `loudness ${s.loudness.toFixed(1)}dB, tempo ${Math.round(s.tempo)}bpm`,
  }))

  const KEY_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  const keyName = KEY_NAMES[features.key] ?? null
  const mode = features.mode === 1 ? 'major' : 'minor'

  return {
    bpm: Math.round(features.tempo),
    durationSecs: Math.round(features.duration_ms / 1000),
    key: keyName ? `${keyName} ${mode}` : null,
    timeSignature: features.time_signature ? `${features.time_signature}/4` : null,
    sections,
    energyNotes: `energy ${(features.energy * 100).toFixed(0)}%, valence ${(features.valence * 100).toFixed(0)}%, danceability ${(features.danceability * 100).toFixed(0)}%`,
    hookMoment: sections.length > 1 ? `section 2 at ${sections[1]?.startSecs}s (typically chorus)` : 'see sections',
    source: 'spotify',
  }
}

async function analyzeDriveFile(
  driveUrl: string,
  googleAccessToken: string,
  anthropicApiKey: string,
  lyricsMarkdown?: string | null,
): Promise<SongAnalysis> {
  const fileId = extractFileId(driveUrl)
  const drive = getDriveClient(googleAccessToken)

  const fileRes = await drive.files.get({ fileId, alt: 'media' }, { responseType: 'stream' })
  const metadata = await mm.parseStream(fileRes.data as any, undefined, { duration: true })

  const bpm = metadata.common.bpm ?? null
  const durationSecs = metadata.format.duration ? Math.round(metadata.format.duration) : null

  const durationLabel = durationSecs
    ? `${Math.floor(durationSecs / 60)}:${String(Math.round(durationSecs % 60)).padStart(2, '0')} song`
    : 'song'

  const client = new Anthropic({ apiKey: anthropicApiKey })
  const inferPrompt = `Given these song lyrics, infer the likely song structure with estimated timestamps for a ${durationLabel}.

${lyricsMarkdown ? `Lyrics:\n${lyricsMarkdown.slice(0, 2000)}` : 'No lyrics available.'}

Return a JSON object matching this shape exactly:
{
  "sections": [{"label": "intro", "startSecs": 0, "durationSecs": 15, "description": "instrumental opening"}],
  "energyNotes": "brief qualitative energy description",
  "hookMoment": "description of the main hook moment, e.g. 'chorus at ~0:45'"
}`

  const aiRes = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{ role: 'user', content: inferPrompt }],
  })

  let aiData: { sections: SongSection[]; energyNotes: string; hookMoment: string } = {
    sections: [],
    energyNotes: 'unknown',
    hookMoment: 'unknown',
  }
  try {
    const text = aiRes.content.find(c => c.type === 'text')?.text ?? ''
    const jsonMatch = text.match(/\{[\s\S]+\}/)
    if (jsonMatch) aiData = JSON.parse(jsonMatch[0]) as typeof aiData
  } catch {
    // use defaults
  }

  return {
    bpm,
    durationSecs,
    key: null,
    timeSignature: null,
    sections: aiData.sections,
    energyNotes: aiData.energyNotes,
    hookMoment: aiData.hookMoment,
    source: 'drive',
  }
}
