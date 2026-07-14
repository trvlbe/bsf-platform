import { Router } from 'express'
import passport from '../lib/passport.js'
import { prisma } from '../lib/db.js'

export const authRouter = Router()

authRouter.get('/google',
  passport.authenticate('google', {
    scope: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/drive.readonly'],
    accessType: 'offline',
    prompt: 'consent',
  })
)

authRouter.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login?error=oauth' }),
  (req, res) => {
    req.session.userId = req.user!.id
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/dashboard`)
  }
)

authRouter.get('/me', async (req, res) => {
  if (!req.session.userId || !req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId } })
  if (!user) { res.status(401).json({ error: 'Not authenticated' }); return }
  const { id, email, name, avatarUrl } = req.user
  res.json({
    id, email, name, avatarUrl,
    isSetupComplete: !!(user.anthropicApiKey),
  })
})

authRouter.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('Session destroy error on logout:', err)
    res.json({ ok: true })
  })
})
