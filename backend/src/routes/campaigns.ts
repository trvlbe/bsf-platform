import { Router } from 'express'
import { requireAuth } from '../middleware/requireAuth.js'

export const campaignsRouter = Router()
campaignsRouter.get('/', requireAuth, (_req, res) => {
  res.json({ campaigns: [] })
})
