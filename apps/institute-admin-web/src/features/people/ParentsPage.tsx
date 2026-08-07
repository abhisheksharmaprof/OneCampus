import { type FormEvent, type ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Download, Link2, Mail, MessageSquare, Monitor, Plus, Search, Send, UserPlus, Users } from 'lucide-react'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { Modal, PageSkeleton } from '../../components/admin-ui'
import { adminRequest, AdminApiError } from '../admin/admin.api'

type Child = { id: string; name: string; relationship?: string; isPrimaryContact?: boolean }
type Parent = { id: string; fullName: string; email: string; phone: string; children: Child[]; portalAccess?: boolean; lastLogin?: string | null }
type Student = { id: string; firstName: string; lastName: string; admissionNumber: string }
type Tab = 'Directory' | 'Guardian Links' | 'Portal Access'

const initials = (name: string) => name.trim().split(/\s+/).map((part) => part[0] ?? '').join('').slice(0, 2).toUpperCase() || '?'
const relationship = (value?: string) => value ? value.charAt(0) + value.slice(1).toLowerCase() : 'Guardian'
const loginDate = (value?: string | null) => value ? new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value)) : 'Never'

function Field({ name, label, required, type = 'text', placeholder, children }: { name: string; label: string; required?: boolean; type?: string; placeholder?: string; children?: ReactNode }) {
  return <label className="pp-field"><span>{label}{required && <em className="pp-req">*</em>}</span>{children ?? <input name={name} type={type} placeholder={placeholder} required={required} autoComplete="off" />}</label>
}

function Stat({ label, value, caption, icon, tone = 'primary' }: { label: string; value: number | string; caption: string; icon: ReactNode; tone?: string }) {
  return <Card className={`pp-stat pp-stat--${tone}`}><span>{label}</span><i>{icon}</i><strong>{value}</strong><small>{caption}</small></Card>
}

