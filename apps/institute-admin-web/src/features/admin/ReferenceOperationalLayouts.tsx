import { useMemo, useState, type ReactNode } from 'react'
import { BarChart3, BookOpen, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Download, FileCheck2, GraduationCap, MoreVertical, Send, Upload, Users } from 'lucide-react'
import type { AdminRoute } from '../../adminNavigation'
import { WizardActions, WizardStepper } from '../../components/admin-ui'

type SupportedRouteId = 'AC4' | 'AC5' | 'AC6' | 'CM1' | 'CM2' | 'TT1'

export type OperationalLayoutAction =
  | 'create-assessment'
  | 'publish-marks'
  | 'view-assessment'
  | 'create-common-test'
  | 'view-common-test'
  | 'edit-common-test'
  | 'cancel-common-test'
  | 'generate-report-cards'
  | 'view-marks'
  | 'publish-report'
  | 'download-report-card'
  | 'regenerate-report-card'
  | 'new-circular'
  | 'view-circular'
  | 'duplicate-circular'
  | 'delete-circular'
  | 'save-circular-draft'
  | 'schedule-circular'
  | 'send-circular'
  | 'new-template'
  | 'edit-template'
  | 'duplicate-template'
  | 'delete-template'
  | 'publish-timetable'
  | 'copy-timetable'
  | 'assign-period'
  | 'add-exam-slot'
  | 'edit-exam-slot'
  | 'delete-exam-slot'
  | 'add-calendar-event'
  | 'previous-month'
  | 'next-month'
  | 'change-tab'
  | 'change-wizard-step'

export interface ReferenceOperationalLayoutsProps {
  route: AdminRoute
  /** Opens the existing action dialog/flow owned by the consuming route. */
  onOpenAction: (action: OperationalLayoutAction, context?: Record<string, string>) => void
  /** Navigates to an existing route or detail route owned by the consuming app. */
  onNavigate: (route: AdminRoute | string, context?: Record<string, string>) => void
}

const supportedRouteIds = new Set<SupportedRouteId>(['AC4', 'AC5', 'AC6', 'CM1', 'CM2', 'TT1'])

const styles = {
  screen: { display: 'grid', gap: '24px' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '16px', flexWrap: 'wrap' as const },
  breadcrumb: { margin: 0, color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-caption)' },
  title: { margin: '4px 0 0', fontSize: 'var(--font-size-display)', color: 'var(--color-text-primary)' },
  actions: { display: 'flex', gap: '12px', flexWrap: 'wrap' as const },
  card: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: '12px', overflow: 'hidden' },
  filterBar: { display: 'flex', gap: '12px', flexWrap: 'wrap' as const, alignItems: 'center', padding: '12px 16px', background: 'var(--color-canvas)', border: '1px solid var(--color-border)', borderRadius: '8px' },
  select: { minHeight: '40px', padding: '0 12px', border: '1px solid var(--color-border)', borderRadius: '8px', background: 'var(--color-surface)', color: 'var(--color-text-primary)' },
  search: { marginLeft: 'auto', minWidth: '240px', minHeight: '40px', padding: '0 12px', border: '1px solid var(--color-border)', borderRadius: '8px' },
  tabs: { display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)' },
  tab: { padding: '12px 16px', background: 'transparent', border: 0, borderBottom: '2px solid transparent', color: 'var(--color-text-secondary)', fontWeight: 600 },
  activeTab: { color: 'var(--color-primary)', borderBottomColor: 'var(--color-primary)' },
  section: { padding: '20px' },
  twoColumn: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, 0.48fr)', gap: '24px', alignItems: 'start' },
} as const

function ActionButton({ children, action, onOpenAction, context, primary = false, disabled = false, ariaLabel }: {
  children: ReactNode
  action: OperationalLayoutAction
  onOpenAction: ReferenceOperationalLayoutsProps['onOpenAction']
  context?: Record<string, string>
  primary?: boolean
  disabled?: boolean
  ariaLabel?: string
}) {
  const accessibleLabel = ariaLabel ?? (typeof children === 'string' ? children : undefined)
  return <button aria-label={accessibleLabel} className={primary ? 'button-primary' : 'button-secondary'} type="button" disabled={disabled} onClick={() => onOpenAction(action, context)}>{children}</button>
}

