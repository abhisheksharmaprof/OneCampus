import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardCheck,
  CreditCard,
  FileText,
  Globe2,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings2,
  ShieldCheck,
  UserCog,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import './platform-admin.css'

export type PlatformSession = {
  accessToken: string
  refreshToken: string
  user: { id: string; displayName: string; roles: string[]; activeRole: string; instituteId: string; branchIds: string[] }
  onboarding?: { completed: boolean; status?: string; instituteName?: string; rejectionReason?: string }
}

type PlatformSection = 'overview' | 'registrations' | 'institutes' | 'subscriptions' | 'users' | 'audit' | 'settings'

type Application = {
  id: string
  name: string
  city: string
  owner: string
  email: string
  submitted: string
  plan: string
  status: 'Needs review' | 'In review'
}

const applicationsSeed: Application[] = [
  { id: 'REG-1048', name: 'Oakridge Public School', city: 'Bengaluru, Karnataka', owner: 'Rohan Mehta', email: 'rohan@oakridge.edu', submitted: 'Today, 10:42 AM', plan: 'Growth', status: 'Needs review' },
  { id: 'REG-1047', name: 'The Heritage Academy', city: 'Pune, Maharashtra', owner: 'Nandini Shah', email: 'nandini@heritage.ac.in', submitted: 'Yesterday, 4:18 PM', plan: 'Scale', status: 'In review' },
  { id: 'REG-1046', name: 'Riverbend International', city: 'Jaipur, Rajasthan', owner: 'Aditya Singh', email: 'aditya@riverbend.school', submitted: 'Aug 01, 2026', plan: 'Starter', status: 'Needs review' },
]

const institutes = [
  ['Northstar Academy', 'NSA', 'Mumbai, MH', 'Scale', '342', 'Active'],
  ['Greenfield Public School', 'GPS', 'Delhi, DL', 'Growth', '218', 'Active'],
  ['Bright Horizon School', 'BHS', 'Kochi, KL', 'Starter', '86', 'Trial'],
  ['St. Mary’s Convent', 'SMC', 'Lucknow, UP', 'Growth', '164', 'Past due'],
  ['Oakridge Public School', 'OPS', 'Bengaluru, KA', 'Growth', '—', 'Pending'],
]

const navItems: Array<{ id: PlatformSection; label: string; icon: typeof LayoutDashboard }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'registrations', label: 'Registration queue', icon: ClipboardCheck },
  { id: 'institutes', label: 'All institutes', icon: Building2 },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'users', label: 'Users & access', icon: Users },
  { id: 'audit', label: 'Audit activity', icon: Activity },
]

