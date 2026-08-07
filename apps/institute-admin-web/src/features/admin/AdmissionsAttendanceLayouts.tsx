import { useState, type ReactNode } from 'react'
import { BarChart3, Check, ChevronDown, Plus, X } from 'lucide-react'
import type { AdminRoute } from '../../adminNavigation'
import { Card, SectionHeader } from '../../components/ui/primitives'

export type AdmissionsAttendanceAction = 'create-field' | 'edit-field' | 'duplicate-field' | 'delete-field' | 'publish-form' | 'export-attendance' | 'open-student-profile' | 'approve-leave' | 'reject-leave' | 'view-leave' | 'change-tab'

export function AdmissionsAttendanceLayouts({ route, onOpenAction, onNavigate }: {
  route: AdminRoute
  onOpenAction: (action: AdmissionsAttendanceAction, context?: Record<string, string>) => void
  onNavigate: (path: string) => void
}) {
  switch (route.id) {
    case 'AD4': return <ApplicationFormBuilder route={route} onOpenAction={onOpenAction} />
    case 'AT2': return <AttendanceAnalytics route={route} onOpenAction={onOpenAction} onNavigate={onNavigate} />
    case 'ST3': return <LeaveApprovals route={route} onOpenAction={onOpenAction} onNavigate={onNavigate} />
    default: return null
  }
}

function Header({ route, children }: { route: AdminRoute; children?: ReactNode }) {
  return <div className="page-heading"><div><p className="breadcrumb">{route.breadcrumb}</p><h1>{route.label}</h1></div><div className="page-actions">{children}</div></div>
}

function ApplicationFormBuilder({ route, onOpenAction }: { route: AdminRoute; onOpenAction: (action: AdmissionsAttendanceAction, context?: Record<string, string>) => void }) {
  const [published, setPublished] = useState(false)
  const fields = [['Student name', 'Short text', 'Required'], ['Date of birth', 'Date', 'Required'], ['Previous school', 'Short text', 'Optional'], ['Primary guardian email', 'Email', 'Required'], ['Supporting documents', 'Upload', 'Optional']]
  return <div className="entity-page"><Header route={route}><button className="button-secondary" type="button" onClick={() => onOpenAction('create-field')}><Plus aria-hidden="true" />Add Field</button><button className="button-primary" type="button" onClick={() => { setPublished(true); onOpenAction('publish-form') }}>{published ? 'Published' : 'Publish Form'}</button></Header>
    <section className="entity-grid"><Card><SectionHeader title="Form settings" /><div className="admin-form-grid"><label>Form title<input defaultValue="2026–27 Application Form" aria-label="Application form title" /></label><label>Academic year<select aria-label="Application academic year"><option>2026–27</option></select></label><label>Accept applications until<input type="date" aria-label="Application deadline" defaultValue="2026-09-30" /></label></div></Card><Card><SectionHeader title="Applicant experience" /><p className="page-subtitle">Fields appear in the order shown. Required fields are clearly marked for parents.</p><button className="button-secondary" type="button" onClick={() => onOpenAction('edit-field', { field: 'Applicant experience' })}>Edit confirmation message</button></Card></section>
    <Card className="entity-table-card"><SectionHeader title="Application fields" /><div className="table-scroll"><table className="data-table"><thead><tr><th>Field</th><th>Type</th><th>Validation</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{fields.map(([field, type, required]) => <tr key={field}><td><strong>{field}</strong></td><td>{type}</td><td><span className={`status-badge ${required === 'Required' ? 'tone-warning' : 'tone-neutral'}`}>{required}</span></td><td><button className="table-action" type="button" onClick={() => onOpenAction('edit-field', { field })}>Edit</button><button className="table-action" type="button" onClick={() => onOpenAction('duplicate-field', { field })}>Duplicate</button><button className="table-action" type="button" onClick={() => onOpenAction('delete-field', { field })}>Delete</button></td></tr>)}</tbody></table></div></Card>
  </div>
}

