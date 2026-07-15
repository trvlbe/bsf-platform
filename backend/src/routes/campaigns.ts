import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../lib/db.js'
import { requireAuth } from '../middleware/requireAuth.js'
import { fetchDocAsText, listFolderFiles, drivePublicUrl } from '../lib/driveClient.js'
import { createVideoJob } from '../lib/higgsfield.js'
import { parseLyricsFromRawText } from '../lib/claudeLyricsParser.js'
import { generateCampaign } from '../commands/generate.js'
import { pushCampaign } from '../commands/push.js'
import { pushPost } from '../lib/buffer.js'
import { decrypt } from '../lib/encrypt.js'
import { analyzeLyricsForBrief } from '../lib/briefAnalyzer.js'
import { analyzeMusicUrl } from '../lib/musicAnalyzer.js'

export const campaignsRouter = Router()
campaignsRouter.use(requireAuth)

const optionalUrl = z.union([z.string().url(), z.literal('')]).optional().transform(v => v || undefined)

const CreateCampaignSchema = z.object({
  title: z.string().min(1),
  artist: z.string().default(''),
  label: z.string().default(''),
  releaseDate: z.preprocess(v => (v === '' || v == null) ? new Date() : v, z.coerce.date()),
  musicUrl: optionalUrl,
  assetsFolderUrl: optionalUrl,
  platforms: z.array(z.enum(['TIKTOK', 'INSTAGRAM', 'YOUTUBE', 'FACEBOOK'])).min(1),
  brandTone: z.string().min(1),
  brandIdentity: z.string().default(''),
  creativeBrief: z.string().optional(),
  lyricsMarkdown: z.string().optional(),
  contentOrientation: z.enum(['VERTICAL', 'HORIZONTAL', 'SQUARE']).default('VERTICAL'),
  contentDuration: z.enum(['SHORT_FORM', 'MID_FORM', 'LONG_FORM']).default('SHORT_FORM'),
  contentResolution: z.enum(['1080p', '4K']).default('1080p'),
  preReleaseDays: z.number().int().min(1).max(60).default(14),
  postReleaseDays: z.number().int().min(1).max(60).default(14),
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
    const pushedCounts = await prisma.post.groupBy({
      by: ['campaignId'],
      where: { campaignId: { in: campaigns.map(c => c.id) }, bufferId: { not: null } },
      _count: { id: true }
    })
    const pushedMap = new Map(pushedCounts.map(p => [p.campaignId, p._count.id]))
    res.json(campaigns.map(c => ({ ...c, pushedCount: pushedMap.get(c.id) ?? 0 })))
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
      data: { ...parsed.data, userId: req.session.userId!, slug }
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
      data: parsed.data,
    })
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})

campaignsRouter.delete('/:id', async (req, res) => {
  try {
    const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
    await prisma.campaign.delete({ where: { id: req.params.id } })
    res.status(204).end()
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
    const [campaign, user] = await Promise.all([
      prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } }),
      prisma.user.findUnique({ where: { id: req.session.userId! } }),
    ])
    if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
    if (!user?.accessToken) { res.status(401).json({ error: 'No Drive token — sign out and sign back in with Google' }); return }

    let anthropicApiKey: string | undefined
    try {
      anthropicApiKey = user.anthropicApiKey ? decrypt(user.anthropicApiKey) : process.env.ANTHROPIC_API_KEY
    } catch {
      res.status(500).json({ error: 'Anthropic API key unreadable — re-save in Settings' }); return
    }
    if (!anthropicApiKey) { res.status(400).json({ error: 'Anthropic API key not configured — add it in Settings' }); return }

    const rawText = await fetchDocAsText(docUrl, user.accessToken)
    const lyricsMarkdown = await parseLyricsFromRawText(rawText, anthropicApiKey)
    await prisma.campaign.update({ where: { id: req.params.id }, data: { lyricsDocUrl: docUrl, lyricsMarkdown } })
    res.json({ lyricsMarkdown })
  } catch (err: any) {
    res.status(500).json({ error: 'Lyrics import failed', message: err.message })
  }
})