export function PlatformAdminPage({ session, onSignOut }: { session: PlatformSession; onSignOut: () => Promise<void> }) {
  const [section, setSection] = useState<PlatformSection>(() => sectionFromPath(window.location.pathname))
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [applications, setApplications] = useState(applicationsSeed)
  const [query, setQuery] = useState('')
  const [toast, setToast] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
    fetch(`${apiBase}/api/v1/admin/platform/registrations`, { headers: { Authorization: `Bearer ${session.accessToken}` } })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load registration queue.')))
      .then((payload: { data?: { items?: Array<Record<string, unknown>> } }) => {
        const items = payload.data?.items ?? []
        if (!items.length) return
        setApplications(items.map((item) => ({
          id: String(item.id), name: String(item.displayName || item.name), city: String(item.city || 'Details pending'), owner: String(item.contactName || 'Institute owner'), email: String(item.contactEmail || item.primaryEmail || '—'), submitted: 'Pending review', plan: 'Starter', status: 'Needs review' as const,
        })))
      })
      .catch(() => undefined)
  }, [session.accessToken])

  const goTo = (next: PlatformSection) => {
    setSection(next)
    window.history.pushState({}, '', next === 'overview' ? '/platform' : `/platform/${next}`)
    setMobileOpen(false)
  }

  const pending = applications.length
  const filteredInstitutes = useMemo(() => institutes.filter((row) => row.join(' ').toLowerCase().includes(query.toLowerCase())), [query])

  const updateApplication = async (id: string, action: 'approved' | 'rejected') => {
    const apiBase = (import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000').replace(/\/$/, '')
    const response = await fetch(`${apiBase}/api/v1/admin/platform/registrations/${id}/${action === 'approved' ? 'approve' : 'reject'}`, { method: 'POST', headers: { Authorization: `Bearer ${session.accessToken}`, 'Content-Type': 'application/json' }, body: action === 'rejected' ? JSON.stringify({ reason: 'Please review the application details and resubmit.' }) : undefined })
    if (!response.ok) { setToast('The application could not be updated. Please try again.'); return }
    setApplications((items) => items.filter((item) => item.id !== id))
    setToast(action === 'approved' ? 'Institute approved. An onboarding email is queued.' : 'Registration rejected and applicant notified.')
    window.setTimeout(() => setToast(''), 3500)
  }

  const initials = session.user.displayName.split(' ').map((name) => name[0]).join('').slice(0, 2).toUpperCase() || 'SA'

  return <div className="platform-shell" data-collapsed={collapsed}>
    <header className="platform-topbar">
      <button className="platform-icon-button platform-mobile-menu" type="button" aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileOpen((value) => !value)}>{mobileOpen ? <X /> : <Menu />}</button>
      <button className="platform-icon-button platform-collapse" type="button" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} onClick={() => setCollapsed((value) => !value)}>{collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}</button>
      <div className="platform-breadcrumb"><span>CampusOne</span><ArrowRight /><strong>Platform control center</strong></div>
      <div className="platform-top-actions">
        <button className="platform-icon-button" type="button" aria-label="Notifications"><Bell /><i /></button>
        <div className="platform-user"><span className="platform-avatar">{initials}</span><span className="platform-user-copy"><strong>{session.user.displayName}</strong><small>Platform administrator</small></span><ChevronDown /></div>
      </div>
    </header>
    <div className={`platform-scrim ${mobileOpen ? 'is-visible' : ''}`} onClick={() => setMobileOpen(false)} />
    <aside className={`platform-sidebar ${mobileOpen ? 'is-open' : ''}`}>
      <div className="platform-brand"><span className="platform-brand-mark"><Globe2 /></span><span>CampusOne<span>CONTROL</span></span></div>
      <div className="platform-sidebar-label">Workspace</div>
      <nav aria-label="Platform administration navigation">
        {navItems.map(({ id, label, icon: Icon }) => <button type="button" className={`platform-nav-item ${section === id ? 'is-active' : ''}`} key={id} onClick={() => goTo(id)}><Icon /><span>{label}</span>{id === 'registrations' && pending > 0 && <b>{pending}</b>}</button>)}
      </nav>
      <div className="platform-sidebar-label platform-sidebar-label--lower">System</div>
      <button type="button" className={`platform-nav-item ${section === 'settings' ? 'is-active' : ''}`} onClick={() => goTo('settings')}><Settings2 /><span>Platform settings</span></button>
      <div className="platform-sidebar-footer"><div className="platform-status-dot"><i /> All systems operational</div><button type="button" className="platform-nav-item" onClick={() => { setSigningOut(true); void onSignOut().finally(() => setSigningOut(false)) }}><LogOut /><span>{signingOut ? 'Signing out…' : 'Sign out'}</span></button></div>
    </aside>
    <main className="platform-main">
      {section === 'overview' && <Overview pending={pending} onNavigate={goTo} />}
      {section === 'registrations' && <RegistrationQueue applications={applications} onAction={updateApplication} />}
      {section === 'institutes' && <Institutes query={query} setQuery={setQuery} rows={filteredInstitutes} />}
      {section === 'subscriptions' && <Subscriptions />}
      {section === 'users' && <UsersAccess />}
      {section === 'audit' && <AuditActivity />}
      {section === 'settings' && <PlatformSettings />}
    </main>
    {toast && <div className="platform-toast" role="status"><CheckCircle2 />{toast}<button type="button" aria-label="Dismiss notification" onClick={() => setToast('')}><X /></button></div>}
  </div>
}

