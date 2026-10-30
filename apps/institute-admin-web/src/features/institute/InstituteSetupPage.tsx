import { FormEvent, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import {
  Building2,
  ChevronRight,
  MoreHorizontal,
  Plus,
  Edit2,
  UserCheck,
  Users,
  GraduationCap,
  Layers,
  Eye,
  GitCompare,
  Network,
  Search,
} from 'lucide-react'
import { ConfirmationDialog, DataTable, Modal, PageSkeleton, Tabs, type DataTableColumn } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, AdminApiError, type PageData } from '../admin/admin.api'

interface Branch {
  id: string
  instituteSlug?: string | null
  instituteUrl?: string | null
  name: string
  code: string
  isHeadOffice: boolean
  isActive: boolean
  timezone: string
  address_line_1: string
  address_line_2: string
  city: string
  state: string
  postal_code: string
  phone: string
  email: string
  branch_admin_name: string
  studentCount: number
  staffCount: number
  sectionCount: number
  latitude?: string
  longitude?: string
}

interface InstituteAssociation {
  id: string
  instituteId?: string
  institute_id?: string
  name?: string
  instituteName?: string
  institute_name?: string
  code?: string
  city?: string
  status?: string
}

const emptyPage = <T,>(): PageData<T> => ({
  count: 0,
  page: 1,
  pageSize: 25,
  totalPages: 1,
  next: null,
  previous: null,
  items: [],
})

/** Legacy campus-site maintenance is intentionally a compact dialog. Details stay on their own route. */
function CampusSiteModal({
  isOpen,
  branch,
  busy,
  onClose,
  onSubmit,
}: {
  isOpen: boolean
  branch?: Branch
  busy: boolean
  onClose: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <Modal
      open={isOpen}
      title={branch ? `Edit campus site — ${branch.name}` : 'Add campus site'}
      description="Campus sites are legacy operational locations. Independent institutes are managed separately below."
      size="medium"
      onClose={() => { if (!busy) onClose() }}
      footer={<><button className="button-secondary" onClick={onClose} type="button" disabled={busy}>Cancel</button><button className="button-primary" form="campus-site-form" type="submit" disabled={busy}>{busy ? 'Saving…' : branch ? 'Save campus site' : 'Create campus site'}</button></>}
    >
      <form id="campus-site-form" className="admin-form-grid" onSubmit={onSubmit}>
        <label className="field-label">Campus site name <span className="req">*</span><input name="name" defaultValue={branch?.name} placeholder="e.g. Jaipur Main Campus" required minLength={2} /></label>
        <div className="field-row"><label className="field-label">City<input name="city" defaultValue={branch?.city} placeholder="Jaipur" /></label><label className="field-label">State<input name="state" defaultValue={branch?.state} placeholder="Rajasthan" /></label></div>
        <label className="field-label">Address<input name="address_line_1" defaultValue={branch?.address_line_1} placeholder="Street address" /></label>
        <div className="field-row"><label className="field-label">Phone<input name="phone" defaultValue={branch?.phone} inputMode="tel" /></label><label className="field-label">Email<input name="email" defaultValue={branch?.email} type="email" /></label></div>
        <label className="field-label">Site administrator<input name="branch_admin_name" defaultValue={branch?.branch_admin_name} placeholder="Name" /></label>
        <input name="address_line_2" type="hidden" defaultValue={branch?.address_line_2} /><input name="postal_code" type="hidden" defaultValue={branch?.postal_code} />
        <input name="timezone" type="hidden" defaultValue={branch?.timezone ?? 'Asia/Kolkata'} />
        {branch && !branch.isHeadOffice && <label className="checkbox-label"><input name="isActive" type="checkbox" defaultChecked={branch.isActive} /> Active campus site</label>}
      </form>
    </Modal>
  )
}

