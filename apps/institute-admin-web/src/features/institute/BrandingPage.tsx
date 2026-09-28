import { useEffect, useState } from 'react'
import { Check, Eye, ExternalLink } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { FileUploadField, Modal } from '../../components/admin-ui'
import { adminRequest, adminUpload } from '../admin/admin.api'
import './branding.css'

interface InstituteProfile {
  id: string
  name?: string
  displayName?: string
  brandColor?: string
  address_line_1?: string
  address_line_2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  primaryEmail?: string
  primaryPhone?: string
}

interface LogoAsset {
  id: string
  url?: string | null
}

export function BrandingPage({ accessToken }: { accessToken: string }) {
  const navigate = useNavigate()
  const [primary, setPrimary] = useState('#2E5AAC')
  const [instituteName, setInstituteName] = useState('')
  const [profile, setProfile] = useState<InstituteProfile | null>(null)
  const [logo, setLogo] = useState<File | null>(null)
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [logoError, setLogoError] = useState('')
  const [savingLogo, setSavingLogo] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => {
    if (!logo) return
    const objectUrl = URL.createObjectURL(logo)
    setLogoUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [logo])

  useEffect(() => {
    const controller = new AbortController()
    const loadBranding = async () => {
      try {
        const loadedProfile = await adminRequest<InstituteProfile>(accessToken, 'institute', { signal: controller.signal })
        setProfile(loadedProfile)
        setInstituteName(loadedProfile.displayName || loadedProfile.name || '')
        if (loadedProfile.brandColor) setPrimary(loadedProfile.brandColor)
        const assets = await adminRequest<LogoAsset[]>(accessToken, `files?ownerType=INSTITUTE&ownerId=${encodeURIComponent(loadedProfile.id)}&assetType=LOGO`, { signal: controller.signal })
        const asset = assets[0]
        if (asset) {
          setLogoAssetId(asset.id)
          if (asset.url) setLogoUrl(asset.url)
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Institute branding could not be loaded.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void loadBranding()
    return () => controller.abort()
  }, [accessToken])

  const saveBranding = async () => {
    if (instituteName.trim().length < 2) {
      setError('Enter a document name with at least 2 characters.')
      return
    }
    if (!/^#[0-9A-Fa-f]{6}$/.test(primary)) {
      setError('Enter a valid six-digit hex brand color.')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const updated = await adminRequest<InstituteProfile>(accessToken, 'institute', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: instituteName.trim(), brandColor: primary }),
      })
      setProfile((current) => ({ ...current, ...updated }))
      setInstituteName(updated.displayName || updated.name || instituteName.trim())
      setPrimary(updated.brandColor || primary)
      setNotice('Branding saved. New invoice and receipt previews will use these details.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Branding could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const saveLogo = async (file: File | null, error?: string) => {
    setLogo(file)
    setLogoError(error ?? '')
    if (error || !file) return
    setSavingLogo(true)
    try {
      const asset = await adminUpload<LogoAsset>(accessToken, 'institute/logo', file)
      setLogoAssetId(asset.id)
      if (asset.url) setLogoUrl(asset.url)
    } catch (cause) {
      setLogo(null)
      setLogoUrl('')
      setLogoError(cause instanceof Error ? cause.message : 'Logo could not be uploaded.')
    } finally {
      setSavingLogo(false)
    }
  }

  const removeLogo = async () => {
    if (!logoAssetId) {
      setLogo(null)
      setLogoUrl('')
      return
    }
    setSavingLogo(true)
    setLogoError('')
    try {
      await adminRequest(accessToken, `files/${logoAssetId}`, { method: 'DELETE' })
      setLogo(null)
      setLogoAssetId(null)
      setLogoUrl('')
    } catch (cause) {
      setLogoError(cause instanceof Error ? cause.message : 'Logo could not be removed.')
    } finally {
      setSavingLogo(false)
    }
  }

  return <main className="entity-page branding-page">
    <header className="branding-heading">
      <div><p className="breadcrumb">Home / Institute Setup / Branding</p><h1>Branding</h1><p>Manage the assets and colors used across institute documents.</p></div>
      <div className="branding-heading-actions"><button className="button-secondary" title="Preview document branding" type="button" onClick={() => setPreviewOpen(true)}><Eye size={15} /> Preview</button><button className="button-primary" title="Save branding changes" type="button" disabled={loading || saving || !profile} onClick={() => void saveBranding()}><Check size={15} /> {saving ? 'Saving…' : 'Save All'}</button></div>
    </header>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="branding-save-notice" role="status">{notice}</p>}
    <div className="branding-grid">
      <section className="branding-card branding-identity-card">
        <div className="branding-card-heading"><div><h2>Logo &amp; Identity</h2><p>These saved institute details appear on new finance documents.</p></div><span className="branding-sync-badge">{loading ? 'Loading' : profile ? 'Connected' : 'Unavailable'}</span></div>
        <div className="brand-logo" style={{ background: primary }}>{logoUrl ? <img src={logoUrl} alt="Institute logo" /> : instituteName.slice(0, 2).toUpperCase()}</div>
        <strong className="branding-institute-name">{instituteName}</strong>
        <p>Logo appears on receipts, report cards, certificates, and the parent portal.</p>
        <FileUploadField kind="image" label={savingLogo ? 'Uploading…' : 'Upload logo'} value={logo} disabled={savingLogo || loading} onChange={saveLogo} />
        {logoUrl ? <button className="branding-remove-link" type="button" onClick={() => void removeLogo()} disabled={savingLogo}>Remove logo</button> : null}
        {logoError && <p className="form-error" role="alert">{logoError}</p>}
        <label>School Full Name (for documents)<input value={instituteName} onChange={(event) => setInstituteName(event.target.value)} disabled={loading} /></label>
        <Color label="Primary Brand Color" value={primary} setValue={setPrimary} />
      </section>
      <div className="branding-side-column">
        <section className="branding-card preview-card"><div className="branding-card-heading"><h2>Document Header Preview</h2><span className="branding-preview-label"><Eye size={13} /> Live</span></div><div className="document-preview" style={{ borderTopColor: primary }}><div className="document-brand-row">{logoUrl ? <img src={logoUrl} alt="Institute logo" /> : <span>{instituteName.slice(0, 2).toUpperCase()}</span>}<strong style={{ background: primary }}>{instituteName}</strong></div><small>Official institute document</small><hr style={{ borderColor: primary }} />{[profile?.address_line_1, profile?.address_line_2, [profile?.city, profile?.state, profile?.postalCode].filter(Boolean).join(' '), profile?.country].filter(Boolean).map((line) => <span key={line}>{line}</span>)}{[profile?.primaryPhone, profile?.primaryEmail].filter(Boolean).length > 0 && <span>{[profile?.primaryPhone, profile?.primaryEmail].filter(Boolean).join(' · ')}</span>}<hr style={{ borderColor: primary }} /><b style={{ color: primary }}>FEE RECEIPT</b></div></section>
        <section className="branding-card"><h2>Document Templates</h2><p>Load and edit the saved invoice and receipt templates in Template Studio.</p><button className="button-secondary" type="button" onClick={() => navigate('/template-studio')}><ExternalLink size={14} /> Open Template Studio</button></section>
      </div>
    </div>
    <Modal open={previewOpen} title="Document branding preview" description="Preview of the institute identity currently saved for invoices and receipts." onClose={() => setPreviewOpen(false)} footer={<button className="button-primary" type="button" onClick={() => setPreviewOpen(false)}>Close preview</button>}><div className="document-preview" style={{ borderTopColor: primary }}><div className="document-brand-row">{logoUrl ? <img src={logoUrl} alt="Institute logo" /> : <span>{instituteName.slice(0, 2).toUpperCase()}</span>}<strong style={{ background: primary }}>{instituteName}</strong></div><small>Official institute document</small><hr style={{ borderColor: primary }} />{[profile?.address_line_1, profile?.address_line_2, [profile?.city, profile?.state, profile?.postalCode].filter(Boolean).join(' '), profile?.country].filter(Boolean).map((line) => <span key={line}>{line}</span>)}<hr style={{ borderColor: primary }} /><b style={{ color: primary }}>FEE RECEIPT</b></div></Modal>
  </main>
}

function Color({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <label className="branding-color-field">{label}<span className="color-field"><input aria-label={`${label} picker`} type="color" value={value} onChange={(event) => setValue(event.target.value)} /><input aria-label={`${label} hex value`} value={value} onChange={(event) => setValue(event.target.value)} /></span></label>
}