function PageHeader({ route, action, label, onOpenAction, secondary, description, className }: {
  route: AdminRoute
  action: OperationalLayoutAction
  label: string
  onOpenAction: ReferenceOperationalLayoutsProps['onOpenAction']
  secondary?: ReactNode
  description?: string
  className?: string
}) {
  return <header style={styles.header} className={className}>
    <div><p style={styles.breadcrumb}>{route.breadcrumb}</p><h1 style={styles.title}>{route.label}</h1>{description ? <p className="academic-reference__subtitle">{description}</p> : null}</div>
    <div style={styles.actions}>{secondary}<ActionButton primary action={action} onOpenAction={onOpenAction}>{label}</ActionButton></div>
  </header>
}

function AcademicMetrics({ items }: { items: Array<{ label: string; value: string | number; hint: string; icon: ReactNode }> }) {
  return <section className="academic-reference__metrics" aria-label="Academic summary">
    {items.map((item) => <article key={item.label}><span>{item.label}</span><i>{item.icon}</i><strong>{item.value}</strong><small>{item.hint}</small></article>)}
  </section>
}

function FilterBar({ labels }: { labels: readonly string[] }) {
  return <div style={styles.filterBar} aria-label="Filters">
    {labels.map((label) => <label key={label}><span className="sr-only">Filter by {label}</span><select aria-label={`Filter by ${label}`} style={styles.select} defaultValue="All"><option>All</option><option>{label} option</option></select></label>)}
    <label style={{ marginLeft: 'auto' }}><span className="sr-only">Search records</span><input style={styles.search} type="search" placeholder="Search…" aria-label="Search records" /></label>
  </div>
}

function OverflowButton({ label, action, onOpenAction, context }: { label: string; action: OperationalLayoutAction; onOpenAction: ReferenceOperationalLayoutsProps['onOpenAction']; context?: Record<string, string> }) {
  return <button type="button" aria-label={label} className="table-action" onClick={() => onOpenAction(action, context)}><MoreVertical aria-hidden="true" /></button>
}

function AssessmentLayout({ route, onOpenAction, onNavigate }: ReferenceOperationalLayoutsProps) {
  const rows = [
    ['Term 1 Mathematics', 'Grade 8', 'Mathematics', 'Term 1', '100', '18 Aug 2026', 'Published'],
    ['Unit Test 2', 'Grade 7', 'Science', 'Term 1', '50', '22 Aug 2026', 'Draft'],
    ['Common English Assessment', 'Grade 8', 'English', 'Term 1', '80', '28 Aug 2026', 'Marks Pending'],
  ]
  return <div style={styles.screen} className="academic-reference">
    <PageHeader className="academic-reference__header" route={route} action="create-assessment" label="+ Create Assessment" description="Plan exams, monitor marks entry, and publish results across every class." onOpenAction={onOpenAction} />
    <AcademicMetrics items={[
      { label: 'Total assessments', value: rows.length, hint: 'This academic year', icon: <FileCheck2 /> },
      { label: 'Published', value: rows.filter((row) => row[6] === 'Published').length, hint: 'Results available', icon: <CheckCircle2 /> },
      { label: 'Upcoming', value: 2, hint: 'Scheduled assessments', icon: <CalendarDays /> },
      { label: 'Marks pending', value: rows.filter((row) => row[6] !== 'Published').length, hint: 'Needs attention', icon: <Clock3 /> },
    ]} />
    <FilterBar labels={['Branch', 'Class', 'Subject', 'Term', 'Marks status']} />
    <div style={styles.card} className="table-scroll academic-reference__table"><table className="data-table"><thead><tr><th>Name</th><th>Class</th><th>Subject</th><th>Term</th><th>Max Marks</th><th>Date</th><th>Marks Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map(([name, className, subject, term, marks, date, status]) => <tr key={name}><td><button type="button" className="table-action" onClick={() => onNavigate('/academics/assessments', { assessment: name })}>{name}{name.startsWith('Common') && <span className="status-badge tone-neutral" style={{ marginLeft: 8 }}>Common</span>}</button></td><td>{className}</td><td>{subject}</td><td>{term}</td><td>{marks}</td><td>{date}</td><td><span className={`status-badge ${status === 'Published' ? 'tone-success' : status === 'Marks Pending' ? 'tone-warning' : 'tone-neutral'}`}>{status}</span></td><td><div className="academic-reference__row-actions"><ActionButton action="view-assessment" onOpenAction={onOpenAction} context={{ assessment: name }}>View</ActionButton><ActionButton action="publish-marks" onOpenAction={onOpenAction} disabled={status === 'Published'} context={{ assessment: name }}>Publish Marks</ActionButton><OverflowButton label={`More actions for ${name}`} action="view-assessment" onOpenAction={onOpenAction} context={{ assessment: name }} /></div></td></tr>)}</tbody></table></div>
  </div>
}

