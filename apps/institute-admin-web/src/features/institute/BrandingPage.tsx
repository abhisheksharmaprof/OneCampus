import { useEffect, useState } from 'react'
import { Check, Eye, Pencil } from 'lucide-react'
import { FileUploadField, Modal } from '../../components/admin-ui'
import { adminRequest, adminUpload } from '../admin/admin.api'
import './branding.css'

const templates = [
  ['Fee Receipt', 'Used for all fee collections'],
  ['Transfer Certificate', 'Issued when student transfers'],
  ['ID Card', 'Student & staff ID cards'],
  ['Report Card', 'Term-wise progress report'],
  ['Certificate', 'Achievement & completion'],
  ['Email Header', 'Parent communication emails'],
]

interface InstituteProfile {
  id: string
  name?: string
  displayName?: string
  brandColor?: string
}

interface LogoAsset {
  id: string
  url?: string | null
}

export function BrandingPage({ accessToken }: { accessToken: string }) {
  const [primary, setPrimary] = useState('#2E5AAC')
  const [secondary, setSecondary] = useState('#1E8E5A')
  const [instituteName, setInstituteName] = useState('Institute Name')
  const [editing, setEditing] = useState<string | null>(null)
  const [logo, setLogo] = useState<File | null>(null)
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState('')
  const [logoError, setLogoError] = useState('')
  const [savingLogo, setSavingLogo] = useState(false)

  useEffect(() => {
    if (!logo) return
    const objectUrl = URL.createObjectURL(logo)
    setLogoUrl(objectUrl)
    return () => URL.revokeObjectURL(objectUrl)
  }, [logo])

  useEffect(() => {
    const loadBranding = async () => {
      try {
        const profile = await adminRequest<InstituteProfile>(accessToken, 'institute')
        setInstituteName(profile.displayName || profile.name || 'Institute Name')
        if (profile.brandColor) setPrimary(profile.brandColor)
        const assets = await adminRequest<LogoAsset[]>(accessToken, `files?ownerType=INSTITUTE&ownerId=${encodeURIComponent(profile.id)}&assetType=LOGO`)
        const asset = assets[0]
        if (asset) {
          setLogoAssetId(asset.id)
          if (asset.url) setLogoUrl(asset.url)
        }
      } catch {
        // Branding remains usable when optional asset metadata is unavailable.
      }
    }
    void loadBranding()
  }, [accessToken])

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
      <div className="branding-heading-actions"><button className="button-secondary" title="Preview document branding" type="button"><Eye size={15} /> Preview</button><button className="button-primary" title="Save branding changes" type="button"><Check size={15} /> Save All</button></div>
    </header>
    <div className="branding-grid">
      <section className="branding-card branding-identity-card">
        <div className="branding-card-heading"><div><h2>Logo &amp; Identity</h2><p>Synced from Institute Details → Branding Assets.</p></div><span className="branding-sync-badge">Synced</span></div>
        <div className="brand-logo" style={{ background: primary }}>{logoUrl ? <img src={logoUrl} alt="Institute logo" /> : instituteName.slice(0, 2).toUpperCase()}</div>
        <strong className="branding-institute-name">{instituteName}</strong>
        <p>Logo appears on receipts, report cards, certificates, and the parent portal.</p>
        <FileUploadField kind="image" label={savingLogo ? 'Uploading…' : 'Upload logo'} value={logo} disabled={savingLogo} onChange={saveLogo} />
        {logoUrl ? <button className="branding-remove-link" type="button" onClick={() => void removeLogo()} disabled={savingLogo}>Remove logo</button> : null}
        {logoError && <p className="form-error" role="alert">{logoError}</p>}
        <label>School Full Name (for documents)<input defaultValue={instituteName} /></label>
        <label>Tagline / Motto (optional)<input defaultValue="Excellence in Education" /></label>
        <Color label="Primary Brand Color" value={primary} setValue={setPrimary} />
        <Color label="Secondary Color (accents)" value={secondary} setValue={setSecondary} />
      </section>
      <div className="branding-side-column">
        <section className="branding-card preview-card"><div className="branding-card-heading"><h2>Document Header Preview</h2><span className="branding-preview-label"><Eye size={13} /> Live</span></div><div className="document-preview" style={{ borderTopColor: primary }}><div className="document-brand-row">{logoUrl ? <img src={logoUrl} alt="Institute logo" /> : <span>{instituteName.slice(0, 2).toUpperCase()}</span>}<strong style={{ background: primary }}>{instituteName}</strong></div><small>Official institute document</small><hr style={{ borderColor: secondary }} /><span>5th Block, Koramangala, Bangalore 560095</span><span>+91 80 2555 0100　 koramangala@vidyabharati.edu</span><hr style={{ borderColor: secondary }} /><b style={{ color: secondary }}>FEE RECEIPT</b><i style={{ background: secondary }}>Secondary accent</i></div></section>
        <section className="branding-card"><h2>Document Templates</h2>{templates.map(([name, description]) => <div className="template-row" key={name}><span><b>{name}</b><small>{description}</small></span><button className="button-secondary btn-sm" title={`Edit ${name} template`} type="button" onClick={() => setEditing(name)}><Pencil size={14} /> Edit</button></div>)}</section>
      </div>
    </div>
    <Modal open={Boolean(editing)} title={`Edit ${editing ?? ''}`} description="Template editor" onClose={() => setEditing(null)} footer={<button className="button-primary" type="button" onClick={() => setEditing(null)}>Save template</button>}><p>Template editing opens in this popup. No side panel is used.</p></Modal>
  </main>
}

function Color({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return <label className="branding-color-field">{label}<span className="color-field"><input aria-label={`${label} picker`} type="color" value={value} onChange={(event) => setValue(event.target.value)} /><input value={value} onChange={(event) => setValue(event.target.value)} /></span></label>
}
