import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'
import { Award, BarChart3, ChevronDown, Download, FileText, MoreHorizontal, Plus, Search, Settings2 } from 'lucide-react'
import type { AdminRoute } from '../../adminNavigation'
import { Card } from '../../components/ui/primitives'
import { PageHeader, Tabs, type TabItem } from '../../components/admin-ui'

export type DedicatedAdminModal =
  | 'fee-component' | 'discount-rule' | 'installment-plan' | 'category' | 'activity-type'
  | 'batch' | 'partnership' | 'award-approval' | 'award-rejection' | 'upgrade-plan'
  | 'export-report' | 'export-audit' | 'deletion-request' | 'consent-text'

export interface DedicatedAdminAction {
  type: 'create' | 'edit' | 'delete' | 'save' | 'export' | 'approve' | 'reject' | 'send-reminder' | 'download' | 'change-tab' | 'toggle'
  routeId: string
  target?: string
  value?: string | boolean
}

export interface DedicatedOperationalLayoutsProps {
  route: AdminRoute
  onOpenModal: (modal: DedicatedAdminModal, context?: Record<string, string>) => void
  onAction: (action: DedicatedAdminAction) => void
  onNavigate: (path: string) => void
  records?: Array<{ id: string; title: string; recordType: string; status: string; data?: Record<string, unknown>; updatedAt?: string }>
}

const layout: Record<string, CSSProperties> = {
  page: { display: 'grid', gap: 'var(--space-6)' },
  grid2: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))', gap: 'var(--space-5)' },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(13rem, 1fr))', gap: 'var(--space-4)' },
  cardStack: { display: 'grid', gap: 'var(--space-4)' },
  split: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap' },
  toolbar: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', flexWrap: 'wrap', padding: 'var(--space-3) var(--space-4)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-card)', background: 'var(--color-surface)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 'var(--font-size-body)' },
  settingsRow: { display: 'grid', gridTemplateColumns: 'minmax(15rem, 1fr) auto', gap: 'var(--space-5)', alignItems: 'center', padding: 'var(--space-4) 0', borderBottom: '1px solid var(--color-border)' },
}

const status = (label: string, tone: 'success' | 'warning' | 'neutral' | 'danger' = 'neutral') => <span className={`status-badge tone-${tone}`}>{label}</span>

function ActionButton({ label, onClick, primary = false, icon }: { label: string; onClick: () => void; primary?: boolean; icon?: ReactNode }) {
  return <button type="button" className={primary ? 'button-primary' : 'button-secondary'} aria-label={label} onClick={onClick}>{icon}{label}</button>
}

function OverflowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" className="icon-button" aria-label={label} onClick={onClick}><MoreHorizontal aria-hidden="true" /></button>
}

function FilterBar({ routeId, onAction, placeholder = 'Search records' }: { routeId: string; onAction: (action: DedicatedAdminAction) => void; placeholder?: string }) {
  return <div style={layout.toolbar} aria-label="Screen filters">
    <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
      <button type="button" className="button-secondary" aria-label="Filter by branch" onClick={() => onAction({ type: 'toggle', routeId, target: 'branch-filter' })}>All branches <ChevronDown aria-hidden="true" /></button>
      <button type="button" className="button-secondary" aria-label="Filter by status" onClick={() => onAction({ type: 'toggle', routeId, target: 'status-filter' })}>All statuses <ChevronDown aria-hidden="true" /></button>
    </div>
    <label className="search-control"><Search aria-hidden="true" /><span className="sr-only">{placeholder}</span><input aria-label={placeholder} placeholder={placeholder} onChange={(event) => onAction({ type: 'toggle', routeId, target: 'search', value: event.target.value })} /></label>
  </div>
}

function Table({ children, label }: { children: ReactNode; label: string }) {
  return <Card className="entity-table-card"><div className="table-scroll"><table style={layout.table} aria-label={label}>{children}</table></div></Card>
}