function CommonTestDetail({ route, testName, onOpenAction, onNavigate }: ReferenceOperationalLayoutsProps & { testName: string }) {
  const [tab, setTab] = useState<'overview' | 'progress' | 'fairness' | 'results'>('overview')
  const decodedName = decodeURIComponent(testName)
  return <div style={styles.screen}>
    <header style={styles.header}>
      <div><p style={styles.breadcrumb}>{route.breadcrumb} / Detail</p><h1 style={styles.title}>{decodedName}</h1><span className="status-badge tone-warning">Results Pending</span></div>
      <div style={styles.actions}><button type="button" className="button-secondary" onClick={() => onNavigate('/academics/common-tests')}>Back to Common Tests</button><ActionButton action="edit-common-test" onOpenAction={onOpenAction}>Edit test</ActionButton><ActionButton action="cancel-common-test" onOpenAction={onOpenAction}>Cancel test</ActionButton></div>
    </header>
    <nav style={styles.tabs} aria-label="Common test detail views">{([['overview', 'Overview'], ['progress', 'Branch Progress'], ['fairness', 'Fairness Controls'], ['results', 'Results']] as const).map(([id, label]) => <button key={id} type="button" style={{ ...styles.tab, ...(tab === id ? styles.activeTab : {}) }} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); onOpenAction('change-tab', { tab: label }) }}>{label}</button>)}</nav>
    {tab === 'overview' && <section className="prototype-metric-grid">{[['Subject / Class', 'Mathematics · Grade 8'], ['Branches', '5 of 6 participating'], ['Scheduling', 'Same date and time'], ['Question paper', 'Shared and locked'], ['Report card weightage', '20%'], ['Leaderboard points', 'Participation + rank bonus']].map(([label, value]) => <article className="prototype-metric" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>}
    {tab === 'progress' && <div style={styles.card} className="table-scroll"><div className="prototype-success-banner"><span>All participating branches have submitted marks.</span><ActionButton primary action="publish-marks" onOpenAction={onOpenAction}>Publish results</ActionButton></div><table className="data-table"><thead><tr><th>Branch</th><th>Status</th><th>Students marked</th><th>Submitted</th></tr></thead><tbody>{[['Central Campus', 'Marks Submitted', '148 / 148', 'Today, 14:10'], ['North Campus', 'Marks Submitted', '132 / 132', 'Today, 13:42'], ['East Campus', 'In Progress', '96 / 121', '—']].map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={cell}>{index === 1 ? <span className={`status-badge ${cell === 'Marks Submitted' ? 'tone-success' : 'tone-warning'}`}>{cell}</span> : cell}</td>)}</tr>)}</tbody></table></div>}
    {tab === 'fairness' && <section style={{ ...styles.card, ...styles.section, display: 'grid', gap: 18 }}><h2>Fairness controls</h2><label>Proctoring mode per branch<select style={styles.select} aria-label="Proctoring mode"><option>Offline — shared protocol</option><option>Online proctored</option></select></label><label><input type="checkbox" onChange={() => onOpenAction('edit-common-test', { control: 'normalization' })} /> Apply statistical normalization before awarding points</label><p className="page-subtitle">Changes are audit logged and apply only before result publication.</p></section>}
    {tab === 'results' && <section className="prototype-empty-state"><BarChart3 aria-hidden="true" /><h2>Results are not published yet</h2><p>Publish once every participating branch has completed marks submission.</p></section>}
  </div>
}

