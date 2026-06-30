import { google } from 'googleapis'

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

function getDriveClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return google.drive({ version: 'v3', auth })
}

export async function fetchDocAsText(docUrl: string, accessToken: string): Promise<string> {
  const fileId = extractDocId(docUrl)
  const drive = getDriveClient(accessToken)
  const res = await drive.files.export({
    fileId,
    mimeType: 'text/plain',
  }, { responseType: 'text' })
  return res.data as string
}

export async function getFileMetadata(fileUrl: string, accessToken: string) {
  const fileId = extractFileId(fileUrl)
  const drive = getDriveClient(accessToken)
  const res = await drive.files.get({
    fileId,
    fields: 'id,name,mimeType,webViewLink,size',
  })
  return res.data
}
