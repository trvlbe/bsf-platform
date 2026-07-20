import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import request from 'supertest'
import { prisma } from '../lib/db.js'

// Mock requireAuth so tests don't need a real Google OAuth session
vi.mock('../middleware/requireAuth.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.session = req.session ?? {}
    req.session.userId = (globalThis as any).__testUserId__
    next()
  },
}))

// Mock Buffer API so push tests don't hit the real Buffer service
vi.mock('../lib/buffer.js', () => ({
  pushPost: vi.fn().mockResolvedValue('fake-buffer-id-123'),
}))

// Mock musicAnalyzer to avoid dependency on music-metadata package in test envs
vi.mock('../lib/musicAnalyzer.js', () => ({
  analyzeMusicUrl: vi.fn().mockResolvedValue({ tempo: 120, mood: 'energetic' }),
}))

// Import app AFTER the mock is registered
const { app } = await import('../app.js')

let testUserId: string
let testCampaignId: string
let testPostId: string

// Push-guard test fixtures
let pushCampaignId: string
let approvedPostId: string
let unapprovedPostId: string
let notStartedGatePostId: string
let pendingGatePostId: string
let readyGatePostId: string

beforeAll(async () => {
  // Find or create a test user
  let user = await prisma.user.findFirst({ where: { email: 'approve-test@bsf.test' } })
  if (!user) {
    user = await prisma.user.create({
      data: {
        googleId: 'approve-test-google-id',
        email: 'approve-test@bsf.test',
        name: 'Approve Test User',
      },
    })
  }
  testUserId = user.id
  ;(globalThis as any).__testUserId__ = testUserId

  // Create a test campaign
  const campaign = await prisma.campaign.create({
    data: {
      userId: testUserId,
      slug: 'approve-test-campaign',
      title: 'Approve Test Campaign',
      artist: 'Test Artist',
      label: 'Test Label',
      releaseDate: new Date('2026-09-01'),
      platforms: ['TIKTOK'],
      brandTone: 'test',
      brandIdentity: 'test',
    },
  })
  testCampaignId = campaign.id

  // Create a test post
  const post = await prisma.post.create({
    data: {
      campaignId: testCampaignId,
      platform: 'TIKTOK',
      caption: 'Test caption',
      hashtags: ['#test'],
      lyricSource: 'Test lyric quote',
      assetNote: 'Test asset note',
      directionBrief: 'Test direction brief',
      scheduledAt: new Date('2026-09-01'),
      dayOffset: 0,
      editorStatus: 'READY',
    },
  })
  testPostId = post.id

  // --- Push-guard fixtures ---
  // Set env vars so pushCampaign can resolve a token + profile without a real user token
  process.env.BUFFER_ACCESS_TOKEN = 'test-buffer-token'
  process.env.BUFFER_CHANNEL_TIKTOK = 'test-tiktok-profile-id'

  const pushCampaign = await prisma.campaign.create({
    data: {
      userId: testUserId,
      slug: 'push-guard-test-campaign',
      title: 'Push Guard Test Campaign',
      artist: 'Push Artist',
      label: 'Push Label',
      releaseDate: new Date('2026-10-01'),
      platforms: ['TIKTOK'],
      brandTone: 'test',
      brandIdentity: 'test',
    },
  })
  pushCampaignId = pushCampaign.id

  const approvedPost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Approved post caption',
      hashtags: ['#approved'],
      lyricSource: 'Approved lyric quote',
      assetNote: 'Approved asset note',
      directionBrief: 'Approved direction brief',
      scheduledAt: new Date('2026-10-01'),
      dayOffset: 0,
      approved: true,
    },
  })
  approvedPostId = approvedPost.id

  const unapprovedPost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Unapproved post caption',
      hashtags: ['#unapproved'],
      lyricSource: 'Unapproved lyric quote',
      assetNote: 'Unapproved asset note',
      directionBrief: 'Unapproved direction brief',
      scheduledAt: new Date('2026-10-02'),
      dayOffset: 1,
      approved: false,
    },
  })
  unapprovedPostId = unapprovedPost.id

  const notStartedGatePost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Gate test — not started',
      hashtags: ['#gate'],
      lyricSource: 'Gate lyric',
      assetNote: 'Gate asset note',
      directionBrief: 'Gate direction brief',
      scheduledAt: new Date('2026-10-03'),
      dayOffset: 2,
      editorStatus: 'NOT_STARTED',
    },
  })
  notStartedGatePostId = notStartedGatePost.id

  const pendingGatePost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Gate test — pending',
      hashtags: ['#gate'],
      lyricSource: 'Gate lyric',
      assetNote: 'Gate asset note',
      directionBrief: 'Gate direction brief',
      scheduledAt: new Date('2026-10-04'),
      dayOffset: 3,
      editorStatus: 'PENDING',
    },
  })
  pendingGatePostId = pendingGatePost.id

  const readyGatePost = await prisma.post.create({
    data: {
      campaignId: pushCampaignId,
      platform: 'TIKTOK',
      caption: 'Gate test — ready',
      hashtags: ['#gate'],
      lyricSource: 'Gate lyric',
      assetNote: 'Gate asset note',
      directionBrief: 'Gate direction brief',
      scheduledAt: new Date('2026-10-05'),
      dayOffset: 4,
      editorStatus: 'READY',
    },
  })
  readyGatePostId = readyGatePost.id
})

