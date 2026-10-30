import { useCallback, useEffect, useMemo, useState } from 'react'
import { BriefcaseBusiness, Camera, Check, ChevronRight, CircleUserRound, Mail, Pencil, Phone, RefreshCw, Save, ShieldCheck, UserRound, X } from 'lucide-react'
import { AdminApiError as AccountApiError } from '../admin/admin.api'
import { getAccountProfile, importAccountFields, updateAccountProfile, uploadAccountPhoto, type AccountProfile } from './account.api'
import './account.css'

const personalLabels: Record<string, string> = {
  dateOfBirth: 'Date of birth', gender: 'Gender', bloodGroup: 'Blood group', maritalStatus: 'Marital status',
  fatherName: "Father's name", motherName: "Mother's name", currentAddress: 'Current address', permanentAddress: 'Permanent address',
}
const importLabels: Record<string, string> = {
  dateOfBirth: 'Date of birth', gender: 'Gender', bloodGroup: 'Blood group', maritalStatus: 'Marital status',
  fatherName: "Father's name", motherName: "Mother's name", currentAddress: 'Current address', permanentAddress: 'Permanent address',
  qualification: 'Qualification', experienceYears: 'Years of experience', previousWorkplace: 'Previous workplace',
}

function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'U'
}

function prettyRole(value: string) {
  return value.toLowerCase().split('_').map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
}

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === '' ? 'Not added' : String(value)
}

