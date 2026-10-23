import { FormEvent, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileText, Image as ImageIcon, Save, Eye } from 'lucide-react'
import { FileUploadField, Modal, PageSkeleton } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, adminUpload } from '../admin/admin.api'

interface InstituteProfile {
  id: string
  name: string
  slug: string
  code: string
  isActive: boolean
  legalName?: string
  instituteType?: string
  boardAffiliation?: string
  boardAffiliationNo?: string
  udiseCode?: string
  estYear?: string
  medium?: string
  entityType?: string
  registrationNo?: string
  panNo?: string
  gstNo?: string
  brandColor?: string
  displayName?: string
  postalCode?: string
  country?: string
  alternatePhone?: string
  websiteUrl?: string
  primaryEmail?: string
  primaryPhone?: string
  logoUrl?: string
  contactName?: string
  contactDesignation?: string
  contactPhone?: string
  contactEmail?: string
}

interface Branch {
  id: string
  name: string
  code: string
  isHeadOffice: boolean
  isActive: boolean
  timezone: string
  address_line_1?: string
  city?: string
  state?: string
  postal_code?: string
  email?: string
  phone?: string
}

interface LogoAsset {
  id: string
  url?: string | null
  mimeType?: string
  status?: string
  createdAt?: string
}

export function InstituteProfilePage({ accessToken }: { accessToken: string }) {
  const [profile, setProfile] = useState<InstituteProfile | null>(null)
  const [headOffice, setHeadOffice] = useState<Branch | null>(null)
  const [activeSection, setActiveSection] = useState<'identity' | 'legal' | 'contact' | 'academic' | 'branding'>('identity')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [pendingHeadOfficeSave, setPendingHeadOfficeSave] = useState<string | null>(null)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [documentType, setDocumentType] = useState('affiliation_certificate')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoAssetId, setLogoAssetId] = useState<string | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [letterheadFile, setLetterheadFile] = useState<File | null>(null)
  const [letterheadAssetId, setLetterheadAssetId] = useState<string | null>(null)
  const [letterheadPreview, setLetterheadPreview] = useState('')
  const [letterheadMimeType, setLetterheadMimeType] = useState('')

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview('')
      return
    }
    const previewUrl = URL.createObjectURL(logoFile)
    setLogoPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [logoFile])

  useEffect(() => {
    if (!letterheadFile) return
    const previewUrl = URL.createObjectURL(letterheadFile)
    setLetterheadPreview(previewUrl)
    setLetterheadMimeType(letterheadFile.type)
    return () => URL.revokeObjectURL(previewUrl)
  }, [letterheadFile])

  const removeLogo = async () => {
    setUploadError('')
    if (!logoAssetId) {
      setLogoFile(null)
      return
    }
    setUploading(true)
    try {
      await adminRequest(accessToken, `files/${logoAssetId}`, { method: 'DELETE' })
      setLogoFile(null)
      setLogoAssetId(null)
      setProfile((current) => current ? { ...current, logoUrl: '' } : current)
      setIsDirty(false)
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'The institute logo could not be removed.')
    } finally {
      setUploading(false)
    }
  }

  const uploadLogo = async (file: File | null, validationError?: string) => {
    setLogoFile(file)
    setUploadError(validationError ?? '')
    if (validationError) return
    if (!file) {
      await removeLogo()
      return
    }
    setUploading(true)
    try {
      const asset = await adminUpload<LogoAsset>(accessToken, 'institute/logo', file)
      setLogoAssetId(asset.id)
      if (asset.url) setLogoPreview(asset.url)
      setIsDirty(false)
    } catch (cause) {
      setLogoFile(null)
      setUploadError(cause instanceof Error ? cause.message : 'The institute logo could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  const removeLetterhead = async () => {
    setUploadError('')
    if (!letterheadAssetId) {
      setLetterheadFile(null)
      setLetterheadPreview('')
      return
    }
    setUploading(true)
    try {
      await adminRequest(accessToken, `files/${letterheadAssetId}`, { method: 'DELETE' })
      setLetterheadFile(null)
      setLetterheadAssetId(null)
      setLetterheadPreview('')
      setLetterheadMimeType('')
    } catch (cause) {
      setUploadError(cause instanceof Error ? cause.message : 'The institute letterhead could not be removed.')
    } finally {
      setUploading(false)
    }
  }

  const uploadLetterhead = async (file: File | null, validationError?: string) => {
    setLetterheadFile(file)
    setUploadError(validationError ?? '')
    if (validationError) return
    if (!file) {
      await removeLetterhead()
      return
    }
    if (!profile?.id) {
      setUploadError('Institute details are still loading. Please try again.')
      setLetterheadFile(null)
      return
    }
    setUploading(true)
    try {
      const asset = await adminUpload<LogoAsset>(accessToken, 'files', file, {
        ownerType: 'INSTITUTE',
        ownerId: profile.id,
        assetType: 'LETTERHEAD',
      })
      setLetterheadAssetId(asset.id)
      setLetterheadMimeType(asset.mimeType ?? file.type)
      if (asset.url) setLetterheadPreview(asset.url)
    } catch (cause) {
      setLetterheadFile(null)
      setLetterheadPreview('')
      setUploadError(cause instanceof Error ? cause.message : 'The institute letterhead could not be uploaded.')
    } finally {
      setUploading(false)
    }
  }

  // Live preview branding state
  const [displayName, setDisplayName] = useState('')
  const [primaryColor, setPrimaryColor] = useState('#2E5AAC')
  const [isDirty, setIsDirty] = useState(false)
  const editRevision = useRef(0)

  useEffect(() => {
    void adminRequest<InstituteProfile>(accessToken, 'institute')
      .then((data) => {
        setProfile(data)
        setDisplayName(data.displayName ?? data.name ?? '')
        if (data.brandColor) setPrimaryColor(data.brandColor)
        void adminRequest<LogoAsset[]>(accessToken, `files?ownerType=INSTITUTE&ownerId=${encodeURIComponent(data.id)}&assetType=LOGO`)
          .then((assets) => {
            const logo = assets[0]
            if (!logo) return
            setLogoAssetId(logo.id)
            if (logo.url) setLogoPreview(logo.url)
          })
          .catch(() => {
            // The profile remains usable if the optional logo metadata request fails.
          })
        void adminRequest<LogoAsset[]>(accessToken, `files?ownerType=INSTITUTE&ownerId=${encodeURIComponent(data.id)}&assetType=LETTERHEAD`)
          .then((assets) => {
            const letterhead = assets[0]
            if (!letterhead) return
            setLetterheadAssetId(letterhead.id)
            setLetterheadMimeType(letterhead.mimeType ?? '')
            if (letterhead.url) setLetterheadPreview(letterhead.url)
          })
          .catch(() => {
            // The profile remains usable if the optional letterhead request fails.
          })
        setError('')
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : 'Institute profile could not be loaded.')
      )

    void adminRequest<{ items: Branch[] }>(accessToken, 'branches?pageSize=100')
      .then((response) => {
        const ho = response.items.find((b) => b.isHeadOffice)
        if (ho) setHeadOffice(ho)
      })
      .catch(() => {})
  }, [accessToken])

  const headOfficePayloadFromForm = (form: FormData): Record<string, string> => {
    const payload: Record<string, string> = {}
    const branchName = String(form.get('branchName') ?? '')
    const timezone = String(form.get('branchTimezone') ?? '')
    if (branchName) payload.name = branchName
    if (timezone) payload.timezone = timezone
    for (const field of ['address_line_1', 'city', 'state', 'primaryEmail', 'primaryPhone']) {
      const value = form.get(field)
      if (typeof value === 'string') payload[field === 'primaryEmail' ? 'email' : field === 'primaryPhone' ? 'phone' : field] = value
    }
    return payload
  }

  const retryHeadOfficeSave = async () => {
    if (!pendingHeadOfficeSave) return
    const formElement = document.getElementById('institute-profile-form')
    if (!(formElement instanceof HTMLFormElement)) return
    const submittedRevision = editRevision.current
    const branchId = pendingHeadOfficeSave
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const updatedBranch = await adminRequest<Branch>(accessToken, `branches/${branchId}`, {
        method: 'PATCH',
        body: JSON.stringify(headOfficePayloadFromForm(new FormData(formElement))),
      })
      setHeadOffice(updatedBranch)
      setPendingHeadOfficeSave(null)
      if (editRevision.current === submittedRevision) {
        setIsDirty(false)
        setSaved(true)
        setTimeout(() => setSaved(false), 4000)
      } else {
        setIsDirty(true)
        setError('Head office contact details were saved. Other changes made while saving are still unsaved.')
      }
    } catch (cause) {
      setError(`Institute details are saved, but head office contact details are still not saved: ${cause instanceof Error ? cause.message : 'The update failed.'}`)
    } finally {
      setSaving(false)
    }
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const submittedRevision = editRevision.current
    setSaving(true)
    setSaved(false)
    setPendingHeadOfficeSave(null)

    const rawEstYear = form.get('estYear')
    let parsedEstYear: number | null = null
    if (rawEstYear && typeof rawEstYear === 'string' && rawEstYear.trim() !== '') {
      const num = parseInt(rawEstYear.trim(), 10)
      if (!isNaN(num)) parsedEstYear = num
    }

    const payload: Record<string, any> = {}
    const nameStr = (form.get('name') as string)?.trim()
    const legalNameStr = (form.get('legalName') as string)?.trim()

    if (legalNameStr) payload.name = legalNameStr
    else if (nameStr) payload.name = nameStr

    if (nameStr) payload.displayName = nameStr

    const instituteType = form.get('instituteType') as string
    if (instituteType) payload.instituteType = instituteType

    const boardAffiliation = form.get('boardAffiliation') as string
    if (boardAffiliation !== null && boardAffiliation !== undefined) payload.boardAffiliation = boardAffiliation

    const boardAffiliationNo = form.get('boardAffiliationNo') as string
    if (boardAffiliationNo !== null && boardAffiliationNo !== undefined) payload.boardAffiliationNo = boardAffiliationNo

    const udiseCode = form.get('udiseCode') as string
    if (udiseCode !== null && udiseCode !== undefined) payload.udiseCode = udiseCode

    if (parsedEstYear !== null) payload.estYear = parsedEstYear

    const medium = form.get('medium') as string
    if (medium) payload.medium = medium

    const entityType = form.get('entityType') as string
    if (entityType !== null && entityType !== undefined) payload.entityType = entityType

    const registrationNo = form.get('registrationNo') as string
    if (registrationNo !== null && registrationNo !== undefined) payload.registrationNo = registrationNo

    const panNo = form.get('panNo') as string
    if (panNo !== null && panNo !== undefined) payload.panNo = panNo

    const gstNo = form.get('gstNo') as string
    if (gstNo !== null && gstNo !== undefined) payload.gstNo = gstNo

    try {
      const data = await adminRequest<InstituteProfile>(accessToken, 'institute', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      })
      setProfile(data)

      if (headOffice) {
        try {
          const updatedBranch = await adminRequest<Branch>(accessToken, `branches/${headOffice.id}`, {
            method: 'PATCH',
            body: JSON.stringify(headOfficePayloadFromForm(form)),
          })
          setHeadOffice(updatedBranch)
        } catch (cause) {
          if (editRevision.current === submittedRevision) {
            setPendingHeadOfficeSave(headOffice.id)
            setIsDirty(false)
            setError(`Institute details were saved, but head office contact details were not: ${cause instanceof Error ? cause.message : 'The update failed.'}`)
          } else {
            setIsDirty(true)
            setError(`Institute details were saved, but head office contact details were not. Review the current values and save again. ${cause instanceof Error ? cause.message : ''}`)
          }
          return
        }
      }

      setError('')
      if (editRevision.current === submittedRevision) {
        setSaved(true)
        setIsDirty(false)
        setTimeout(() => setSaved(false), 4000)
      } else {
        setSaved(false)
        setIsDirty(true)
        setError('The submitted details were saved. Changes made while saving are still unsaved.')
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Institute profile could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const sections = [
    { id: 'identity', label: 'Identity' },
    { id: 'legal', label: 'Legal & Compliance' },
    { id: 'contact', label: 'Head Office Contact' },
    { id: 'branding', label: 'Branding Assets' },
    { id: 'academic', label: 'Academic Setup' },
  ] as const
  const logoSource = logoPreview || profile?.logoUrl || ''
  const contactFields = [profile?.contactName, profile?.contactDesignation, profile?.contactPhone, profile?.contactEmail]
  const filledContactFields = contactFields.filter(Boolean).length
  const contactStatus = filledContactFields === contactFields.length ? 'Complete' : filledContactFields ? 'Needs details' : 'Not provided'

  return (
    <div className="entity-page profile-page-layout institute-setup-page">
      <div className="page-heading institute-subpage-heading">
        <div>
          <p className="breadcrumb">Institute Setup / Institute Details</p>
          <h1>Institute Details</h1>
          <p className="page-subtitle">Manage institute identity, legal records, head office contact, and brand assets.</p>
        </div>
      </div>

      {error && <div className="inline-error" role="alert">{error}{pendingHeadOfficeSave && <button className="button-secondary btn-sm" type="button" disabled={saving} onClick={() => void retryHeadOfficeSave()}>{saving ? 'Retrying…' : 'Retry head office update'}</button>}</div>}
      {saved && <div className="prototype-success-banner" role="status"><CheckCircle2 size={18} /> Institute details saved.</div>}

      {!profile ? (
        error ? null : <PageSkeleton name="institute-profile" label="Loading institute profile" variant="form" />
      ) : (
        <form id="institute-profile-form" className="profile-form-layout" onSubmit={save} onInput={() => { editRevision.current += 1; setIsDirty(true); if (pendingHeadOfficeSave) { setPendingHeadOfficeSave(null); setError('') } }} onChange={() => { editRevision.current += 1; setIsDirty(true); if (pendingHeadOfficeSave) { setPendingHeadOfficeSave(null); setError('') } }}>
          {/* Left Sticky Section Navigation */}
          <aside className="profile-section-nav-sticky">
            <nav className="section-nav-list" aria-label="Profile sections">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`section-nav-item ${activeSection === s.id ? 'active' : ''}`}
                  aria-current={activeSection === s.id ? 'location' : undefined}
                  onClick={() => {
                    setActiveSection(s.id)
                    const elem = document.getElementById(`sec-${s.id}`)
                    if (elem) elem.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                >
                  {s.label}
                </button>
              ))}
            </nav>
          </aside>

          {/* Right Main Form Content */}
          <div className="profile-sections-container">
            {/* 1. Identity Section */}
            <div id="sec-identity">
              <Card className="profile-card">
                <SectionHeader title="1. Identity" />
                <div className="admin-form-grid">
                  <label className="field-label">
                    Legal Name
                    <input name="legalName" defaultValue={profile.legalName ?? ''} placeholder="Full registered legal entity name" />
                  </label>
                  <label className="field-label">
                    Display Name <span className="req">*</span>
                    <input
                      name="name"
                      defaultValue={profile.displayName ?? profile.name}
                      onChange={(e) => setDisplayName(e.target.value)}
                      minLength={2}
                      maxLength={200}
                      required
                    />
                  </label>

                  <label className="field-label">
                    Institute Type
                    <select name="instituteType" defaultValue={profile.instituteType ?? ''}>
                      <option value="">Not set — choose if known</option>
                      <option value="School">School</option>
                      <option value="College">College</option>
                      <option value="Coaching Center">Coaching Center</option>
                      <option value="University">University</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Board Affiliation
                    <select name="boardAffiliation" defaultValue={profile.boardAffiliation ?? ''}>
                      <option value="">Not set — choose if known</option>
                      <option value="CBSE">CBSE (Central Board of Secondary Education)</option>
                      <option value="ICSE">ICSE / CISCE</option>
                      <option value="IB">IB (International Baccalaureate)</option>
                      <option value="State Board">State Board</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>

                  <label className="field-label">
                    Board Affiliation Number
                    <input name="boardAffiliationNo" defaultValue={profile.boardAffiliationNo ?? ''} placeholder="e.g. CBSE/AFF/1730489" />
                  </label>
                  <label className="field-label">
                    UDISE Code
                    <input name="udiseCode" defaultValue={profile.udiseCode ?? ''} placeholder="11-digit UDISE code" />
                  </label>

                  <label className="field-label">
                    Establishment Year
                    <input name="estYear" type="number" defaultValue={profile.estYear ?? ''} placeholder="e.g. 1998" />
                  </label>
                  <label className="field-label">
                    Medium of Instruction
                    <input name="medium" defaultValue={profile.medium ?? ''} placeholder="e.g. English" />
                  </label>

                  <div className="field-full-width">
                    <div className="field-label">Permanent Institute Code <span className="locked-field">🔒 Read-only</span></div>
                    <div className="institute-code-display" aria-label="Permanent institute code">
                      <code>{profile.code}</code>
                      <span>Assigned by the system platform</span>
                    </div>
                  </div>

                  <label className="field-label">
                    Institute Slug <span className="locked-field">🔒 Read-only</span>
                    <input name="slug" value={profile.slug} readOnly aria-label="Institute slug" />
                  </label>
                </div>
              </Card>
            </div>

            {/* 2. Legal & Compliance Section */}
            <div id="sec-legal">
              <Card className="profile-card">
                <SectionHeader title="2. Legal & Compliance" />
                <div className="admin-form-grid">
                  <label className="field-label">
                    Registered Entity Type
                    <select name="entityType" defaultValue={profile.entityType ?? ''}>
                      <option value="">Not set — choose if known</option>
                      <option value="Trust">Trust</option>
                      <option value="Society">Society</option>
                      <option value="Section 8 Company">Section 8 Company</option>
                      <option value="Private Limited">Private Limited</option>
                      <option value="Sole Proprietorship">Sole Proprietorship</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Registration Number
                    <input name="registrationNo" defaultValue={profile.registrationNo ?? ''} placeholder="Registration number" />
                  </label>

                  <label className="field-label">
                    PAN Number
                    <input name="panNo" defaultValue={profile.panNo ?? ''} placeholder="10-digit PAN" />
                  </label>
                  <label className="field-label">
                    GST Number
                    <input name="gstNo" defaultValue={profile.gstNo ?? ''} placeholder="15-digit GSTIN" />
                  </label>
                </div>

              </Card>
            </div>

            {/* 3. Head Office Contact Section */}
            <div id="sec-contact">
              <Card className="profile-card">
                <SectionHeader title="3. Head Office Contact" />
                <div className="admin-form-grid">
                  <div className="field-full-width">
                    <label className="field-label">
                      Branch Name
                      <input name="branchName" defaultValue={headOffice?.name ?? ''} placeholder="Head office campus name" required />
                    </label>

                    <label className="field-label">
                      Letterhead
                      <FileUploadField
                        kind="document"
                        label="Upload letterhead"
                        onChange={(file, validationError) => {
                          if (!file || validationError) return
                          setDocumentFile(file)
                          setDocumentType('letterhead')
                          setUploadModalOpen(true)
                        }}
                      />
                    </label>
                  </div>

                  <div className="field-full-width">
                    <label className="field-label">
                      Address Line 1
                      <input name="address_line_1" defaultValue={headOffice?.address_line_1 ?? ''} placeholder="Street address" />
                    </label>
                  </div>

                  <label className="field-label">
                    City
                    <input name="city" defaultValue={headOffice?.city ?? ''} />
                  </label>
                  <label className="field-label">
                    State
                    <input name="state" defaultValue={headOffice?.state ?? ''} />
                  </label>

                  <label className="field-label">
                    Primary Email
                    <input name="primaryEmail" type="email" defaultValue={profile.primaryEmail ?? headOffice?.email ?? ''} />
                  </label>
                  <label className="field-label">
                    Primary Phone
                    <input name="primaryPhone" defaultValue={profile.primaryPhone ?? headOffice?.phone ?? ''} />
                  </label>
                  <label className="field-label">Postal Code<input name="postalCode" defaultValue={profile.postalCode ?? headOffice?.postal_code ?? ''} /></label>
                  <label className="field-label">Country<input name="country" defaultValue={profile.country ?? ''} /></label>
                  <label className="field-label">Alternate Phone<input name="alternatePhone" defaultValue={profile.alternatePhone ?? ''} /></label>
                  <label className="field-label">Website URL<input name="websiteUrl" type="url" defaultValue={profile.websiteUrl ?? ''} placeholder="https://example.edu" /></label>

                  <label className="field-label">
                    Timezone
                    <input name="branchTimezone" defaultValue={headOffice?.timezone ?? ''} placeholder="e.g. Asia/Kolkata" required />
                  </label>
                </div>
                <div className="primary-contact-panel"><div className="panel-inner-heading"><h3 className="h3">Primary point of contact</h3><span className={`status-badge ${contactStatus === 'Complete' ? 'tone-success' : 'tone-warning'}`}>{contactStatus}</span></div><div className="admin-form-grid"><label className="field-label">Name<input name="contactName" defaultValue={profile.contactName ?? ''} /></label><label className="field-label">Designation<input name="contactDesignation" defaultValue={profile.contactDesignation ?? ''} /></label><label className="field-label">Phone<input name="contactPhone" defaultValue={profile.contactPhone ?? ''} /></label><label className="field-label">Email<input name="contactEmail" type="email" defaultValue={profile.contactEmail ?? ''} /></label></div></div>
              </Card>
            </div>

            {/* 4. Branding Assets Section */}
            <div id="sec-branding">
              <Card className="profile-card">
                <SectionHeader title="4. Branding Assets" />
                <p className="section-caption">Logo and letterhead uploads or removals apply immediately. Save Changes applies institute and head office details.</p>
                <div className="branding-two-col">
                  <div className="branding-controls">
                    <section className="branding-asset-panel">
                      <div className="branding-asset-heading"><div><strong>Institute logo</strong><small>Used across reports, certificates, and portals.</small></div><span className="asset-status">Primary</span></div>
                      <div className="logo-upload-box">
                        <div className="logo-avatar-preview" style={{ background: primaryColor }}>
                          {logoPreview || profile?.logoUrl ? <img src={logoPreview || profile.logoUrl} alt="Institute logo preview" /> : displayName.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="logo-upload-actions">
                          <FileUploadField kind="image" label="Upload logo" value={logoFile} disabled={uploading} onChange={uploadLogo} />
                          <button type="button" className="btn-link-sm danger-text" onClick={() => void removeLogo()} disabled={uploading || (!logoFile && !logoAssetId && !profile?.logoUrl)}>Remove logo</button>
                        </div>
                      </div>
                    </section>

                    <section className="branding-asset-panel letterhead-panel">
                      <div className="branding-asset-heading"><div><strong>Letterhead</strong><small>Upload the official institute letterhead for documents.</small></div><span className="asset-status optional">Optional</span></div>
                      <div className="letterhead-preview">
                        {letterheadPreview ? (letterheadMimeType === 'application/pdf' ? <iframe src={letterheadPreview} title="Institute letterhead preview" /> : <img src={letterheadPreview} alt="Institute letterhead preview" />) : <div className="letterhead-empty"><FileText size={20} /><span>No letterhead uploaded</span></div>}
                      </div>
                      <div className="letterhead-actions"><FileUploadField kind="document" label="Upload letterhead" value={letterheadFile} disabled={uploading} onChange={uploadLetterhead} /><button type="button" className="btn-link-sm danger-text" onClick={() => void removeLetterhead()} disabled={uploading || !letterheadAssetId}>Remove letterhead</button></div>
                    </section>

                  </div>

                  {/* Real-time Live Preview Card */}
                  <div className="branding-live-preview-card">
                    <div className="live-preview-tag"><Eye size={13} /> Live Preview</div>
                    <div
                      className="report-preview-box"
                      style={{ borderTop: `4px solid ${primaryColor}` }}
                    >
                      {letterheadPreview ? <div className="preview-letterhead-asset">{letterheadMimeType === 'application/pdf' ? <iframe src={letterheadPreview} title="Letterhead live preview" /> : <img src={letterheadPreview} alt="Uploaded institute letterhead" />}</div> : null}
                      <div className="preview-brand-header">
                        {logoSource ? <img src={logoSource} alt="Uploaded institute logo" /> : <span className="preview-logo-fallback">{displayName.slice(0, 2).toUpperCase()}</span>}
                        <div><div className="preview-inst-name">{displayName || 'Institute Name'}</div><small>Official institute document</small></div>
                      </div>
                      <div className="preview-sub">Report Card — Term 1, 2026-27</div>
                      <div className="preview-sample-table">
                        <div className="preview-row"><span>Student: Rohan Verma</span><span>Class 8 - A</span></div>
                        <div className="preview-row"><span>Mathematics</span><strong>92 / 100</strong></div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </div>

            {/* 5. Academic Setup Section */}
            <div id="sec-academic">
              <Card className="profile-card">
                <SectionHeader title="5. Academic Setup" />
                <p className="section-caption">Academic years, terms, classes, and grading records are managed in Academic Structure. The institute language is saved under Identity.</p>
                <Link className="button-secondary profile-academic-link" to={`/academics/structure${window.location.search}`}>Open Academic Structure</Link>
              </Card>
            </div>
          </div>

          <div className="profile-sticky-footer">
            <span role="status">{saving ? 'Saving institute details…' : isDirty ? 'Unsaved changes' : saved ? 'Changes saved' : 'No unsaved changes'}</span>
            <button className="button-primary" type="submit" disabled={saving || !isDirty}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* Upload Document Modal */}
      <Modal
        open={uploadModalOpen}
        title="Upload Institute Document"
        description="Attach affiliation, registration, PAN, or GST certificates."
        onClose={() => setUploadModalOpen(false)}
        footer={
          <>
            <button className="button-secondary" type="button" onClick={() => setUploadModalOpen(false)}>
              Cancel
            </button>
            <button
              className="button-primary"
              type="button"
              disabled={!documentFile || uploading}
              onClick={async () => {
                if (!documentFile) { setUploadError('Select a document before uploading.'); return }
                setUploading(true); setUploadError('')
                try {
                  const result = await adminUpload<{ id?: string; uploadedDate?: string; type?: string }>(accessToken, 'institute/documents', documentFile, { documentType })
                  setDocumentFile(null); setUploadModalOpen(false)
                } catch (cause) { setUploadError(cause instanceof Error ? cause.message : 'The document could not be uploaded.') } finally { setUploading(false) }
              }}
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
          </>
        }
      >
        <div className="admin-form-grid" style={{ gap: '1rem' }}>
          <label className="field-label">
            Document Type
            <select value={documentType} onChange={(event) => setDocumentType(event.target.value)}>
              <option value="affiliation_certificate">Affiliation Certificate</option>
              <option value="registration_certificate">Registration Certificate</option>
              <option value="pan_card">PAN Card</option>
              <option value="gst_certificate">GST Certificate</option>
            </select>
          </label>
          <div className="field-label">
            Select File
            <FileUploadField kind="document" label="Select file" value={documentFile} onChange={(file, error) => { setDocumentFile(file); setUploadError(error ?? '') }} />
          </div>
        </div>
        {uploadError && <p className="form-error" role="alert">{uploadError}</p>}
      </Modal>
    </div>
  )
}
