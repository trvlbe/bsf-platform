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

// Import app AFTER the mock is registered
const { app } = await import('../app.js')

let testUserId: string
let testCampaignId: string
let testPostId: string

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
      scheduledAt: new Date('2026-09-01'),
      dayOffset: 0,
    },
  })
  testPostId = post.id
})

afterAll(async () => {
  await prisma.post.deleteMany({ where: { campaignId: testCampaignId } })
  await prisma.campaign.deleteMany({ where: { id: testCampaignId } })
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
