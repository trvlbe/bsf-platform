import { prisma } from './db.js'

const API_BASE = 'https://api.higgsfield.ai/v1'

function headers() {
  return { Authorization: `Bearer ${process.env.HIGGSFIELD_API_KEY!}`, 'Content-Type': 'application/json' }
}

export async function checkJobStatus(jobId: string): Promise<{ status: string; downloadUrl?: string }> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { headers: headers() })
  if (!res.ok) throw new Error(`Higgsfield API ${res.status}`)
  const data = await res.json() as { status: string; download_url?: string }
  return { status: data.status, downloadUrl: data.download_url }
}

export async function pollAllPendingPosts(): Promise<void> {
  const pending = await prisma.post.findMany({ where: { videoStatus: 'PENDING', videoJobId: { not: null } } })
  for (const post of pending) {
    try {
      const { status, downloadUrl } = await checkJobStatus(post.videoJobId!)
      if (status === 'ready' && downloadUrl) {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'READY', videoUrl: downloadUrl } })
      } else if (status === 'failed') {
        await prisma.post.update({ where: { id: post.id }, data: { videoStatus: 'FAILED' } })
      }
    } catch {
      // log but don't crash loop
    }
  }
}
