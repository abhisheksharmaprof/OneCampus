import { FormEvent, useEffect, useState } from 'react'
import { CheckCircle2, Upload, FileText, Image as ImageIcon, Save, Eye } from 'lucide-react'
import { FileUploadField, Modal, PageSkeleton } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, adminUpload } from '../admin/admin.api'

interface InstituteProfile {
  id: string
  name: string
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
  primaryColor?: string
  gradingScale?: string
  startMonth?: string
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

interface InstituteDocument {
  id: string
  type: string
  uploadedDate: string
  status: 'Verified' | 'Pending'
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
  const [activeSection, setActiveSection] = useState<'identity' | 'legal' | 'contact' | 'academic'>('identity')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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
  const [displayName, setDisplayName] = useState('Greenfield High Group')
  const [primaryColor, setPrimaryColor] = useState('#2E5AAC')
  const [gradingScale, setGradingScale] = useState('percentage')
  const [isDirty, setIsDirty] = useState(false)

  const [documents, setDocuments] = useState<InstituteDocument[]>([
    { id: '1', type: 'Affiliation Certificate', uploadedDate: '12 Jan 2024', status: 'Verified' },
    { id: '2', type: 'Registration Certificate', uploadedDate: '—', status: 'Pending' },
    { id: '3', type: 'PAN Card', uploadedDate: '—', status: 'Pending' },
    { id: '4', type: 'GST Certificate', uploadedDate: '12 Jan 2024', status: 'Pending' },
  ])

