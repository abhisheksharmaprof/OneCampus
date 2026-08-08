import { useEffect, useMemo, useState } from 'react'
import { AdminApiError, adminRequest } from '../../admin/admin.api'
import { BoneScreen } from '../../../components/admin-ui'
import { bulkMarkAttendance, getAttendanceSettings, getDailyRoster } from '../api/attendanceApi'
import { labelDuplicateClasses, normalizeSections } from '../attendanceOptions'
import type { AttendanceSettings, AttendanceStatus, StudentRosterItem } from '../types'

const QUICK_STATUSES: AttendanceStatus[] = ['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE']

export interface MarkAttendanceTabProps {
  accessToken: string
  selectedBranch: string
  selectedDate: string
  onDateChange?: (date: string) => void
  initialClassId?: string
  initialSectionId?: string
}

export function MarkAttendanceTab({
  accessToken,
  selectedBranch,
  selectedDate,
  onDateChange,
  initialClassId = '',
  initialSectionId = '',
}: MarkAttendanceTabProps) {
  const [classId, setClassId] = useState(initialClassId)
  const [sectionId, setSectionId] = useState(initialSectionId)
  const [search, setSearch] = useState('')
  const [periodLabel, setPeriodLabel] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [captureMode, setCaptureMode] = useState('manual')
  const [settings, setSettings] = useState<AttendanceSettings | null>(null)
  
  const [roster, setRoster] = useState<StudentRosterItem[]>([])
  const [draft, setDraft] = useState<Record<string, { status: AttendanceStatus; remark?: string }>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')
  const [offline, setOffline] = useState(!navigator.onLine)
  
  const [classes, setClasses] = useState<Array<{ id: string; name: string; displayName?: string }>>([])
  const [sections, setSections] = useState<Array<{ id: string; gradeId: string; sectionName: string }>>([])
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([])

  // Modal state for student remark
  const [remarkModalStudent, setRemarkModalStudent] = useState<StudentRosterItem | null>(null)
  const [remarkModalValue, setRemarkModalValue] = useState('')

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    if (offline) return
    const pendingKey = `campusone.attendance.pending.${selectedDate}`
    const pending = localStorage.getItem(pendingKey)
    if (!pending) return
    try {
      const queued = JSON.parse(pending) as Parameters<typeof bulkMarkAttendance>[1]
      void bulkMarkAttendance(accessToken, queued)
        .then((result) => {
          localStorage.removeItem(pendingKey)
          setSaved(`${result.updatedCount} offline attendance records synced.`)
        })
        .catch(() => undefined)
    } catch {
      localStorage.removeItem(pendingKey)
    }
  }, [accessToken, offline, selectedDate])

  useEffect(() => {
    const controller = new AbortController()
    const branch = selectedBranch === 'all' ? undefined : selectedBranch
    Promise.all([
      adminRequest<{ items?: Array<{ id: string; name: string }> }>(accessToken, 'academics/classes?page=1&pageSize=100', { signal: controller.signal }),
      adminRequest<{ items?: Array<{ id: string; gradeId: string; sectionName: string }> }>(accessToken, `academics/sections?page=1&pageSize=100${branch ? `&branchId=${branch}` : ''}`, { signal: controller.signal }),
      adminRequest<{ items?: Array<{ id: string; name: string }> }>(accessToken, 'academics/subjects?page=1&pageSize=100', { signal: controller.signal }),
    ])
      .then(([classData, sectionData, subjectData]) => {
        const normalizedSections = normalizeSections(sectionData.items)
        setSections(normalizedSections)
        setClasses(labelDuplicateClasses(classData.items, normalizedSections))
        setSubjects(subjectData.items ?? [])
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [accessToken, selectedBranch])

  useEffect(() => {
    const controller = new AbortController()
    void getAttendanceSettings(accessToken, undefined, controller.signal)
      .then((value) => {
        setSettings(value)
        const modes = value.enabledCaptureModes?.length ? value.enabledCaptureModes : ['manual']
        setCaptureMode((current) => modes.includes(current) ? current : modes[0])
        if (!value.periodWiseEnabled) {
          setPeriodLabel('')
          setSubjectId('')
        }
      })
      .catch(() => undefined)
    return () => controller.abort()
  }, [accessToken])

  useEffect(() => {
    setClassId(initialClassId)
    setSectionId(initialSectionId)
  }, [initialClassId, initialSectionId])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    void getDailyRoster(
      accessToken,
      {
        date: selectedDate,
        branchId: selectedBranch === 'all' ? undefined : selectedBranch,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
        search,
      },
      controller.signal,
    )
      .then((items) => {
        const rosterItems = Array.isArray(items) ? items : []
        setRoster(rosterItems)
        setDraft(Object.fromEntries(rosterItems.map((item) => [item.studentId, { status: item.status, remark: item.remark }])))
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'Attendance roster could not be loaded.')
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [accessToken, classId, sectionId, search, selectedBranch, selectedDate])

  const markedCount = useMemo(() => {
    return Object.values(draft).filter((item) => item.status !== 'NOT_MARKED').length
  }, [draft])
  const statusCounts = useMemo(() => {
    const values = Object.values(draft)
    return {
      present: values.filter((item) => item.status === 'PRESENT').length,
      absent: values.filter((item) => item.status === 'ABSENT').length,
      late: values.filter((item) => item.status === 'LATE').length,
      leave: values.filter((item) => item.status === 'ON_LEAVE').length,
      remaining: values.filter((item) => item.status === 'NOT_MARKED').length,
    }
  }, [draft])

  const setAll = (status: AttendanceStatus) => {
    setDraft((current) => {
      const next = { ...current }
      roster.forEach((student) => {
        if (student.status !== 'ON_LEAVE') {
          next[student.studentId] = {
            ...next[student.studentId],
            status,
          }
        }
      })
      return next
    })
  }

  const payload = {
    date: selectedDate,
    classSectionId: sectionId || undefined,
    captureMode,
    periodLabel: settings?.periodWiseEnabled ? periodLabel || undefined : undefined,
    subjectId: settings?.periodWiseEnabled ? subjectId || undefined : undefined,
    // NOT_MARKED is a UI-only state and ON_LEAVE is locked by the API.
    // Never send either value to the bulk endpoint; only persisted attendance
    // statuses belong in a write payload.
    records: Object.entries(draft)
      .filter(([, item]) => item.status !== 'NOT_MARKED' && item.status !== 'ON_LEAVE')
      .map(([studentId, item]) => ({ studentId, status: item.status, remark: item.remark })),
  }

  const save = async () => {
    setSaving(true)
    setError('')
    setSaved('')
    try {
      if (payload.records.length === 0) {
        setError('Mark at least one student before submitting attendance. Students on approved leave are skipped automatically.')
        return
      }
      const hasExisting = roster.some((item) => item.status !== 'NOT_MARKED' && item.status !== 'ON_LEAVE')
      if (hasExisting && !window.confirm('This will overwrite existing attendance records and create audit entries. Continue?')) {
        setSaving(false)
        return
      }
      if (offline) {
        localStorage.setItem(`campusone.attendance.pending.${selectedDate}`, JSON.stringify(payload))
        setSaved('Saved offline. It will sync automatically when connection is restored.')
      } else {
        const result = await bulkMarkAttendance(accessToken, payload)
        setSaved(`${result.updatedCount} attendance records saved and absence notifications queued.`)
      }
    } catch (cause: unknown) {
      if (cause instanceof AdminApiError && Object.keys(cause.fieldErrors).length > 0) {
        const details = Object.entries(cause.fieldErrors)
          .flatMap(([field, messages]) => messages.map((message) => `${field}: ${message}`))
          .join(' ')
        setError(details || cause.message)
      } else {
        setError(cause instanceof Error ? cause.message : 'Attendance could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  const copyYesterday = async () => {
    const previous = new Date(`${selectedDate}T00:00:00`)
    previous.setDate(previous.getDate() - 1)
    const dateStr = previous.toISOString().slice(0, 10)
    try {
      const items = await getDailyRoster(accessToken, {
        date: dateStr,
        branchId: selectedBranch === 'all' ? undefined : selectedBranch,
        classId: classId || undefined,
        sectionId: sectionId || undefined,
      })
      const rosterItems = Array.isArray(items) ? items : []
      setDraft((current) => {
        const next = { ...current }
        rosterItems.forEach((item) => {
          if (roster.some((r) => r.studentId === item.studentId && r.status !== 'ON_LEAVE')) {
            next[item.studentId] = { status: item.status, remark: item.remark }
          }
        })
        return next
      })
      setSaved(`Copied attendance from ${dateStr}. Review before submitting.`)
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Yesterday attendance could not be copied.')
    }
  }

  const importCsv = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const lines = String(reader.result ?? '').split(/\r?\n/).slice(1)
      setDraft((current) => {
        const next = { ...current }
        lines.forEach((line) => {
          const [stId, statusVal, remarkVal] = line.split(',').map((v) => v.trim())
          if (stId && (['PRESENT', 'ABSENT', 'LATE', 'ON_LEAVE', 'EXCUSED', 'NOT_MARKED'] as AttendanceStatus[]).includes(statusVal as AttendanceStatus)) {
            const isLocked = roster.some((r) => r.studentId === stId && r.status === 'ON_LEAVE')
            if (!isLocked) {
              next[stId] = { status: statusVal as AttendanceStatus, remark: remarkVal }
            }
          }
        })
        return next
      })
      setSaved('CSV imported. Review the roster before submitting.')
    }
    reader.readAsText(file)
  }

  const openRemarkModal = (student: StudentRosterItem) => {
    const currentRemark = draft[student.studentId]?.remark ?? student.remark ?? ''
    setRemarkModalStudent(student)
    setRemarkModalValue(currentRemark)
  }

  const saveRemarkModal = () => {
    if (!remarkModalStudent) return
    setDraft((current) => ({
      ...current,
      [remarkModalStudent.studentId]: {
        ...(current[remarkModalStudent.studentId] ?? { status: remarkModalStudent.status }),
        remark: remarkModalValue,
      },
    }))
    setRemarkModalStudent(null)
    setRemarkModalValue('')
  }

  return (
    <div className="mark-attendance-tab" data-testid="mark-attendance-tab">
      {offline && (
        <div className="inline-warning" data-testid="offline-banner" role="status">
          You are offline. Changes will be saved locally and synced automatically when connection is restored.
        </div>
      )}
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      {saved && <div className="inline-success">{saved}</div>}

      <div className="attendance-section-intro">
        <div>
          <span className="attendance-section-intro__tag">Fast register</span>
          <h2>Mark daily attendance</h2>
          <p>Select a database class and section, then mark the roster with quick actions. Approved student leave is locked automatically.</p>
        </div>
        <div className="attendance-approval-route">
          <strong>Completion</strong>
          <span>{roster.length ? Math.round((markedCount / roster.length) * 100) : 0}% marked</span>
        </div>
      </div>

      <div className="form-grid" style={{ marginBottom: '1rem' }}>
        <label>
          Branch
          <input type="text" value={selectedBranch === 'all' ? 'All Branches' : selectedBranch} disabled readOnly />
        </label>
        <label>
          Class
          <select value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId('') }}>
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
        <label>
          Date
          <input
            type="date"
            aria-label="Filter date"
            value={selectedDate}
            onChange={(e) => onDateChange?.(e.target.value)}
          />
        </label>
        <label>
          Search students
          <input
            aria-label="Search students"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or admission number"
          />
        </label>
        {settings?.periodWiseEnabled && <>
          <label>
            Subject (optional)
            <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Daily attendance</option>
              {subjects.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
            </select>
          </label>
          <label>
            Period (optional)
            <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="e.g. Period 1 / Mathematics" />
          </label>
        </>}
        <label>
          Capture mode
          <select value={captureMode} onChange={(e) => setCaptureMode(e.target.value)}>
            {(settings?.enabledCaptureModes?.length ? settings.enabledCaptureModes : ['manual']).map((mode) => (
              <option key={mode} value={mode}>{mode === 'qr' ? 'QR Scan' : mode === 'rfid' ? 'RFID Card' : mode === 'biometric' ? 'Biometric Scanner' : mode === 'face' ? 'Face Recognition' : 'Manual Tap'}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="attendance-status-summary" aria-label="Current roster status summary">
        <div className="is-present"><small>Present</small><strong>{statusCounts.present}</strong></div>
        <div className="is-absent"><small>Absent</small><strong>{statusCounts.absent}</strong></div>
        <div className="is-late"><small>Late</small><strong>{statusCounts.late}</strong></div>
        <div className="is-leave"><small>On leave</small><strong>{statusCounts.leave}</strong></div>
        <div className="is-unmarked"><small>Still unmarked</small><strong>{statusCounts.remaining}</strong></div>
      </div>

      <div className="card">
        <div className="section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2>Daily roster</h2>
            <p data-testid="live-counter">
              <strong>{markedCount}</strong> of <strong>{roster.length}</strong> marked
            </p>
          </div>
          <div className="form-actions" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="button-secondary" onClick={() => setAll('PRESENT')}>
              Mark all present
            </button>
            <button type="button" className="button-secondary" onClick={() => setAll('ABSENT')}>
              Mark all absent
            </button>
            <button type="button" className="button-secondary" onClick={() => void copyYesterday()}>
              Copy yesterday
            </button>
            <label className="button-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) importCsv(file)
                }}
              />
            </label>
            <button
              type="button"
              className="button-primary"
              disabled={saving || loading}
              onClick={() => void save()}
            >
              {saving ? 'Saving…' : 'Submit Attendance'}
            </button>
          </div>
        </div>

        {loading ? (
          <BoneScreen name="attendance-mark-roster" loading label="Loading attendance roster"><div className="attendance-roster-skeleton"><span /><span /><span /><span /></div></BoneScreen>
        ) : roster.length === 0 ? (
          <p>No enrolled students found for this filter criteria.</p>
        ) : (
          <div className="table-wrap attendance-roster-wrap">
            <table className="attendance-roster" aria-label="Student Roster">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Class / Section</th>
                  <th>Status</th>
                  <th>Remark</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((student) => {
                  const item = draft[student.studentId] ?? { status: student.status, remark: student.remark }
                  const locked = student.status === 'ON_LEAVE'

                  return (
                    <tr key={student.studentId} data-testid={`roster-row-${student.studentId}`}>
                      <td data-label="Student">
                        <div className="attendance-student-cell">
                          <span className="attendance-student-avatar" aria-hidden="true">
                            {(student.firstName?.[0] ?? student.lastName?.[0] ?? '?').toUpperCase()}
                          </span>
                          <span className="attendance-student-copy">
                            <strong>{student.firstName} {student.lastName}</strong>
                            <small>{student.admissionNumber}</small>
                          </span>
                        </div>
                      </td>
                      <td data-label="Class / Section">
                        {student.className ?? student.classId} / {student.sectionName ?? student.sectionId}
                      </td>
                      <td data-label="Status">
                        <div className="attendance-status-buttons" style={{ display: 'flex', gap: '0.25rem' }}>
                          {QUICK_STATUSES.map((st) => {
                            const isSelected = item.status === st
                            const label = st === 'ON_LEAVE' ? 'On Leave' : st[0] + st.slice(1).toLowerCase()
                            return (
                              <button
                                key={st}
                                type="button"
                                disabled={locked}
                                className={`attendance-status-button status-${st.toLowerCase()} ${isSelected ? 'active' : ''}`}
                                style={{
                                  padding: '0.25rem 0.5rem',
                                  fontWeight: isSelected ? 'bold' : 'normal',
                                  opacity: locked ? 0.6 : 1,
                                }}
                                onClick={() =>
                                  setDraft((current) => ({
                                    ...current,
                                    [student.studentId]: { ...item, status: st },
                                  }))
                                }
                              >
                                {label}
                              </button>
                            )
                          })}
                          {locked && <span className="status-pill" style={{ marginLeft: '0.5rem', color: '#6b7280' }}>🔒 Approved Leave</span>}
                        </div>
                      </td>
                      <td>
                        <input
                          value={item.remark ?? ''}
                          disabled={locked}
                          onChange={(e) =>
                            setDraft((current) => ({
                              ...current,
                              [student.studentId]: { ...item, remark: e.target.value },
                            }))
                          }
                          placeholder={locked ? 'Approved leave' : 'Optional remark'}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button-secondary"
                          style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                          onClick={() => openRemarkModal(student)}
                        >
                          Remark Modal
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {remarkModalStudent && (
        <div
          className="admin-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="remark-modal-title"
        >
          <div className="admin-modal admin-modal--small">
            <div className="admin-modal__header">
              <h2 id="remark-modal-title">
                Student Remark: {remarkModalStudent.firstName} {remarkModalStudent.lastName}
              </h2>
              <button type="button" className="button-secondary" onClick={() => setRemarkModalStudent(null)}>
                ✕
              </button>
            </div>
            <div className="admin-modal__body">
              <p className="admin-modal__description">
                Enter or update remark for {remarkModalStudent.firstName} {remarkModalStudent.lastName} ({remarkModalStudent.admissionNumber}).
              </p>
              <textarea
                aria-label="Student Remark Text"
                value={remarkModalValue}
                onChange={(e) => setRemarkModalValue(e.target.value)}
                disabled={remarkModalStudent.status === 'ON_LEAVE'}
                rows={4}
                style={{ width: '100%', marginTop: '0.5rem', padding: '0.5rem' }}
                placeholder="e.g., Doctor appointment / Arrived late with pass"
              />
            </div>
            <div className="admin-modal__footer">
              <button type="button" className="button-secondary" onClick={() => setRemarkModalStudent(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={remarkModalStudent.status === 'ON_LEAVE'}
                onClick={saveRemarkModal}
              >
                Save Remark
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
