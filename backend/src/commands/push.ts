import { prisma } from '../lib/db.js'
import { pushPost } from '../lib/buffer.js'
import { decrypt } from '../lib/encrypt.js'

export async function pushCampaign(campaignId: string, userId: string): Promise<{ pushed: number; skipped: number }> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const user = await prisma.user.findUnique({ where: { id: userId } })

  const accessToken = user?.bufferAccessToken
    ? decrypt(user.bufferAccessToken)
    : process.env.BUFFER_ACCESS_TOKEN
  if (!accessToken) throw new Error('Buffer access token not configured — add it in Settings')

  const platformMap: Record<string, string | undefined> = {
    TIKTOK: user?.bufferProfileTiktok ? decrypt(user.bufferProfileTiktok) : process.env.BUFFER_PROFILE_TIKTOK,
    INSTAGRAM: user?.bufferProfileInstagram ? decrypt(user.bufferProfileInstagram) : process.env.BUFFER_PROFILE_INSTAGRAM,
    YOUTUBE: user?.bufferProfileYoutube ? decrypt(user.bufferProfileYoutube) : process.env.BUFFER_PROFILE_YOUTUBE,
    FACEBOOK: user?.bufferProfileFacebook ? decrypt(user.bufferProfileFacebook) : process.env.BUFFER_PROFILE_FACEBOOK,
  }
  const profileIds: Record<string, string> = {}
  for (const [platform, id] of Object.entries(platformMap)) {
    if (id) profileIds[platform] = id
  }

  const posts = await prisma.post.findMany({ where: { campaignId, bufferId: null } })
  let pushed = 0, skipped = 0

  for (const post of posts) {
    try {
      const bufferId = await pushPost(post, accessToken, profileIds)
      await prisma.post.update({ where: { id: post.id }, data: { bufferId } })
      pushed++
    } catch {
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