function sectionFromPath(path: string): PlatformSection { const value = path.split('/')[2] as PlatformSection | undefined; return value && ['registrations', 'institutes', 'subscriptions', 'users', 'audit', 'settings'].includes(value) ? value : 'overview' }

function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) { return <div className="platform-page-title"><div><p className="platform-eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>{action}</div> }

function StatCard({ label, value, note, icon: Icon, tone = 'blue' }: { label: string; value: string; note: string; icon: typeof Building2; tone?: string }) { return <div className="platform-stat-card"><span className={`platform-stat-icon ${tone}`}><Icon /></span><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></div> }

function Overview({ pending, onNavigate }: { pending: number; onNavigate: (section: PlatformSection) => void }) {
  return <div className="platform-page"><PageTitle eyebrow="Platform overview" title="Good morning, admin" description="A single view of the CampusOne network, approvals, revenue, and platform health." action={<button className="platform-button platform-button--dark" type="button" onClick={() => onNavigate('registrations')}><ClipboardCheck /> Review queue <span>{pending}</span></button>} />
    <div className="platform-stat-grid"><StatCard label="Active institutes" value="128" note="↑ 12 this month" icon={Building2} /><StatCard label="Pending approvals" value={String(pending).padStart(2, '0')} note="Requires your attention" icon={ClipboardCheck} tone="amber" /><StatCard label="Monthly recurring revenue" value="₹8.42L" note="↑ 8.6% vs last month" icon={CircleDollarSign} tone="green" /><StatCard label="Active users" value="24,680" note="Across all institutes" icon={Users} tone="purple" /></div>
    <div className="platform-grid platform-grid--main"><section className="platform-panel"><div className="platform-panel-heading"><div><h2>Network growth</h2><p>Active institutes over the last 6 months</p></div><button className="platform-select" type="button">Last 6 months <ChevronDown /></button></div><div className="platform-chart"><div className="platform-chart-y"><span>140</span><span>100</span><span>60</span><span>20</span></div><div className="platform-bars">{[['Mar', 42], ['Apr', 54], ['May', 66], ['Jun', 80], ['Jul', 101], ['Aug', 128]].map(([month, height]) => <div className="platform-bar-wrap" key={month}><div className="platform-bar" style={{ height: `${Number(height) / 1.45}%` }}><span>{height}</span></div><small>{month}</small></div>)}</div></div></section><section className="platform-panel"><div className="platform-panel-heading"><div><h2>Needs your attention</h2><p>Actions that keep the network moving</p></div><AlertTriangle className="platform-warning-icon" /></div><div className="platform-attention-list"><button type="button" onClick={() => onNavigate('registrations')}><span className="platform-attention-icon amber"><ClipboardCheck /></span><span><strong>{pending} institute registrations</strong><small>Awaiting approval review</small></span><ArrowRight /></button><button type="button" onClick={() => onNavigate('subscriptions')}><span className="platform-attention-icon red"><CircleDollarSign /></span><span><strong>4 subscriptions past due</strong><small>Follow up with institute admins</small></span><ArrowRight /></button><button type="button" onClick={() => onNavigate('audit')}><span className="platform-attention-icon blue"><ShieldCheck /></span><span><strong>Security review due</strong><small>Last reviewed 28 days ago</small></span><ArrowRight /></button></div></section></div>
    <div className="platform-grid platform-grid--bottom"><section className="platform-panel"><div className="platform-panel-heading"><div><h2>Recent activity</h2><p>Latest changes across the platform</p></div><button className="platform-link" type="button" onClick={() => onNavigate('audit')}>View audit log <ArrowRight /></button></div><ActivityFeed /></section><section className="platform-panel"><div className="platform-panel-heading"><div><h2>Plan mix</h2><p>128 active institutes</p></div></div><div className="plan-mix"><div className="plan-mix-ring"><strong>128</strong><small>institutes</small></div><div className="plan-mix-legend"><span><i className="dot dot-blue" /> Scale <strong>28%</strong></span><span><i className="dot dot-purple" /> Growth <strong>46%</strong></span><span><i className="dot dot-amber" /> Starter <strong>26%</strong></span></div></div></section></div>
  </div>
}

 function RegistrationQueue({ applications, onAction }: { applications: Application[]; onAction: (id: string, action: 'approved' | 'rejected') => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(applications[0]?.id ?? null)
  const active = applications.find((item) => item.id === selected) ?? applications[0]
  return <div className="platform-page"><PageTitle eyebrow="Governance" title="Registration queue" description="Review, approve, or reject new institutes before they enter the CampusOne network." action={<button className="platform-button platform-button--dark" type="button"><FileText /> Export queue</button>} /><div className="platform-queue-layout"><section className="platform-panel platform-queue-list"><div className="platform-toolbar"><div className="platform-tabs"><button className="is-active" type="button">Needs review <span>{applications.length}</span></button><button type="button">In review</button><button type="button">All applications</button></div><button className="platform-icon-button" type="button" aria-label="More queue actions"><MoreHorizontal /></button></div>{applications.map((item) => <button type="button" className={`platform-application-row ${selected === item.id ? 'is-selected' : ''}`} key={item.id} onClick={() => setSelected(item.id)}><span className="platform-institute-avatar">{item.name.split(' ').map((word) => word[0]).join('').slice(0, 2)}</span><span><strong>{item.name}</strong><small>{item.city} · {item.submitted}</small></span><span className={`platform-status platform-status--${item.status === 'In review' ? 'review' : 'pending'}`}>{item.status}</span></button>)}{!applications.length && <div className="platform-empty"><CheckCircle2 /><strong>Queue cleared</strong><p>There are no registrations waiting for review.</p></div>}</section>{active && <section className="platform-panel platform-review-panel"><div className="platform-review-heading"><div><p className="platform-eyebrow">Application {active.id}</p><h2>{active.name}</h2><p>{active.city}</p></div><span className="platform-status platform-status--pending">{active.status}</span></div><div className="platform-review-summary"><div><span>Applicant</span><strong>{active.owner}</strong><small>{active.email}</small></div><div><span>Requested plan</span><strong>{active.plan}</strong><small>14-day trial included</small></div><div><span>Submitted</span><strong>{active.submitted}</strong><small>Documents attached</small></div></div><div className="platform-document-check"><div><CheckCircle2 /><span><strong>Registration documents</strong><small>3 files verified · business registration, tax ID, address proof</small></span></div><button className="platform-link" type="button">View documents <ArrowRight /></button></div><div className="platform-review-checks"><h3>Approval checklist</h3>{['Institute identity and legal name match', 'Applicant has authority to create this workspace', 'Required documents are clear and current'].map((label) => <label key={label}><input type="checkbox" defaultChecked />{label}</label>)}</div><div className="platform-review-actions"><button className="platform-button platform-button--danger" type="button" onClick={() => onAction(active.id, 'rejected')}><XCircle /> Reject application</button><button className="platform-button platform-button--success" type="button" onClick={() => onAction(active.id, 'approved')}><Check /> Approve institute</button></div></section>}</div></div>
}

function Institutes({ query, setQuery, rows }: { query: string; setQuery: (value: string) => void; rows: string[][] }) { return <div className="platform-page"><PageTitle eyebrow="Network management" title="All institutes" description="Search and manage every institute, campus, owner, and subscription in the network." action={<button className="platform-button platform-button--dark" type="button"><Building2 /> Add institute</button>} /><section className="platform-panel platform-table-panel"><div className="platform-toolbar"><label className="platform-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search institutes, cities, or codes…" /></label><div className="platform-filter-actions"><button className="platform-select" type="button">All statuses <ChevronDown /></button><button className="platform-select" type="button">All plans <ChevronDown /></button></div></div><div className="platform-table-wrap"><table className="platform-table"><thead><tr><th>Institute</th><th>Location</th><th>Plan</th><th>Students</th><th>Status</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row[1]}><td><strong>{row[0]}</strong><small>{row[1]}</small></td><td>{row[2]}</td><td>{row[3]}</td><td>{row[4]}</td><td><span className={`platform-status platform-status--${row[5] === 'Active' ? 'active' : row[5] === 'Pending' ? 'pending' : 'review'}`}>{row[5]}</span></td><td><button className="platform-icon-button" type="button" aria-label={`Open ${row[0]}`}><ArrowRight /></button></td></tr>)}</tbody></table></div></section></div> }

