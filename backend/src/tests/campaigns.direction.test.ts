import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const mockCampaign = { id: 'camp-1', userId: 'user-1' }
const mockPost = { id: 'post-1', campaignId: 'camp-1', caption: 'orig', hashtags: [], directionBrief: 'orig brief', directionAccepted: null }

vi.mock('../lib/db.js', () => ({
  prisma: {
    campaign: { findFirst: vi.fn().mockResolvedValue(mockCampaign) },
    post: {
      findFirst: vi.fn().mockResolvedValue(mockPost),
      update: vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...mockPost, ...data, directionAccepted: new Date().toISOString() })),
    },
  },
}))

const { campaignsRouter } = await import('../routes/campaigns.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.session = { userId: 'user-1' } as any; next() })
  app.use('/campaigns', campaignsRouter)
  return app
}

beforeEach(() => vi.clearAllMocks())

describe('PATCH /:id/posts/:postId/direction', () => {
  it('accepts as-is with an empty body and sets directionAccepted', async () => {
    const res = await request(buildApp()).patch('/campaigns/camp-1/posts/post-1/direction').send({})
    expect(res.status).toBe(200)
    expect(res.body.directionAccepted).toBeTruthy()
  })

  it('saves edited fields and sets directionAccepted', async () => {
    const res = await request(buildApp()).patch('/campaigns/camp-1/posts/post-1/direction').send({ caption: 'edited', directionBrief: 'edited brief' })
    expect(res.status).toBe(200)
    expect(res.body.caption).toBe('edited')
    expect(res.body.directionBrief).toBe('edited brief')
    expect(res.body.directionAccepted).toBeTruthy()
  })

  it('404s when the campaign does not belong to the user', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.campaign.findFirst as any).mockResolvedValueOnce(null)
    const res = await request(buildApp()).patch('/campaigns/camp-1/posts/post-1/direction').send({})
    expect(res.status).toBe(404)
  })
})
