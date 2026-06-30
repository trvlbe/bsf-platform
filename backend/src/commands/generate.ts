import { prisma } from '../lib/db.js'
import { parseMarkdownLyrics } from '../lib/markdownLyricsParser.js'
import { buildPostSlots } from '../lib/calendarBuilder.js'
import { runArcAgent } from '../agents/arcAgent.js'
import { runContentAgent } from '../agents/contentAgent.js'

export async function generateCampaign(campaignId: string, userId: string): Promise<{ postCount: number }> {
  const campaign = await prisma.campaign.findFirst({ where: { id: campaignId, userId } })
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`)
  if (!campaign.lyricsMarkdown) throw new Error('Campaign has no lyrics — import lyrics first')

  await prisma.post.deleteMany({ where: { campaignId } })
  await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'GENERATING' } })

  try {
    const parsedLyrics = parseMarkdownLyrics(campaign.lyricsMarkdown)
    const slots = buildPostSlots(campaign)
    const arc = await runArcAgent(campaign, parsedLyrics)

    await prisma.campaignArc.upsert({
      where: { campaignId },
      update: { ...arc },
      create: { campaignId, ...arc }
    })

    const days = [...new Set(slots.map(s => s.dayOffset))].sort((a, b) => a - b)
    const allPosts: Array<Parameters<typeof prisma.post.create>[0]['data']> = []

    for (const dayOffset of days) {
      const drafts = await runContentAgent(campaign, arc, parsedLyrics, slots, dayOffset)
      const daySlots = slots.filter(s => s.dayOffset === dayOffset)
      for (const draft of drafts) {
        const slot = daySlots.find(s => s.platform === draft.platform)
        if (!slot) continue
        allPosts.push({
          campaignId,
          platform: draft.platform as any,
          caption: draft.caption,
          hashtags: draft.hashtags,
          lyricSource: draft.lyricSource,
          assetNote: draft.assetNote,
          scheduledAt: slot.scheduledAt,
          dayOffset,
        })
      }
    }

    await prisma.post.createMany({ data: allPosts })
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'GENERATED' } })
    return { postCount: allPosts.length }
  } catch (err) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: 'DRAFT' } })
    throw err
  }
}
