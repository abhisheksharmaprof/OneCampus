import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarCheck2,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Settings2,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react'
import { Tabs, type TabItem } from '../../components/admin-ui/Tabs'
import { LeaveApprovalsTab } from './components/LeaveApprovalsTab'
import { MarkAttendanceTab } from './components/MarkAttendanceTab'
import { OverviewTab } from './components/OverviewTab'
import { ReportsAnalyticsTab } from './components/ReportsAnalyticsTab'
import { SettingsTab } from './components/SettingsTab'
import {
  getAttendanceReminders,
  getDailyRoster,
  getLeaveApplications,
  type MissingAttendanceSection,
} from './api/attendanceApi'
import './attendance-redesign.css'

export type AttendanceTab = 'mark' | 'overview' | 'student-leave' | 'staff-leave' | 'leave' | 'reports' | 'settings'

export function AttendancePage({
  accessToken,
  selectedBranch,
  selectedDate,
  onDateChange,
  onTabChange,
  initialTab = 'overview',
}: {
  accessToken: string
  selectedBranch: string
  selectedDate: string
  onDateChange: (date: string) => void
  onTabChange?: (tab: AttendanceTab) => void
  initialTab?: AttendanceTab
}) {
  const [tab, setTab] = useState<AttendanceTab>(initialTab)
  const [reminders, setReminders] = useState<MissingAttendanceSection[]>([])
  const [rosterStats, setRosterStats] = useState({ total: 0, present: 0, absent: 0, late: 0 })
  const [pendingLeaves, setPendingLeaves] = useState(0)
  const [pulseLoading, setPulseLoading] = useState(true)
  const [markTarget, setMarkTarget] = useState<{ classId?: string; sectionId?: string }>({})

  const selectTab = (nextTab: AttendanceTab) => {
    setTab(nextTab)
    onTabChange?.(nextTab)
  }

  useEffect(() => {
    setTab(initialTab)
  }, [initialTab])

  useEffect(() => {
    const controller = new AbortController()
    const branchId = selectedBranch === 'all' ? undefined : selectedBranch
    setPulseLoading(true)
    Promise.all([
      getAttendanceReminders(accessToken, { date: selectedDate, branchId }, controller.signal),
      getDailyRoster(accessToken, { date: selectedDate, branchId }, controller.signal),
      getLeaveApplications(accessToken, { status: 'pending', branchId }, controller.signal),
    ])
      .then(([reminderData, roster, leaves]) => {
        setReminders(Array.isArray(reminderData?.missingSections) ? reminderData.missingSections : [])
        setRosterStats({
          total: roster.length,
          present: roster.filter((item) => item.status === 'PRESENT').length,
          absent: roster.filter((item) => item.status === 'ABSENT').length,
          late: roster.filter((item) => item.status === 'LATE').length,
        })
        setPendingLeaves(leaves.length)
      })
      .catch(() => undefined)
      .finally(() => {
        if (!controller.signal.aborted) setPulseLoading(false)
      })
    return () => controller.abort()
  }, [accessToken, selectedBranch, selectedDate])

  const completion = useMemo(() => {
    if (!rosterStats.total) return 0
    return Math.round(((rosterStats.present + rosterStats.absent + rosterStats.late) / rosterStats.total) * 100)
  }, [rosterStats])

  const openMissingSection = (sectionId: string) => {
    const target = reminders.find((item) => item.sectionId === sectionId)
    setMarkTarget({ classId: target?.classId, sectionId })
    selectTab('mark')
    window.setTimeout(() => {
      document.querySelector('[data-testid="mark-attendance-tab"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  const tabs: readonly TabItem[] = [
    {
      id: 'overview',
      label: 'Overview',
      panel: (
        <OverviewTab
          accessToken={accessToken}
          selectedBranch={selectedBranch}
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          onSwitchToMarkTab={() => selectTab('mark')}
        />
      ),
    },
    {
      id: 'mark',
      label: 'Mark Attendance',
      panel: (
        <MarkAttendanceTab
          accessToken={accessToken}
          selectedBranch={selectedBranch}
          selectedDate={selectedDate}
          onDateChange={onDateChange}
          initialClassId={markTarget.classId}
          initialSectionId={markTarget.sectionId}
        />
      ),
    },
    {
      id: 'student-leave',
      label: <><UserCheck aria-hidden="true" />Student Leave</>,
      panel: (
        <LeaveApprovalsTab
          accessToken={accessToken}
          selectedBranch={selectedBranch}
          initialType="student"
          showTypeSwitcher={false}
        />
      ),
    },
    {
      id: 'staff-leave',
      label: <><Users aria-hidden="true" />Staff Leave</>,
      panel: (
        <LeaveApprovalsTab
          accessToken={accessToken}
          selectedBranch={selectedBranch}
          initialType="staff"
          showTypeSwitcher={false}
        />
      ),
    },
    {
      id: 'reports',
      label: 'Reports & Analytics',
      panel: (
        <ReportsAnalyticsTab
          accessToken={accessToken}
          selectedBranch={selectedBranch}
        />
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      panel: (
        <SettingsTab
          accessToken={accessToken}
        />
      ),
    },
  ]

  const currentTabLabel =
    tab === 'mark'
      ? 'Mark Attendance'
      : tab === 'overview'
      ? 'Attendance Overview'
      : tab === 'student-leave' || tab === 'leave'
      ? 'Student Leave'
      : tab === 'staff-leave'
      ? 'Staff Leave'
      : tab === 'reports'
      ? 'Reports & Analytics'
      : 'Attendance Settings'

  return (
    <div className="entity-page attendance-workspace" data-testid="attendance-page">
      <header className="attendance-hero">
        <div className="attendance-hero__copy">
          <div className="attendance-hero__eyebrow"><ShieldCheck aria-hidden="true" /> Academic operations</div>
          <h1>Attendance command centre</h1>
          <p>
            Mark registers, resolve gaps, manage leave and spot attendance risk from one reliable workspace.
          </p>
        </div>
        <div className="attendance-date-control">
          <CalendarDays aria-hidden="true" />
          <label>
            Working date
            <input
              aria-label="Attendance date"
              type="date"
              value={selectedDate}
              onChange={(event) => onDateChange(event.target.value)}
            />
          </label>
        </div>
      </header>

      <section className="attendance-pulse" aria-label="Daily attendance summary">
        <article className="attendance-kpi attendance-kpi--primary">
          <span className="attendance-kpi__icon"><CalendarCheck2 aria-hidden="true" /></span>
          <div><small>Register completion</small><strong>{pulseLoading ? '—' : `${completion}%`}</strong><p>{rosterStats.total} students in scope</p></div>
          <span className="attendance-kpi__meter"><i style={{ width: `${completion}%` }} /></span>
        </article>
        <article className="attendance-kpi">
          <span className="attendance-kpi__icon attendance-kpi__icon--success"><CheckCircle2 aria-hidden="true" /></span>
          <div><small>Present today</small><strong>{pulseLoading ? '—' : rosterStats.present}</strong><p>{rosterStats.late} arrived late</p></div>
        </article>
        <article className="attendance-kpi">
          <span className="attendance-kpi__icon attendance-kpi__icon--danger"><AlertTriangle aria-hidden="true" /></span>
          <div><small>Unmarked classes</small><strong>{pulseLoading ? '—' : reminders.length}</strong><p>{reminders.length ? 'Action required' : 'All caught up'}</p></div>
        </article>
        <article className="attendance-kpi">
          <span className="attendance-kpi__icon attendance-kpi__icon--amber"><Clock3 aria-hidden="true" /></span>
          <div><small>Pending leave</small><strong>{pulseLoading ? '—' : pendingLeaves}</strong><p>Student and staff requests</p></div>
        </article>
      </section>

      {reminders.length > 0 && (
        <section className="attendance-alert-rail" aria-label="Attendance not updated warnings">
          <div className="attendance-alert-rail__intro">
            <span><AlertTriangle aria-hidden="true" /></span>
            <div><strong>Registers need attention</strong><p>{reminders.length} class{reminders.length === 1 ? '' : 'es'} still have students without attendance.</p></div>
          </div>
          <div className="attendance-alert-rail__items">
            {reminders.slice(0, 4).map((item) => (
              <button key={item.sectionId} type="button" onClick={() => openMissingSection(item.sectionId)}>
                <span><strong>{item.className} · {item.sectionName}</strong><small>{item.teacherName || 'Teacher not assigned'}</small></span>
                Mark now
              </button>
            ))}
            {reminders.length > 4 && <span className="attendance-alert-rail__more">+{reminders.length - 4} more</span>}
          </div>
        </section>
      )}

      <div className="attendance-content-heading">
        <div><p className="breadcrumb">Academic / Attendance</p><h2>{currentTabLabel}</h2></div>
        <div className="attendance-context"><BarChart3 aria-hidden="true" />{selectedBranch === 'all' ? 'All branches' : 'Selected branch'} · live records</div>
      </div>

      <div className="attendance-nav-icons" aria-hidden="true">
        <span><BarChart3 /></span><span><CalendarCheck2 /></span><span><UserCheck /></span>
        <span><Users /></span><span><BarChart3 /></span><span><Settings2 /></span>
      </div>
      <Tabs tabs={tabs} activeId={tab === 'leave' ? 'student-leave' : tab} onChange={(id) => selectTab(id as AttendanceTab)} label="Attendance Navigation" />
    </div>
  )
}