function CommonTestsLayout({ route, onOpenAction, onNavigate }: ReferenceOperationalLayoutsProps) {
  const [step, setStep] = useState(0)
  const query = new URLSearchParams(window.location.search)
  const [creating, setCreating] = useState(query.get('mode') === 'create')
  const showBuilder = creating || query.get('mode') === 'create'
  const selectedTest = query.get('test')
  const steps = [{ id: 'scope', label: 'Scope' }, { id: 'scheduling', label: 'Scheduling' }, { id: 'paper', label: 'Question Paper' }, { id: 'scoring', label: 'Scoring' }]
  const advance = (next: number) => { setStep(next); onOpenAction('change-wizard-step', { step: String(next + 1) }) }
  if (showBuilder) return <CommonTestWizard route={route} onOpenAction={onOpenAction} onNavigate={onNavigate} step={step} setStep={advance} onClose={() => { setCreating(false); onNavigate('/academics/common-tests') }} steps={steps} />
  if (selectedTest) return <CommonTestDetail route={route} testName={selectedTest} onOpenAction={onOpenAction} onNavigate={onNavigate} />
  return <div style={styles.screen} className="academic-reference">
    <PageHeader className="academic-reference__header" route={route} action="create-common-test" label="+ Create Common Test" description="Coordinate shared assessments across branches with one schedule and question paper." onOpenAction={(action, context) => { onOpenAction(action, context); setCreating(true); onNavigate('/academics/common-tests', { mode: 'create' }) }} />
    <AcademicMetrics items={[
      { label: 'Common tests', value: 2, hint: 'This academic year', icon: <BookOpen /> },
      { label: 'Branches covered', value: 6, hint: 'Across the institute', icon: <GraduationCap /> },
      { label: 'Published', value: 1, hint: 'Results released', icon: <CheckCircle2 /> },
      { label: 'Results pending', value: 1, hint: 'Awaiting completion', icon: <Clock3 /> },
    ]} />
    <FilterBar labels={['Status', 'Subject', 'Class']} />
    <div style={styles.card} className="table-scroll academic-reference__table"><table className="data-table"><thead><tr><th>Name</th><th>Subject / Class</th><th>Branches Participating</th><th>Status</th><th>Test Date / Window</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><tr><td><button type="button" className="table-action" onClick={() => onNavigate('/academics/common-tests', { test: 'Term 1 Benchmark' })}>Term 1 Benchmark</button></td><td>Mathematics · Grade 8</td><td>5 of 6 branches</td><td><span className="status-badge tone-warning">Results Pending</span></td><td>28 Aug 2026 · 09:00</td><td><div className="academic-reference__row-actions"><ActionButton action="view-common-test" onOpenAction={onOpenAction}>View</ActionButton><ActionButton action="edit-common-test" onOpenAction={onOpenAction}>Edit</ActionButton><ActionButton action="cancel-common-test" onOpenAction={onOpenAction}>Cancel Test</ActionButton></div></td></tr><tr><td><button type="button" className="table-action" onClick={() => onNavigate('/academics/common-tests', { test: 'Science Quiz' })}>Science Quiz</button></td><td>Science · Grade 7</td><td>6 of 6 branches</td><td><span className="status-badge tone-success">Published</span></td><td>12 Aug 2026</td><td><div className="academic-reference__row-actions"><ActionButton action="view-common-test" onOpenAction={onOpenAction}>View</ActionButton></div></td></tr></tbody></table></div>
  </div>
}

