import { describe, it, expect, vi } from 'vitest'

vi.mock('googleapis', () => ({
  google: {
    auth: { OAuth2: vi.fn().mockImplementation(() => ({ setCredentials: vi.fn() })) },
    drive: vi.fn().mockReturnValue({
      files: {
        list: vi.fn().mockResolvedValue({
          data: {
            files: [
              { id: 'file1', name: 'cover.jpg', mimeType: 'image/jpeg', webViewLink: 'https://drive.google.com/file1', size: '102400' },
              { id: 'file2', name: 'broll.mp4', mimeType: 'video/mp4', webViewLink: 'https://drive.google.com/file2', size: '5242880' },
            ]
          }
        })
      }
    })
  }
}))

describe('listFolderFiles', () => {
  it('returns files from Drive folder', async () => {
    const { listFolderFiles } = await import('../lib/driveClient.js')
    const files = await listFolderFiles('https://drive.google.com/drive/folders/abc123', 'fake-token')
    expect(files).toHaveLength(2)
    expect(files[0].name).toBe('cover.jpg')
    expect(files[0].mimeType).toBe('image/jpeg')
    expect(files[1].name).toBe('broll.mp4')
  })

  it('returns empty array when folder has no files', async () => {
    const { google } = await import('googleapis')
    const mockDrive = google.drive as any
    mockDrive.mockReturnValueOnce({
      files: { list: vi.fn().mockResolvedValue({ data: { files: null } }) }
    })
    const { listFolderFiles } = await import('../lib/driveClient.js')
    const files = await listFolderFiles('https://drive.google.com/drive/folders/empty', 'fake-token')
    expect(files).toHaveLength(0)
  })

  it('passes folder ID in Drive list query', async () => {
    const { google } = await import('googleapis')
    const mockDrive = google.drive as any
    const mockList = vi.fn().mockResolvedValue({ data: { files: [] } })
    mockDrive.mockReturnValueOnce({ files: { list: mockList } })
    const { listFolderFiles } = await import('../lib/driveClient.js')
    await listFolderFiles('https://drive.google.com/drive/folders/FOLDER_ID_HERE', 'tok')
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({
      q: expect.stringContaining('FOLDER_ID_HERE')
    }))
  })
})