/* =========================================================
   MAIN INSTITUTE SETUP PAGE (BRANCHES LIST + BRANCH DETAIL)
========================================================= */
export function InstituteSetupPage({
  accessToken,
  branchId,
  onOpenBranch,
  onBranchesChanged,
}: {
  accessToken: string
  branchId?: string
  onOpenBranch: (id: string) => void
  onBranchesChanged: () => void
}) {
  const [data, setData] = useState<PageData<Branch>>(emptyPage)
  const [loading, setLoading] = useState(true)
  const [branch, setBranch] = useState<Branch | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL')
  const [page, setPage] = useState(1)
  const [revision, setRevision] = useState(0)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<Branch | undefined>()
  const [viewing, setViewing] = useState<Branch | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [confirmDeactivate, setConfirmDeactivate] = useState(false)
  const [deactivatingBranch, setDeactivatingBranch] = useState<Branch | null>(null)
  const [associations, setAssociations] = useState<InstituteAssociation[]>([])
  const [associationsLoading, setAssociationsLoading] = useState(true)
  const [associationModal, setAssociationModal] = useState<'create' | 'link' | null>(null)
  const [comparisonOpen, setComparisonOpen] = useState(false)

  // Fetch Branches List
  useEffect(() => {
    const c = new AbortController()
    setLoading(true)
    setError('')
    const q = new URLSearchParams({ page: String(page), pageSize: '25' })
    if (search) q.set('search', search)
    if (statusFilter !== 'ALL') q.set('isActive', statusFilter === 'ACTIVE' ? 'true' : 'false')

    void adminRequest<PageData<Branch>>(accessToken, `branches?${q}`, { signal: c.signal })
      .then(setData)
      .catch((e: unknown) => {
        if (c.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Campus sites could not be loaded.')
      })
      .finally(() => { if (!c.signal.aborted) setLoading(false) })
    return () => c.abort()
  }, [accessToken, page, revision, search, statusFilter])

  // Fetch Single Branch Detail
  useEffect(() => {
    if (!branchId) {
      setBranch(null)
      return
    }
    const c = new AbortController()
    setError('')
    void adminRequest<Branch>(accessToken, `branches/${branchId}`, { signal: c.signal })
      .then(setBranch)
      .catch((e: unknown) => {
        if (c.signal.aborted) return
        setError(e instanceof Error ? e.message : 'Branch could not be loaded.')
      })
    return () => c.abort()
  }, [accessToken, branchId, revision])

  useEffect(() => {
    const controller = new AbortController()
    setAssociationsLoading(true)
    void adminRequest<PageData<InstituteAssociation> | InstituteAssociation[]>(accessToken, 'institute-associations', { signal: controller.signal })
      .then((response) => setAssociations(Array.isArray(response) ? response : response.items ?? []))
      .catch((e: unknown) => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Associated institutes could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setAssociationsLoading(false) })
    return () => controller.abort()
  }, [accessToken, revision])

  const handleSaveBranch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    const raw = new FormData(event.currentTarget)
    // Keep this payload aligned with BranchCreateSerializer/BranchUpdateSerializer.
    // The API intentionally does not accept code, head-office status, country, or
    // map coordinates from this endpoint, and rejects unknown fields strictly.
    const payload: Record<string, string | boolean> = {
      name: String(raw.get('name') ?? ''),
      timezone: String(raw.get('timezone') ?? 'Asia/Kolkata'),
      address_line_1: String(raw.get('address_line_1') ?? ''),
      address_line_2: String(raw.get('address_line_2') ?? ''),
      city: String(raw.get('city') ?? ''),
      state: String(raw.get('state') ?? ''),
      postal_code: String(raw.get('postal_code') ?? ''),
      phone: String(raw.get('phone') ?? ''),
      email: String(raw.get('email') ?? ''),
      branch_admin_name: String(raw.get('branch_admin_name') ?? ''),
    }

    if (editing && !editing.isHeadOffice) {
      payload.isActive = raw.get('isActive') === 'on'
    }

    try {
      await adminRequest<Branch>(accessToken, editing ? `branches/${editing.id}` : 'branches', {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      })
      setDrawerOpen(false)
      setRevision((n) => n + 1)
      onBranchesChanged()
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'The campus site could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const handleToggleStatus = async (b: Branch) => {
    if (b.isHeadOffice) return
    setBusy(true)
    try {
      await adminRequest<Branch>(accessToken, `branches/${b.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !b.isActive }),
      })
      setRevision((n) => n + 1)
      onBranchesChanged()
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'Campus-site status could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  const handleDeactivate = async () => {
    const target = deactivatingBranch || branch
    if (!target) return
    setBusy(true)
    setError('')
    try {
      await adminRequest<Branch>(accessToken, `branches/${target.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: false }),
      })
      setConfirmDeactivate(false)
      setDeactivatingBranch(null)
      setRevision((n) => n + 1)
      onBranchesChanged()
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'The campus site could not be deactivated.')
    } finally {
      setBusy(false)
    }
  }

  const handleAssociationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!associationModal) return
    setBusy(true)
    setError('')
    const raw = new FormData(event.currentTarget)
    const payload = associationModal === 'create'
      ? { action: 'create', name: String(raw.get('name') ?? ''), city: String(raw.get('city') ?? ''), email: String(raw.get('email') ?? '') }
      : { action: 'link', instituteId: String(raw.get('instituteId') ?? '') }
    try {
      await adminRequest<InstituteAssociation>(accessToken, 'institute-associations', { method: 'POST', body: JSON.stringify(payload) })
      setAssociationModal(null)
      setRevision((n) => n + 1)
      onBranchesChanged()
    } catch (e) {
      setError(e instanceof AdminApiError ? e.message : 'The institute association could not be saved.')
    } finally {
      setBusy(false)
    }
  }

  const columns: DataTableColumn<Branch>[] = [
    {
      id: 'name',
      header: 'Campus site',
      sortable: true,
      cell: (b) => (
        <span className="row-name-cell">
          <Building2 size={16} className="branch-icon-head" />
          <button className="row-name-link" onClick={() => setViewing(b)} type="button">
            {b.name}
          </button>
          {b.isHeadOffice && <span className="status-badge tone-info hq-badge">HQ</span>}
        </span>
      ),
    },
    { id: 'code', header: 'Code', cell: (b) => <span className="code-font">{b.code}</span> },
    { id: 'city', header: 'City', cell: (b) => b.city || '—' },
    { id: 'admin', header: 'Site administrator', cell: (b) => b.branch_admin_name || 'Unassigned' },
    { id: 'students', header: 'Students', align: 'end', cell: (b) => b.studentCount },
    {
      id: 'status',
      header: 'Status',
      cell: (b) => (
        <label className="switch-toggle" title={b.isHeadOffice ? 'HQ status cannot be toggled' : 'Toggle status'}>
          <input
            type="checkbox"
            checked={b.isActive}
            disabled={b.isHeadOffice || busy}
            onChange={() => void handleToggleStatus(b)}
          />
          <span className="switch-slider" />
        </label>
      ),
    },
    {
      id: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: (b) => (
        <div className="page-actions">
          <button
            className="button-secondary btn-sm"
            type="button"
            onClick={() => setViewing(b)}
          >
            View
          </button>
          <button
            className="admin-icon-button"
            aria-label={`Edit ${b.name}`}
            type="button"
            onClick={() => {
              setEditing(b)
              setDrawerOpen(true)
            }}
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      ),
    },
  ]

  // Preserve old deep links, but present their content as a dialog instead of a separate detail surface.
  if (branchId) {
    if (!branch) {
      return (
        <div className="entity-page">
          {error ? <div role="alert" className="inline-error">{error}</div> : <PageSkeleton name="branch-detail" label="Loading branch details" variant="detail" />}
        </div>
      )
    }
    return <>
      <BranchDetailModal branch={branch} busy={busy} onClose={() => window.history.back()} onEdit={() => { setEditing(branch); setDrawerOpen(true) }} onDeactivate={() => { setDeactivatingBranch(branch); setConfirmDeactivate(true) }} />
      <CampusSiteModal isOpen={drawerOpen} branch={editing} busy={busy} onClose={() => setDrawerOpen(false)} onSubmit={handleSaveBranch} />
      <ConfirmationDialog open={confirmDeactivate} title={`Deactivate ${branch.name}?`} consequence={`Deactivating this campus site will hide it from the site switcher for all roles and disable new enrollments here. Existing student/staff records are retained (${branch.studentCount} students, ${branch.staffCount} staff).`} confirmLabel="Deactivate campus site" busy={busy} onCancel={() => { setConfirmDeactivate(false); setDeactivatingBranch(null) }} onConfirm={() => void handleDeactivate()} />
    </>
  }

  // Branches List View
  return (
    <div className="entity-page institute-setup-page branch-reference-page">
      <div className="branch-reference-header">
        <div>
          <p className="breadcrumb">Home <span>›</span> Institute Setup <span>›</span> Branches &amp; Campuses</p>
          <h1>Branches &amp; Campuses</h1>
          <p>Manage campus sites and open the records scoped to each one.</p>
          {data.items[0]?.instituteUrl && <p className="section-caption">Institute URL: <a href={data.items[0].instituteUrl} target="_blank" rel="noreferrer">{data.items[0].instituteUrl}</a> · Branch codes are short 3–4 character identifiers.</p>}
        </div>
        <div className="page-actions"><button className="button-secondary" type="button" onClick={() => setComparisonOpen(true)}><GitCompare size={16} /> Compare</button><button className="button-secondary" type="button" onClick={() => setAssociationModal('create')}><Building2 size={16} /> Add Institute</button><button className="button-primary" type="button" onClick={() => { setEditing(undefined); setDrawerOpen(true) }}><Plus size={16} /> Add Branch</button></div>
      </div>
      <div className="branch-kpi-grid" aria-label="Campus summary">
        <BranchKpi label="Campus sites" value={loading ? '—' : data.count} hint={loading ? 'Loading campuses' : `${data.items.length} shown on this page`} tone="blue" icon={<Network size={20} />} />
        <BranchKpi label="Students in view" value={loading ? '—' : data.items.reduce((total, item) => total + item.studentCount, 0)} hint="Across shown campuses" tone="green" icon={<GraduationCap size={20} />} />
        <BranchKpi label="Staff in view" value={loading ? '—' : data.items.reduce((total, item) => total + item.staffCount, 0)} hint="Across shown campuses" tone="gold" icon={<Users size={20} />} />
        <BranchKpi label="Head offices in view" value={loading ? '—' : data.items.filter((item) => item.isHeadOffice).length} hint="On this page" tone="purple" icon={<Building2 size={20} />} />
      </div>

      {error ? <div role="alert" className="inline-error">{error}</div> : null}

      <section className="branch-list" aria-label="Campus sites">
        <div className="branch-list-toolbar">
          <label className="branch-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Search campuses</span>
            <input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="Search by campus, city, or code" />
          </label>
          <label className="branch-status-filter"><span>Status</span><select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as typeof statusFilter); setPage(1) }}><option value="ALL">All campuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
          <div className="branch-list-pagination" aria-label="Campus list pagination">
            <span>{loading ? 'Loading campuses…' : data.count ? `Showing ${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.count)} of ${data.count}` : 'No campuses to show'}</span>
            <button className="button-secondary btn-sm" type="button" aria-label="Previous page" disabled={loading || !data.previous} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button>
            <span>Page {data.page} of {data.totalPages}</span>
            <button className="button-secondary btn-sm" type="button" aria-label="Next page" disabled={loading || !data.next} onClick={() => setPage((value) => value + 1)}>Next</button>
          </div>
        </div>
        {loading ? <PageSkeleton name="campus-list" label="Loading campus sites" variant="list" /> : data.items.length ? <div className="branch-card-grid">{data.items.map((item, index) => <BranchReferenceCard key={item.id} branch={item} color={['#2e5aac', '#1e8e5a', '#bd7b17'][index % 3]} onView={() => setViewing(item)} onEdit={() => { setEditing(item); setDrawerOpen(true) }} />)}</div> : <div className="branch-list-empty"><h2>{search || statusFilter !== 'ALL' ? 'No campuses match these filters' : 'No campuses yet'}</h2><p>{search || statusFilter !== 'ALL' ? 'Try another search or status, or clear the filters.' : 'Add a campus to start managing branch-specific records.'}</p>{search || statusFilter !== 'ALL' ? <button className="button-secondary" type="button" onClick={() => { setSearch(''); setStatusFilter('ALL'); setPage(1) }}>Clear filters</button> : <button className="button-primary" type="button" onClick={() => { setEditing(undefined); setDrawerOpen(true) }}><Plus size={16} /> Add Branch</button>}</div>}
      </section>

      <CampusSiteModal
        isOpen={drawerOpen}
        branch={editing}
        busy={busy}
        onClose={() => setDrawerOpen(false)}
        onSubmit={handleSaveBranch}
      />

      <BranchDetailModal
        branch={viewing}
        busy={busy}
        onClose={() => setViewing(null)}
        onEdit={() => {
          if (!viewing) return
          setEditing(viewing)
          setViewing(null)
          setDrawerOpen(true)
        }}
        onDeactivate={() => {
          if (!viewing) return
          setDeactivatingBranch(viewing)
          setConfirmDeactivate(true)
        }}
      />

      <Modal open={comparisonOpen} title="Campus comparison" description={`Compare the ${data.items.length === 1 ? 'campus' : 'campuses'} shown on this page.`} size="large" onClose={() => setComparisonOpen(false)} footer={<button className="button-primary" type="button" onClick={() => setComparisonOpen(false)}>Close</button>}><table className="mini-table"><thead><tr><th>Campus</th><th>Students</th><th>Staff</th><th>Sections</th><th>Status</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.studentCount}</td><td>{item.staffCount}</td><td>{item.sectionCount}</td><td><span className={`status-badge ${item.isActive ? 'tone-success' : 'tone-danger'}`}>{item.isActive ? 'Active' : 'Inactive'}</span></td></tr>)}</tbody></table></Modal>

      <Modal
        open={associationModal !== null}
        title={associationModal === 'create' ? 'Create independent institute' : 'Link an existing institute'}
        description={associationModal === 'create' ? 'This creates a new, independent institute and associates it with the current institute.' : 'Enter the registered institute ID to associate two independent institutes.'}
        onClose={() => { if (!busy) setAssociationModal(null) }}
        footer={<><button className="button-secondary" type="button" disabled={busy} onClick={() => setAssociationModal(null)}>Cancel</button><button className="button-primary" type="submit" form="institute-association-form" disabled={busy}>{busy ? 'Saving…' : associationModal === 'create' ? 'Create & associate' : 'Link institute'}</button></>}
      >
        <form id="institute-association-form" className="admin-form-grid" onSubmit={handleAssociationSubmit}>
          {associationModal === 'create' ? <>
            <label className="field-label field-full-width">Institute name <span className="req">*</span><input name="name" required minLength={2} placeholder="e.g. Horizon Public School" /></label>
            <label className="field-label">City<input name="city" placeholder="e.g. Jaipur" /></label>
            <label className="field-label">Administrator email<input name="email" type="email" placeholder="admin@example.edu" /></label>
          </> : <label className="field-label">Registered institute ID <span className="req">*</span><input name="instituteId" required placeholder="Paste the institute ID" /></label>}
        </form>
      </Modal>
    </div>
  )
}

