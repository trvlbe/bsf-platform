import type { Post } from '@prisma/client'

const BUFFER_API = 'https://api.bufferapp.com/1/updates/create.json'

const PROFILE_ENV: Record<string, string> = {
  TIKTOK: 'BUFFER_PROFILE_TIKTOK',
  INSTAGRAM: 'BUFFER_PROFILE_INSTAGRAM',
  YOUTUBE: 'BUFFER_PROFILE_YOUTUBE',
  FACEBOOK: 'BUFFER_PROFILE_FACEBOOK',
}

export async function pushPost(post: Post): Promise<string> {
  const profileId = process.env[PROFILE_ENV[post.platform]]
  if (!profileId) throw new Error(`No Buffer profile ID for platform ${post.platform} — set ${PROFILE_ENV[post.platform]}`)

  const text = `${post.caption}\n${post.hashtags.join(' ')}`
  const body = new URLSearchParams({
    access_token: process.env.BUFFER_ACCESS_TOKEN!,
    profile_ids: profileId,
    text,
    scheduled_at: post.scheduledAt.toISOString(),
    now: 'false',
    shorten: 'false',
  })

  const res = await fetch(BUFFER_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) throw new Error(`Buffer API error: ${res.status}`)
  const data = await res.json() as { update?: { id?: string } }
  const bufferId = data.update?.id
  if (!bufferId) throw new Error('Buffer did not return an update ID')
  return bufferId
}