campaignsRouter.get('/:id/assets', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  if (!campaign.assetsFolderUrl) { res.json([]); return }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
    if (!user?.accessToken) { res.status(401).json({ error: 'No Drive token — sign out and sign back in with Google' }); return }
    const files = await listFolderFiles(campaign.assetsFolderUrl, user.accessToken)
    res.json(files)
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to list assets', message: err.message })
  }
})

campaignsRouter.post('/:id/analyze-brief', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  if (!campaign.lyricsMarkdown) { res.status(400).json({ error: 'No lyrics — import lyrics first' }); return }

  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
  let anthropicApiKey: string | undefined
  try {
    anthropicApiKey = user?.anthropicApiKey ? decrypt(user.anthropicApiKey) : process.env.ANTHROPIC_API_KEY
  } catch {
    res.status(500).json({ error: 'Anthropic API key unreadable — re-save in Settings' }); return
  }
  if (!anthropicApiKey) { res.status(400).json({ error: 'Anthropic API key not configured' }); return }

  try {
    const brief = await analyzeLyricsForBrief(campaign.lyricsMarkdown, anthropicApiKey)
    res.json({ brief })
  } catch (err: any) {
    res.status(500).json({ error: 'Analysis failed', message: err.message })
  }
})

campaignsRouter.post('/:id/generate', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  try {
    const result = await generateCampaign(req.params.id, req.session.userId!)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: 'Generate failed', message: err.message })
  }
})

campaignsRouter.post('/:id/push', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  try {
    const result = await pushCampaign(req.params.id, req.session.userId!)
    res.json(result)
  } catch (err: any) {
    res.status(500).json({ error: 'Push failed', message: err.message })
  }
})

campaignsRouter.get('/:id/posts', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const posts = await prisma.post.findMany({
    where: { campaignId: campaign.id },
    orderBy: [{ dayOffset: 'asc' }, { platform: 'asc' }]
  })
  res.json(posts)
})

campaignsRouter.get('/:id/posts/:postId', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const post = await prisma.post.findFirst({ where: { id: req.params.postId, campaignId: campaign.id } })
  if (!post) { res.status(404).json({ error: 'Post not found' }); return }
  res.json(post)
})

campaignsRouter.post('/:id/posts/:postId/generate-video', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const post = await prisma.post.findFirst({ where: { id: req.params.postId, campaignId: campaign.id } })
  if (!post) { res.status(404).json({ error: 'Post not found' }); return }
  if (!post.assetFileId) {
    res.status(400).json({ error: 'No image asset selected — pick one from the asset list first' }); return
  }
  if (!post.assetMimeType?.startsWith('image/')) {
    res.status(400).json({ error: 'Selected asset is not an image' }); return
  }
  const { prompt } = req.body as { prompt?: string }
  const motionPrompt = prompt?.trim() ||
    `Cinematic atmospheric animation. ${post.caption.replace(/[^\w\s,.!?]/g, '').slice(0, 100)}`
  try {
    const imageUrl = drivePublicUrl(post.assetFileId)
    const { requestId } = await createVideoJob(imageUrl, motionPrompt)
    const updated = await prisma.post.update({
      where: { id: post.id },
      data: { videoJobId: requestId, videoStatus: 'PENDING', videoUrl: null },
    })
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: 'Video generation failed', message: err.message })
  }
})

const UpdatePostSchema = z.object({
  caption: z.string().min(1).max(2200).optional(),
  hashtags: z.array(z.string()).optional(),
  approved: z.boolean().optional(),
  assetFileId: z.string().nullable().optional(),
  assetMimeType: z.string().nullable().optional(),
})

campaignsRouter.patch('/:id/posts/:postId', async (req, res) => {
  const parsed = UpdatePostSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  try {
    const post = await prisma.post.update({
      where: { id: req.params.postId, campaignId: campaign.id },
      data: parsed.data,
    })
    res.json(post)
  } catch (err: any) {
    res.status(500).json({ error: 'Internal error', message: err.message })
  }
})

