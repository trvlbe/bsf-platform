import type { Post } from '@prisma/client'

const BUFFER_API = 'https://api.buffer.com'

const CREATE_POST_MUTATION = `
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) {
      ... on PostActionSuccess {
        post { id }
      }
      ... on MutationError {
        message
      }
    }
  }
`

const YOUTUBE_MUSIC_CATEGORY_ID = '10'
const YOUTUBE_TITLE_LIMIT = 100

export function buildYoutubeTitle(campaignTitle: string, sequenceNumber: number, phrase: string | null): string {
  const base = `${campaignTitle} #${sequenceNumber}`
  const full = phrase ? `${base}: ${phrase}` : base
  return full.length > YOUTUBE_TITLE_LIMIT ? full.slice(0, YOUTUBE_TITLE_LIMIT - 1) + '…' : full
}

function buildMetadata(post: Post, campaignTitle: string, sequenceNumber: number): Record<string, unknown> | undefined {
  switch (post.platform) {
    case 'YOUTUBE':
      return {
        youtube: {
          title: buildYoutubeTitle(campaignTitle, sequenceNumber, post.youtubeTitlePhrase),
          categoryId: YOUTUBE_MUSIC_CATEGORY_ID,
          isAiGenerated: true,
        },
      }
    case 'INSTAGRAM':
      return { instagram: { type: 'reel', isAiGenerated: true } }
    case 'FACEBOOK':
      return { facebook: { type: 'reel' } }
    case 'TIKTOK':
      return { tiktok: { isAiGenerated: true } }
    default:
      return undefined
  }
}

export async function pushPost(
  post: Post,
  apiKey: string,
  channelIds: Record<string, string>,
  campaignTitle: string,
  sequenceNumber: number,
): Promise<string> {
  const channelId = channelIds[post.platform]
  if (!channelId) throw new Error(`No Buffer channel ID for platform ${post.platform}`)

  const text = `${post.caption}\n${post.hashtags.join(' ')}`
  const assets = post.videoUrl ? [{ video: { url: post.videoUrl } }] : undefined
  const metadata = buildMetadata(post, campaignTitle, sequenceNumber)

  const res = await fetch(BUFFER_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: CREATE_POST_MUTATION,
      variables: {
        input: {
          text,
          channelId,
          schedulingType: 'automatic',
          mode: 'customScheduled',
          dueAt: post.scheduledAt.toISOString(),
          ...(assets ? { assets } : {}),
          ...(metadata ? { metadata } : {}),
        },
      },
    }),
  })

  const data = await res.json() as {
    errors?: { message: string }[]
    data?: { createPost?: { message?: string; post?: { id: string } } }
  }

  if (data.errors?.length) throw new Error(data.errors[0].message)
  const result = data.data?.createPost
  if (result?.message) throw new Error(result.message)
  if (!result?.post?.id) throw new Error('Buffer did not return a post id')
  return result.post.id
}