export function ParentsPage({ accessToken, selectedBranch }: { accessToken: string; selectedBranch: string }) {
  const navigate = useNavigate()
  const [parents, setParents] = useState<Parent[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [tab, setTab] = useState<Tab>('Directory')
  const [modalMode, setModalMode] = useState<'parent' | 'link' | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [existingParent, setExistingParent] = useState<Parent | null>(null)
  const [phoneQuery, setPhoneQuery] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = new URLSearchParams()
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    if (search.trim()) params.set('search', search.trim())
    const query = params.toString() ? `?${params}` : ''
    void Promise.all([adminRequest<{ items: Parent[] }>(accessToken, `parents${query}`), adminRequest<{ items: Student[] }>(accessToken, `students${query}`)])
      .then(([parentData, studentData]) => { setParents(parentData.items); setStudents(studentData.items); setListError('') })
      .catch((error: unknown) => setListError(error instanceof Error ? error.message : 'Parents could not be loaded.'))
      .finally(() => setLoading(false))
  }, [accessToken, selectedBranch, search, revision])

  const closeModal = () => { setModalMode(null); setFormError(''); setExistingParent(null); setPhoneQuery('') }
  const handlePhoneChange = (value: string) => {
    setPhoneQuery(value)
    if (value.trim().length < 8) { setExistingParent(null); return }
    void adminRequest<{ items: Parent[] }>(accessToken, `parents?search=${encodeURIComponent(value.trim())}`).then((response) => setExistingParent(response.items.find((parent) => parent.phone === value.trim()) ?? response.items[0] ?? null)).catch(() => undefined)
  }
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setSaving(true); setFormError('')
    try {
      if (existingParent) await adminRequest(accessToken, `parents/${existingParent.id}/students`, { method: 'POST', body: JSON.stringify({ studentId: form.get('studentId'), relationship: form.get('relationship'), isPrimaryContact: form.get('isPrimaryContact') === 'on' }) })
      else await adminRequest(accessToken, 'parents', { method: 'POST', body: JSON.stringify({ fullName: form.get('fullName'), email: form.get('email'), phone: form.get('phone'), studentId: form.get('studentId'), relationship: form.get('relationship'), isPrimaryContact: form.get('isPrimaryContact') === 'on' }) })
      closeModal(); setRevision((value) => value + 1)
    } catch (error) { setFormError(error instanceof AdminApiError ? error.message : 'Parent could not be saved.') } finally { setSaving(false) }
  }
  const exportCsv = () => {
    const rows = ['Parent,Relationship,Children,Phone,Email,Portal access,Last login', ...parents.map((parent) => [parent.fullName, parent.children.map((child) => relationship(child.relationship)).join(' / '), parent.children.map((child) => child.name).join(' | '), parent.phone, parent.email, parent.portalAccess ? 'Enabled' : 'Disabled', parent.lastLogin ?? 'Never'].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))]
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'parents-directory.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  const active = parents.filter((parent) => parent.portalAccess).length
  const recent = parents.filter((parent) => parent.lastLogin).length
  const openLink = (parent?: Parent) => { setExistingParent(parent ?? null); setPhoneQuery(parent?.phone ?? ''); setModalMode('link') }

  if (loading) return <div className="entity-page parents-page"><div className="page-heading"><div><p className="breadcrumb">People / Parents</p><h1>Parents</h1></div></div><PageSkeleton name="parents-directory" label="Loading parent directory" variant="list" /></div>

  return <div className="entity-page parents-page">
    <div className="page-heading"><div><p className="breadcrumb">People / Parents</p><h1>Parents</h1><p className="page-subtitle">Manage parent records, guardian links, and portal access.</p></div><div className="pp-header-actions"><button type="button" className="button-secondary" onClick={() => undefined}><MessageSquare size={16} /> Bulk message</button><button type="button" className="button-primary" aria-label="Link parent" onClick={() => setModalMode('parent')}><UserPlus size={16} /> Add parent</button></div></div>
    {listError && <div className="inline-error" role="alert">{listError}</div>}
    <div className="pp-tabs" role="tablist" aria-label="Parents sections">{(['Directory', 'Guardian Links', 'Portal Access'] as Tab[]).map((item) => <button key={item} role="tab" type="button" aria-selected={tab === item} className={tab === item ? 'is-active' : ''} onClick={() => setTab(item)}>{item}</button>)}</div>

    {tab === 'Directory' && <>
      <div className="pp-stat-grid"><Stat label="Total parents" value={parents.length} caption="Registered guardians" icon={<Users />} /><Stat label="Portal active" value={active} caption="Using parent portal" icon={<Monitor />} tone="success" /><Stat label="Active this week" value={recent} caption="Recent sign-ins" icon={<Check />} tone="warning" /><Stat label="Never logged in" value={parents.length - recent} caption="Need invitation" icon={<Mail />} tone="danger" /></div>
      <Card className="entity-table-card"><div className="pp-toolbar"><SectionHeader title={`Parent directory (${loading ? '…' : parents.length})`} /><div className="pp-toolbar-actions"><button type="button" className="button-secondary button-small"><Mail size={14} /> Bulk invite</button><button type="button" className="button-secondary button-small" onClick={exportCsv}><Download size={14} /> Export</button><button type="button" className="button-primary button-small" onClick={() => setModalMode('parent')}><Plus size={14} /> Add parent</button></div><label className="pp-search"><Search size={15} /><span className="sr-only">Search parents</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by name, phone, email…" /></label></div>
        {loading ? <div className="pp-loading">Loading…</div> : parents.length === 0 ? <div className="pp-empty"><Users size={28} /><p>{search ? 'No parents match your search.' : 'No parents linked yet. Use Add parent to create one.'}</p></div> : <div className="pp-directory"><div className="pp-table-head"><span>Parent / guardian</span><span>Relationship</span><span>Children</span><span>Phone</span><span>Email</span><span>Portal</span><span>Last login</span><span /></div>{parents.map((parent) => <div className="pp-row" key={parent.id}><button className="pp-name-cell pp-name-button" type="button" onClick={() => navigate(`/parents/profile?parent=${parent.id}`)}><i className="pp-avatar">{initials(parent.fullName)}</i><span><strong>{parent.fullName}</strong><small>{parent.children.length} {parent.children.length === 1 ? 'child' : 'children'}</small></span></button><span className="pp-relationship">{relationship(parent.children[0]?.relationship)}</span><div className="pp-children">{parent.children.map((child) => <button key={child.id} type="button" className="pp-child-chip" onClick={() => navigate(`/students/profile?student=${child.id}`)}>{child.name}</button>)}</div><span>{parent.phone || '—'}</span><small>{parent.email || '—'}</small><span className={`pp-status ${parent.portalAccess ? 'is-active' : ''}`}>{parent.portalAccess ? <><Check size={13} /> Active</> : 'Inactive'}</span><span className="pp-last-login">{loginDate(parent.lastLogin)}</span><button type="button" className="button-secondary button-small" onClick={() => navigate(`/parents/profile?parent=${parent.id}`)}>View</button></div>)}</div>}</Card>
    </>}

    {tab === 'Guardian Links' && <Card className="pp-links-card"><SectionHeader title="Guardian ↔ student links" action={<button type="button" className="button-primary button-small" onClick={() => openLink()}><Link2 size={14} /> Add link</button>} /><div className="pp-links-grid">{parents.map((parent) => <article className="pp-link-card" key={parent.id}><div className="pp-link-card__heading"><i className="pp-avatar">{initials(parent.fullName)}</i><div><strong>{parent.fullName}</strong><small>{relationship(parent.children[0]?.relationship)} · {parent.phone || '—'}</small></div></div><div className="pp-linked-students">{parent.children.map((child) => <div key={child.id}><i className="pp-student-dot">{initials(child.name)}</i><span><strong>{child.name}</strong><small>{child.isPrimaryContact ? 'Primary contact' : 'Additional contact'}</small></span><b>{relationship(child.relationship)}</b></div>)}</div><button type="button" className="button-secondary button-small pp-add-child" onClick={() => openLink(parent)}><Plus size={14} /> Add child link</button></article>)}</div></Card>}

    {tab === 'Portal Access' && <><div className="pp-stat-grid"><Stat label="Portal users" value={active} caption="Activated accounts" icon={<Monitor />} /><Stat label="Login rate" value={parents.length ? `${Math.round((recent / parents.length) * 100)}%` : '0%'} caption="Parents signed in" icon={<Check />} tone="success" /><Stat label="Not invited" value={parents.length - active} caption="Need activation" icon={<Mail />} tone="warning" /><Stat label="Messages sent" value="—" caption="Not tracked in platform" icon={<Send />} /></div><Card className="entity-table-card"><div className="pp-toolbar"><SectionHeader title="Portal access management" /><div className="pp-toolbar-actions"><button className="button-secondary button-small" type="button"><Mail size={14} /> Invite all inactive</button><button className="button-secondary button-small" type="button" onClick={exportCsv}><Download size={14} /> Export</button></div></div><div className="pp-portal-table"><div className="pp-portal-head"><span>Parent</span><span>Portal access</span><span>Last login</span><span>Account</span><span>2FA</span></div>{parents.map((parent) => <div className="pp-portal-row" key={parent.id}><span className="pp-name-cell"><i className="pp-avatar">{initials(parent.fullName)}</i><b>{parent.fullName}<small>{parent.email || '—'}</small></b></span><span className={`pp-status ${parent.portalAccess ? 'is-active' : ''}`}>{parent.portalAccess ? 'Enabled' : 'Disabled'}</span><span>{loginDate(parent.lastLogin)}</span><span>{parent.portalAccess ? 'Portal account' : '—'}</span><span>{parent.portalAccess ? 'Not configured' : '—'}</span></div>)}</div></Card></>}

    <Modal open={modalMode !== null} title={modalMode === 'link' ? 'Add guardian link' : 'Add parent / guardian'} description={modalMode === 'link' ? 'Choose an existing parent and link them to a student.' : 'Create a parent record and link it to their child.'} size="large" onClose={closeModal}><form className="pp-form" onSubmit={submit}>{formError && <div className="inline-error" role="alert">{formError}</div>}{modalMode === 'parent' && <h3 className="pp-section-title">Parent details</h3>}<div className="pp-grid"><label className="pp-field"><span>Full name <em className="pp-req">*</em></span><input name="fullName" required disabled={modalMode === 'link' && Boolean(existingParent)} placeholder="e.g. Rohit Sharma" defaultValue={existingParent?.fullName ?? ''} key={existingParent?.id ?? 'new'} /></label><label className="pp-field"><span>Phone <em className="pp-req">*</em></span><input name="phone" type="tel" required placeholder="+91 98765 43210" value={phoneQuery} onChange={(event) => handlePhoneChange(event.target.value)} /></label>{modalMode === 'parent' && <Field name="email" label="Email" type="email" placeholder="parent@example.com" />}</div>{existingParent && <div className="pp-match-banner"><i className="pp-match-icon"><Check size={15} /></i><div><strong>Existing account found: {existingParent.fullName}</strong><span>Already linked to: {existingParent.children.length ? existingParent.children.map((child) => child.name).join(', ') : 'no children yet'}</span><small>Saving adds this student to the existing account without creating a duplicate.</small></div></div>}<h3 className="pp-section-title">Link to student</h3><div className="pp-grid"><Field name="studentId" label="Student" required><select name="studentId" required defaultValue=""><option value="" disabled>Select student</option>{students.map((student) => <option key={student.id} value={student.id}>{`${student.firstName} ${student.lastName}`.trim()} — {student.admissionNumber}</option>)}</select></Field><Field name="relationship" label="Relationship"><select name="relationship" defaultValue="GUARDIAN"><option value="FATHER">Father</option><option value="MOTHER">Mother</option><option value="GUARDIAN">Guardian</option></select></Field><label className="pp-checkbox"><input name="isPrimaryContact" type="checkbox" defaultChecked /> Mark as primary contact</label></div><div className="pp-form-actions"><button type="button" className="button-secondary" onClick={closeModal}>Cancel</button><button type="submit" className="button-primary" disabled={saving}>{saving ? 'Saving…' : existingParent || modalMode === 'link' ? 'Add guardian link' : 'Create & link parent'}</button></div></form></Modal>
  </div>
}
