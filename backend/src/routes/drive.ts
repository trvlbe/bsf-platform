import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { fetchDocAsText, getFileMetadata } from '../lib/driveClient.js'
import { parseLyricsFromRawText } from '../lib/claudeLyricsParser.js'
import { prisma } from '../lib/db.js'

export const driveRouter = Router()

driveRouter.use(requireAuth)

driveRouter.get('/doc', async (req, res) => {
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url query param required' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
  if (!user?.accessToken) {
    res.status(401).json({ error: 'No Drive access token — re-authenticate' })
    return
  }
  try {
    const text = await fetchDocAsText(url, user.accessToken)
    res.json({ text })
  } catch (err: any) {
    res.status(502).json({ error: 'Drive API error', message: err.message })
  }
})

driveRouter.post('/parse-lyrics', async (req, res) => {
  const parsed = z.object({ docUrl: z.string().url() }).safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
  if (!user?.accessToken) {
    res.status(401).json({ error: 'No Drive access token — re-authenticate' })
    return
  }
  try {
    const rawText = await fetchDocAsText(parsed.data.docUrl, user.accessToken)
    const lyricsMarkdown = await parseLyricsFromRawText(rawText)
    res.json({ lyricsMarkdown })
  } catch (err: any) {
    res.status(502).json({ error: 'Parse error', message: err.message })
  }
})

driveRouter.get('/file', async (req, res) => {
  const { url } = req.query
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'url query param required' })
    return
  }
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
  if (!user?.accessToken) {
    res.status(401).json({ error: 'No Drive access token' })
    return
  }
  try {
    const metadata = await getFileMetadata(url, user.accessToken)
    res.json(metadata)
  } catch (err: any) {
    res.status(502).json({ error: 'Drive API error', message: err.message })
  }
})
