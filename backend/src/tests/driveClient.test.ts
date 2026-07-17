import { describe, it, expect, vi, beforeEach } from 'vitest'

let tokensListener: ((tokens: { access_token?: string }) => void) | undefined

vi.mock('googleapis', () => ({
  google: {
    auth: {
      OAuth2: vi.fn().mockImplementation(() => ({
        setCredentials: vi.fn(),
        on: vi.fn((event: string, cb: (tokens: { access_token?: string }) => void) => {
          if (event === 'tokens') tokensListener = cb
        }),
      })),
    },
    drive: vi.fn().mockReturnValue({}),
  },
}))

vi.mock('../lib/db.js', () => ({
  prisma: { user: { update: vi.fn().mockResolvedValue({}) } },
}))

beforeEach(() => {
  vi.clearAllMocks()
  tokensListener = undefined
  process.env.GOOGLE_CLIENT_ID = 'client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
})

describe('getDriveClient', () => {
  it('configures OAuth2 with the app client ID/secret and both access + refresh tokens', async () => {
    const { google } = await import('googleapis')
    const { getDriveClient } = await import('../lib/driveClient.js')
    getDriveClient({ id: 'user-1', accessToken: 'access-tok', refreshToken: 'refresh-tok' })
    expect(google.auth.OAuth2).toHaveBeenCalledWith('client-id', 'client-secret')
    const instance = (google.auth.OAuth2 as any).mock.results[0].value
    expect(instance.setCredentials).toHaveBeenCalledWith({ access_token: 'access-tok', refresh_token: 'refresh-tok' })
  })

  it('passes undefined refresh_token when the user has none stored', async () => {
    const { google } = await import('googleapis')
    const { getDriveClient } = await import('../lib/driveClient.js')
    getDriveClient({ id: 'user-1', accessToken: 'access-tok', refreshToken: null })
    const instance = (google.auth.OAuth2 as any).mock.results[0].value
    expect(instance.setCredentials).toHaveBeenCalledWith({ access_token: 'access-tok', refresh_token: undefined })
  })

  it('persists a refreshed access token to the database when Google issues one', async () => {
    const { prisma } = await import('../lib/db.js')
    const { getDriveClient } = await import('../lib/driveClient.js')
    getDriveClient({ id: 'user-1', accessToken: 'access-tok', refreshToken: 'refresh-tok' })
    expect(tokensListener).toBeDefined()
    tokensListener!({ access_token: 'new-access-tok' })
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { accessToken: 'new-access-tok' } })
  })

  it('does not touch the database when the tokens event has no access_token', async () => {
    const { prisma } = await import('../lib/db.js')
    const { getDriveClient } = await import('../lib/driveClient.js')
    getDriveClient({ id: 'user-1', accessToken: 'access-tok', refreshToken: 'refresh-tok' })
    tokensListener!({})
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})