campaignsRouter.post('/:id/posts/:postId/push', async (req, res) => {
  const campaign = await prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } })
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  const post = await prisma.post.findFirst({ where: { id: req.params.postId, campaignId: campaign.id } })
  if (!post) { res.status(404).json({ error: 'Post not found' }); return }
  if (!post.approved) { res.status(409).json({ error: 'Post must be approved before pushing' }); return }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })

    let accessToken: string | undefined
    try {
      accessToken = user?.bufferAccessToken
        ? decrypt(user.bufferAccessToken)
        : process.env.BUFFER_ACCESS_TOKEN
    } catch {
      throw new Error('Buffer access token is unreadable — please re-save it in Settings')
    }
    if (!accessToken) throw new Error('Buffer access token not configured — add it in Settings')

    const platformMap: Record<string, string | undefined> = {
      TIKTOK: (() => {
        try { return user?.bufferProfileTiktok ? decrypt(user.bufferProfileTiktok) : process.env.BUFFER_PROFILE_TIKTOK } catch { return process.env.BUFFER_PROFILE_TIKTOK }
      })(),
      INSTAGRAM: (() => {
        try { return user?.bufferProfileInstagram ? decrypt(user.bufferProfileInstagram) : process.env.BUFFER_PROFILE_INSTAGRAM } catch { return process.env.BUFFER_PROFILE_INSTAGRAM }
      })(),
      YOUTUBE: (() => {
        try { return user?.bufferProfileYoutube ? decrypt(user.bufferProfileYoutube) : process.env.BUFFER_PROFILE_YOUTUBE } catch { return process.env.BUFFER_PROFILE_YOUTUBE }
      })(),
      FACEBOOK: (() => {
        try { return user?.bufferProfileFacebook ? decrypt(user.bufferProfileFacebook) : process.env.BUFFER_PROFILE_FACEBOOK } catch { return process.env.BUFFER_PROFILE_FACEBOOK }
      })(),
    }
    const profileIds: Record<string, string> = {}
    for (const [platform, id] of Object.entries(platformMap)) {
      if (id) profileIds[platform] = id
    }

    const bufferId = await pushPost(post, accessToken, profileIds)
    const updated = await prisma.post.update({ where: { id: post.id }, data: { bufferId } })
    res.json(updated)
  } catch (err: any) {
    res.status(500).json({ error: 'Push failed', message: err.message })
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

campaignsRouter.post('/:id/analyze-music', async (req, res) => {
  const [campaign, user] = await Promise.all([
    prisma.campaign.findFirst({ where: { id: req.params.id, userId: req.session.userId! } }),
    prisma.user.findUnique({ where: { id: req.session.userId! } }),
  ])
  if (!campaign) { res.status(404).json({ error: 'Not found' }); return }
  if (!campaign.musicUrl) { res.status(400).json({ error: 'No music URL — add one in campaign settings' }); return }
  if (!user?.accessToken) { res.status(401).json({ error: 'No Drive token — sign out and sign in again' }); return }

  let anthropicApiKey: string | undefined
  try {
    anthropicApiKey = user.anthropicApiKey ? decrypt(user.anthropicApiKey) : process.env.ANTHROPIC_API_KEY
  } catch {
    res.status(500).json({ error: 'Anthropic API key unreadable — re-save in Settings' }); return
  }
  if (!anthropicApiKey) { res.status(400).json({ error: 'Anthropic API key not configured — add it in Settings' }); return }

  try {
    const analysis = await analyzeMusicUrl(campaign.musicUrl, user.accessToken, anthropicApiKey, campaign.lyricsMarkdown)
    await prisma.campaign.update({ where: { id: req.params.id }, data: { songAnalysis: analysis as any } })
    res.json(analysis)
  } catch (err: any) {
    res.status(500).json({ error: 'Music analysis failed', message: err.message })
  }
})
