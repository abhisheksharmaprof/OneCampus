import { useEffect, useMemo, useState } from 'react'
import {
  Calendar,
  Clock,
  Printer,
  ChevronLeft,
  ChevronRight,
  Search,
  CheckCircle2,
  FileText,
  Save,
  BookOpen,
} from 'lucide-react'
import QRCode from 'qrcode'
import {
  resultsRequest,
  type Bootstrap,
  type Candidate,
  type ExamDetail,
  type Section,
  type Sheet,
} from './results.api'
import { openPrintWindow } from '../../documents/engine/docRender'
import './hall-ticket.css'

const DEFAULT_INSTRUCTIONS = [
  'Candidates must bring this original Hall Ticket and Institute ID Card to the examination hall.',
  'Candidates should occupy their allocated seats at least 15 minutes prior to the examination start time.',
  'No candidate will be admitted into the examination hall after 30 minutes from the commencement of the exam.',
  'Electronic devices including mobile phones, programmable calculators, smart watches, and notes are strictly barred.',
  'Candidates must not leave the examination hall until the final bell rings and scripts are handed over.',
]

function formatDate(iso?: string) {
  if (!iso) return '—'
  try {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return iso
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

function formatDay(iso?: string) {
  if (!iso) return '—'
  try {
    const [y, m, d] = iso.split('-').map(Number)
    if (!y || !m || !d) return '—'
    const date = new Date(y, m - 1, d)
    return date.toLocaleDateString('en-GB', { weekday: 'long' })
  } catch {
    return '—'
  }
}

function formatTime(start?: string, end?: string) {
  if (!start && !end) return 'Time not set'
  if (start && !end) return start
  return `${start} – ${end}`
}

export function HallTicketManager({
  token,
  section,
  detail,
  bootstrap,
  onReload,
  onError,
}: {
  token: string
  section: Section
  detail: ExamDetail | null
  bootstrap: Bootstrap
  onReload: () => void
  onError: (msg: string) => void
}) {
  const [subTab, setSubTab] = useState<'cards' | 'schedule' | 'instructions'>('cards')
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [qrMap, setQrMap] = useState<Record<string, string>>({})

  const existingSchedule = useMemo(() => {
    return (detail?.exam.rules.schedule || {}) as Record<
      string,
      { examDate?: string; startTime?: string; endTime?: string; session?: string }
    >
  }, [detail?.exam.rules.schedule])

  const [scheduleState, setScheduleState] = useState<
    Record<string, { examDate: string; startTime: string; endTime: string; session: string }>
  >({})

  const [instructions, setInstructions] = useState<string[]>(
    detail?.exam.rules.instructions?.length ? detail.exam.rules.instructions : DEFAULT_INSTRUCTIONS,
  )

  useEffect(() => {
    if (!detail) return
    const initial: Record<
      string,
      { examDate: string; startTime: string; endTime: string; session: string }
    > = {}
    for (const sheet of detail.subjects) {
      const saved = existingSchedule[sheet.subjectId] || {}
      initial[sheet.subjectId] = {
        examDate: saved.examDate || detail.exam.examDate || '',
        startTime: saved.startTime || '09:30',
        endTime: saved.endTime || '12:30',
        session: saved.session || 'Morning',
      }
    }
    setScheduleState(initial)
  }, [detail, existingSchedule])

  const candidates = useMemo(() => detail?.candidates || [], [detail])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (candidates.length > 0) {
      setSelectedIds(new Set(candidates.map((c) => c.id)))
    }
  }, [candidates])

  const filteredCandidates = useMemo(() => {
    if (!query.trim()) return candidates
    const q = query.toLowerCase()
    return candidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.roll.toLowerCase().includes(q) ||
        c.admission.toLowerCase().includes(q),
    )
  }, [candidates, query])

  const currentCandidate = filteredCandidates[currentIndex] || filteredCandidates[0] || null

  // Generate QR codes for tickets
  useEffect(() => {
    if (!detail) return
    let active = true
    const generateQrs = async () => {
      const entries: Record<string, string> = {}
      for (const candidate of candidates) {
        const payload = JSON.stringify({
          inst: bootstrap.branding?.name || 'CampusOne',
          exam: detail.exam.name,
          student: candidate.name,
          roll: candidate.roll,
          adm: candidate.admission,
          year: section.year,
          candidateId: candidate.id,
        })
        try {
          entries[candidate.id] = await QRCode.toDataURL(payload, { width: 90, margin: 1 })
        } catch {
          // ignore qr generation error
        }
      }
      if (active) {
        setQrMap(entries)
      }
    }
    void generateQrs()
    return () => {
      active = false
    }
  }, [candidates, detail, bootstrap.branding, section.year])

  const notify = (msg: string) => {
    setNotice(msg)
    window.setTimeout(() => setNotice(''), 3000)
  }

  const handleScheduleChange = (
    subjectId: string,
    field: 'examDate' | 'startTime' | 'endTime' | 'session',
    val: string,
  ) => {
    setScheduleState((prev) => ({
      ...prev,
      [subjectId]: {
        ...prev[subjectId],
        [field]: val,
      },
    }))
  }

  const saveSchedule = async () => {
    if (!detail) return
    setSaving(true)
    try {
      await resultsRequest(
        token,
        `exams/${detail.exam.id}`,
        {
          rules: {
            ...detail.exam.rules,
            schedule: scheduleState,
          },
        },
        'PATCH',
      )
      notify('Exam timetable schedule saved successfully.')
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Schedule could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const saveInstructions = async () => {
    if (!detail) return
    setSaving(true)
    try {
      await resultsRequest(
        token,
        `exams/${detail.exam.id}`,
        {
          rules: {
            ...detail.exam.rules,
            instructions,
          },
        },
        'PATCH',
      )
      notify('Exam rules and instructions saved successfully.')
      onReload()
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Instructions could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === candidates.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(candidates.map((c) => c.id)))
    }
  }

  const toggleCandidateSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const renderSingleTicketHtml = (c: Candidate, sheets: Sheet[]) => {
    const candidateSubjects = sheets.filter((s) => !c.excludedSubjectIds.includes(s.subjectId))
    const rowsHtml = candidateSubjects
      .map((s) => {
        const sched = scheduleState[s.subjectId] || {}
        return `
          <tr>
            <td>${formatDate(sched.examDate)}</td>
            <td>${formatDay(sched.examDate)}</td>
            <td>${formatTime(sched.startTime, sched.endTime)}</td>
            <td><strong>${(detail?.exam.rules.subjects?.[s.subjectId]?.code || s.subjectId.slice(0, 4)).toUpperCase()}</strong></td>
            <td>${s.name}</td>
            <td style="width: 100px;"></td>
          </tr>
        `
      })
      .join('')

    const instructionsListHtml = instructions
      .map((item) => `<li>${item}</li>`)
      .join('')

    const logoHtml = bootstrap.branding?.logoUrl
      ? `<img src="${bootstrap.branding.logoUrl}" class="ht-school-logo" alt="Logo" />`
      : `<div class="ht-school-logo-placeholder">LOGO</div>`

    const photoHtml = c.photoUrl
      ? `<img src="${c.photoUrl}" class="ht-photo-img" alt="Student Photo" />`
      : `<div class="ht-photo-fallback">Passport Photo</div>`

    const qrDataUrl = qrMap[c.id] || ''
    const qrHtml = qrDataUrl
      ? `<div class="ht-qr-box"><img src="${qrDataUrl}" alt="QR" /><span class="ht-qr-label">Verified</span></div>`
      : ''

    return `
      <article class="ht-ticket">
        <header class="ht-school-header">
          ${logoHtml}
          <div class="ht-school-details">
            <h1 class="ht-school-name">${bootstrap.branding?.name || 'CAMPUSONE ACADEMY'}</h1>
            <p class="ht-school-address">${bootstrap.branding?.address || 'Senior Secondary Academic Campus'}</p>
          </div>
        </header>

        <div class="ht-ticket-banner">EXAMINATION ADMIT CARD / HALL TICKET</div>

        <div class="ht-exam-title-row">
          <span><strong>Examination:</strong> ${detail?.exam.name || 'Annual Examination'}</span>
          <span><strong>Academic Year:</strong> ${section.year}</span>
          <span><strong>Class:</strong> ${section.name}</span>
        </div>

        <div class="ht-student-info-grid">
          <table class="ht-details-table">
            <tbody>
              <tr>
                <td class="ht-details-label">Student Name:</td>
                <td class="ht-details-value">${c.name}</td>
                <td class="ht-details-label">Roll Number:</td>
                <td class="ht-details-value">${c.roll || '—'}</td>
              </tr>
              <tr>
                <td class="ht-details-label">Admission No:</td>
                <td class="ht-details-value">${c.admission || '—'}</td>
                <td class="ht-details-label">Date of Birth:</td>
                <td class="ht-details-value">${formatDate(c.dob)}</td>
              </tr>
              <tr>
                <td class="ht-details-label">Father's Name:</td>
                <td class="ht-details-value">${c.fatherName || c.motherName || '—'}</td>
                <td class="ht-details-label">Gender:</td>
                <td class="ht-details-value">${c.gender || '—'}</td>
              </tr>
            </tbody>
          </table>
          <div class="ht-photo-box">
            ${photoHtml}
          </div>
        </div>

        <div class="ht-timetable-card">
          <h4>Examination Schedule</h4>
          <table class="ht-ticket-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Day</th>
                <th>Time</th>
                <th>Code</th>
                <th>Subject</th>
                <th>Invigilator Initial</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <div class="ht-instructions-box">
          <h5>Important Instructions for Candidate</h5>
          <ol>
            ${instructionsListHtml}
          </ol>
        </div>

        <footer class="ht-signature-grid">
          <div class="ht-sig-block">
            <div class="ht-sig-line">Candidate's Signature</div>
          </div>
          ${qrHtml}
          <div class="ht-sig-block">
            <div class="ht-sig-line">Controller of Exams / Principal</div>
          </div>
        </footer>
      </article>
    `
  }

  const printSelectedTickets = () => {
    if (!detail) return
    const selectedCandidates = candidates.filter((c) => selectedIds.has(c.id))
    if (selectedCandidates.length === 0) {
      notify('Please select at least one candidate to print.')
      return
    }

    const ticketsHtml = selectedCandidates
      .map((c) => renderSingleTicketHtml(c, detail.subjects))
      .join('')

    const fullHtml = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Admit Cards - ${detail.exam.name}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: #0f172a;
    }
    .ht-ticket {
      width: 100%;
      border: 2px solid #0f172a;
      padding: 18mm 16mm;
      margin: 0 0 15mm 0;
      page-break-after: always;
      break-after: page;
    }
    .ht-ticket:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .ht-school-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 2px solid #0f172a;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .ht-school-logo {
      max-height: 60px;
      max-width: 100px;
      object-fit: contain;
    }
    .ht-school-logo-placeholder {
      width: 50px;
      height: 50px;
      border: 1px dashed #64748b;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
    }
    .ht-school-details {
      text-align: center;
      flex: 1;
    }
    .ht-school-name {
      font-size: 18px;
      font-weight: 800;
      text-transform: uppercase;
      margin: 0;
    }
    .ht-school-address {
      font-size: 11px;
      color: #334155;
      margin: 3px 0 0;
    }
    .ht-ticket-banner {
      text-align: center;
      background: #0f172a;
      color: #ffffff;
      padding: 4px;
      font-weight: 700;
      font-size: 13px;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .ht-exam-title-row {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      border-bottom: 1px solid #cbd5e1;
      padding-bottom: 5px;
      margin-bottom: 10px;
    }
    .ht-student-info-grid {
      display: grid;
      grid-template-columns: 1fr 110px;
      gap: 12px;
      margin-bottom: 12px;
    }
    .ht-details-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .ht-details-table td {
      padding: 2px 4px;
      vertical-align: top;
    }
    .ht-details-label {
      font-weight: 600;
      color: #475569;
      width: 25%;
    }
    .ht-details-value {
      font-weight: 700;
    }
    .ht-photo-box {
      width: 105px;
      height: 125px;
      border: 1px solid #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      background: #f8fafc;
      overflow: hidden;
      margin-left: auto;
    }
    .ht-photo-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .ht-photo-fallback {
      font-size: 10px;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }
    .ht-timetable-card h4 {
      margin: 0 0 5px;
      font-size: 12px;
      text-transform: uppercase;
      font-weight: 700;
    }
    .ht-ticket-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-bottom: 10px;
    }
    .ht-ticket-table th,
    .ht-ticket-table td {
      border: 1px solid #0f172a;
      padding: 4px 6px;
      text-align: left;
    }
    .ht-ticket-table th {
      background: #f1f5f9;
      font-weight: 700;
      text-transform: uppercase;
    }
    .ht-instructions-box {
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      padding: 6px 10px;
      margin-bottom: 14px;
      border-radius: 4px;
    }
    .ht-instructions-box h5 {
      margin: 0 0 3px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .ht-instructions-box ol {
      margin: 0;
      padding-left: 16px;
      font-size: 10px;
      line-height: 1.4;
      color: #334155;
    }
    .ht-signature-grid {
      display: grid;
      grid-template-columns: 140px 1fr 150px;
      gap: 15px;
      align-items: end;
      margin-top: 15px;
    }
    .ht-sig-block {
      text-align: center;
    }
    .ht-sig-line {
      border-top: 1px solid #0f172a;
      padding-top: 4px;
      font-size: 10px;
      font-weight: 600;
    }
    .ht-qr-box {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .ht-qr-box img {
      width: 70px;
      height: 70px;
    }
    .ht-qr-label {
      font-size: 9px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  </style>
</head>
<body>
  ${ticketsHtml}
</body>
</html>`

    openPrintWindow(fullHtml)
  }

  if (!detail) {
    return (
      <section className="ht-schedule-card">
        <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
          <BookOpen style={{ margin: '0 auto 1rem', width: 40, height: 40, opacity: 0.5 }} />
          <h3>Select an Exam</h3>
          <p>Please select an exam from the top bar or create one in Setup to configure and issue Hall Tickets.</p>
        </div>
      </section>
    )
  }

  return (
    <div className="ht-manager">
      {notice && (
        <div className="aop-notice" role="status">
          <CheckCircle2 size={18} /> {notice}
        </div>
      )}

      <header className="ht-header">
        <div>
          <h2>Hall Tickets & Admit Cards</h2>
          <p>
            {detail.exam.name} · {section.name} · {candidates.length} candidates · {detail.subjects.length} subjects
          </p>
        </div>
        <div className="ht-header-actions">
          <button
            className="button-primary"
            type="button"
            onClick={printSelectedTickets}
            disabled={selectedIds.size === 0}
          >
            <Printer size={16} /> Print Selected ({selectedIds.size})
          </button>
        </div>
      </header>

      <nav className="ht-tabs" aria-label="Hall ticket views">
        <button
          type="button"
          className={`ht-tab-button ${subTab === 'cards' ? 'is-active' : ''}`}
          onClick={() => setSubTab('cards')}
        >
          Candidate Admit Cards
        </button>
        <button
          type="button"
          className={`ht-tab-button ${subTab === 'schedule' ? 'is-active' : ''}`}
          onClick={() => setSubTab('schedule')}
        >
          Subject Timetable Schedule
        </button>
        <button
          type="button"
          className={`ht-tab-button ${subTab === 'instructions' ? 'is-active' : ''}`}
          onClick={() => setSubTab('instructions')}
        >
          Exam Rules & Guidelines
        </button>
      </nav>

      {subTab === 'schedule' && (
        <section className="ht-schedule-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3>Exam Timetable & Subject Schedule</h3>
              <p style={{ margin: '0.25rem 0', color: '#64748b', fontSize: '0.875rem' }}>
                Set the exam dates, start and end times for each subject. These will be printed on all candidate hall tickets.
              </p>
            </div>
            <button
              className="button-primary"
              type="button"
              onClick={saveSchedule}
              disabled={saving}
            >
              <Save size={16} /> {saving ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>

          <table className="ht-schedule-table">
            <thead>
              <tr>
                <th>Subject Name</th>
                <th>Subject Code</th>
                <th>Exam Date</th>
                <th>Start Time</th>
                <th>End Time</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {detail.subjects.map((sheet) => {
                const item = scheduleState[sheet.subjectId] || {
                  examDate: '',
                  startTime: '09:30',
                  endTime: '12:30',
                  session: 'Morning',
                }
                const code = detail.exam.rules.subjects?.[sheet.subjectId]?.code || sheet.subjectId.slice(0, 4)
                return (
                  <tr key={sheet.id}>
                    <td>
                      <strong>{sheet.name}</strong>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{code.toUpperCase()}</span>
                    </td>
                    <td>
                      <input
                        type="date"
                        className="ht-input-date"
                        value={item.examDate}
                        onChange={(e) => handleScheduleChange(sheet.subjectId, 'examDate', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="ht-input-time"
                        value={item.startTime}
                        onChange={(e) => handleScheduleChange(sheet.subjectId, 'startTime', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="time"
                        className="ht-input-time"
                        value={item.endTime}
                        onChange={(e) => handleScheduleChange(sheet.subjectId, 'endTime', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="ht-input-text"
                        value={item.session}
                        onChange={(e) => handleScheduleChange(sheet.subjectId, 'session', e.target.value)}
                      >
                        <option value="Morning">Morning</option>
                        <option value="Afternoon">Afternoon</option>
                        <option value="Evening">Evening</option>
                      </select>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      )}

      {subTab === 'instructions' && (
        <section className="ht-schedule-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <h3>Exam Instructions & Guidelines</h3>
              <p style={{ margin: '0.25rem 0', color: '#64748b', fontSize: '0.875rem' }}>
                Instructions printed at the bottom of every candidate hall ticket.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setInstructions(DEFAULT_INSTRUCTIONS)}
              >
                Reset to Standard
              </button>
              <button
                className="button-primary"
                type="button"
                onClick={saveInstructions}
                disabled={saving}
              >
                <Save size={16} /> {saving ? 'Saving…' : 'Save Instructions'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {instructions.map((line, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, width: '24px' }}>{idx + 1}.</span>
                <input
                  type="text"
                  className="ht-input-text"
                  style={{ flex: 1 }}
                  value={line}
                  onChange={(e) => {
                    const next = [...instructions]
                    next[idx] = e.target.value
                    setInstructions(next)
                  }}
                />
                <button
                  type="button"
                  className="button-secondary"
                  style={{ padding: '0.4rem 0.6rem' }}
                  onClick={() => setInstructions(instructions.filter((_, i) => i !== idx))}
                  title="Remove instruction"
                >
                  ✕
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button-secondary"
              style={{ alignSelf: 'flex-start', marginTop: '0.5rem' }}
              onClick={() => setInstructions([...instructions, ''])}
            >
              + Add Instruction Line
            </button>
          </div>
        </section>
      )}

      {subTab === 'cards' && (
        <div className="ht-preview-layout">
          {/* Left: Candidate list */}
          <aside className="ht-sidebar">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                Candidates ({selectedIds.size}/{candidates.length})
              </span>
              <button
                className="button-secondary"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                type="button"
                onClick={toggleSelectAll}
              >
                {selectedIds.size === candidates.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div style={{ position: 'relative' }}>
              <Search
                size={14}
                style={{ position: 'absolute', left: 8, top: 10, color: '#94a3b8' }}
              />
              <input
                type="text"
                placeholder="Search candidates…"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setCurrentIndex(0)
                }}
                className="ht-input-text"
                style={{ width: '100%', paddingLeft: '1.75rem', boxSizing: 'border-box' }}
              />
            </div>

            <div className="ht-candidate-list">
              {filteredCandidates.map((c, idx) => {
                const isSelected = selectedIds.has(c.id)
                const isActive = currentCandidate?.id === c.id
                return (
                  <div
                    key={c.id}
                    className={`ht-candidate-row ${isActive ? 'is-active' : ''}`}
                    onClick={() => setCurrentIndex(idx)}
                  >
                    <label
                      style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCandidateSelect(c.id)}
                      />
                      <div className="ht-candidate-info">
                        <span className="ht-candidate-name">{c.name}</span>
                        <span className="ht-candidate-meta">
                          Roll: {c.roll || '—'} · Adm: {c.admission}
                        </span>
                      </div>
                    </label>
                  </div>
                )
              })}
            </div>
          </aside>

          {/* Right: Live Ticket Preview */}
          <main className="ht-preview-pane">
            <nav className="ht-preview-nav">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={currentIndex <= 0}
                  onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
                  title="Previous Student"
                >
                  <ChevronLeft size={16} /> Prev
                </button>
                <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                  Candidate {filteredCandidates.length ? currentIndex + 1 : 0} of {filteredCandidates.length}
                </span>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={currentIndex >= filteredCandidates.length - 1}
                  onClick={() =>
                    setCurrentIndex((prev) => Math.min(filteredCandidates.length - 1, prev + 1))
                  }
                  title="Next Student"
                >
                  Next <ChevronRight size={16} />
                </button>
              </div>

              <div>
                <button
                  className="button-primary"
                  type="button"
                  disabled={!currentCandidate}
                  onClick={() => {
                    if (!currentCandidate) return
                    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Admit Card - ${currentCandidate.name}</title><style>@page{size:A4 portrait;margin:12mm;}*{box-sizing:border-box;}body{margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;}.ht-ticket{width:100%;border:2px solid #0f172a;padding:18mm 16mm;}.ht-school-header{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:10px;}.ht-school-logo{max-height:60px;max-width:100px;object-fit:contain;}.ht-school-details{text-align:center;flex:1;}.ht-school-name{font-size:18px;font-weight:800;text-transform:uppercase;margin:0;}.ht-school-address{font-size:11px;color:#334155;margin:3px 0 0;}.ht-ticket-banner{text-align:center;background:#0f172a;color:#ffffff;padding:4px;font-weight:700;font-size:13px;letter-spacing:1px;margin-bottom:10px;}.ht-exam-title-row{display:flex;justify-content:space-between;font-size:12px;border-bottom:1px solid #cbd5e1;padding-bottom:5px;margin-bottom:10px;}.ht-student-info-grid{display:grid;grid-template-columns:1fr 110px;gap:12px;margin-bottom:12px;}.ht-details-table{width:100%;border-collapse:collapse;font-size:12px;}.ht-details-table td{padding:2px 4px;vertical-align:top;}.ht-details-label{font-weight:600;color:#475569;width:25%;}.ht-details-value{font-weight:700;}.ht-photo-box{width:105px;height:125px;border:1px solid #0f172a;display:flex;align-items:center;justify-content:center;text-align:center;background:#f8fafc;overflow:hidden;margin-left:auto;}.ht-photo-img{width:100%;height:100%;object-fit:cover;}.ht-photo-fallback{font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;}.ht-timetable-card h4{margin:0 0 5px;font-size:12px;text-transform:uppercase;font-weight:700;}.ht-ticket-table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:10px;}.ht-ticket-table th,.ht-ticket-table td{border:1px solid #0f172a;padding:4px 6px;text-align:left;}.ht-ticket-table th{background:#f1f5f9;font-weight:700;text-transform:uppercase;}.ht-instructions-box{border:1px solid #cbd5e1;background:#f8fafc;padding:6px 10px;margin-bottom:14px;border-radius:4px;}.ht-instructions-box h5{margin:0 0 3px;font-size:11px;font-weight:700;text-transform:uppercase;}.ht-instructions-box ol{margin:0;padding-left:16px;font-size:10px;line-height:1.4;color:#334155;}.ht-signature-grid{display:grid;grid-template-columns:140px 1fr 150px;gap:15px;align-items:end;margin-top:15px;}.ht-sig-block{text-align:center;}.ht-sig-line{border-top:1px solid #0f172a;padding-top:4px;font-size:10px;font-weight:600;}.ht-qr-box{display:flex;flex-direction:column;align-items:center;justify-content:center;}.ht-qr-box img{width:70px;height:70px;}.ht-qr-label{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;}</style></head><body>${renderSingleTicketHtml(currentCandidate, detail.subjects)}</body></html>`
                    openPrintWindow(html)
                  }}
                >
                  <Printer size={16} /> Print Current Ticket
                </button>
              </div>
            </nav>

            <div className="ht-ticket-wrapper">
              {currentCandidate ? (
                <div
                  dangerouslySetInnerHTML={{
                    __html: renderSingleTicketHtml(currentCandidate, detail.subjects),
                  }}
                />
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                  No candidate found matching your search.
                </div>
              )}
            </div>
          </main>
        </div>
      )}
    </div>
  )
}

