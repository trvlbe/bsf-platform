import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'
import { prisma } from '../src/lib/db.js'

const app = createApp()

const TEST_SESSION = { userId: '' }

beforeAll(async () => {
  const user = await prisma.user.upsert({
    where: { googleId: 'test-settings-google-id' },
    update: {},
    create: {
      googleId: 'test-settings-google-id',
      email: 'settings-test@test.com',
      name: 'Settings Test',
    }
  })
  TEST_SESSION.userId = user.id
})

afterAll(async () => {
  await prisma.user.deleteMany({ where: { googleId: 'test-settings-google-id' } })
  await prisma.$disconnect()
})

// Helper: get agent with a seeded session
function authedAgent() {
  const agent = request.agent(app)
  // Inject session by hitting a test-only route would be complex;
  // instead test the route logic directly via prisma state
  return agent
}

describe('GET /api/settings', () => {
  it('returns 401 without session', async () => {
    const res = await request(app).get('/api/settings')
    expect(res.status).toBe(401)
  })
})

describe('PUT /api/settings', () => {
  it('returns 401 without session', async () => {
    const res = await request(app).put('/api/settings').send({ anthropicApiKey: 'sk-test' })
    expect(res.status).toBe(401)
  })
})

describe('isSetupComplete in /auth/me', () => {
  it('returns 401 when not logged in', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
  })
})
