import { useEffect, useState } from 'react'
import { adminRequest } from '../../admin/admin.api'
import { BoneScreen } from '../../../components/admin-ui'
import { getOverviewRegister } from '../api/attendanceApi'
import type { AttendanceStatus } from '../types'
import { AttendanceCharts } from './AttendanceCharts'
import { labelDuplicateClasses, normalizeSections } from '../attendanceOptions'

export interface OverviewTabProps {
  accessToken: string
  selectedBranch: string
  selectedDate: string
  onDateChange: (date: string) => void
  onSwitchToMarkTab?: () => void
}

interface CalendarCell {
  date: string
  state: 'missing' | 'non_applicable' | 'future' | 'marked' | string
  percentage?: number | null
}

export function OverviewTab({
  accessToken,
  selectedBranch,
  selectedDate,
  onDateChange,
  onSwitchToMarkTab,
}: OverviewTabProps) {
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [classes, setClasses] = useState<Array<{ id: string; name: string; displayName?: string }>>([])
  const [sections, setSections] = useState<Array<{ id: string; gradeId: string; sectionName: string }>>([])
  
  const [overview, setOverview] = useState<{
    records: Array<{ id: string; studentId: string; date: string; status: AttendanceStatus; remark?: string }>
    calendarDates: string[]
    calendar?: CalendarCell[]
  }>({ records: [], calendarDates: [], calendar: [] })
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const branch = selectedBranch === 'all' ? undefined : selectedBranch
    Promise.all([
      adminRequest<{ items?: Array<{ id: string; name: string }> }>(accessToken, 'academics/classes?page=1&pageSize=100', { signal: controller.signal }),
      adminRequest<{ items?: Array<{ id: string; gradeId: string; sectionName: string }> }>(accessToken, `academics/sections?page=1&pageSize=100${branch ? `&branchId=${branch}` : ''}`, { signal: controller.signal }),
    ])
      .then(([classData, sectionData]) => {
        const normalizedSections = normalizeSections(sectionData.items)
        setSections(normalizedSections)
        setClasses(labelDuplicateClasses(classData.items, normalizedSections))
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [accessToken, selectedBranch])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void getOverviewRegister(
      accessToken,
      {
        month: selectedDate.slice(0, 7),
        branchId: selectedBranch === 'all' ? undefined : selectedBranch,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
      },
      controller.signal,
    )
      .then((data) => {
        // Older/empty API responses can omit collection fields. Keep the view
        // usable in that state instead of crashing while building the calendar.
        setOverview({
          records: Array.isArray(data.records) ? data.records : [],
          calendarDates: Array.isArray(data.calendarDates) ? data.calendarDates : [],
          calendar: Array.isArray(data.calendar) ? data.calendar : [],
        })
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Attendance overview could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [accessToken, classId, sectionId, selectedBranch, selectedDate])

  // Process calendar cells with fallbacks if overview.calendar is missing
  const calendarCells: CalendarCell[] = (overview.calendar && overview.calendar.length > 0)
    ? overview.calendar
    : (() => {
        const dateMap = new Map<string, { present: number; total: number }>()
        overview.records.forEach((r) => {
          const cur = dateMap.get(r.date) ?? { present: 0, total: 0 }
          cur.total += 1
          if (r.status === 'PRESENT' || r.status === 'LATE') cur.present += 1
          dateMap.set(r.date, cur)
        })

        const today = new Date().toISOString().slice(0, 10)
        return overview.calendarDates.map((dateStr) => {
          const dayOfWeek = new Date(`${dateStr}T00:00:00`).getDay()
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
          const data = dateMap.get(dateStr)

          if (isWeekend) {
            return { date: dateStr, state: 'non_applicable', percentage: null }
          }
          if (dateStr > today) {
            return { date: dateStr, state: 'future', percentage: null }
          }
          if (!data || data.total === 0) {
            return { date: dateStr, state: 'missing', percentage: null }
          }

          const pct = Math.round((data.present / data.total) * 100)
          return { date: dateStr, state: 'marked', percentage: pct }
        })
      })()

  const handleCellClick = (cell: CalendarCell) => {
    onDateChange(cell.date)
    if (cell.state === 'missing') {
      onSwitchToMarkTab?.()
    }
  }

  return (
    <div className="overview-tab" data-testid="overview-tab">
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}

      <div className="attendance-section-intro">
        <div><span className="attendance-section-intro__tag">Live register intelligence</span><h2>Monthly attendance health</h2><p>All charts and calendar states are calculated from saved attendance—no sample or placeholder analytics.</p></div>
        <div className="attendance-approval-route"><strong>Recorded events</strong><span>{loading ? 'Loading…' : overview.records.length}</span></div>
      </div>

      {loading ? <BoneScreen name="attendance-overview-charts" loading label="Loading attendance charts"><div className="attendance-chart-loading"><span /><span /></div></BoneScreen> : <AttendanceCharts records={overview.records} />}

      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Register Review & Filter</h2>
            <p>Filter attendance register overview by class and section.</p>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Class
            <select
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value)
                setSectionId('')
              }}
            >
              <option value="">All classes</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.displayName ?? c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Section
            <select value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">All sections</option>
              {sections
                .filter((s) => !classId || s.gradeId === classId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sectionName}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>

      <div className="card">
        <div className="section-header" style={{ marginBottom: '1rem' }}>
          <div>
            <h2>Interactive Monthly Attendance Register</h2>
            <p>
              Green/red cells show attendance %. Amber indicates a missing past day (click to jump to Mark Attendance). Muted gray indicates weekends/holidays or future.
            </p>
          </div>
        </div>

        {loading ? (
          <BoneScreen name="attendance-overview-calendar" loading label="Loading overview register"><p>Loading overview register…</p></BoneScreen>
        ) : calendarCells.length === 0 ? (
          <p>No calendar data for month {selectedDate.slice(0, 7)}.</p>
        ) : (
          <div className="attendance-calendar" data-testid="attendance-calendar">
            {calendarCells.map((cell) => {
              const isMissing = cell.state === 'missing'
              const isNonApplicable = cell.state === 'non_applicable'
              const isFuture = cell.state === 'future'
              const isMarked = cell.state === 'marked' || cell.state === 'completed'
              const pct = cell.percentage ?? 0
              const isLowPct = isMarked && pct < 75

              return (
                <button
                  key={cell.date}
                  type="button"
                  data-testid={`calendar-cell-${cell.date}`}
                  className={`calendar-${cell.state} ${isLowPct ? 'calendar-low' : ''} ${cell.date === selectedDate ? 'selected-date' : ''}`}
                  onClick={() => handleCellClick(cell)}
                >
                  <strong>{cell.date.slice(-2)}</strong>
                  <small>
                    {isMissing
                      ? 'Missing · mark now'
                      : isNonApplicable
                      ? 'Weekend / Holiday'
                      : isFuture
                      ? 'Future'
                      : `${pct}%`}
                  </small>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
