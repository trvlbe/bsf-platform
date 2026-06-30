import { Router } from 'express'
import passport from '../lib/passport.js'

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
    req.session.userId = (req.user as any).id
    res.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5174'}/dashboard`)
  }
)

authRouter.get('/me', (req, res) => {
  if (!req.session.userId || !req.user) {
    res.status(401).json({ error: 'Not authenticated' })
    return
  }
  const user = req.user as any
  res.json({ id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl })
})

authRouter.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }))
})