  useEffect(() => {
    void adminRequest<InstituteProfile>(accessToken, 'institute')
      .then((data) => {
        setProfile(data)
        if (data.name) setDisplayName(data.name)
        if (data.primaryColor) setPrimaryColor(data.primaryColor)
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

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setSaved(false)

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
        const branchPayload: Record<string, any> = {}
        const branchName = form.get('branchName') as string
        if (branchName) branchPayload.name = branchName
        const timezone = form.get('branchTimezone') as string
        if (timezone) branchPayload.timezone = timezone
        const addr1 = form.get('address_line_1') as string
        if (addr1 !== null && addr1 !== undefined) branchPayload.address_line_1 = addr1
        const city = form.get('city') as string
        if (city !== null && city !== undefined) branchPayload.city = city
        const state = form.get('state') as string
        if (state !== null && state !== undefined) branchPayload.state = state
        const email = form.get('primaryEmail') as string
        if (email !== null && email !== undefined) branchPayload.email = email
        const phone = form.get('primaryPhone') as string
        if (phone !== null && phone !== undefined) branchPayload.phone = phone

        if (Object.keys(branchPayload).length > 0) {
          const updatedBranch = await adminRequest<Branch>(accessToken, `branches/${headOffice.id}`, {
            method: 'PATCH',
            body: JSON.stringify(branchPayload),
          })
          setHeadOffice(updatedBranch)
        }
      }

      setError('')
      setSaved(true)
      setIsDirty(false)
      setTimeout(() => setSaved(false), 4000)
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
    { id: 'academic', label: 'Academic Defaults' },
  ] as const
  const logoSource = logoPreview || profile?.logoUrl || ''

  return (
    <div className="entity-page profile-page-layout">
      <div className="page-heading institute-subpage-heading">
        <div>
          <p className="breadcrumb">Institute Setup / Institute Details</p>
          <h1>Institute Details</h1>
          <p className="page-subtitle">Manage institute identity, legal records, contact details, and academic defaults.</p>
        </div>
      </div>

      {error && <div className="inline-error" role="alert">{error}</div>}
      {saved && <div className="prototype-success-banner" role="status"><CheckCircle2 size={18} /> Institute profile updated successfully.</div>}

      {!profile ? (
        error ? null : <PageSkeleton name="institute-profile" label="Loading institute profile" variant="form" />
      ) : (
        <form className="profile-form-layout" onSubmit={save} onInput={() => setIsDirty(true)} onChange={() => setIsDirty(true)}>
          {/* Left Sticky Section Navigation */}
          <aside className="profile-section-nav-sticky">
            <nav className="section-nav-list" aria-label="Profile sections">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`section-nav-item ${activeSection === s.id ? 'active' : ''}`}
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
                    <input name="legalName" defaultValue={profile.legalName ?? 'Greenfield Educational Trust'} placeholder="Full registered legal entity name" />
                  </label>
                  <label className="field-label">
                    Display Name <span className="req">*</span>
                    <input
                      name="name"
                      defaultValue={profile.name}
                      onChange={(e) => setDisplayName(e.target.value)}
                      minLength={2}
                      maxLength={200}
                      required
                    />
                  </label>

                  <label className="field-label">
                    Institute Type
                    <select name="instituteType" defaultValue={profile.instituteType ?? 'School'}>
                      <option value="School">School</option>
                      <option value="College">College</option>
                      <option value="Coaching Center">Coaching Center</option>
                      <option value="University">University</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Board Affiliation
                    <select name="boardAffiliation" defaultValue={profile.boardAffiliation ?? 'CBSE'}>
                      <option value="CBSE">CBSE (Central Board of Secondary Education)</option>
                      <option value="ICSE">ICSE / CISCE</option>
                      <option value="IB">IB (International Baccalaureate)</option>
                      <option value="State Board">State Board</option>
                      <option value="Other">Other</option>
                    </select>
                  </label>

                  <label className="field-label">
                    Board Affiliation Number
                    <input name="boardAffiliationNo" defaultValue={profile.boardAffiliationNo ?? 'CBSE/AFF/1730489'} placeholder="e.g. CBSE/AFF/1730489" />
                  </label>
                  <label className="field-label">
                    UDISE Code
                    <input name="udiseCode" defaultValue={profile.udiseCode ?? '08120304501'} placeholder="11-digit UDISE code" />
                  </label>

                  <label className="field-label">
                    Establishment Year
                    <input name="estYear" type="number" defaultValue={profile.estYear ?? '1998'} placeholder="1998" />
                  </label>
                  <label className="field-label">
                    Medium of Instruction
                    <input name="medium" defaultValue={profile.medium ?? 'English'} placeholder="English" />
                  </label>

                  <div className="field-full-width">
                    <div className="field-label">Permanent Institute Code <span className="locked-field">🔒 Read-only</span></div>
                    <div className="institute-code-display" aria-label="Permanent institute code">
                      <code>{profile.code}</code>
                      <span>Assigned by the system platform</span>
                    </div>
                  </div>
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
                    <select name="entityType" defaultValue={profile.entityType ?? 'Trust'}>
                      <option value="Trust">Trust</option>
                      <option value="Society">Society</option>
                      <option value="Section 8 Company">Section 8 Company</option>
                      <option value="Private Limited">Private Limited</option>
                      <option value="Sole Proprietorship">Sole Proprietorship</option>
                    </select>
                  </label>
                  <label className="field-label">
                    Registration Number
                    <input name="registrationNo" defaultValue={profile.registrationNo ?? 'REG/JPR/1998/442'} placeholder="Registration number" />
                  </label>

                  <label className="field-label">
                    PAN Number
                    <input name="panNo" defaultValue={profile.panNo ?? 'AAATG1234F'} placeholder="10-digit PAN" />
                  </label>
                  <label className="field-label">
                    GST Number
                    <input name="gstNo" defaultValue={profile.gstNo ?? '08AAATG1234F1Z5'} placeholder="15-digit GSTIN" />
                  </label>
                </div>

                <div className="doc-panel-divider" />
                <div className="panel-inner-heading">
                  <h3 className="h3">Institute Documents</h3>
                  <button
                    type="button"
                    className="button-secondary btn-sm"
                    onClick={() => setUploadModalOpen(true)}
                  >
                    <Upload size={14} /> Upload Document
                  </button>
                </div>

                <table className="mini-table">
                  <thead>
                    <tr>
                      <th>Document Type</th>
                      <th>Uploaded Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id}>
                        <td>
                          <span className="row-name-cell">
                            <FileText size={15} color="var(--color-primary)" /> {doc.type}
                          </span>
                        </td>
                        <td>{doc.uploadedDate}</td>
                        <td>
                          <span className={`status-badge ${doc.status === 'Verified' ? 'tone-success' : 'tone-warning'}`}>
                            {doc.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                      <input name="branchName" defaultValue={headOffice?.name ?? 'Jaipur Main Campus'} required />
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
                      <input name="address_line_1" defaultValue={headOffice?.address_line_1 ?? 'Plot 12, Greenfield Campus, Tonk Road'} />
                    </label>
                  </div>

                  <label className="field-label">
                    City
                    <input name="city" defaultValue={headOffice?.city ?? 'Jaipur'} />
                  </label>
                  <label className="field-label">
                    State
                    <input name="state" defaultValue={headOffice?.state ?? 'Rajasthan'} />
                  </label>

                  <label className="field-label">
                    Primary Email
                    <input name="primaryEmail" type="email" defaultValue={profile.primaryEmail ?? headOffice?.email ?? 'info@greenfield.edu.in'} />
                  </label>
                  <label className="field-label">
                    Primary Phone
                    <input name="primaryPhone" defaultValue={profile.primaryPhone ?? headOffice?.phone ?? '0141-234 5678'} />
                  </label>
                  <label className="field-label">Postal Code<input name="postalCode" defaultValue={profile.postalCode ?? headOffice?.postal_code ?? ''} /></label>
                  <label className="field-label">Country<input name="country" defaultValue={profile.country ?? 'India'} /></label>
                  <label className="field-label">Alternate Phone<input name="alternatePhone" defaultValue={profile.alternatePhone ?? ''} /></label>
                  <label className="field-label">Website URL<input name="websiteUrl" type="url" defaultValue={profile.websiteUrl ?? ''} placeholder="https://example.edu" /></label>

                  <label className="field-label">
                    Timezone
                    <input name="branchTimezone" defaultValue={headOffice?.timezone ?? 'Asia/Kolkata'} required />
                  </label>
                </div>
                <div className="primary-contact-panel"><div className="panel-inner-heading"><h3 className="h3">Primary point of contact</h3><span className="status-badge tone-warning">Missing</span></div><div className="admin-form-grid"><label className="field-label">Name<input name="contactName" defaultValue={profile.contactName ?? ''} /></label><label className="field-label">Designation<input name="contactDesignation" defaultValue={profile.contactDesignation ?? ''} /></label><label className="field-label">Phone<input name="contactPhone" defaultValue={profile.contactPhone ?? ''} /></label><label className="field-label">Email<input name="contactEmail" type="email" defaultValue={profile.contactEmail ?? ''} /></label></div></div>
              </Card>
            </div>

            {/* 4. Branding Assets Section */}
            <div id="sec-branding">
              <Card className="profile-card">
                <SectionHeader title="4. Branding Assets" />
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

            {/* 5. Academic Defaults Section */}
            <div id="sec-academic">
              <Card className="profile-card">
                <SectionHeader title="5. Academic Defaults" />
                <div className="admin-form-grid">
                  <div className="field-full-width">
                    <label className="field-label">Default Grading Scale</label>
                    <div className="radio-group-options">
                      <label className="radio-opt">
                        <input
                          type="radio"
                          name="gradingScaleRadio"
                          checked={gradingScale === 'percentage'}
                          onChange={() => { setGradingScale('percentage'); setIsDirty(true) }}
                        />
                        Percentage (0–100%)
                      </label>
                      <label className="radio-opt">
                        <input
                          type="radio"
                          name="gradingScaleRadio"
                          checked={gradingScale === 'gpa'}
                          onChange={() => { setGradingScale('gpa'); setIsDirty(true) }}
                        />
                        GPA (4.0 or 10.0 Scale)
                      </label>
                      <label className="radio-opt">
                        <input
                          type="radio"
                          name="gradingScaleRadio"
                          checked={gradingScale === 'letter'}
                          onChange={() => { setGradingScale('letter'); setIsDirty(true) }}
                        />
                        Letter Grade (A+, A, B, C, F)
                      </label>
                    </div>
                  </div>

                  <label className="field-label">
                    Academic Year Start Month
                    <select name="startMonth" defaultValue={profile.startMonth ?? 'April'}>
                      <option value="January">January</option>
                      <option value="April">April</option>
                      <option value="June">June</option>
                      <option value="September">September</option>
                    </select>
                  </label>
                  <label className="field-label">Number of Terms<input name="numberOfTerms" type="number" min={1} max={4} defaultValue={2} /></label>
                  <label className="field-label">Language<input name="language" defaultValue={profile.medium ?? 'English'} /></label>
                  <label className="field-label">Currency<select name="currency" defaultValue="INR"><option value="INR">INR — Indian Rupee</option><option value="USD">USD — US Dollar</option><option value="EUR">EUR — Euro</option></select></label>
                </div>
              </Card>
            </div>
          </div>

          {/* Sticky Bottom Action Bar — rendered only when data is dirty */}
          {isDirty && (
            <div className="profile-sticky-footer">
              <button className="button-primary" type="submit" disabled={saving}>
                <Save size={16} /> {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          )}
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
                  setDocuments((prev) => [...prev, { id: result.id ?? String(Date.now()), type: result.type ?? documentType.replaceAll('_', ' '), uploadedDate: result.uploadedDate ?? 'Today', status: 'Pending' }])
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
