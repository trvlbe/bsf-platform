import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { fetchDocAsText, getFileMetadata, getDriveClient } from '../lib/driveClient.js'
import { parseLyricsFromRawText } from '../lib/claudeLyricsParser.js'
import { decrypt } from '../lib/encrypt.js'
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
    const text = await fetchDocAsText(url, { id: user.id, accessToken: user.accessToken, refreshToken: user.refreshToken })
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
  let anthropicApiKey: string | undefined
  try {
    anthropicApiKey = user.anthropicApiKey ? decrypt(user.anthropicApiKey) : process.env.ANTHROPIC_API_KEY
  } catch {
    res.status(500).json({ error: 'Anthropic API key unreadable — re-save in Settings' }); return
  }
  if (!anthropicApiKey) { res.status(400).json({ error: 'Anthropic API key not configured — add it in Settings' }); return }

  try {
    const rawText = await fetchDocAsText(parsed.data.docUrl, { id: user.id, accessToken: user.accessToken, refreshToken: user.refreshToken })
    const lyricsMarkdown = await parseLyricsFromRawText(rawText, anthropicApiKey)
    res.json({ lyricsMarkdown })
  } catch (err: any) {
    res.status(502).json({ error: 'Parse error', message: err.message })
  }
})

driveRouter.get('/asset/:fileId', async (req, res) => {
  const { fileId } = req.params
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
  if (!user?.accessToken) {
    res.status(401).json({ error: 'No Drive token — re-authenticate' })
    return
  }
  try {
    const drive = getDriveClient({ id: user.id, accessToken: user.accessToken, refreshToken: user.refreshToken })
    const meta = await drive.files.get({ fileId, fields: 'mimeType' })
    const mimeType = meta.data.mimeType ?? 'application/octet-stream'
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Cache-Control', 'private, max-age=300')
    res.setHeader('Accept-Ranges', 'bytes')
    const fileRes = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    )
    ;(fileRes.data as any).pipe(res)
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Drive fetch error', message: err.message })
    }
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
    const metadata = await getFileMetadata(url, { id: user.id, accessToken: user.accessToken, refreshToken: user.refreshToken })
    res.json(metadata)
  } catch (err: any) {
    res.status(502).json({ error: 'Drive API error', message: err.message })
  }
})
