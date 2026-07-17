import { google } from 'googleapis'
import { prisma } from './db.js'

export function drivePublicUrl(fileId: string): string {
  return `https://drive.google.com/uc?id=${fileId}&export=view`
}

export function extractDocId(url: string): string {
  const match = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error(`Cannot extract doc ID from URL: ${url}`)
  return match[1]
}

export function extractFileId(url: string): string {
  const match = url.match(/\/(?:file\/d|folders|open\?id=)\/([a-zA-Z0-9_-]+)/) ||
                url.match(/[?&]id=([a-zA-Z0-9_-]+)/)
  if (!match) throw new Error(`Cannot extract file ID from URL: ${url}`)
  return match[1]
}

export interface DriveCredentials {
  id: string
  accessToken: string
  refreshToken: string | null
}

export function getDriveClient(creds: DriveCredentials) {
  const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET)
  auth.setCredentials({ access_token: creds.accessToken, refresh_token: creds.refreshToken ?? undefined })
  auth.on('tokens', (tokens) => {
    if (tokens.access_token) {
      prisma.user.update({ where: { id: creds.id }, data: { accessToken: tokens.access_token } }).catch(() => {})
    }
  })
  return google.drive({ version: 'v3', auth })
}

export async function fetchDocAsText(docUrl: string, creds: DriveCredentials): Promise<string> {
  const fileId = extractDocId(docUrl)
  const drive = getDriveClient(creds)
  const res = await drive.files.export({
    fileId,
    mimeType: 'text/plain',
  }, { responseType: 'text' })
  return res.data as string
}

export async function getFileMetadata(fileUrl: string, creds: DriveCredentials) {
  const fileId = extractFileId(fileUrl)
  const drive = getDriveClient(creds)
  const res = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,webViewLink,size',
  })
  return res.data
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink: string
  size?: string
}

export async function listFolderFiles(folderUrl: string, creds: DriveCredentials): Promise<DriveFile[]> {
  const folderId = extractFileId(folderUrl)
  const drive = getDriveClient(creds)
  const res = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(id,name,mimeType,webViewLink,size)',
    orderBy: 'name',
  })
  return ((res.data.files ?? []) as DriveFile[])
}
