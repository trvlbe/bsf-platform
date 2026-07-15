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
  if (!res.ok) throw new Error(`Spotify token error ${res.status}`)
  const data = await res.json() as { access_token: string }
  return data.access_token
}

async function inferStructureWithClaude(
  client: Anthropic,
  context: string,
  durationLabel: string,
  lyricsMarkdown?: string | null,
): Promise<{ bpm: number | null; key: string | null; timeSignature: string | null; sections: SongSection[]; energyNotes: string; hookMoment: string }> {
  const prompt = `You are a music analyst. Given this song's context and lyrics, infer its likely musical structure with estimated timestamps for a ${durationLabel} track.

${context}
${lyricsMarkdown ? `\nLyrics:\n${lyricsMarkdown.slice(0, 2000)}` : ''}

Return a JSON object with this exact shape (no extra keys, no markdown):
{
  "bpm": 120,
  "key": "A minor",
  "timeSignature": "4/4",
  "sections": [{"label": "intro", "startSecs": 0, "durationSecs": 15, "description": "instrumental opening"}],
  "energyNotes": "brief qualitative energy description",
  "hookMoment": "e.g. chorus at ~0:45"
}`

  const aiRes = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = aiRes.content.find(c => c.type === 'text')?.text ?? ''
  const jsonMatch = text.match(/\{[\s\S]+\}/)
  if (!jsonMatch) return { bpm: null, key: null, timeSignature: null, sections: [], energyNotes: 'unknown', hookMoment: 'unknown' }
  try {
    return JSON.parse(jsonMatch[0]) as ReturnType<typeof inferStructureWithClaude> extends Promise<infer T> ? T : never
  } catch {
    return { bpm: null, key: null, timeSignature: null, sections: [], energyNotes: 'unknown', hookMoment: 'unknown' }
  }
}

export async function analyzeMusicUrl(
  musicUrl: string,
  accessToken: string,
  anthropicApiKey: string,
  lyricsMarkdown?: string | null,
): Promise<SongAnalysis> {
  if (musicUrl.includes('spotify.com')) {
    return analyzeSpotify(musicUrl, anthropicApiKey, lyricsMarkdown)
  }
  return analyzeDriveFile(musicUrl, accessToken, anthropicApiKey, lyricsMarkdown)
}

async function analyzeSpotify(
  spotifyUrl: string,
  anthropicApiKey: string,
  lyricsMarkdown?: string | null,
): Promise<SongAnalysis> {
  const trackId = extractSpotifyTrackId(spotifyUrl)
  if (!trackId) throw new Error('Cannot extract Spotify track ID from URL')

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error('SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET required in env')

  const spotifyToken = await getSpotifyToken(clientId, clientSecret)

  const trackRes = await fetch(`https://api.spotify.com/v1/tracks/${trackId}`, {
    headers: { Authorization: `Bearer ${spotifyToken}` },
  })
  if (!trackRes.ok) {
    const err = await trackRes.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(`Spotify tracks error ${trackRes.status}: ${err?.error?.message ?? 'unknown'}`)
  }

  const track = await trackRes.json() as {
    name: string
    artists: Array<{ name: string }>
    duration_ms: number
    album: { name: string }
  }

  const durationSecs = Math.round(track.duration_ms / 1000)
  const durationLabel = `${Math.floor(durationSecs / 60)}:${String(durationSecs % 60).padStart(2, '0')}`
  const context = `Track: "${track.name}" by ${track.artists.map(a => a.name).join(', ')}\nAlbum: ${track.album.name}`

  const client = new Anthropic({ apiKey: anthropicApiKey })
  const inferred = await inferStructureWithClaude(client, context, durationLabel, lyricsMarkdown)

  return {
    bpm: inferred.bpm ?? null,
    durationSecs,
    key: inferred.key ?? null,
    timeSignature: inferred.timeSignature ?? null,
    sections: inferred.sections ?? [],
    energyNotes: inferred.energyNotes,
    hookMoment: inferred.hookMoment,
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

  const bpmFromTag = metadata.common.bpm ?? null
  const durationSecs = metadata.format.duration ? Math.round(metadata.format.duration) : null
  const durationLabel = durationSecs
    ? `${Math.floor(durationSecs / 60)}:${String(Math.round(durationSecs % 60)).padStart(2, '0')}`
    : 'unknown duration'

  const context = metadata.common.title
    ? `Track: "${metadata.common.title}"${metadata.common.artist ? ` by ${metadata.common.artist}` : ''}`
    : 'Audio file (no embedded metadata)'

  const client = new Anthropic({ apiKey: anthropicApiKey })
  const inferred = await inferStructureWithClaude(client, context, durationLabel, lyricsMarkdown)

  return {
    bpm: bpmFromTag ?? inferred.bpm ?? null,
    durationSecs,
    key: inferred.key ?? null,
    timeSignature: inferred.timeSignature ?? null,
    sections: inferred.sections ?? [],
    energyNotes: inferred.energyNotes,
    hookMoment: inferred.hookMoment,
    source: 'drive',
  }
}
