import { describe, it, expect, vi, beforeEach } from 'vitest'
import express from 'express'
import request from 'supertest'

const mockCampaign = { id: 'camp-1', userId: 'user-1', assetsFolderUrl: 'https://drive.google.com/drive/folders/abc', songAnalysis: null, lyricsMarkdown: null }
const mockUser = { id: 'user-1', accessToken: 'drive-token', anthropicApiKey: null }
const basePost = {
  id: 'post-1', campaignId: 'camp-1', caption: 'c', hashtags: [], lyricSource: 'lyric',
  directionBrief: 'brief', directionAccepted: new Date().toISOString(), editorStatus: 'NOT_STARTED',
}

const mockUpdate = vi.fn().mockImplementation(({ data }) => Promise.resolve({ ...basePost, ...data }))

vi.mock('../lib/db.js', () => ({
  prisma: {
    campaign: { findFirst: vi.fn().mockResolvedValue(mockCampaign) },
    user: { findUnique: vi.fn().mockResolvedValue(mockUser) },
    post: { findFirst: vi.fn().mockResolvedValue(basePost), update: mockUpdate },
  },
}))
vi.mock('../lib/driveClient.js', () => ({
  listFolderFiles: vi.fn().mockResolvedValue([{ id: 'file-1', name: 'a.jpg', mimeType: 'image/jpeg', webViewLink: 'x' }]),
  drivePublicUrl: vi.fn().mockReturnValue('https://drive.example/file-1'),
  fetchDocAsText: vi.fn(),
}))
vi.mock('../lib/higgsfield.js', () => ({
  createVideoJob: vi.fn().mockResolvedValue({ requestId: 'job-1' }),
}))
vi.mock('../agents/editorAgent.js', () => ({
  runEditorAgent: vi.fn(),
}))

const { campaignsRouter } = await import('../routes/campaigns.js')
const { runEditorAgent } = await import('../agents/editorAgent.js')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use((req, _res, next) => { req.session = { userId: 'user-1' } as any; next() })
  app.use('/campaigns', campaignsRouter)
  return app
}

beforeEach(() => { vi.clearAllMocks(); process.env.ANTHROPIC_API_KEY = 'env-key' })

describe('POST /:id/posts/:postId/send-to-editor', () => {
  it('400s when directionAccepted is not set', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValueOnce({ ...basePost, directionAccepted: null })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(400)
  })

  it('sets editorStatus READY with no video job when the agent picks no asset', async () => {
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: null, motionPrompt: null, reasoning: 'no fit' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('READY')
    expect(res.body.assetFileId).toBeNull()
  })

  it('calls createVideoJob and sets editorStatus/videoStatus PENDING when the agent picks an asset', async () => {
    const { createVideoJob } = await import('../lib/higgsfield.js')
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: 'file-1', motionPrompt: 'slow zoom', reasoning: 'good fit' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(createVideoJob).toHaveBeenCalledWith('https://drive.example/file-1', 'slow zoom')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('PENDING')
    expect(res.body.videoStatus).toBe('PENDING')
    expect(res.body.assetFileId).toBe('file-1')
  })

  it('sets editorStatus FAILED when the agent call throws', async () => {
    ;(runEditorAgent as any).mockRejectedValue(new Error('rate limited'))
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('FAILED')
  })

  it('sets editorStatus FAILED when createVideoJob throws', async () => {
    const { createVideoJob } = await import('../lib/higgsfield.js')
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: 'file-1', motionPrompt: 'slow zoom', reasoning: 'good fit' })
    ;(createVideoJob as any).mockRejectedValueOnce(new Error('bad credentials'))
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('FAILED')
  })

  it('sets editorStatus FAILED when the agent chooses an assetFileId not in the campaign asset list', async () => {
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: 'file-does-not-exist', motionPrompt: 'slow zoom', reasoning: 'good fit' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(200)
    expect(res.body.editorStatus).toBe('FAILED')
  })

  it('400s when the campaign has no image assets (folder returns none)', async () => {
    const { listFolderFiles } = await import('../lib/driveClient.js')
    ;(listFolderFiles as any).mockResolvedValueOnce([])
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(400)
    expect(runEditorAgent).not.toHaveBeenCalled()
  })

  it('400s when the campaign has no assetsFolderUrl configured', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.campaign.findFirst as any).mockResolvedValueOnce({ ...mockCampaign, assetsFolderUrl: '' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/send-to-editor')
    expect(res.status).toBe(400)
    expect(runEditorAgent).not.toHaveBeenCalled()
  })
})

describe('POST /:id/posts/:postId/regenerate', () => {
  it('400s when editorStatus is NOT_STARTED (no prior attempt)', async () => {
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(400)
  })

  it('400s when editorStatus is PENDING (attempt in flight)', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValueOnce({ ...basePost, editorStatus: 'PENDING' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(400)
  })

  it('reruns the editor agent with feedback when editorStatus is READY', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValue({ ...basePost, editorStatus: 'READY', editorPrompt: 'slow zoom' })
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: 'file-1', motionPrompt: 'handheld pan', reasoning: 'more movement' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({ feedback: 'Too static' })
    expect(res.status).toBe(200)
    expect(runEditorAgent).toHaveBeenCalledWith(expect.objectContaining({ feedback: 'Too static', previousPrompt: 'slow zoom' }), expect.any(String))
  })

  it('reruns when editorStatus is FAILED', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValue({ ...basePost, editorStatus: 'FAILED' })
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: null, motionPrompt: null, reasoning: 'ok' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(200)
  })

  it('400s when the campaign has no image assets (folder returns none)', async () => {
    const { listFolderFiles } = await import('../lib/driveClient.js')
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValue({ ...basePost, editorStatus: 'READY' })
    ;(listFolderFiles as any).mockResolvedValueOnce([])
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(400)
    expect(runEditorAgent).not.toHaveBeenCalled()
  })

  it('clears a stale video when regenerating into a caption-only decision', async () => {
    const { prisma } = await import('../lib/db.js')
    ;(prisma.post.findFirst as any).mockResolvedValue({
      ...basePost,
      editorStatus: 'READY',
      videoUrl: 'https://old-video.mp4',
      videoStatus: 'READY',
    })
    ;(runEditorAgent as any).mockResolvedValue({ assetFileId: null, motionPrompt: null, reasoning: 'caption only now' })
    const res = await request(buildApp()).post('/campaigns/camp-1/posts/post-1/regenerate').send({})
    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ videoUrl: null, videoStatus: null, videoJobId: null }),
    }))
  })
})
