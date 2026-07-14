const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.message || body?.error || `${res.status} ${path}`)
  }
  return res.json() as Promise<T>
}

export interface SongSection {
  label: string
  startSecs: number | null
  durationSecs: number | null
  description: string
}

export interface SongAnalysis {
  bpm: number | null
  durationSecs: number | null
  key: string | null
  timeSignature: string | null
  sections: SongSection[]
  energyNotes: string
  hookMoment: string
  source: 'spotify' | 'drive'
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink: string
  size?: string
}

export interface SettingsResponse {
  anthropicApiKey: string | null
  bufferAccessToken: string | null
  bufferProfileTiktok: string | null
  bufferProfileInstagram: string | null
  bufferProfileYoutube: string | null
  bufferProfileFacebook: string | null
  higgsfieldApiKey: string | null
  isSetupComplete: boolean
}

export const api = {
  getMe: () => fetch('/auth/me', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
  logout: () => fetch('/auth/logout', { credentials: 'include', method: 'POST' }).then(() => undefined),

  getCampaigns: () => req<any[]>('/campaigns'),
  createCampaign: (data: any) => req<any>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  getCampaign: (id: string) => req<any>(`/campaigns/${id}`),
  updateCampaign: (id: string, data: any) => req<any>(`/campaigns/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  importLyrics: (id: string, docUrl: string) => req<{ lyricsMarkdown: string }>(`/campaigns/${id}/lyrics`, { method: 'POST', body: JSON.stringify({ docUrl }) }),
  generateCampaign: (id: string) => req<{ postCount: number }>(`/campaigns/${id}/generate`, { method: 'POST' }),
  analyzeBrief: (id: string) => req<{ brief: string }>(`/campaigns/${id}/analyze-brief`, { method: 'POST' }),
  pushCampaign: (id: string) => req<{ pushed: number; skipped: number }>(`/campaigns/${id}/push`, { method: 'POST' }),
  getCampaignStatus: (id: string) => req<any>(`/campaigns/${id}/status`),
  getAssets: (id: string) => req<DriveFile[]>(`/campaigns/${id}/assets`),
  analyzeMusic: (id: string) => req<SongAnalysis>(`/campaigns/${id}/analyze-music`, { method: 'POST' }),
  getPosts: (id: string) => req<any[]>(`/campaigns/${id}/posts`),
  updatePost: (campaignId: string, postId: string, data: any) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  approvePost: (campaignId: string, postId: string) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}`, { method: 'PATCH', body: JSON.stringify({ approved: true }) }),
  pushPost: (campaignId: string, postId: string) =>
    req<any>(`/campaigns/${campaignId}/posts/${postId}/push`, { method: 'POST' }),

  fetchDriveDoc: (url: string) => req<{ text: string }>(`/drive/doc?url=${encodeURIComponent(url)}`),
  parseLyrics: (docUrl: string) => req<{ lyricsMarkdown: string }>('/drive/parse-lyrics', { method: 'POST', body: JSON.stringify({ docUrl }) }),

  getSettings: () => req<SettingsResponse>('/settings'),
  updateSettings: (data: Partial<Record<keyof Omit<SettingsResponse, 'isSetupComplete'>, string>>) =>
    req<SettingsResponse>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
}
