import type { Post } from '@prisma/client'

const BUFFER_API = 'https://api.bufferapp.com/1/updates/create.json'

const PLATFORM_KEY: Record<string, string> = {
  TIKTOK: 'TIKTOK',
  INSTAGRAM: 'INSTAGRAM',
  YOUTUBE: 'YOUTUBE',
  FACEBOOK: 'FACEBOOK',
}

export async function pushPost(
  post: Post,
  accessToken: string,
  profileIds: Record<string, string>,
): Promise<string> {
  const profileId = profileIds[post.platform]
  if (!profileId) throw new Error(`No Buffer profile ID for platform ${post.platform}`)

  const text = `${post.caption}\n${post.hashtags.join(' ')}`
  const body = new URLSearchParams({
    access_token: accessToken,
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