function FeeStructure({ route, onOpenModal, onAction }: DedicatedOperationalLayoutsProps) {
  const [tab, setTab] = useState('components')
  const selectTab = (id: string) => { setTab(id); onAction({ type: 'change-tab', routeId: route.id, value: id }) }
  const config = tab === 'components'
    ? { action: '+ Add Fee Component', modal: 'fee-component' as const, columns: ['Class', 'Fee head', 'Amount', 'Frequency', 'Branches'], rows: [['Grade 8', 'Tuition fee', '₹42,000', 'Annual', 'All branches'], ['Grade 8', 'Transport', '₹9,600', 'Quarterly', 'North Campus']] }
    : tab === 'discounts'
      ? { action: '+ Add Discount Rule', modal: 'discount-rule' as const, columns: ['Discount name', 'Type', 'Value', 'Eligibility rule'], rows: [['Sibling discount', 'Percentage', '10%', 'Two or more enrolled siblings'], ['Merit scholarship', 'Percentage', '25%', 'Assessment threshold ≥ 90%']] }
      : { action: '+ Add Installment Plan', modal: 'installment-plan' as const, columns: ['Plan name', '# installments', 'Applicable fee heads', 'Schedule'], rows: [['Quarterly tuition', '4', 'Tuition fee', 'Apr · Jul · Oct · Jan'], ['Two-part annual', '2', 'Tuition + lab', 'Apr · Oct']] }
  const tabs: TabItem[] = ['components', 'discounts', 'installments'].map((id) => ({ id, label: id === 'components' ? 'Fee Components' : id === 'discounts' ? 'Discounts & Scholarships' : 'Installment Plans', panel: <Table label={`${route.label} ${id} table`}><thead><tr>{config.columns.map((column) => <th key={column}>{column}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead><tbody>{config.rows.map((row) => <tr key={row[0]}>{row.map((cell) => <td key={cell}>{cell}</td>)}<td><OverflowButton label={`Manage ${row[0]}`} onClick={() => onAction({ type: 'edit', routeId: route.id, target: row[0] })} /></td></tr>)}</tbody></Table> }))
  return <section style={layout.page}><PageHeader title="Fee Structure" breadcrumbs={[{ label: 'Fees' }, { label: 'Structure' }]} actions={<ActionButton primary label={config.action} icon={<Plus aria-hidden="true" />} onClick={() => onOpenModal(config.modal)} />} /><Tabs tabs={tabs} activeId={tab} onChange={selectTab} label="Fee structure sections" /></section>
}

function PointsAndCategories({ route, onOpenModal, onAction }: DedicatedOperationalLayoutsProps) {
  const [tab, setTab] = useState('categories')
  const tabs: TabItem[] = [
    { id: 'categories', label: 'Categories', panel: <div style={layout.grid3}>{[['Academic', 'Learning progress and achievement'], ['Sports', 'Participation and team performance'], ['Citizenship', 'Community contribution'], ['Arts', 'Creative achievement']].map(([name, description]) => <Card key={name}><div style={layout.split}><Award aria-hidden="true" color="var(--color-primary)" />{name === 'Academic' ? status('Platform Default') : <OverflowButton label={`Manage ${name} category`} onClick={() => onAction({ type: 'edit', routeId: route.id, target: name })} />}</div><h3 style={{ marginTop: 'var(--space-4)' }}>{name}</h3><p className="section-caption" style={{ marginTop: 'var(--space-2)' }}>{description}</p></Card>)}</div> },
    { id: 'activities', label: 'Activity Types', panel: <Table label="Activity types"><thead><tr><th>Name</th><th>Category</th><th>Default points</th><th>Award mode</th><th>Active</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{[['Olympiad participation', 'Academic', '10', 'Manual'], ['Inter-house match', 'Sports', '15', 'Manual'], ['Reading streak', 'Academic', '5', 'Auto']].map(([name, category, points, mode]) => <tr key={name}><td><strong>{name}</strong></td><td>{status(category)}</td><td>{points}</td><td>{status(mode, mode === 'Auto' ? 'success' : 'warning')}</td><td><button type="button" aria-label={`Toggle ${name} active`} onClick={() => onAction({ type: 'toggle', routeId: route.id, target: name })}>Active</button></td><td><OverflowButton label={`Manage ${name}`} onClick={() => onAction({ type: 'edit', routeId: route.id, target: name })} /></td></tr>)}</tbody></Table> },
  ]
  return <section style={layout.page}><PageHeader title="Points & Categories" breadcrumbs={[{ label: 'Gamification' }, { label: route.label }]} actions={<ActionButton primary label={tab === 'categories' ? '+ Add Category' : '+ Add Activity Type'} icon={<Plus aria-hidden="true" />} onClick={() => onOpenModal(tab === 'categories' ? 'category' : 'activity-type')} />} /><Tabs tabs={tabs} activeId={tab} onChange={(id) => { setTab(id); onAction({ type: 'change-tab', routeId: route.id, value: id }) }} label="Points and categories sections" /></section>
}

function BatchCatalog({ route, onOpenModal, onAction }: DedicatedOperationalLayoutsProps) {
  const groups = [{ title: 'Academic Performance', items: ['Subject Star', 'Perfect Attendance'] }, { title: 'Cross-Category / Overall', items: ['All-rounder', 'Network Champion'] }, { title: 'Sports', items: ['Team Player', 'Sports Star'] }]
  return <section style={layout.page}><PageHeader title="Batch Catalog" breadcrumbs={[{ label: 'Gamification' }, { label: route.label }]} actions={<ActionButton primary label="+ Create Batch" icon={<Plus aria-hidden="true" />} onClick={() => onOpenModal('batch')} />} />{groups.map((group) => <Card key={group.title}><div style={layout.split}><h2>{group.title}</h2><span className="section-caption">{group.items.length} batches</span></div><div style={{ ...layout.grid3, marginTop: 'var(--space-4)' }}>{group.items.map((item) => <button type="button" className="card is-interactive" key={item} aria-label={`View ${item} batch`} onClick={() => onAction({ type: 'edit', routeId: route.id, target: item })}><Award aria-hidden="true" color="var(--color-primary)" /><h3 style={{ marginTop: 'var(--space-3)' }}>{item}</h3><p className="section-caption">{item === 'Network Champion' ? 'Requires an active network partnership' : 'Annual · Active'}</p>{item === 'Network Champion' && <span className="section-caption">🌐 Network</span>}</button>)}</div></Card>)}</section>
}

function Leaderboards({ route, onAction }: DedicatedOperationalLayoutsProps) {
  const [tab, setTab] = useState('preview')
  const tabs: TabItem[] = [
    { id: 'preview', label: 'Live Preview', panel: <><FilterBar routeId={route.id} onAction={onAction} placeholder="Search student rankings" /><Table label="Leaderboard preview"><thead><tr><th>Rank</th><th>Student</th><th>Branch</th><th>Points</th><th>Batches earned</th></tr></thead><tbody>{[['🥇 1', 'Aarav Mehta', 'North Campus', '1,240', '8'], ['🥈 2', 'Ananya Shah', 'Central Campus', '1,185', '7'], ['🥉 3', 'Vihaan Rao', 'North Campus', '1,110', '6']].map((row) => <tr key={row[1]}>{row.map((cell) => <td key={cell}>{cell}</td>)}</tr>)}</tbody></Table></> },
    { id: 'privacy', label: 'Privacy Settings', panel: <Card><div style={layout.cardStack}>{[['Allow parent visibility', 'Parents can view the configured leaderboard scope.'], ['Anonymize below grade', 'Grades 4 and below show rank position without student names.'], ['Allow students to opt out', 'Points and rank remain in the school record.'], ['Show names on network leaderboard', 'Enable a cross-institute partnership first.']].map(([name, description], index) => <div style={layout.settingsRow} key={name}><div><h3>{name}</h3><p className="section-caption">{description}</p></div><button type="button" aria-label={`Change ${name}`} disabled={index === 3} onClick={() => onAction({ type: 'toggle', routeId: route.id, target: name })}>{index === 1 ? 'Grade 4' : index === 3 ? 'Unavailable' : 'Off'}</button></div>)}<div style={{ display: 'flex', justifyContent: 'flex-end' }}><ActionButton primary label="Save privacy settings" onClick={() => onAction({ type: 'save', routeId: route.id, target: 'privacy' })} /></div></div></Card> },
  ]
  return <section style={layout.page}><PageHeader title="Leaderboards" breadcrumbs={[{ label: 'Gamification' }, { label: route.label }]} /><Tabs tabs={tabs} activeId={tab} onChange={(id) => { setTab(id); onAction({ type: 'change-tab', routeId: route.id, value: id }) }} label="Leaderboard sections" /></section>
}

function Partnerships({ route, onOpenModal, onAction, onNavigate }: DedicatedOperationalLayoutsProps) {
  return <section style={layout.page}><PageHeader title="Partnerships" breadcrumbs={[{ label: 'Network' }, { label: route.label }]} actions={<ActionButton primary label="+ Request Partnership" icon={<Plus aria-hidden="true" />} onClick={() => onOpenModal('partnership')} />} /><Card><div style={layout.split}><div><h2>Awaiting your response</h2><p className="section-caption">Incoming cross-institute requests need a decision.</p></div>{status('1 pending', 'warning')}</div><div style={{ ...layout.split, marginTop: 'var(--space-4)', paddingTop: 'var(--space-4)', borderTop: '1px solid var(--color-border)' }}><div><strong>Riverside International School</strong><p className="section-caption">All Students · Requested 18 Jul 2026</p></div><div style={{ display: 'flex', gap: 'var(--space-2)' }}><ActionButton primary label="Accept Riverside partnership" onClick={() => onAction({ type: 'approve', routeId: route.id, target: 'Riverside International School' })} /><ActionButton label="Decline Riverside partnership" onClick={() => onAction({ type: 'reject', routeId: route.id, target: 'Riverside International School' })} /></div></div></Card><Table label="All partnerships"><thead><tr><th>Partner institute</th><th>Status</th><th>Scope</th><th>Requested date</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{[['Riverside International School', 'Pending', 'All students', '18 Jul 2026'], ['Green Valley Academy', 'Active', 'Grade 10', '02 May 2026']].map(([name, state, scope, date]) => <tr key={name}><td><strong>{name}</strong></td><td>{status(state, state === 'Active' ? 'success' : 'warning')}</td><td>{scope}</td><td>{date}</td><td><OverflowButton label={`Manage partnership with ${name}`} onClick={() => onAction({ type: 'edit', routeId: route.id, target: name })} /></td></tr>)}</tbody></Table><Card><div style={layout.split}><div><h2>Network Leaderboard Preview</h2><p className="section-caption">Shared rankings are shown only for active partnerships.</p></div><ActionButton label="Open leaderboards" onClick={() => onNavigate('/recognition/leaderboard')} /></div></Card></section>
}

function AwardApprovals({ route, onOpenModal, onAction, onNavigate }: DedicatedOperationalLayoutsProps) {
  return <section style={layout.page}><PageHeader title="Award Approvals" breadcrumbs={[{ label: 'Gamification' }, { label: route.label }]} /><FilterBar routeId={route.id} onAction={onAction} placeholder="Search by student name" /><Table label="Award approvals"><thead><tr><th>Student</th><th>Category</th><th>Points</th><th>Note</th><th>Requested by</th><th>Requested at</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{[['Ira Nair', 'Sports', '75', 'State-level tournament finalist', 'Rohan Singh', '2 hours ago'], ['Kabir Jain', 'Academic', '60', 'National Olympiad qualifier', 'Meera Kapoor', 'Yesterday']].map(([student, category, points, note, requester, time]) => <tr key={student}><td><button type="button" className="text-link" aria-label={`View ${student} profile`} onClick={() => onNavigate(`/students?student=${student.toLowerCase().replaceAll(' ', '-')}`)}>{student}</button></td><td>{status(category)}</td><td><strong>{points}</strong></td><td>{note}</td><td>{requester}</td><td>{time}</td><td><div style={{ display: 'flex', gap: 'var(--space-2)' }}><button type="button" className="text-link" aria-label={`Approve award for ${student}`} onClick={() => onOpenModal('award-approval', { student })}>Approve</button><button type="button" className="text-link" aria-label={`Reject award for ${student}`} onClick={() => onOpenModal('award-rejection', { student })}>Reject</button></div></td></tr>)}</tbody></Table></section>
}

function Reports({ route, onAction, onNavigate }: DedicatedOperationalLayoutsProps) {
  const [tab, setTab] = useState('gallery')
  const selectedReport = new URLSearchParams(window.location.search).get('report')
  const reports = ['Attendance Trends', 'Academic Performance', 'Fee Collection', 'Admissions Conversion', 'Staff Attendance', 'Leaderboard & Gamification Engagement']
  if (selectedReport) return <ReportDetail route={route} reportName={selectedReport} onAction={onAction} onNavigate={onNavigate} />
  const tabs: TabItem[] = [
    { id: 'gallery', label: 'Report Gallery', panel: <div style={layout.grid3}>{reports.map((report) => <button type="button" className="card is-interactive" key={report} aria-label={`Open ${report} report`} onClick={() => onNavigate(`/reports?report=${encodeURIComponent(report)}`)}><BarChart3 aria-hidden="true" color="var(--color-primary)" /><h3 style={{ marginTop: 'var(--space-4)' }}>{report}</h3><div aria-hidden="true" style={{ height: '3.75rem', marginTop: 'var(--space-4)', background: 'var(--color-primary-subtle)', borderRadius: 'var(--radius-button)' }} /><span className="text-link" style={{ marginTop: 'var(--space-3)', display: 'inline-block' }}>Open →</span></button>)}</div> },
    { id: 'builder', label: 'Custom Report Builder', panel: <Card><div style={{ textAlign: 'center', padding: 'var(--space-10)' }}><Settings2 aria-hidden="true" color="var(--color-primary)" /><h2 style={{ marginTop: 'var(--space-3)' }}>Custom Report Builder — Coming Soon</h2><p className="section-caption" style={{ marginTop: 'var(--space-2)' }}>Build cross-module reports with fields, filters, tables, and charts.</p></div></Card> },
  ]
  return <section style={layout.page}><PageHeader title="Reports & Analytics" breadcrumbs={[{ label: route.label }]} /><Tabs tabs={tabs} activeId={tab} onChange={(id) => { setTab(id); onAction({ type: 'change-tab', routeId: route.id, value: id }) }} label="Reports and analytics sections" /></section>
}

function ReportDetail({ route, reportName, onAction, onNavigate }: { route: AdminRoute; reportName: string; onAction: (action: DedicatedAdminAction) => void; onNavigate: (path: string) => void }) {
  const name = decodeURIComponent(reportName)
  const trend = [62, 68, 66, 74, 78, 75, 84, 88]
  return <section style={layout.page}>
    <PageHeader title={name} breadcrumbs={[{ label: 'Reports & Analytics' }, { label: name }]} description="A branch-aware view of the current academic year." actions={<><ActionButton label="Back to reports" onClick={() => onNavigate('/reports')} /><ActionButton label="Export report" icon={<Download aria-hidden="true" />} onClick={() => onAction({ type: 'export', routeId: route.id, target: name })} /></>} />
    <FilterBar routeId={route.id} onAction={onAction} placeholder="Search report rows" />
    <Card className="prototype-chart-card"><div style={layout.split}><div><p className="section-caption">Current period</p><strong className="prototype-report-value">88.4%</strong></div>{status('+6.2% vs prior period', 'success')}</div><div className="prototype-bar-chart" role="img" aria-label={`${name} trend rising from 62 to 88 percent`}>{trend.map((value, index) => <span key={index} style={{ height: `${value}%` }} title={`${value}%`} />)}</div></Card>
    <Table label={`${name} report data`}><thead><tr><th>Period</th><th>Value</th><th>Change</th><th>Status</th></tr></thead><tbody>{[['Week 1', '82.2%', '+1.1%', 'On track'], ['Week 2', '84.7%', '+2.5%', 'On track'], ['Week 3', '86.9%', '+2.2%', 'On track'], ['Week 4', '88.4%', '+1.5%', 'On track']].map(([period, value, change, state]) => <tr key={period}><td><strong>{period}</strong></td><td>{value}</td><td style={{ color: 'var(--color-success)' }}>{change}</td><td>{status(state, 'success')}</td></tr>)}</tbody></Table>
  </section>
}

function AuditLog({ route, onOpenModal, onAction }: DedicatedOperationalLayoutsProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const records = [['18 Jul 2026, 14:32:18', 'Meera Kapoor', 'role.create', 'roles · a1b2…', '203.0.113.6'], ['18 Jul 2026, 13:06:42', 'Rohan Singh', 'marks.publish', 'assessments · b3c4…', '203.0.113.11']]
  return <section style={layout.page}><PageHeader title="Audit Log" breadcrumbs={[{ label: route.label }]} actions={<ActionButton label="Export CSV" icon={<Download aria-hidden="true" />} onClick={() => onOpenModal('export-audit')} />} /><FilterBar routeId={route.id} onAction={onAction} placeholder="Search action or entity" /><Table label="Audit log"><thead><tr><th>Timestamp</th><th>User</th><th>Action</th><th>Entity</th><th>IP address</th><th><span className="sr-only">Expand JSON diff</span></th></tr></thead><tbody>{records.map((row) => <Fragment key={row[0]}><tr><td>{row[0]}</td><td>{row[1]}</td><td><code>{row[2]}</code></td><td>{row[3]}</td><td>{row[4]}</td><td><button type="button" className="icon-button" aria-label={`${expanded === row[0] ? 'Collapse' : 'Expand'} audit entry ${row[2]}`} aria-expanded={expanded === row[0]} onClick={() => { setExpanded(expanded === row[0] ? null : row[0]); onAction({ type: 'toggle', routeId: route.id, target: row[0] }) }}><ChevronDown aria-hidden="true" /></button></td></tr>{expanded === row[0] && <tr><td colSpan={6}><div style={layout.grid2}><div><strong>Before</strong><pre aria-label="Before values">{`{\n  "permissions": []\n}`}</pre></div><div><strong>After</strong><pre aria-label="After values">{`{\n  "permissions": ["roles.manage"]\n}`}</pre></div></div></td></tr>}</Fragment>)}</tbody></Table></section>
}

function Governance({ route, onAction, onNavigate }: DedicatedOperationalLayoutsProps) {
  return <section style={layout.page}><PageHeader title="Governance Settings" breadcrumbs={[{ label: 'Roles & Permissions' }, { label: route.label }]} /><Card><div style={layout.cardStack}><div style={layout.settingsRow}><div><h3>Require two-person approval for large point awards</h3><p className="section-caption">Awards above the threshold require a different approver before posting.</p><button type="button" className="text-link" aria-label="View pending award approvals" onClick={() => onNavigate('/recognition/award-approvals')}>View pending approvals →</button></div><button type="button" aria-label="Toggle two-person approval" onClick={() => onAction({ type: 'toggle', routeId: route.id, target: 'two-person-approval' })}>On · 50 points</button></div><div style={layout.settingsRow}><div><h3>Notify me before a temporary role expires</h3><p className="section-caption">Set a reminder before the role’s valid-until date.</p></div><button type="button" aria-label="Change role expiry reminder" onClick={() => onAction({ type: 'toggle', routeId: route.id, target: 'role-expiry-reminder' })}>7 days</button></div><div style={{ padding: 'var(--space-4)', background: 'var(--color-canvas)', color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)' }}>Deactivating a role revokes it from every assigned user immediately — checked at request time, not just at login.</div><div style={{ display: 'flex', justifyContent: 'flex-end' }}><ActionButton primary label="Save governance settings" onClick={() => onAction({ type: 'save', routeId: route.id })} /></div></div></Card></section>
}

function Subscription({ route, onOpenModal, onAction }: DedicatedOperationalLayoutsProps) {
  return <section style={layout.page}><PageHeader title="Subscription & Plan" breadcrumbs={[{ label: route.label }]} actions={<ActionButton primary label="Upgrade Plan" onClick={() => onOpenModal('upgrade-plan')} />} /><div style={layout.grid2}><Card><h2>Growth Plan</h2><p className="section-caption">₹1,200 per student / year</p><ul style={{ paddingLeft: 'var(--space-5)', lineHeight: 2 }}><li>All core academic modules</li><li>Gamification and leaderboards</li><li>Cross-institute network tools</li></ul><div style={{ display: 'flex', gap: 'var(--space-2)' }}>{status('5 branches')}{status('1,500 students')}</div></Card><Card><h2>Usage</h2>{[['Students', '1,240 / 1,500', '83%'], ['Branches', '4 / 5', '80%']].map(([name, value, percent]) => <div key={name} style={{ marginTop: 'var(--space-4)' }}><div style={layout.split}><strong>{name}</strong><span className="section-caption">{value}</span></div><div aria-label={`${name} usage ${percent}`} style={{ height: '0.5rem', marginTop: 'var(--space-2)', background: 'var(--color-canvas)', borderRadius: 'var(--radius-pill)' }}><span style={{ display: 'block', width: percent, height: '100%', background: 'var(--color-warning)', borderRadius: 'inherit' }} /></div></div>)}</Card></div><Table label="Billing history"><thead><tr><th>Date</th><th>Amount</th><th>Status</th><th>Invoice</th></tr></thead><tbody>{[['01 Apr 2026', '₹1,488,000', 'Paid'], ['01 Apr 2025', '₹1,310,000', 'Paid']].map(([date, amount, state]) => <tr key={date}><td>{date}</td><td>{amount}</td><td>{status(state, 'success')}</td><td><button type="button" className="icon-button" aria-label={`Download invoice dated ${date}`} onClick={() => onAction({ type: 'download', routeId: route.id, target: date })}><Download aria-hidden="true" /></button></td></tr>)}</tbody></Table></section>
}

function Compliance({ route, onOpenModal, onAction }: DedicatedOperationalLayoutsProps) {
  const [tab, setTab] = useState('records')
  const tabs: TabItem[] = [
    { id: 'records', label: 'Consent Records', panel: <><FilterBar routeId={route.id} onAction={onAction} placeholder="Search by student name" /><Table label="Consent records"><thead><tr><th>Student</th><th>Parent</th><th>Consent type</th><th>Consented</th><th>Text version</th><th>Date</th></tr></thead><tbody>{[['Aarav Mehta', 'Priya Mehta', 'Data Processing', '✓', 'v3.2', '04 Apr 2026'], ['Ananya Shah', 'Rakesh Shah', 'Photo Usage', '✗', 'v3.2', '11 May 2026']].map(([student, parent, type, consent, version, date]) => <tr key={`${student}-${type}`}><td>{student}</td><td>{parent}</td><td>{status(type)}</td><td>{consent === '✓' ? <span aria-label="Consented" style={{ color: 'var(--color-success)' }}>✓</span> : <span aria-label="Not consented" style={{ color: 'var(--color-danger)' }}>✗</span>}</td><td>{version}</td><td>{date}</td></tr>)}</tbody></Table></> },
    { id: 'policy', label: 'Data Policy Settings', panel: <Card><div style={layout.cardStack}><div style={layout.settingsRow}><div><h3>Auto-archive student records after graduation</h3><p className="section-caption">Retention period for data-minimization requirements.</p></div><button type="button" aria-label="Change auto archive period" onClick={() => onAction({ type: 'toggle', routeId: route.id, target: 'auto-archive' })}>7 years</button></div><div style={layout.settingsRow}><div><h3>Current consent language version</h3><p className="section-caption">v3.2 is the active onboarding consent language.</p><button type="button" className="text-link" aria-label="View current consent text" onClick={() => onOpenModal('consent-text')}>View current consent text</button></div><FileText aria-hidden="true" color="var(--color-text-secondary)" /></div><div style={layout.settingsRow}><div><h3>Data deletion requests</h3><p className="section-caption">Use the guarded request flow after confirming identity.</p></div><ActionButton label="Request Data Deletion" onClick={() => onOpenModal('deletion-request')} /></div></div></Card> },
  ]
  return <section style={layout.page}><PageHeader title="Compliance & Consent" breadcrumbs={[{ label: route.label }]} /><Tabs tabs={tabs} activeId={tab} onChange={(id) => { setTab(id); onAction({ type: 'change-tab', routeId: route.id, value: id }) }} label="Compliance and consent sections" /></section>
}

export function DedicatedOperationalLayouts(props: DedicatedOperationalLayoutsProps) {
  switch (props.route.id) {
    case 'FN1': return <FeeStructure {...props} />
    case 'RG1': return <PointsAndCategories {...props} />
    case 'RG2': return <BatchCatalog {...props} />
    case 'RG4': return <Leaderboards {...props} />
    case 'RG5': return <Partnerships {...props} />
    case 'RG6': return <AwardApprovals {...props} />
    case 'RA1': return <Reports {...props} />
    case 'AL1': return <AuditLog {...props} />
    case 'SE2': return <Governance {...props} />
    case 'SE3': return <Subscription {...props} />
    case 'SE4': return <Compliance {...props} />
    default: return null
  }
}