function CommonTestWizard({ route, onOpenAction, onNavigate, step, setStep, onClose, steps }: ReferenceOperationalLayoutsProps & { step: number; setStep: (next: number) => void; onClose: () => void; steps: { id: string; label: string }[] }) {
  const body = [
    <><h2>What is this test for?</h2><label>Subject<select style={styles.select} aria-label="Common test subject"><option>Mathematics</option></select></label><label>Class / Grade<select style={styles.select} aria-label="Common test class"><option>Grade 8</option></select></label><h2>Which branches?</h2><label><input type="checkbox" defaultChecked /> All Branches</label><div style={{ padding: 12, borderLeft: '2px solid var(--color-border)' }}>Central Campus <button type="button" className="table-action" onClick={() => onOpenAction('change-wizard-step', { control: 'sections' })}>All Sections selected</button></div></>,
    <><h2>Scheduling</h2><label><input type="radio" name="schedule" defaultChecked /> Same date &amp; time for every branch</label><div style={styles.actions}><input type="date" aria-label="Common test date" /><input type="time" aria-label="Common test time" /></div><label><input type="radio" name="schedule" /> Each branch schedules within a date window</label></>,
    <><h2>Question paper</h2><label><input type="radio" name="paper" defaultChecked /> One shared paper (locked, identical for every branch)</label><button type="button" aria-label="Upload shared question paper" className="button-secondary" onClick={() => onOpenAction('change-wizard-step', { control: 'upload-paper' })}><Upload aria-hidden="true" /> Upload paper PDF</button><label><input type="radio" name="paper" /> Shared question bank, randomized per branch</label></>,
    <><h2>Scoring &amp; Weightage</h2><label><input type="checkbox" /> Counts toward report card</label><label>Weightage <input type="number" aria-label="Report card weightage" defaultValue="20" /> %</label><label><input type="checkbox" /> Counts toward leaderboard points</label><label><input type="radio" name="formula" defaultChecked /> Flat points for participation</label><p className="page-subtitle">Leave both options off only when this test should not affect grades or leaderboard results.</p></>,
  ][step]
  return <div style={styles.screen}><header style={styles.header}><div><p style={styles.breadcrumb}>{route.breadcrumb} / Create</p><h1 style={styles.title}>Create Common Test</h1></div><button type="button" className="button-secondary" onClick={onClose}>Back to Common Tests</button></header><WizardStepper steps={steps} currentStep={step} onStepChange={(next) => setStep(next)} label="Common test creation steps" /><main style={{ ...styles.card, ...styles.section, maxWidth: 720, width: '100%', justifySelf: 'center' }}>{body}</main><WizardActions status={`Step ${step + 1} of ${steps.length}`}><button type="button" className="button-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>Back</button><ActionButton primary action={step === steps.length - 1 ? 'create-common-test' : 'change-wizard-step'} onOpenAction={(action, context) => { if (step === steps.length - 1) { onOpenAction(action, context); onNavigate('/academics/common-tests', { created: 'true' }) } else setStep(step + 1) }}>{step === steps.length - 1 ? 'Create Common Test' : 'Next'}</ActionButton></WizardActions></div>
}