function Subscriptions() { return <div className="platform-page"><PageTitle eyebrow="Revenue control" title="Subscriptions" description="Monitor plan health, billing status, upgrades, and revenue across all institutes." action={<button className="platform-button platform-button--dark" type="button"><CircleDollarSign /> Create plan</button>} /><div className="platform-stat-grid"><StatCard label="MRR" value="₹8.42L" note="+8.6% this month" icon={CircleDollarSign} tone="green" /><StatCard label="Active subscriptions" value="128" note="92% of institutes" icon={CreditCard} /><StatCard label="Past due" value="04" note="₹38,400 at risk" icon={AlertTriangle} tone="amber" /><StatCard label="Trial conversion" value="64%" note="+4.2% vs last quarter" icon={BarChart3} tone="purple" /></div><section className="platform-panel platform-table-panel"><div className="platform-panel-heading"><div><h2>Plan performance</h2><p>Revenue and subscriber health by plan</p></div><button className="platform-link" type="button">Billing settings <ArrowRight /></button></div><div className="plan-cards">{[['Scale', '36', '₹4.14L', '98%', 'blue'], ['Growth', '59', '₹3.83L', '94%', 'purple'], ['Starter', '33', '₹45.6K', '82%', 'amber']].map(([name, count, revenue, retention, tone]) => <div className="plan-card" key={name}><span className={`plan-card-icon ${tone}`}><CreditCard /></span><div><strong>{name}</strong><small>{count} institutes</small></div><div><span>Monthly revenue</span><strong>{revenue}</strong></div><div><span>Renewal health</span><strong>{retention}</strong></div><button className="platform-icon-button" type="button" aria-label={`Open ${name} plan`}><ArrowRight /></button></div>)}</div></section></div> }

