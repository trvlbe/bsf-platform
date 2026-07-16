import { prisma } from './db.js'

const API_BASE = 'https://platform.higgsfield.ai'

function headers(): Record<string, string> {
  const key = process.env.HIGGSFIELD_API_KEY
  const secret = process.env.HIGGSFIELD_API_SECRET
  if (!key || !secret) throw new Error('HIGGSFIELD_API_KEY and HIGGSFIELD_API_SECRET must be set')
  return {
    Authorization: `Key ${key}:${secret}`,
    'Content-Type': 'application/json',
  }
}

export async function createVideoJob(
  imageUrl: string,
  prompt: string,
  model = 'dopamine-xl',
): Promise<{ requestId: string }> {
  const res = await fetch(`${API_BASE}/v1/image2video/dop`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      model,
      params: {
        prompt,
        input_images: [{ type: 'image_url', image_url: imageUrl }],
      },
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Higgsfield createJob ${res.status}: ${text}`)
  }
  const data = await res.json() as { request_id: string; status: string }
  return { requestId: data.request_id }
}

export async function checkJobStatus(requestId: string): Promise<{ status: string; videoUrl?: string }> {
  const res = await fetch(`${API_BASE}/requests/${requestId}/status`, { headers: headers() })
  if (!res.ok) throw new Error(`Higgsfield status ${res.status}`)
  const data = await res.json() as { status: string; video?: { url: string } }
  return {
    status: data.status,
    videoUrl: data.video?.url,
  }
}

export async function pollAllPendingPosts(): Promise<void> {
  const pending = await prisma.post.findMany({
    where: { videoStatus: { in: ['PENDING', 'PROCESSING'] }, videoJobId: { not: null } },
  })
  for (const post of pending) {
    try {
      const { status, videoUrl } = await checkJobStatus(post.videoJobId!)
      if (status === 'completed' && videoUrl) {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'READY', videoUrl, editorStatus: 'READY' } })
      } else if (status === 'failed' || status === 'nsfw') {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'FAILED', editorStatus: 'FAILED' } })
      } else if (status === 'in_progress') {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'PROCESSING' } })
      }
    } catch {
      // log but don't crash the poll loop
    }
  }
}