function ReportCardsLayout({ route, onOpenAction }: ReferenceOperationalLayoutsProps) {
  const [tab, setTab] = useState<'marks' | 'cards'>('marks')
  return <div style={styles.screen} className="academic-reference"><PageHeader className="academic-reference__header" route={route} action="generate-report-cards" label="Generate Report Cards" description="Review marks completion, publish results, and generate student report cards." onOpenAction={onOpenAction} /><AcademicMetrics items={[
    { label: 'Students marked', value: '28 / 28', hint: 'Current assessment', icon: <Users /> },
    { label: 'Completion', value: '100%', hint: 'Marks entered', icon: <CheckCircle2 /> },
    { label: 'Report cards', value: 1, hint: 'Generated this term', icon: <FileCheck2 /> },
    { label: 'Average score', value: '72%', hint: 'Current term', icon: <BarChart3 /> },
  ]} /><nav style={styles.tabs} className="academic-reference__tabs" aria-label="Marks and report cards views"><button type="button" style={{ ...styles.tab, ...(tab === 'marks' ? styles.activeTab : {}) }} aria-current={tab === 'marks' ? 'page' : undefined} onClick={() => { setTab('marks'); onOpenAction('change-tab', { tab: 'Marks Oversight' }) }}>Marks Oversight</button><button type="button" style={{ ...styles.tab, ...(tab === 'cards' ? styles.activeTab : {}) }} aria-current={tab === 'cards' ? 'page' : undefined} onClick={() => { setTab('cards'); onOpenAction('change-tab', { tab: 'Report Cards' }) }}>Report Cards</button></nav>{tab === 'marks' ? <div style={styles.card} className="table-scroll academic-reference__table"><table className="data-table"><thead><tr><th>Assessment Name</th><th>Class-Section</th><th>Teacher</th><th>Students Marked</th><th>Publish Status</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><tr><td><strong>Term 1 Mathematics</strong></td><td>Grade 8-A</td><td>Anita Rao</td><td>28 / 28</td><td><span className="status-badge tone-neutral">Draft</span></td><td><div className="academic-reference__row-actions"><ActionButton action="view-marks" onOpenAction={onOpenAction}>View Marks</ActionButton><ActionButton action="publish-report" onOpenAction={onOpenAction}>Publish</ActionButton></div></td></tr></tbody></table></div> : <div style={styles.card} className="table-scroll academic-reference__table"><table className="data-table"><thead><tr><th>Student</th><th>Class-Section</th><th>Academic Year / Term</th><th>Generated Date</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><tr><td><strong>Aarav Sharma</strong></td><td>Grade 8-A</td><td>2026–27 / Term 1</td><td>30 Aug 2026</td><td><div className="academic-reference__row-actions"><ActionButton action="download-report-card" onOpenAction={onOpenAction}><Download aria-hidden="true" /> Download</ActionButton><ActionButton action="regenerate-report-card" onOpenAction={onOpenAction}>Regenerate</ActionButton></div></td></tr></tbody></table></div>}</div>
}

function CircularsLayout({ route, onOpenAction, onNavigate }: ReferenceOperationalLayoutsProps) {
  const composer = new URLSearchParams(window.location.search).get('compose') === 'new'
  if (composer) return <CircularComposer route={route} onOpenAction={onOpenAction} onNavigate={onNavigate} />
  return <div style={styles.screen}><PageHeader route={route} action="new-circular" label="+ New Circular" onOpenAction={(action, context) => { onOpenAction(action, context); onNavigate('/communication/circulars', { compose: 'new' }) }} /><FilterBar labels={['Scope', 'Branch', 'Date range']} /><div style={styles.card} className="table-scroll"><table className="data-table"><thead><tr><th>Title</th><th>Scope</th><th>Posted By</th><th>Date</th><th>Read Receipt</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><tr><td><button type="button" className="table-action" onClick={() => onOpenAction('view-circular', { circular: 'Independence Day programme' })}>Independence Day programme</button></td><td><span className="status-badge tone-neutral">Institute-wide</span></td><td>Priya Mehta</td><td>10 Aug 2026</td><td><progress value="64" max="100" aria-label="64 percent read">64%</progress> 64%</td><td><ActionButton action="view-circular" onOpenAction={onOpenAction}>View</ActionButton> <ActionButton action="duplicate-circular" onOpenAction={onOpenAction}>Duplicate</ActionButton> <ActionButton action="delete-circular" onOpenAction={onOpenAction}>Delete</ActionButton></td></tr></tbody></table></div></div>
}