afterAll(async () => {
  await prisma.post.deleteMany({ where: { campaignId: testCampaignId } })
  await prisma.campaign.deleteMany({ where: { id: testCampaignId } })
  await prisma.post.deleteMany({ where: { campaignId: pushCampaignId } })
  await prisma.campaign.deleteMany({ where: { id: pushCampaignId } })
  await prisma.user.deleteMany({ where: { email: 'approve-test@bsf.test' } })
})

describe('PATCH /api/campaigns/:id/posts/:postId — approved field', () => {
  it('PATCH /api/campaigns/:id/posts/:postId accepts approved field', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${testCampaignId}/posts/${testPostId}`)
      .send({ approved: true })
    expect(res.status).toBe(200)
    expect(res.body.approved).toBe(true)
  })

  it('PATCH sets approved to false when sent false', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${testCampaignId}/posts/${testPostId}`)
      .send({ approved: false })
    expect(res.status).toBe(200)
    expect(res.body.approved).toBe(false)
  })
})

describe('POST /api/campaigns/:id/push — push guard (approved only)', () => {
  it('only pushes approved posts; unapproved posts are skipped', async () => {
    const res = await request(app)
      .post(`/api/campaigns/${pushCampaignId}/push`)
    expect(res.status).toBe(200)

    // Only 1 post was approved, so pushed count must be exactly 1
    expect(res.body.pushed).toBe(1)

    // Approved post must have received a bufferId
    const approved = await prisma.post.findUnique({ where: { id: approvedPostId } })
    expect(approved?.bufferId).not.toBeNull()

    // Unapproved post must still have bufferId === null
    const unapproved = await prisma.post.findUnique({ where: { id: unapprovedPostId } })
    expect(unapproved?.bufferId).toBeNull()
  })
})

describe('POST /api/campaigns/:id/posts/:postId/push — single-post approved guard', () => {
  it('rejects push of unapproved post with 409', async () => {
    const unapprovedPost = await prisma.post.create({
      data: {
        campaignId: testCampaignId,
        platform: 'INSTAGRAM',
        caption: 'Unapproved caption',
        hashtags: [],
        lyricSource: 'test lyric',
        assetNote: 'test note',
        directionBrief: 'test direction brief',
        scheduledAt: new Date(),
        dayOffset: 99,
        approved: false,
      },
    })

    const res = await request(app)
      .post(`/api/campaigns/${testCampaignId}/posts/${unapprovedPost.id}/push`)

    expect(res.status).toBe(409)
    expect(res.body.error).toMatch(/approved/)

    // bufferId must still be null
    const stillUnapproved = await prisma.post.findUnique({ where: { id: unapprovedPost.id } })
    expect(stillUnapproved?.bufferId).toBeNull()

    // Cleanup
    await prisma.post.delete({ where: { id: unapprovedPost.id } })
  })
})

describe('PATCH /api/campaigns/:id/posts/:postId — approve gate on editorStatus', () => {
  it('400s when approving a post with editorStatus NOT_STARTED', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${notStartedGatePostId}`)
      .send({ approved: true })
    expect(res.status).toBe(400)
  })

  it('400s when approving a post with editorStatus PENDING', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${pendingGatePostId}`)
      .send({ approved: true })
    expect(res.status).toBe(400)
  })

  it('succeeds when approving a post with editorStatus READY', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${readyGatePostId}`)
      .send({ approved: true })
    expect(res.status).toBe(200)
    expect(res.body.approved).toBe(true)
  })

  it('does not require editorStatus when approved is not in the request body', async () => {
    const res = await request(app)
      .patch(`/api/campaigns/${pushCampaignId}/posts/${notStartedGatePostId}`)
      .send({ caption: 'just a caption edit' })
    expect(res.status).toBe(200)
  })
})

describe('POST /api/campaigns/:id/push — pushError persistence', () => {
  it('clears pushError on a successful push and sets it on a failed one', async () => {
    const { pushPost } = await import('../lib/buffer.js')

    // readyGatePostId was approved earlier in this file with bufferId still
    // null — exclude it here so it doesn't compete with failingPost for the
    // single queued mock rejection/resolution below.
    await prisma.post.update({ where: { id: readyGatePostId }, data: { bufferId: 'pre-existing-buffer-id' } })

    const failingPost = await prisma.post.create({
      data: {
        campaignId: pushCampaignId,
        platform: 'TIKTOK',
        caption: 'Will fail to push',
        hashtags: ['#fail'],
        lyricSource: 'Fail lyric',
        assetNote: 'Fail asset note',
        directionBrief: 'Fail direction brief',
        scheduledAt: new Date('2026-10-06'),
        dayOffset: 5,
        approved: true,
      },
    })

    ;(pushPost as any).mockRejectedValueOnce(new Error('Invalid channel id'))
    await request(app).post(`/api/campaigns/${pushCampaignId}/push`)

    const failed = await prisma.post.findUnique({ where: { id: failingPost.id } })
    expect(failed?.pushError).toBe('Invalid channel id')
    expect(failed?.bufferId).toBeNull()

    ;(pushPost as any).mockResolvedValueOnce('buffer-post-999')
    await request(app).post(`/api/campaigns/${pushCampaignId}/push`)

    const succeeded = await prisma.post.findUnique({ where: { id: failingPost.id } })
    expect(succeeded?.pushError).toBeNull()
    expect(succeeded?.bufferId).toBe('buffer-post-999')

    await prisma.post.delete({ where: { id: failingPost.id } })
  })
})