function UsersAccess() { return <div className="platform-page"><PageTitle eyebrow="Identity & access" title="Users & access" description="Control platform administrators, institute owners, and access policies from one place." action={<button className="platform-button platform-button--dark" type="button"><UserCog /> Invite admin</button>} /><div className="platform-stat-grid"><StatCard label="Total users" value="24,680" note="Across 128 institutes" icon={Users} /><StatCard label="Platform admins" value="06" note="2 pending invitations" icon={ShieldCheck} tone="purple" /><StatCard label="Suspended accounts" value="18" note="Review recommended" icon={AlertTriangle} tone="amber" /><StatCard label="MFA adoption" value="78%" note="↑ 6% this quarter" icon={CheckCircle2} tone="green" /></div><section className="platform-panel platform-access-panel"><div className="platform-panel-heading"><div><h2>Admin access model</h2><p>High-impact controls are restricted to platform administrators.</p></div><button className="platform-link" type="button">Manage policies <ArrowRight /></button></div><div className="access-list">{[['Platform admin', 'Full control over institutes, billing, and system settings', '6 users', 'Full access'], ['Support operator', 'Read-only visibility into institute records and audit activity', '12 users', 'Limited'], ['Billing operator', 'Manage plans, invoices, and payment escalations', '4 users', 'Billing only']].map(([title, description, count, level]) => <div className="access-row" key={title}><span className="platform-access-avatar"><ShieldCheck /></span><span><strong>{title}</strong><small>{description}</small></span><span>{count}</span><span className="platform-status platform-status--active">{level}</span><button className="platform-icon-button" type="button" aria-label={`Edit ${title}`}><ArrowRight /></button></div>)}</div></section></div> }