function BranchDetailModal({ branch, busy, onClose, onEdit, onDeactivate }: { branch: Branch | null; busy: boolean; onClose: () => void; onEdit: () => void; onDeactivate: () => void }) {
  if (!branch) return null
  return <Modal open title={<span className="branch-modal-title"><Building2 size={18} /> {branch.name}<span className={`status-badge ${branch.isActive ? 'tone-success' : 'tone-danger'}`}>{branch.isActive ? 'Active' : 'Inactive'}</span></span>} description="Campus site details" size="large" onClose={() => { if (!busy) onClose() }} footer={<><button className="button-secondary" type="button" onClick={onClose}>Close</button><button className="button-primary" type="button" onClick={onEdit}><Edit2 size={15} /> Edit site</button></>}><BranchDetail branch={branch} onDeactivate={onDeactivate} /></Modal>
}

function BranchKpi({ label, value, hint, tone, icon }: { label: string; value: string | number; hint: string; tone: string; icon: ReactNode }) {
  return <div className="branch-kpi"><div><span>{label}</span><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong>{hint ? <small>{hint}</small> : null}</div><i className={`branch-kpi-icon ${tone}`}>{icon}</i></div>
}

function BranchReferenceCard({ branch, color, onView, onEdit }: { branch: Branch; color: string; onView: () => void; onEdit: () => void }) {
  const abbreviation = branch.code || branch.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 3).toUpperCase()
  const location = [branch.city, branch.state].filter(Boolean).join(', ')
  return <article className="branch-reference-card" style={{ '--branch-color': color } as CSSProperties}>
    <header><div className="branch-card-name"><b>{abbreviation}</b><div><strong>{branch.name}</strong><small>{location || 'Location not set'}</small></div></div><em>{branch.isHeadOffice ? 'Head office' : 'Branch'}</em></header>
    <div className="branch-card-body"><div className="branch-counts"><div><strong>{branch.studentCount}</strong><span>Students</span></div><div><strong>{branch.staffCount}</strong><span>Staff</span></div></div><dl><div><dt>Branch Head</dt><dd>{branch.branch_admin_name || 'Unassigned'}</dd></div><div><dt>Status</dt><dd><mark>{branch.isActive ? 'Active' : 'Inactive'}</mark></dd></div></dl><footer><button className="button-secondary btn-sm" type="button" onClick={onView}><Eye size={15} /> Details</button><button className="button-secondary btn-sm" type="button" onClick={onEdit}><Edit2 size={15} /> Edit</button></footer></div>
  </article>
}

