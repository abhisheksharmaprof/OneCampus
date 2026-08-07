import {
  AlertTriangle,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  GraduationCap,
  IndianRupee,
  Megaphone,
  Plus,
  Sparkles,
  Star,
  UserRoundCheck,
  Users,
  WalletCards,
} from 'lucide-react'
import type { BranchContext } from '../../components/layout/AppShell'
import { DashboardSkeleton } from '../../components/admin-ui'
import type { DashboardData } from './dashboard.api'
import './dashboard.css'

function formatCurrency(value: string | number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(Number(value))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(`${value}T00:00:00`))
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1_440)}d ago`
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()
}

type Navigate = (page: string) => void

function SectionTitle({ icon: Icon, title, action, onAction }: { icon: typeof Users; title: string; action?: string; onAction?: () => void }) {
  return <div className="overview-card-header"><h2><Icon aria-hidden="true" />{title}</h2>{action && <button type="button" onClick={onAction}>{action}</button>}</div>
}

function Empty({ children }: { children: string }) {
  return <p className="overview-empty">{children}</p>
}

export function DashboardPage({
  branch,
  data,
  error,
  displayName,
  academicYear,
  onBranchChange,
  onReview,
  onNavigate,
}: {
  branch: BranchContext
  data: DashboardData | null
  error: string
  displayName: string
  academicYear: string
  onBranchChange: (branch: BranchContext) => void
  onReview: (destination: string) => void
  onNavigate: Navigate
}) {
  if (!data) {
    if (!error) return <DashboardSkeleton />
    return <div className="dashboard-page"><div className="card dashboard-state" role="alert">{error}</div></div>
  }

  const firstName = displayName.trim().split(/\s+/)[0] || 'Admin'
  const branchLabel = branch === 'all' ? 'All Branches' : data.context.branches.find((item) => item.id === branch)?.name ?? 'Selected Branch'
  const enrollment = data.enrollmentByBranch ?? data.branchComparison.map((item) => ({ branchId: item.branchId, name: item.name, code: item.name.slice(0, 3).toUpperCase(), students: 0 }))
  const collections = data.feeLastSevenDays ?? []
  const studentAttendance = data.attendanceBreakdown?.students ?? {
    present: data.kpis.todayAttendance.present,
    absent: Math.max(0, data.kpis.todayAttendance.total - data.kpis.todayAttendance.present),
    late: 0, excused: 0, total: data.kpis.todayAttendance.total,
  }
  const staffAttendance = data.attendanceBreakdown?.staff ?? { present: 0, absent: 0, late: 0, total: 0 }
  const teacherAttendance = data.attendanceBreakdown?.teachers ?? { present: 0, absent: 0, late: 0, total: 0 }
  const finance = data.financeSnapshot ?? {
    feesCollected: data.kpis.feeCollection.collected,
    expenses: '0.00', outstanding: '0.00', defaulters: 0, net: data.kpis.feeCollection.collected,
  }
  const maxEnrollment = Math.max(1, ...enrollment.map((item) => item.students))
  const maxCollection = Math.max(1, ...collections.map((item) => Number(item.amount)))
  const kpis = [
    { label: 'Total Students', value: data.kpis.activeStudents, detail: 'Active students', icon: GraduationCap, color: 'blue', navigate: 'Student Directory' },
    { label: 'Total Teachers', value: data.kpis.totalTeachers ?? 0, detail: 'Active teaching staff', icon: BriefcaseBusiness, color: 'green', navigate: 'Staff Directory' },
    { label: 'Total Staff', value: data.kpis.totalStaff, detail: `${data.kpis.pendingLeaves ?? 0} pending leave`, icon: Users, color: 'amber', navigate: 'Staff Directory' },
    { label: 'Total Subjects', value: data.kpis.totalSubjects ?? 0, detail: `Academic year ${academicYear}`, icon: BookOpen, color: 'purple', navigate: 'Subjects & Curriculum' },
    { label: 'Attendance Today', value: data.kpis.todayAttendance.percentage == null ? '—' : `${data.kpis.todayAttendance.percentage}%`, detail: `${data.kpis.todayAttendance.present} of ${data.kpis.todayAttendance.total} present`, icon: UserRoundCheck, color: 'green', navigate: 'Attendance Dashboard' },
    { label: 'Fees Collected (MTD)', value: formatCurrency(data.kpis.feeCollection.collected), detail: data.kpis.feeCollection.percentage == null ? 'No target set' : `${data.kpis.feeCollection.percentage}% of target`, icon: IndianRupee, color: 'green', navigate: 'Collection Dashboard & Invoices' },
    { label: 'Pending Leaves', value: data.kpis.pendingLeaves ?? 0, detail: 'Awaiting approval', icon: Clock3, color: 'amber', review: 'attendance/leave-approvals' },
    { label: 'At-Risk Students', value: data.kpis.atRiskStudents ?? data.attentionItems.find((item) => item.id === 'attendance')?.count ?? 0, detail: 'Attendance below 75%', icon: AlertTriangle, color: 'red', review: 'attendance/low-attendance' },
  ]

  return (
    <div className="dashboard-page overview-dashboard">
      <div className="overview-heading">
        <div><h1>Dashboard Overview</h1><p>Welcome back, {firstName} — here is what is happening today.</p></div>
        <div className="overview-heading-actions">
          <span className="overview-scope"><i />Viewing: {branchLabel}</span>
          <button className="button-secondary" type="button" onClick={() => onNavigate('Audit Log')}><Star aria-hidden="true" /> Saved Views</button>
          <button className="button-primary" type="button" onClick={() => onNavigate('Student Directory')}><Plus aria-hidden="true" /> Quick Add</button>
        </div>
      </div>

      <section className="overview-kpi-grid" aria-label="Needs your attention">
        {kpis.map(({ label, value, detail, icon: Icon, color, navigate, review }) => (
          <button aria-label={review && Number(value) > 0 ? `Review ${label}` : undefined} className="overview-kpi" type="button" key={label} onClick={() => review ? onReview(review) : navigate && onNavigate(navigate)}>
            <span className={`overview-kpi-icon is-${color}`}><Icon aria-hidden="true" /></span>
            <span className="overview-kpi-label">{label}</span>
            <strong>{typeof value === 'number' ? value.toLocaleString('en-IN') : value}</strong>
            <small>{detail}</small>
          </button>
        ))}
      </section>

      <section className="overview-split overview-charts">
        <article className="overview-card">
          <SectionTitle icon={Users} title="Enrollment by Branch" />
          {enrollment.length ? <div className="overview-bar-chart" aria-label="Enrollment by branch chart">
            {enrollment.map((item) => <button type="button" key={item.branchId} onClick={() => onBranchChange(item.branchId)} title={`${item.name}: ${item.students} students`}>
              <span className="overview-bar-value">{item.students}</span><i style={{ height: `${Math.max(8, item.students * 100 / maxEnrollment)}%` }} /><small>{item.code}</small>
            </button>)}
          </div> : <Empty>No active branch enrollment data.</Empty>}
        </article>
        <article className="overview-card">
          <SectionTitle icon={IndianRupee} title="Fee Collection (Last 7 Days)" />
          {collections.length ? <div className="overview-bar-chart is-green" aria-label="Fee collection for the last seven days">
            {collections.map((item) => <div key={item.date} title={`${formatDate(item.date)}: ${formatCurrency(item.amount)}`}>
              <span className="overview-bar-value">{Number(item.amount) ? formatCurrency(item.amount) : '—'}</span><i style={{ height: `${Math.max(4, Number(item.amount) * 100 / maxCollection)}%` }} /><small>{new Date(`${item.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}</small>
            </div>)}
          </div> : <Empty>No collections recorded in the last seven days.</Empty>}
        </article>
      </section>

      <article className="overview-card overview-attendance">
        <SectionTitle icon={ClipboardCheck} title="Today's Attendance Breakdown" action="View all" onAction={() => onNavigate('Attendance Dashboard')} />
        <div className="overview-attendance-grid">
          {[
            { label: 'Students', summary: studentAttendance, Icon: GraduationCap },
            { label: 'Teachers', summary: teacherAttendance, Icon: BriefcaseBusiness },
            { label: 'Staff', summary: staffAttendance, Icon: Users },
          ].map(({ label, summary: stats, Icon }) => {
            return <div className="overview-attendance-stat" key={label}><span><Icon aria-hidden="true" />{label}</span><strong>{stats.present}</strong><small>Present</small><p><em>{stats.absent} Absent</em><b>{stats.late} Late</b></p></div>
          })}
        </div>
      </article>

      <section className="overview-split">
        <article className="overview-card">
          <SectionTitle icon={Sparkles} title="Admissions This Month" action="View funnel" onAction={() => onNavigate('Admissions Dashboard & Funnel')} />
          <div className="overview-funnel-list">
            {Object.entries(data.admissionsFunnel).map(([stage, value], index) => <div key={stage}><span>{['Enquiries', 'Visits scheduled', 'Applications', 'Enrolled'][index]}</span><i><b style={{ width: `${Math.max(4, value * 100 / Math.max(1, data.admissionsFunnel.enquiry))}%` }} /></i><strong>{value}</strong></div>)}
          </div>
        </article>
        <article className="overview-card">
          <SectionTitle icon={Clock3} title="Leave Requests" action="View all" onAction={() => onReview('attendance/leave-approvals')} />
          {data.leaveRequests?.length ? <div className="overview-person-list">{data.leaveRequests.map((leave) => <div key={leave.id}><span className="overview-avatar">{initials(leave.applicantName)}</span><p><strong>{leave.applicantName}</strong><small>{leave.leaveType} · {formatDate(leave.startsOn)}–{formatDate(leave.endsOn)}</small></p><button type="button" onClick={() => onReview('attendance/leave-approvals')}>Review <ChevronRight aria-hidden="true" /></button></div>)}</div> : <Empty>No pending leave requests.</Empty>}
        </article>
      </section>

      <section className="overview-split">
        <article className="overview-card">
          <SectionTitle icon={WalletCards} title="Finance Snapshot (MTD)" action="Full report" onAction={() => onNavigate('Reports')} />
          <div className="overview-finance-grid">
            <div><span>Fees Collected</span><strong className="is-success">{formatCurrency(finance.feesCollected)}</strong></div>
            <div><span>Total Expenses</span><strong className="is-danger">{formatCurrency(finance.expenses)}</strong></div>
            <div><span>Outstanding Fees</span><strong className="is-warning">{formatCurrency(finance.outstanding)}</strong><small>{finance.defaulters} invoices</small></div>
            <div><span>Net</span><strong>{formatCurrency(finance.net)}</strong></div>
          </div>
        </article>
        <article className="overview-card">
          <SectionTitle icon={Megaphone} title="Notice Board" action="View all" onAction={() => onNavigate('Circulars & Broadcast')} />
          {data.noticeBoard?.length ? <div className="overview-notice-list">{data.noticeBoard.map((notice) => <div key={notice.id}><p><strong>{notice.title}</strong><small>Updated {relativeTime(notice.updatedAt)}</small></p><span>{notice.status}</span></div>)}</div> : <Empty>No circulars posted.</Empty>}
        </article>
      </section>

      <article className="overview-card">
        <SectionTitle icon={CalendarDays} title="Upcoming Events" action="View calendar" onAction={() => onNavigate('Academic Calendar')} />
        {data.upcoming.length ? <div className="overview-events">{data.upcoming.slice(0, 3).map((event) => <div key={event.id}><time><strong>{new Date(`${event.startsOn}T00:00:00`).getDate()}</strong><span>{new Date(`${event.startsOn}T00:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</span></time><p><strong>{event.title}</strong><small>{event.type.replaceAll('_', ' ')}</small></p></div>)}</div> : <Empty>No upcoming events.</Empty>}
      </article>

      <article className="overview-card overview-quick-actions">
        <SectionTitle icon={Plus} title="Quick Actions" />
        <div>{[
          [Plus, 'Add Student', 'Student Directory'], [Plus, 'Add Staff', 'Staff Directory'], [ClipboardCheck, 'Mark Attendance', 'Mark Attendance'], [IndianRupee, 'Collect Fee', 'Collections'], [CalendarDays, 'Generate Timetable', 'Generate Timetable'], [Megaphone, 'Send Announcement', 'Circulars'],
        ].map(([Icon, label, destination]) => <button type="button" key={label as string} onClick={() => onNavigate(destination as string)}><Icon aria-hidden="true" />{label as string}</button>)}</div>
      </article>

      <article className="overview-card">
        <SectionTitle icon={CheckCircle2} title="Recent Activity" action="View all" onAction={() => onNavigate('Audit Log')} />
        {data.recentActivity.length ? <div className="overview-activity-list">{data.recentActivity.slice(0, 5).map((activity) => <div key={activity.id}><i /><p><strong>{activity.actorName}</strong><span>{activity.message}</span><small>{relativeTime(activity.createdAt)}</small></p></div>)}</div> : <Empty>No recent activity yet.</Empty>}
      </article>
    </div>
  )
}
