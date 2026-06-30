import { prisma } from '../lib/db.js'
import { pushPost } from '../lib/buffer.js'

export async function pushCampaign(campaignId: string, userId: string): Promise<{ pushed: number; skipped: number }> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)

  const posts = await prisma.post.findMany({ where: { campaignId, bufferId: null } })
  let pushed = 0, skipped = 0

  for (const post of posts) {
    try {
      const bufferId = await pushPost(post)
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
