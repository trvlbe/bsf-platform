import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api, type SettingsResponse } from '../lib/api.js'

interface FieldConfig {
  key: keyof Omit<SettingsResponse, 'isSetupComplete'>
  label: string
  placeholder: string
  required: boolean
}

const AI_FIELDS: FieldConfig[] = [
  { key: 'anthropicApiKey', label: 'Anthropic API Key', placeholder: 'sk-ant-...', required: true },
]

const BUFFER_FIELDS: FieldConfig[] = [
  { key: 'bufferAccessToken', label: 'Buffer Access Token', placeholder: 'access token...', required: true },
  { key: 'bufferProfileTiktok', label: 'TikTok Profile ID', placeholder: 'Buffer profile ID', required: false },
  { key: 'bufferProfileInstagram', label: 'Instagram Profile ID', placeholder: 'Buffer profile ID', required: false },
  { key: 'bufferProfileYoutube', label: 'YouTube Profile ID', placeholder: 'Buffer profile ID', required: false },
  { key: 'bufferProfileFacebook', label: 'Facebook Profile ID', placeholder: 'Buffer profile ID', required: false },
]

const VIDEO_FIELDS: FieldConfig[] = [
  { key: 'higgsfieldApiKey', label: 'Higgsfield API Key', placeholder: 'API key...', required: false },
]

function CredentialInput({
  field,
  currentValue,
  onSave,
  isSaving,
}: {
  field: FieldConfig
  currentValue: string | null
  onSave: (key: string, value: string) => void
  isSaving: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')

  if (!editing) {
    return (
      <div className="flex items-center justify-between py-3 border-b border-charcoal-100 last:border-0">
        <div>
          <span className="text-sm font-medium text-charcoal-700">
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </span>
          <p className="text-xs text-charcoal-400 mt-0.5 font-mono">
            {currentValue ?? <span className="text-amber-500">Not configured</span>}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {currentValue ? 'Update' : 'Add'}
        </button>
      </div>
    )
  }

  return (
    <div className="py-3 border-b border-charcoal-100 last:border-0">
      <label className="text-sm font-medium text-charcoal-700 block mb-1">
        {field.label}
        {field.required && <span className="text-red-500 ml-1">*</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="password"
          autoComplete="off"
          placeholder={field.placeholder}
          value={value}
          onChange={e => setValue(e.target.value)}
          className="flex-1 border border-charcoal-200 rounded px-3 py-2 text-sm font-mono"
        />
        <button
          onClick={() => { onSave(field.key, value); setEditing(false); setValue('') }}
          disabled={!value || isSaving}
          className="px-3 py-2 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 disabled:opacity-50"
        >
          Save
        </button>
        <button
          onClick={() => { setEditing(false); setValue('') }}
          className="px-3 py-2 text-charcoal-500 text-sm rounded hover:bg-charcoal-100"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

function Section({ title, fields, settings, onSave, isSaving }: {
  title: string
  fields: FieldConfig[]
  settings: SettingsResponse | undefined
  onSave: (key: string, value: string) => void
  isSaving: boolean
}) {
  return (
    <div className="bg-white rounded-xl border border-charcoal-200 p-6 mb-4">
      <h2 className="font-display text-sm tracking-widest uppercase text-charcoal-500 mb-4">{title}</h2>
      {fields.map(field => (
        <CredentialInput
          key={field.key}
          field={field}
          currentValue={settings ? settings[field.key] : null}
          onSave={onSave}
          isSaving={isSaving}
        />
      ))}
    </div>
  )
}

export default function Settings() {
  const [searchParams] = useSearchParams()
  const isSetup = searchParams.get('setup') === 'true'
  const queryClient = useQueryClient()

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  })

  const saveMutation = useMutation({
    mutationFn: (data: Record<string, string>) => api.updateSettings(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(['settings'], updated)
      if (isSetup && updated.isSetupComplete) {
        window.location.replace('/dashboard')
      }
    },
  })

  const handleSave = (key: string, value: string) => {
    saveMutation.mutate({ [key]: value })
  }

  if (isLoading) return <div className="p-8 text-charcoal-400">Loading…</div>

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {isSetup && !settings?.isSetupComplete && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>Setup required.</strong> Add your Anthropic API key and Buffer access token to start generating campaigns.
        </div>
      )}

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-charcoal-900">Settings</h1>
        <p className="text-sm text-charcoal-500 mt-1">API credentials are encrypted at rest.</p>
      </div>

      {saveMutation.isError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          Save failed — please try again.
        </div>
      )}

      <Section title="AI" fields={AI_FIELDS} settings={settings} onSave={handleSave} isSaving={saveMutation.isPending} />
      <Section title="Social Publishing" fields={BUFFER_FIELDS} settings={settings} onSave={handleSave} isSaving={saveMutation.isPending} />
      <Section title="Video Generation (optional)" fields={VIDEO_FIELDS} settings={settings} onSave={handleSave} isSaving={saveMutation.isPending} />

      {settings?.isSetupComplete && (
        <p className="text-center text-sm text-green-600 mt-4">✓ Setup complete</p>
      )}
    </div>
  )
}
