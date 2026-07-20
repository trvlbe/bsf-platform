import { prisma } from '../lib/db.js'
import { pushPost } from '../lib/buffer.js'
import { decrypt } from '../lib/encrypt.js'

export async function pushCampaign(campaignId: string, userId: string): Promise<{ pushed: number; skipped: number }> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const user = await prisma.user.findUnique({ where: { id: userId } })

  let apiKey: string | undefined
  try {
    apiKey = user?.bufferAccessToken
      ? decrypt(user.bufferAccessToken)
      : process.env.BUFFER_ACCESS_TOKEN
  } catch {
    throw new Error('Buffer access token is unreadable — please re-save it in Settings')
  }
  if (!apiKey) throw new Error('Buffer access token not configured — add it in Settings')

  const channelMap: Record<string, string | undefined> = {
    TIKTOK: (() => {
      try { return user?.bufferChannelTiktok ? decrypt(user.bufferChannelTiktok) : process.env.BUFFER_CHANNEL_TIKTOK } catch { return process.env.BUFFER_CHANNEL_TIKTOK }
    })(),
    INSTAGRAM: (() => {
      try { return user?.bufferChannelInstagram ? decrypt(user.bufferChannelInstagram) : process.env.BUFFER_CHANNEL_INSTAGRAM } catch { return process.env.BUFFER_CHANNEL_INSTAGRAM }
    })(),
    YOUTUBE: (() => {
      try { return user?.bufferChannelYoutube ? decrypt(user.bufferChannelYoutube) : process.env.BUFFER_CHANNEL_YOUTUBE } catch { return process.env.BUFFER_CHANNEL_YOUTUBE }
    })(),
    FACEBOOK: (() => {
      try { return user?.bufferChannelFacebook ? decrypt(user.bufferChannelFacebook) : process.env.BUFFER_CHANNEL_FACEBOOK } catch { return process.env.BUFFER_CHANNEL_FACEBOOK }
    })(),
  }
  const channelIds: Record<string, string> = {}
  for (const [platform, id] of Object.entries(channelMap)) {
    if (id) channelIds[platform] = id
  }

  const orderedPosts = await prisma.post.findMany({ where: { campaignId }, orderBy: { scheduledAt: 'asc' }, select: { id: true } })
  const posts = await prisma.post.findMany({ where: { campaignId, bufferId: null, approved: true } })
  let pushed = 0, skipped = 0

  for (const post of posts) {
    const sequenceNumber = orderedPosts.findIndex(p => p.id === post.id) + 1
    try {
      const bufferId = await pushPost(post, apiKey, channelIds, campaign.title, sequenceNumber)
      await prisma.post.update({ where: { id: post.id }, data: { bufferId, pushError: null } })
      pushed++
    } catch (err: any) {
      await prisma.post.update({ where: { id: post.id }, data: { pushError: err.message } })
      skipped++
    }
  }

  if (pushed > 0) {
    const total = await prisma.post.count({ where: { campaignId } })
    const totalPushed = await prisma.post.count({ where: { campaignId, bufferId: { not: null } } })
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { status: totalPushed >= total ? 'COMPLETE' : 'ACTIVE' }
    })
  }

  return { pushed, skipped }
}