function CircularComposer({ route, onOpenAction, onNavigate }: ReferenceOperationalLayoutsProps) {
  return <div style={styles.screen}><header style={styles.header}><div><p style={styles.breadcrumb}>{route.breadcrumb} / New Circular</p><h1 style={styles.title}>New Circular</h1></div><button type="button" className="button-secondary" onClick={() => onNavigate('/communication/circulars')}>Discard and return</button></header><main style={styles.twoColumn}><section style={{ ...styles.card, ...styles.section, display: 'grid', gap: 16 }}><label>Title<input aria-label="Circular title" placeholder="Circular title" required /></label><label>Body<textarea aria-label="Circular message body" rows={12} placeholder="Write your message…" required /></label><button type="button" className="button-secondary" onClick={() => onOpenAction('new-circular', { control: 'attachment' })}><Upload aria-hidden="true" /> Add attachment</button></section><aside style={{ ...styles.card, ...styles.section, display: 'grid', gap: 16 }}><h2>Targeting</h2><label><input type="radio" name="scope" defaultChecked /> Institute-wide</label><label><input type="radio" name="scope" /> Specific Branch(es)</label><label><input type="radio" name="scope" /> Specific Class Sections</label><hr /><h2>Channels</h2><label><input type="checkbox" checked readOnly /> Push notification <small>Included · estimated reach 1,240</small></label><label><input type="checkbox" /> WhatsApp <small>Available only when configured</small></label><label><input type="checkbox" /> Email <small>Uses the verified institute sender</small></label></aside></main><WizardActions status="Drafts stay private until scheduled or sent."><ActionButton action="save-circular-draft" onOpenAction={onOpenAction}>Save as Draft</ActionButton><ActionButton action="schedule-circular" onOpenAction={onOpenAction}>Schedule</ActionButton><ActionButton primary action="send-circular" onOpenAction={onOpenAction}><Send aria-hidden="true" /> Send Now</ActionButton></WizardActions></div>
}

function TemplatesLayout({ route, onOpenAction }: ReferenceOperationalLayoutsProps) {
  return <div style={styles.screen}><PageHeader route={route} action="new-template" label="+ New Template" onOpenAction={onOpenAction} /><div style={styles.card} className="table-scroll"><table className="data-table"><thead><tr><th>Template Name</th><th>Type</th><th>Last Edited</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><tr><td>Low attendance alert</td><td><span className="status-badge tone-warning">Low Attendance</span></td><td>Today, 10:24</td><td><ActionButton action="edit-template" onOpenAction={onOpenAction}>Edit</ActionButton> <ActionButton action="duplicate-template" onOpenAction={onOpenAction}>Duplicate</ActionButton> <ActionButton action="delete-template" onOpenAction={onOpenAction}>Delete</ActionButton></td></tr><tr><td>Fee reminder</td><td><span className="status-badge tone-neutral">Fee Reminder</span></td><td>Yesterday</td><td><ActionButton action="edit-template" onOpenAction={onOpenAction}>Edit</ActionButton> <ActionButton action="duplicate-template" onOpenAction={onOpenAction}>Duplicate</ActionButton> <ActionButton action="delete-template" onOpenAction={onOpenAction}>Delete</ActionButton></td></tr></tbody></table></div></div>
}

