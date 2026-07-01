import { Router } from 'express'
import { z } from 'zod'
import { requireAuth } from '../middleware/requireAuth.js'
import { prisma } from '../lib/db.js'
import { encrypt, decrypt, mask } from '../lib/encrypt.js'

export const settingsRouter = Router()
settingsRouter.use(requireAuth)

const CREDENTIAL_FIELDS = [
  'anthropicApiKey',
  'bufferAccessToken',
  'bufferProfileTiktok',
  'bufferProfileInstagram',
  'bufferProfileYoutube',
  'bufferProfileFacebook',
  'higgsfieldApiKey',
] as const

type CredentialField = typeof CREDENTIAL_FIELDS[number]

const credentialString = z.string().trim().min(1)

const UpdateSettingsSchema = z.object({
  anthropicApiKey: credentialString.optional(),
  bufferAccessToken: credentialString.optional(),
  bufferProfileTiktok: credentialString.optional(),
  bufferProfileInstagram: credentialString.optional(),
  bufferProfileYoutube: credentialString.optional(),
  bufferProfileFacebook: credentialString.optional(),
  higgsfieldApiKey: credentialString.optional(),
})

function buildMaskedResponse(user: Record<string, unknown>) {
  const result: Record<string, string | null | boolean> = {}
  for (const field of CREDENTIAL_FIELDS) {
    const encrypted = user[field] as string | null
    if (encrypted) {
      try {
        result[field] = mask(decrypt(encrypted))
      } catch {
        result[field] = null
      }
    } else {
      result[field] = null
    }
  }
  result.isSetupComplete = !!(user.anthropicApiKey && user.bufferAccessToken)
  return result
}

settingsRouter.get('/', async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.session.userId! } })
  if (!user) { res.status(404).json({ error: 'User not found' }); return }
  res.json(buildMaskedResponse(user as Record<string, unknown>))
})

settingsRouter.put('/', async (req, res) => {
  const parsed = UpdateSettingsSchema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: parsed.error.flatten() }); return }

  const updates: Partial<Record<CredentialField, string>> = {}
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      updates[key as CredentialField] = encrypt(value)
    }
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No fields provided' })
    return
  }

  const user = await prisma.user.update({
    where: { id: req.session.userId! },
    data: updates,
  })

  res.json(buildMaskedResponse(user as Record<string, unknown>))
})
