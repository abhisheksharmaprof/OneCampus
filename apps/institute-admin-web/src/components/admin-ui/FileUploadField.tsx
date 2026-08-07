import { ChangeEvent, useId, useState } from 'react'
import { Upload, X } from 'lucide-react'

export const FILE_UPLOAD_LIMITS = {
  image: { maxBytes: 5 * 1024 * 1024, accept: 'image/jpeg,image/png,image/webp', label: 'JPG, PNG, or WebP up to 5 MB' },
  document: { maxBytes: 10 * 1024 * 1024, accept: '.pdf,image/jpeg,image/png,image/webp', label: 'PDF, JPG, PNG, or WebP up to 10 MB' },
} as const

type UploadKind = keyof typeof FILE_UPLOAD_LIMITS

export function validateUpload(file: File, kind: UploadKind): string | null {
  const limits = FILE_UPLOAD_LIMITS[kind]
  const validType = kind === 'image'
    ? ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
    : ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  if (!validType) return kind === 'image' ? 'Choose a JPG, PNG, or WebP image.' : 'Choose a PDF, JPG, PNG, or WebP file.'
  if (file.size > limits.maxBytes) return `That file is too large. ${limits.label} are allowed.`
  return null
}

export function FileUploadField({ kind, label = 'Choose file', value, onChange, disabled = false }: {
  kind: UploadKind
  label?: string
  value?: File | null
  onChange: (file: File | null, error?: string) => void
  disabled?: boolean
}) {
  const inputId = useId()
  const [error, setError] = useState('')
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null
    const nextError = file ? validateUpload(file, kind) : null
    setError(nextError ?? '')
    onChange(nextError ? null : file, nextError ?? undefined)
    event.target.value = ''
  }
  return <div className="file-upload-field">
    <label htmlFor={inputId} className="button-secondary button-small" aria-disabled={disabled}>
      <Upload size={14} /> {value ? 'Replace file' : label}
    </label>
    <input id={inputId} type="file" accept={FILE_UPLOAD_LIMITS[kind].accept} hidden disabled={disabled} onChange={handleChange} />
    <span className="file-upload-help">{value ? value.name : FILE_UPLOAD_LIMITS[kind].label}</span>
    {value && <button type="button" className="icon-button" aria-label="Remove selected file" onClick={() => { setError(''); onChange(null) }}><X size={14} /></button>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>
}
