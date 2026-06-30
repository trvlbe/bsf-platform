import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { fetchDocAsText } from '../lib/driveClient.js'
import { parseLyricsFromRawText } from '../lib/claudeLyricsParser.js'

export const campaignsRouter = Router()
campaignsRouter.use(requireAuth)

const CreateCampaignSchema = z.object({
  title: z.string().min(1),
  artist: z.string().min(1),
  label: z.string().min(1),
  releaseDate: z.string().datetime(),
  spotifyUrl: z.string().url().optional(),
  platforms: z.array(z.enum(['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK'])).min(1),
  brandTone: z.string().min(1),
  brandIdentity: z.string().min(1),
  preReleaseDays: z.number().int().default(14),
  postReleaseDays: z.number().int().default(14),
  videoEnabled: z.boolean().default(false),
  videoStyle: z.string().optional(),
})

const UpdateCampaignSchema = CreateCampaignSchema.partial()

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

campaignsRouter.get('/', async (req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { userId: req.session.userId! },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { posts: true } } }
    })
    res.json(campaigns)
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})

campaignsRouter.post('/', async (req, res) => {
  const parsed = CreateCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const slug = slugify(parsed.data.title)
    const campaign = await prisma.campaign.create({
      data: { ...parsed.data, userId: req.session.userId!, slug, releaseDate: new Date(parsed.data.releaseDate) }
    })
    res.status(201).json(campaign)
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})

campaignsRouter.get('/:id', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, userId: req.session.userId! },
      include: { arc: true, _count: { select: { posts: true } } }
    })
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
    const pushedCount = await prisma.post.count({ where: { campaignId: campaign.id, bufferId: { not: null } } })
    res.json({ ...campaign, pushedCount })
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})

campaignsRouter.patch('/:id', async (req, res) => {
  const parsed = UpdateCampaignSchema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() })
    return
  }
  try {
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
    const updated = await prisma.campaign.update({
      where: { id: req.params.id },
      data: parsed.data.releaseDate ? { ...parsed.data, releaseDate: new Date(parsed.data.releaseDate) } : parsed.data,
    })
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})

campaignsRouter.post('/:id/lyrics', async (req, res) => {
  const lyricsBodyParsed = z.object({ docUrl: z.string().url() }).safeParse(req.body)
  if (!lyricsBodyParsed.success) {
    res.status(400).json({ error: lyricsBodyParsed.error.flatten() })
    return
  }
  try {
    const { docUrl } = lyricsBodyParsed.data
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
    const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
    if (!user?.accessToken) { res.status(401).json({ error: 'No Drive token' }); return }
    const rawText = await fetchDocAsText(docUrl, user.accessToken)
    const lyricsMarkdown = await parseLyricsFromRawText(rawText)
    await prisma.campaign.update({ where: { id: req.params.id }, data: { lyricsDocUrl: docUrl, lyricsMarkdown } })
    res.json({ lyricsMarkdown })
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})

campaignsRouter.get('/:id/status', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
    const postCount = await prisma.post.count({ where: { campaignId: campaign.id } })
    const pushedCount = await prisma.post.count({ where: { campaignId: campaign.id, bufferId: { not: null } } })
    const pendingVideoCount = await prisma.post.count({ where: { campaignId: campaign.id, videoStatus: 'PENDING' } })
    res.json({ status: campaign.status, postCount, pushedCount, pendingVideoCount })
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})
