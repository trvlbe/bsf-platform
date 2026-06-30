const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${res.status} ${path}`)
  return res.json() as Promise<T>
}

export const api = {
  getMe: () => req<{ id: string; email: string; name: string; avatarUrl: string | null }>('/auth/me').catch(() => null),
  logout: () => req<void>('/auth/logout', { method: 'POST' }),

  getCampaigns: () => req<any[]>('/campaigns'),
  createCampaign: (data: any) => req<any>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  getCampaign: (id: string) => req<any>(`/campaigns/${id}`),
  updateCampaign: (id: string, data: any) => req<any>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  importLyrics: (id: string, docUrl: string) => req<{ lyricsMarkdown: string }>(`/campaigns/${id}/lyrics`, { method: 'POST', body: JSON.stringify({ docUrl }) }),
  generateCampaign: (id: string) => req<{ postCount: number }>(`/campaigns/${id}/generate`, { method: 'POST' }),
  pushCampaign: (id: string) => req<{ pushed: number; skipped: number }>(`/campaigns/${id}/push`, { method: 'POST' }),
  getCampaignStatus: (id: string) => req<any>(`/campaigns/${id}/status`),
  getPosts: (id: string) => req<any[]>(`/campaigns/${id}/posts`),
  updatePost: (campaignId: string, postId: string, data: any) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  pushPost: (campaignId: string, postId: string) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}/push`, { method: 'POST' }),

  fetchDriveDoc: (url: string) => req<{ text: string }>(`/drive/doc?url=${encodeURIComponent(url)}`),
}