export function AccountPage({ accessToken }: { accessToken: string }) {
  const [account, setAccount] = useState<AccountProfile | null>(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState(false)
  const [photoError, setPhotoError] = useState('')
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [editingContact, setEditingContact] = useState(false)
  const [editingExperience, setEditingExperience] = useState(false)
  const [alternateEmail, setAlternateEmail] = useState('')
  const [qualification, setQualification] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [previousWorkplace, setPreviousWorkplace] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({})
  const [notice, setNotice] = useState('')
  const [importOpen, setImportOpen] = useState(false)
  const [selectedImport, setSelectedImport] = useState<string[]>([])

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const result = await getAccountProfile(accessToken)
      setAccount(result)
      setAlternateEmail(result.alternateEmail)
      setQualification(result.workExperience.qualification)
      setExperienceYears(result.workExperience.experienceYears === null ? '' : String(result.workExperience.experienceYears))
      setPreviousWorkplace(result.workExperience.previousWorkplace)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Your account details could not be loaded.')
    }
  }, [accessToken])

  useEffect(() => { void load() }, [load])
  useEffect(() => () => { if (photoPreview) URL.revokeObjectURL(photoPreview) }, [photoPreview])

  const importFields = useMemo(() => Object.keys(account?.staff?.importable ?? {}), [account])

  const saveContact = async () => {
    setBusy(true); setNotice(''); setFieldErrors({})
    try {
      setAccount(await updateAccountProfile(accessToken, { alternateEmail }))
      setEditingContact(false); setNotice('Alternate contact email saved.')
    } catch (error) {
      if (error instanceof AccountApiError) setFieldErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'The alternate email could not be saved.')
    } finally { setBusy(false) }
  }

  const saveExperience = async () => {
    setBusy(true); setNotice(''); setFieldErrors({})
    const years = experienceYears.trim() ? Number(experienceYears) : null
    if (years !== null && (!Number.isInteger(years) || years < 0 || years > 80)) {
      setFieldErrors({ experienceYears: ['Enter a whole number from 0 to 80.'] }); setBusy(false); return
    }
    try {
      setAccount(await updateAccountProfile(accessToken, { qualification, experienceYears: years, previousWorkplace }))
      setEditingExperience(false); setNotice('Work experience saved to your account profile.')
    } catch (error) {
      if (error instanceof AccountApiError) setFieldErrors(error.fieldErrors)
      setNotice(error instanceof Error ? error.message : 'Work experience could not be saved.')
    } finally { setBusy(false) }
  }

  const handlePhoto = async (file?: File) => {
    if (!file) return
    setPhotoError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Choose a JPG, PNG, or WebP image.')
      return
    }
    const preview = URL.createObjectURL(file)
    setPhotoPreview((old) => { if (old) URL.revokeObjectURL(old); return preview })
    setBusy(true)
    try {
      const result = await uploadAccountPhoto(accessToken, file)
      setAccount((current) => current ? { ...current, photoUrl: result.photoUrl } : current)
      setPhotoPreview((old) => { if (old) URL.revokeObjectURL(old); return null })
      setNotice('Profile photo updated.')
    } catch (error) {
      setPhotoPreview((old) => { if (old) URL.revokeObjectURL(old); return null })
      setPhotoError(error instanceof Error ? error.message : 'The profile photo could not be uploaded.')
    } finally { setBusy(false) }
  }

  const confirmImport = async () => {
    if (!selectedImport.length) return
    setBusy(true); setNotice('')
    try {
      const result = await importAccountFields(accessToken, selectedImport)
      setAccount(result.profile); setImportOpen(false); setSelectedImport([])
      setNotice(
        `Imported ${result.imported.length} field${result.imported.length === 1 ? '' : 's'} from ${account?.staff?.institute}.${result.skipped.length ? ` ${result.skipped.length} field${result.skipped.length === 1 ? ' was' : 's were'} already filled or unavailable.` : ''}`,
      )
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The selected details could not be imported.')
      void load()
    } finally { setBusy(false) }
  }

  if (loadError) return <main className="account-page"><div className="account-load-error" role="alert"><CircleUserRound aria-hidden="true" /><h1>My account</h1><p>{loadError}</p><button className="account-button account-button--primary" onClick={() => void load()}><RefreshCw size={16} /> Try again</button></div></main>
  if (!account) return <main className="account-page"><div className="account-loading" role="status">Loading your account…</div></main>

  const photo = photoPreview ?? account.photoUrl
  return <main className="account-page">
    <div className="account-heading"><div><p className="account-eyebrow">YOUR SPACE</p><h1>My account</h1><p>Manage the details you own. Institute employment records stay with your institute.</p></div><span className="account-private"><ShieldCheck size={16} /> Private to your account</span></div>
    {notice && <p className="account-notice" role="status"><Check size={16} /> {notice}</p>}
    <section className="account-hero" aria-label="Profile overview">
      <div className="account-avatar-wrap">
        <div className={`account-avatar ${!photo ? 'account-avatar--empty' : ''}`}>{photo ? <img src={photo} alt={`${account.displayName} profile`} /> : <span>{initials(account.displayName)}</span>}</div>
        <label className="account-photo-button"><Camera size={15} /> {photo ? 'Change photo' : 'Add photo'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => { void handlePhoto(event.target.files?.[0]); event.currentTarget.value = '' }} /></label>
      </div>
      <div className="account-hero-copy"><span className="account-kicker">ACCOUNT PROFILE</span><h2>{account.displayName}</h2><div className="account-role-line"><span className="account-role-pill">{prettyRole(account.activeRole)}</span>{account.institute && <span>{account.institute}</span>}{account.branch && <><ChevronRight size={14} /><span>{account.branch}</span></>}</div><p>Your name and sign-in email come from your account record and can’t be edited here.</p></div>
      <div className="account-profile-status"><span className="account-status-dot" /> Active account</div>
    </section>
    {photoError && <p className="account-inline-error" role="alert">{photoError}</p>}

    <div className="account-grid">
      <section className="account-card account-card--wide">
        <div className="account-card-heading"><div className="account-card-icon"><UserRound size={18} /></div><div><h2>Personal information</h2><p>Account identity and personal details</p></div><span className="account-readonly">Read only</span></div>
        <div className="account-info-grid account-info-grid--personal">
          <Info label="Full name" value={account.displayName} />
          {Object.entries(personalLabels).map(([key, label]) => <Info key={key} label={label} value={account.personal[key]} />)}
        </div>
        {importFields.length > 0 && <div className="account-import"><div><strong>Some details are already on file</strong><p>Review and choose which empty account fields to copy from {account.staff?.institute}. This won’t change the institute record.</p></div><button className="account-button account-button--quiet" onClick={() => { setSelectedImport(importFields); setImportOpen((value) => !value) }}>{importOpen ? 'Close review' : 'Review details'}<ChevronRight size={15} /></button></div>}
        {importOpen && <div className="account-import-panel"><fieldset><legend>Choose details to copy</legend>{importFields.map((key) => <label key={key} className="account-import-option"><input type="checkbox" checked={selectedImport.includes(key)} onChange={(event) => setSelectedImport((current) => event.target.checked ? [...current, key] : current.filter((item) => item !== key))} /><span><strong>{importLabels[key] ?? key}</strong><small>{display(account.staff?.importable[key])}</small></span></label>)}</fieldset><button className="account-button account-button--primary" disabled={busy || !selectedImport.length} onClick={() => void confirmImport()}>Copy selected details</button></div>}
      </section>

      <section className="account-card">
        <div className="account-card-heading"><div className="account-card-icon"><Mail size={18} /></div><div><h2>Contact details</h2><p>Sign-in address remains protected</p></div></div>
        <div className="account-contact-main"><span className="account-contact-icon"><Mail size={16} /></span><div><small>Sign-in email</small><strong>{account.email}</strong><span className="account-verified"><ShieldCheck size={13} /> Used to sign in</span></div></div>
        <div className="account-contact-main"><span className="account-contact-icon"><Phone size={16} /></span><div><small>Phone number</small><strong>{display(account.phone)}</strong><span className={account.phoneVerified ? 'account-verified' : 'account-unverified'}>{account.phoneVerified ? 'Verified' : 'Not verified'}</span></div></div>
        <div className="account-edit-section"><div className="account-section-title"><div><h3>Alternate contact email</h3><p>For contact only. It cannot be your sign-in email.</p></div>{!editingContact && <button className="account-icon-button" aria-label="Edit alternate contact email" onClick={() => setEditingContact(true)}><Pencil size={16} /></button>}</div>
          {editingContact ? <div className="account-edit-form"><label htmlFor="alternate-email">Email address</label><input id="alternate-email" type="email" value={alternateEmail} onChange={(event) => setAlternateEmail(event.target.value)} aria-invalid={Boolean(fieldErrors.alternateEmail)} />{fieldErrors.alternateEmail?.map((error) => <span className="account-inline-error" role="alert" key={error}>{error}</span>)}<div className="account-form-actions"><button className="account-button account-button--quiet" onClick={() => { setEditingContact(false); setAlternateEmail(account.alternateEmail); setFieldErrors({}) }}><X size={15} /> Cancel</button><button className="account-button account-button--primary" disabled={busy} onClick={() => void saveContact()}><Save size={15} /> Save</button></div></div> : <div className="account-alternate-value"><span>{display(account.alternateEmail)}</span>{account.alternateEmail && <small className="account-unverified">Not verified</small>}</div>}
        </div>
      </section>

      <section className="account-card">
        <div className="account-card-heading"><div className="account-card-icon"><BriefcaseBusiness size={18} /></div><div><h2>Work experience</h2><p>Self-reported details in your account profile</p></div>{!editingExperience && <button className="account-icon-button" aria-label="Edit work experience" onClick={() => setEditingExperience(true)}><Pencil size={16} /></button>}</div>
        {editingExperience ? <div className="account-edit-form account-experience-form"><label htmlFor="qualification">Qualification</label><input id="qualification" value={qualification} maxLength={160} onChange={(event) => setQualification(event.target.value)} /><label htmlFor="experience-years">Years of experience</label><input id="experience-years" type="number" min="0" max="80" step="1" value={experienceYears} onChange={(event) => setExperienceYears(event.target.value)} aria-invalid={Boolean(fieldErrors.experienceYears)} />{fieldErrors.experienceYears?.map((error) => <span className="account-inline-error" role="alert" key={error}>{error}</span>)}<label htmlFor="previous-workplace">Previous workplace</label><input id="previous-workplace" value={previousWorkplace} maxLength={200} onChange={(event) => setPreviousWorkplace(event.target.value)} /><div className="account-form-actions"><button className="account-button account-button--quiet" onClick={() => { setEditingExperience(false); setQualification(account.workExperience.qualification); setExperienceYears(account.workExperience.experienceYears === null ? '' : String(account.workExperience.experienceYears)); setPreviousWorkplace(account.workExperience.previousWorkplace); setFieldErrors({}) }}><X size={15} /> Cancel</button><button className="account-button account-button--primary" disabled={busy} onClick={() => void saveExperience()}><Save size={15} /> Save</button></div></div> : <div className="account-experience-values"><Info label="Qualification" value={account.workExperience.qualification} /><Info label="Years of experience" value={account.workExperience.experienceYears} /><Info label="Previous workplace" value={account.workExperience.previousWorkplace} /></div>}
      </section>

      {account.staff && <section className="account-card account-card--wide account-hr-card"><div className="account-card-heading"><div className="account-card-icon"><BriefcaseBusiness size={18} /></div><div><h2>Institute work record</h2><p>Managed by {account.staff.institute}; edits here won’t change this record</p></div><span className="account-readonly">Institute managed</span></div><div className="account-info-grid"><Info label="Employee code" value={account.staff.employeeCode} /><Info label="Department" value={account.staff.department} /><Info label="Employment type" value={prettyRole(account.staff.employmentType)} /><Info label="Joining date" value={account.staff.joiningDate} /><Info label="Shift" value={account.staff.shift} /><Info label="Work location" value={account.staff.workLocation} /></div></section>}
    </div>
  </main>
}

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  return <div className="account-info-item"><span>{label}</span><strong>{display(value)}</strong></div>
}
