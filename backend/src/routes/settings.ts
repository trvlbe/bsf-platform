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

const UpdateSettingsSchema = z.object({
  anthropicApiKey: z.string().min(1).optional(),
  bufferAccessToken: z.string().min(1).optional(),
  bufferProfileTiktok: z.string().min(1).optional(),
  bufferProfileInstagram: z.string().min(1).optional(),
  bufferProfileYoutube: z.string().min(1).optional(),
  bufferProfileFacebook: z.string().min(1).optional(),
  higgsfieldApiKey: z.string().min(1).optional(),
})

function buildMaskedResponse(user: Record<string, unknown>) {
  const result: Record<string, string | null | boolean> = {}
  for (const field of CREDENTIAL_FIELDS) {
    const encrypted = user[field] as string | null
    result[field] = encrypted ? mask(decrypt(encrypted)) : null
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

  const user = await prisma.user.update({
    where: { id: req.session.userId! },
    data: updates,
  })

  res.json(buildMaskedResponse(user as Record<string, unknown>))
})