function TimetableLayout({ route, onOpenAction }: ReferenceOperationalLayoutsProps) {
  const [tab, setTab] = useState<'weekly' | 'exams' | 'calendar'>('weekly')
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const periods = ['1 · 08:00', '2 · 09:00', '3 · 10:15', '4 · 11:15', '5 · 13:00']
  const weekly = <><div style={styles.filterBar}><label>Branch <select aria-label="Timetable branch" style={styles.select}><option>Central Campus</option></select></label><label>Class-Section <select aria-label="Timetable class section" style={styles.select}><option>Grade 8-A</option></select></label></div><div style={styles.card} className="table-scroll"><table className="data-table"><thead><tr><th>Period</th>{days.map((day) => <th key={day}>{day}</th>)}</tr></thead><tbody>{periods.map((period, row) => <tr key={period}><th scope="row">{period}</th>{days.map((day, column) => { const assigned = (row + column) % 3 !== 0; return <td key={day}>{assigned ? <button type="button" className="table-action" onClick={() => onOpenAction('assign-period', { day, period })}>{['Mathematics', 'Science', 'English'][(row + column) % 3]}<small style={{ display: 'block', color: 'var(--color-text-secondary)' }}>Anita Rao</small></button> : <button type="button" className="button-secondary" aria-label={`Assign ${day} ${period}`} onClick={() => onOpenAction('assign-period', { day, period })}>+ Assign</button>}</td> })}</tr>)}</tbody></table></div></>
  const exams = <div style={styles.card} className="table-scroll"><table className="data-table"><thead><tr><th>Assessment Name</th><th>Date</th><th>Time</th><th>Branch / Room</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody><tr><td>Term 1 Mathematics</td><td>28 Aug 2026</td><td>09:00–11:00</td><td>Central Campus / Hall A</td><td><ActionButton action="edit-exam-slot" onOpenAction={onOpenAction}>Edit</ActionButton> <ActionButton action="delete-exam-slot" onOpenAction={onOpenAction}>Delete</ActionButton></td></tr></tbody></table></div>
  const calendar = <section style={{ ...styles.card, ...styles.section }}><div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16 }}><button type="button" aria-label="Previous month" className="button-secondary" onClick={() => onOpenAction('previous-month')}><ChevronLeft aria-hidden="true" /></button><h2>August 2026</h2><button type="button" aria-label="Next month" className="button-secondary" onClick={() => onOpenAction('next-month')}><ChevronRight aria-hidden="true" /></button></div><p>Legend: Holiday · Exam · PTM · Common Test</p><div role="grid" aria-label="August 2026 academic calendar" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(80px, 1fr))', gap: 6 }}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <strong key={day}>{day}</strong>)}{Array.from({ length: 31 }, (_, index) => <button type="button" key={index} role="gridcell" aria-label={`August ${index + 1}`} style={{ minHeight: 72, textAlign: 'left', background: index === 14 ? 'var(--color-primary-subtle)' : 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 6 }} onClick={() => onOpenAction('add-calendar-event', { date: `2026-08-${String(index + 1).padStart(2, '0')}` })}>{index + 1}{index === 14 && <small style={{ display: 'block' }}>Independence Day</small>}</button>)}</div></section>
  return <div style={styles.screen}><PageHeader route={route} action={tab === 'weekly' ? 'publish-timetable' : tab === 'exams' ? 'add-exam-slot' : 'add-calendar-event'} label={tab === 'weekly' ? 'Publish Timetable' : tab === 'exams' ? '+ Add Exam Slot' : '+ Add Calendar Event'} onOpenAction={onOpenAction} secondary={tab === 'weekly' ? <ActionButton action="copy-timetable" onOpenAction={onOpenAction}>Copy from Another Section</ActionButton> : undefined} /><nav style={styles.tabs} aria-label="Timetable views">{([['weekly', 'Weekly Grid'], ['exams', 'Exam Schedule'], ['calendar', 'Academic Calendar']] as const).map(([id, label]) => <button key={id} type="button" style={{ ...styles.tab, ...(tab === id ? styles.activeTab : {}) }} aria-current={tab === id ? 'page' : undefined} onClick={() => { setTab(id); onOpenAction('change-tab', { tab: label }) }}>{label}</button>)}</nav>{tab === 'weekly' ? weekly : tab === 'exams' ? exams : calendar}</div>
}

/**
 * Reference-specific presentation layer for operational routes. It intentionally owns no data
 * fetching or route registration; consumers retain the existing OperationalListPage contracts.
 */
export function ReferenceOperationalLayouts(props: ReferenceOperationalLayoutsProps) {
  const routeId = props.route.id as SupportedRouteId
  const content = useMemo(() => {
    if (!supportedRouteIds.has(routeId)) return null
    switch (routeId) {
      case 'AC4': return <AssessmentLayout {...props} />
      case 'AC5': return <CommonTestsLayout {...props} />
      case 'AC6': return <ReportCardsLayout {...props} />
      case 'CM1': return <CircularsLayout {...props} />
      case 'CM2': return <TemplatesLayout {...props} />
      case 'TT1': return <TimetableLayout {...props} />
    }
  }, [props, routeId])
  return content
}