function AttendanceAnalytics({ route, onOpenAction, onNavigate }: { route: AdminRoute; onOpenAction: (action: AdmissionsAttendanceAction, context?: Record<string, string>) => void; onNavigate: (path: string) => void }) {
  const [tab, setTab] = useState<'overview' | 'alerts'>('overview')
  const changeTab = (next: 'overview' | 'alerts') => { setTab(next); onOpenAction('change-tab', { tab: next }) }
  return <div className="entity-page"><Header route={route}><button className="button-secondary" type="button" onClick={() => onOpenAction('export-attendance')}><BarChart3 aria-hidden="true" />Export Report</button></Header><nav className="admin-tabs__list" aria-label="Attendance analytics views"><button className={`admin-tab-btn ${tab === 'overview' ? 'is-active' : ''}`} type="button" onClick={() => changeTab('overview')}>Overview</button><button className={`admin-tab-btn ${tab === 'alerts' ? 'is-active' : ''}`} type="button" onClick={() => changeTab('alerts')}>Low Attendance Alerts</button></nav>
    {tab === 'overview' ? <><section className="entity-grid"><Metric label="Institute attendance" value="93.8%" note="+1.6% vs last month" /><Metric label="Students at risk" value="18" note="Below 75% threshold" /><Metric label="Staff attendance" value="96.2%" note="Across active branches" /></section><Card><SectionHeader title="Attendance trend" /><div role="img" aria-label="Attendance trend chart showing weekly attendance between 91 and 96 percent" style={{ minHeight: 240, display: 'grid', placeItems: 'center', background: 'var(--color-canvas)' }}><p>Weekly attendance trend · 91% — 96%</p></div></Card></> : <Card className="entity-table-card"><SectionHeader title="Students needing follow-up" /><div className="table-scroll"><table className="data-table"><thead><tr><th>Student</th><th>Class</th><th>Branch</th><th>Attendance</th><th>Last contact</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{[['Nikhil Verma', 'Grade 8-A', 'Central Campus', '68%', '12 Aug 2026'], ['Aisha Khan', 'Grade 7-B', 'North Campus', '72%', '10 Aug 2026']].map(([student, grade, branch, rate, contact]) => <tr key={student}><td><button className="text-link" type="button" onClick={() => { onOpenAction('open-student-profile', { student }); onNavigate(`/students?student=${encodeURIComponent(student)}`) }}>{student}</button></td><td>{grade}</td><td>{branch}</td><td><span className="status-badge tone-danger">{rate}</span></td><td>{contact}</td><td><button className="table-action" type="button" onClick={() => onOpenAction('open-student-profile', { student })}>Review</button></td></tr>)}</tbody></table></div></Card>}
  </div>
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) { return <Card><p className="section-caption">{label}</p><strong style={{ fontSize: 'var(--font-size-display)' }}>{value}</strong><p className="section-caption">{note}</p></Card> }

function LeaveApprovals({ route, onOpenAction, onNavigate }: { route: AdminRoute; onOpenAction: (action: AdmissionsAttendanceAction, context?: Record<string, string>) => void; onNavigate: (path: string) => void }) {
  return <div className="entity-page"><Header route={route}><button className="button-secondary" type="button" onClick={() => onOpenAction('change-tab', { tab: 'history' })}>View History</button></Header><div className="table-toolbar"><label><span className="sr-only">Filter leave type</span><button className="button-secondary" type="button" onClick={() => onOpenAction('change-tab', { tab: 'leave-type-filter' })}>All leave types <ChevronDown aria-hidden="true" /></button></label><label><span className="sr-only">Filter leave date</span><input type="date" aria-label="Filter leave date" onChange={() => onOpenAction('change-tab', { tab: 'date-filter' })} /></label></div><Card className="entity-table-card"><SectionHeader title="Pending leave approvals" /><div className="table-scroll"><table className="data-table"><thead><tr><th>Staff member</th><th>Leave type</th><th>Dates</th><th>Days</th><th>Reason</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{[['Meera Kapoor', 'Medical leave', '21–22 Aug 2026', '2', 'Medical appointment'], ['Rohan Singh', 'Personal leave', '25 Aug 2026', '1', 'Family commitment']].map(([staff, type, dates, days, reason]) => <tr key={staff}><td><button className="text-link" type="button" onClick={() => { onOpenAction('view-leave', { staff }); onNavigate(`/staff?staff=${encodeURIComponent(staff)}`) }}>{staff}</button></td><td>{type}</td><td>{dates}</td><td>{days}</td><td>{reason}</td><td><button type="button" className="button-secondary" aria-label={`Reject leave for ${staff}`} onClick={() => onOpenAction('reject-leave', { staff })}><X aria-hidden="true" />Reject</button><button type="button" className="button-primary" aria-label={`Approve leave for ${staff}`} onClick={() => onOpenAction('approve-leave', { staff })}><Check aria-hidden="true" />Approve</button></td></tr>)}</tbody></table></div></Card></div>
}
