import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { app } from '../src/app.js'

describe('auth routes', () => {
  it('GET /auth/me returns 401 when not logged in', async () => {
    const res = await request(app).get('/auth/me')
    expect(res.status).toBe(401)
    expect(res.body).toHaveProperty('error')
  })

  it('GET /auth/google redirects to Google', async () => {
    const res = await request(app).get('/auth/google')
    expect(res.status).toBe(302)
    expect(res.headers.location).toContain('accounts.google.com')
  })

  it('POST /auth/logout returns 200', async () => {
    const res = await request(app).post('/auth/logout')
    expect(res.status).toBe(200)
  })
})
