import { useEffect, useState } from 'react'
import { adminRequest } from '../../admin/admin.api'
import { BoneScreen } from '../../../components/admin-ui'
import { getLowAttendanceAlerts } from '../api/attendanceApi'
import type { AttendanceAlertStudent } from '../types'
import { labelDuplicateClasses, normalizeSections } from '../attendanceOptions'

export interface ReportsAnalyticsTabProps {
  accessToken: string
  selectedBranch: string
}

type ReportData = {
  summary: {
    present: number
    absent: number
    late: number
    excused: number
    total: number
    attendancePercentage: number
  }
  trend: Array<{ date: string; total: number; present: number; percentage: number }>
  staffSummary: Array<{ userId: string; name: string; totalDays: number; lateDays: number; latePercentage: number }>
  atRisk: Array<{ studentId: string; reason: string }>
  academicPerformanceAvailable: boolean
}

export function ReportsAnalyticsTab({ accessToken, selectedBranch }: ReportsAnalyticsTabProps) {
  const [data, setData] = useState<ReportData | null>(null)
  const [alerts, setAlerts] = useState<AttendanceAlertStudent[]>([])
  const [error, setError] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [scope, setScope] = useState({ classId: '', sectionId: '', subjectId: '' })
  const [notified, setNotified] = useState<string[]>([])
  const [notifying, setNotifying] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [classes, setClasses] = useState<Array<{ id: string; name: string; displayName?: string }>>([])
  const [sections, setSections] = useState<Array<{ id: string; gradeId: string; sectionName: string }>>([])
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([])

  useEffect(() => {
    const controller = new AbortController()
    const branchId = selectedBranch === 'all' ? '' : selectedBranch
    Promise.all([
      adminRequest<{ items?: Array<{ id: string; name: string }> }>(accessToken, 'academics/classes?page=1&pageSize=100', { signal: controller.signal }),
      adminRequest<{ items?: Array<{ id: string; gradeId: string; sectionName: string }> }>(accessToken, `academics/sections?page=1&pageSize=100${branchId ? `&branchId=${branchId}` : ''}`, { signal: controller.signal }),
      adminRequest<{ items?: Array<{ id: string; name: string }> }>(accessToken, 'academics/subjects?page=1&pageSize=100', { signal: controller.signal }),
    ]).then(([classData, sectionData, subjectData]) => {
      const normalizedSections = normalizeSections(sectionData.items)
      setSections(normalizedSections)
      setClasses(labelDuplicateClasses(classData.items, normalizedSections))
      setSubjects(subjectData.items ?? [])
    }).catch(() => undefined)
    return () => controller.abort()
  }, [accessToken, selectedBranch])

  useEffect(() => {
    const branchId = selectedBranch === 'all' ? undefined : selectedBranch
    const controller = new AbortController()
    const query = new URLSearchParams()
    if (branchId) query.set('branchId', branchId)
    if (dateFrom) query.set('dateFrom', dateFrom)
    if (dateTo) query.set('dateTo', dateTo)
    Object.entries(scope).forEach(([key, value]) => {
      if (value) query.set(key, value)
    })
    setError('')
    setLoading(true)
    Promise.all([
      adminRequest<ReportData>(accessToken, `attendance/reports?${query}`, { signal: controller.signal }),
      getLowAttendanceAlerts(accessToken, { branchId }, controller.signal),
    ])
      .then(([report, low]) => {
        setData(report)
        setAlerts(low)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Reports could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [accessToken, dateFrom, dateTo, scope, selectedBranch])

  const exportCsv = () => {
    if (!data) return
    const rows = [
      ['Date', 'Attendance %', 'Present', 'Total'],
      ...data.trend.map((item) => [item.date, String(item.percentage), String(item.present), String(item.total)]),
    ]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'attendance-report.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  const handleNotifyParent = async (studentId: string) => {
    setNotifying(studentId)
    try {
      await adminRequest(accessToken, `attendance/alerts/${studentId}/notify`, { method: 'POST' })
      setNotified((prev) => [...prev, studentId])
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Parent notification failed.')
    } finally {
      setNotifying(null)
    }
  }

  return (
    <div className="reports-analytics-tab" data-testid="reports-analytics-tab">
      <div className="attendance-section-intro">
        <div><span className="attendance-section-intro__tag">Analytics & intervention</span><h2>Attendance intelligence</h2><p>Explore live trends, identify students at risk, review staff punctuality and contact families from the same report.</p></div>
        <div className="attendance-approval-route"><strong>Alert threshold</strong><span>Below 75%</span></div>
      </div>
      <div
        className="page-heading"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}
      >
        <div>
          <h2>Attendance Reports & Analytics</h2>
          <p className="page-subtitle">
            Real attendance trends, staff punctuality cards, and low-attendance alerts for{' '}
            {selectedBranch === 'all' ? 'all branches combined' : 'the selected branch'}.
          </p>
        </div>
        <div className="form-actions" style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" className="button-secondary" onClick={() => window.print()}>
            Print / PDF
          </button>
          <button type="button" className="button-primary" onClick={exportCsv} disabled={!data}>
            Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      <div className="form-grid" style={{ marginBottom: '1.5rem' }}>
        <label>
          From Date
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </label>
        <label>
          To Date
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </label>
        <label>
          Class
          <select
            value={scope.classId}
            onChange={(e) => setScope({ ...scope, classId: e.target.value, sectionId: '' })}
          >
            <option value="">All classes</option>
            {classes.map((item) => <option key={item.id} value={item.id}>{item.displayName ?? item.name}</option>)}
          </select>
        </label>
        <label>
          Section
          <select
            value={scope.sectionId}
            onChange={(e) => setScope({ ...scope, sectionId: e.target.value })}
          >
            <option value="">All sections</option>
            {sections.filter((item) => !scope.classId || item.gradeId === scope.classId).map((item) => <option key={item.id} value={item.id}>{item.sectionName}</option>)}
          </select>
        </label>
        <label>
          Subject
          <select
            value={scope.subjectId}
            onChange={(e) => setScope({ ...scope, subjectId: e.target.value })}
          >
            <option value="">All subjects</option>
            {subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
      </div>

      {loading && <BoneScreen name="attendance-reports-analytics" loading label="Loading attendance analytics"><div className="attendance-analytics-loading"><span /><span /><span /><span /></div></BoneScreen>}
      {data && (
        <>
          <div className="metric-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div className="metric-card card">
              <span>Attendance Rate</span>
              <strong style={{ fontSize: '1.5rem', display: 'block' }}>{data.summary.attendancePercentage}%</strong>
            </div>
            <div className="metric-card card">
              <span>Present / Late</span>
              <strong style={{ fontSize: '1.5rem', display: 'block' }}>{data.summary.present + data.summary.late}</strong>
            </div>
            <div className="metric-card card">
              <span>Absent</span>
              <strong style={{ fontSize: '1.5rem', display: 'block' }}>{data.summary.absent}</strong>
            </div>
            <div className="metric-card card">
              <span>Low Attendance Alerts</span>
              <strong style={{ fontSize: '1.5rem', display: 'block', color: alerts.length > 0 ? '#ef4444' : 'inherit' }}>
                {alerts.length}
              </strong>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="section-header">
              <div>
                <h2>Attendance Trend</h2>
                <p>Daily breakdown of attendance percentage across the selected range.</p>
              </div>
            </div>
            {data.trend.some((item) => item.percentage > 0) ? (
              <div className="report-bars" data-testid="report-trend-bars">
                {data.trend.map((item) => (
                <div
                  className="report-bar"
                  key={item.date}
                  title={`${item.date}: ${item.percentage}%`}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '24px',
                      height: `${Math.max(item.percentage, 3)}%`,
                      backgroundColor: item.percentage >= 75 ? '#10b981' : '#ef4444',
                      borderRadius: '2px 2px 0 0',
                    }}
                  />
                  <small style={{ marginTop: '0.25rem', fontSize: '0.75rem' }}>{item.date.slice(-2)}</small>
                </div>
                ))}
              </div>
            ) : (
              <div className="attendance-chart-empty attendance-chart-empty--compact" data-testid="report-trend-bars">
                Attendance trends will appear after registers are marked for this date range.
              </div>
            )}
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="section-header">
              <div>
                <h2>Low-Attendance Alerts (&lt; 75% Threshold)</h2>
                <p>Students falling below the minimum required attendance threshold.</p>
              </div>
            </div>
            <div className="table-wrap">
              <table aria-label="Low Attendance Alerts">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class / Section</th>
                    <th>Attendance %</th>
                    <th>Consecutive Absences</th>
                    <th>1-Click Action</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((item) => {
                    const isDone = notified.includes(item.studentId)
                    const isBusy = notifying === item.studentId

                    return (
                      <tr key={item.studentId} data-testid={`alert-row-${item.studentId}`}>
                        <td>
                          <strong>{item.studentName}</strong>
                          <br />
                          <small>{item.admissionNumber}</small>
                        </td>
                        <td>
                          {item.className} / {item.sectionName}
                        </td>
                        <td>
                          <strong style={{ color: item.attendancePercentage < 75 ? '#ef4444' : '#10b981' }}>
                            {item.attendancePercentage}%
                          </strong>
                        </td>
                        <td>{item.consecutiveAbsences}</td>
                        <td>
                          <button
                            type="button"
                            className="button-secondary"
                            disabled={isDone || isBusy}
                            onClick={() => void handleNotifyParent(item.studentId)}
                          >
                            {isDone ? 'Queued / Notified' : isBusy ? 'Sending…' : 'Notify Parent'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {alerts.length === 0 && (
                    <tr>
                      <td colSpan={5}>No students below attendance threshold.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2>Staff Attendance & Punctuality Summary</h2>
            <div className="table-wrap">
              <table aria-label="Staff Punctuality Summary">
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Days Marked</th>
                    <th>Late Days</th>
                    <th>Late %</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffSummary.map((item) => (
                    <tr key={item.userId}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>{item.totalDays}</td>
                      <td>{item.lateDays}</td>
                      <td>
                        <span style={{ color: item.latePercentage > 20 ? '#ef4444' : 'inherit' }}>
                          {item.latePercentage}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {data.staffSummary.length === 0 && (
                    <tr>
                      <td colSpan={4}>No staff attendance records available for this range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card">
            <h2>Academic At-Risk Cross-Reference</h2>
            <p>
              {data.academicPerformanceAvailable
                ? `${data.atRisk.length} students identified for joint academic & attendance review.`
                : 'Academic performance data is not available in the current records.'}
            </p>
          </div>
        </>
      )}
    </div>
  )
}