function AuditActivity() { return <div className="platform-page"><PageTitle eyebrow="Trust & safety" title="Audit activity" description="A tamper-evident record of sensitive actions taken across the platform." action={<button className="platform-button platform-button--secondary" type="button"><FileText /> Export audit log</button>} /><div className="audit-hero"><span><ShieldCheck /></span><div><strong>Audit logging is active</strong><p>All administrative actions, access changes, approvals, and billing events are being recorded.</p></div><span className="platform-status platform-status--active">Protected</span></div><section className="platform-panel platform-table-panel"><div className="platform-toolbar"><label className="platform-search"><Search /><input placeholder="Search actions, users, or institutes…" /></label><button className="platform-select" type="button">Last 30 days <ChevronDown /></button></div><ActivityFeed detailed /></section></div> }

function PlatformSettings() { return <div className="platform-page"><PageTitle eyebrow="System configuration" title="Platform settings" description="Set global defaults and guardrails for the CampusOne network." action={<button className="platform-button platform-button--success" type="button"><Check /> Save changes</button>} /><section className="platform-settings-grid"><div className="platform-panel"><div className="platform-panel-heading"><div><h2>Registration policy</h2><p>Control how new institute applications are handled.</p></div><ClipboardCheck /></div><div className="platform-setting-row"><span><strong>Require manual approval</strong><small>New institutes remain pending until an admin approves them.</small></span><input type="checkbox" defaultChecked /></div><div className="platform-setting-row"><span><strong>Require document verification</strong><small>Block approval until all required documents are checked.</small></span><input type="checkbox" defaultChecked /></div><div className="platform-setting-row"><span><strong>Auto-provision trial workspace</strong><small>Create the workspace immediately after approval.</small></span><input type="checkbox" defaultChecked /></div></div><div className="platform-panel"><div className="platform-panel-heading"><div><h2>Security defaults</h2><p>Network-wide account protection rules.</p></div><ShieldCheck /></div><div className="platform-setting-row"><span><strong>Enforce MFA for platform admins</strong><small>Require a second factor at every new sign-in.</small></span><input type="checkbox" defaultChecked /></div><div className="platform-setting-row"><span><strong>Session timeout</strong><small>Inactive admin sessions are revoked automatically.</small></span><select defaultValue="30"><option value="15">15 minutes</option><option value="30">30 minutes</option><option value="60">60 minutes</option></select></div><div className="platform-setting-row"><span><strong>Maintenance mode</strong><small>Temporarily pause institute access during upgrades.</small></span><input type="checkbox" /></div></div></section></div> }

function ActivityFeed({ detailed = false }: { detailed?: boolean }) { const items = [['Maya Chen', 'approved Northstar Academy', '2 min ago', 'blue'], ['System', 'flagged St. Mary’s Convent subscription', '18 min ago', 'amber'], ['Arjun Rao', 'updated Growth plan pricing', '1 hr ago', 'purple'], ['Maya Chen', 'invited a platform admin', '3 hrs ago', 'green']]; return <div className={`activity-feed ${detailed ? 'activity-feed--detailed' : ''}`}>{items.map(([name, action, time, tone]) => <div className="activity-row" key={`${name}-${action}`}><span className={`activity-avatar ${tone}`}>{name === 'System' ? <Settings2 /> : name.split(' ').map((word) => word[0]).join('')}</span><span><strong>{name} <em>{action}</em></strong><small>{time}{detailed && ' · IP 103.21.44.18'}</small></span><MoreHorizontal /></div>)}</div> }