/* =========================================================
   BRANCH DETAIL
========================================================= */
function BranchDetail({ branch, onDeactivate }: { branch: Branch; onDeactivate: () => void }) {
  const [activeId, setActiveId] = useState('overview')
  const branchParam = `branch=${encodeURIComponent(branch.id)}`

  const tabs = [
    {
      id: 'overview',
      label: 'Overview',
      panel: (
        <div className="branch-overview-grid">
          <Card className="branch-overview-card">
            <SectionHeader title="Location & Address" />
            <div className="detail-list">
              <div>
                <span>Address</span>
                <strong>
                  {[branch.address_line_1, branch.address_line_2, branch.city, branch.state, branch.postal_code]
                    .filter(Boolean)
                    .join(', ') || 'Not provided'}
                </strong>
              </div>
              <div>
                <span>Timezone</span>
                <strong>{branch.timezone || 'Not provided'}</strong>
              </div>
            </div>
          </Card>

          <div className="branch-overview-stack">
            <Card className="branch-overview-card">
              <SectionHeader title="Contact Information" />
              <div className="detail-list">
                <div>
                  <span>Branch Admin</span>
                  <strong>{branch.branch_admin_name || 'Not assigned'}</strong>
                </div>
                <div>
                  <span>Phone</span>
                  <strong>{branch.phone || 'Not provided'}</strong>
                </div>
                <div>
                  <span>Email</span>
                  <strong>{branch.email || 'Not provided'}</strong>
                </div>
              </div>
            </Card>

            <Card className="branch-overview-card">
              <SectionHeader title="Quick Stats" />
              <div className="quick-stat-rows">
                <div className="quick-stat-row">
                  <span className="stat-label"><Users size={16} /> Staff</span>
                  <div className="stat-value-group">
                    <strong>{branch.staffCount}</strong>
                    <button type="button" className="btn-link-sm" onClick={() => setActiveId('staff')}>
                      View →
                    </button>
                  </div>
                </div>
                <div className="quick-stat-row">
                  <span className="stat-label"><GraduationCap size={16} /> Students</span>
                  <div className="stat-value-group">
                    <strong>{branch.studentCount}</strong>
                    <button type="button" className="btn-link-sm" onClick={() => setActiveId('students')}>
                      View →
                    </button>
                  </div>
                </div>
                <div className="quick-stat-row">
                  <span className="stat-label"><Layers size={16} /> Class Sections</span>
                  <div className="stat-value-group">
                    <strong>{branch.sectionCount}</strong>
                    <button type="button" className="btn-link-sm" onClick={() => setActiveId('classes')}>
                      View →
                    </button>
                  </div>
                </div>
              </div>
            </Card>

            {!branch.isHeadOffice && branch.isActive && (
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  className="button-secondary danger-text"
                  type="button"
                  onClick={onDeactivate}
                >
                  Deactivate Branch
                </button>
              </div>
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'staff',
      label: 'Staff',
      panel: (
        <Card className="entity-table-card">
          <div className="panel-inner-heading"><h3>Staff at {branch.name}</h3><span className="badge badge-blue">{branch.staffCount} listed</span></div>
          <p>Open the staff directory to view the current records for this campus.</p>
          <a className="button-secondary" href={`/staff?${branchParam}`}>Open staff directory</a>
        </Card>
      ),
    },
    {
      id: 'students',
      label: 'Students',
      panel: (
        <Card className="entity-table-card">
          <div className="panel-inner-heading"><h3>Students at {branch.name}</h3><span className="badge badge-green">{branch.studentCount} listed</span></div>
          <p>Open the student directory to search and review the current campus records.</p>
          <a className="button-secondary" href={`/students?${branchParam}`}>Open student directory</a>
        </Card>
      ),
    },
    {
      id: 'classes',
      label: 'Class Sections',
      panel: (
        <Card className="entity-table-card">
          <div className="panel-inner-heading"><h3>Class sections at {branch.name}</h3><span className="badge badge-blue">{branch.sectionCount} listed</span></div>
          <p>Manage the live classes, sections, and subjects in Academic Structure.</p>
          <a className="button-secondary" href={`/academics/structure?${branchParam}`}>Open Academic Structure</a>
        </Card>
      ),
    },
  ]

  return <Tabs tabs={tabs} activeId={activeId} onChange={setActiveId} label="Branch detail" />
}
