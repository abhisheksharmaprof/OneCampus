import { Modal } from '../../../components/admin-ui/Modal'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  Download,
  FileText,
  Plus,
  Save,
  Search,
  Upload,
  Users,
  X,
  History,
  RefreshCw,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { StudioV5 } from './StudioV5'
import { LegacyMigration } from './LegacyMigration'
import { ExamSetup } from './ExamSetup'
import { MarksImport } from './MarksImport'
import { ResultAnalytics as MeritAnalytics } from './ResultAnalytics'
import { ReportBuilder } from './ReportBuilder'
import { HallTicketManager } from './HallTicketManager'
import {
  errorMessage,
  resultsRequest,
  type Bootstrap,
  type Exam,
  type ExamDetail,
  type Mark,
} from './results.api'
import './results.css'

type Tab =
  | 'Overview'
  | 'Enter Marks'
  | 'Review Results'
  | 'Hall Tickets'
  | 'Marksheets'
  | 'Analytics'
  | 'Studio v5'
  | 'Setup'
const tabs: Tab[] = [
  'Overview',
  'Enter Marks',
  'Review Results',
  'Hall Tickets',
  'Marksheets',
  'Analytics',
  'Studio v5',
  'Setup',
]
const statusLabel = (s: string) => s.toLowerCase().replaceAll('_', ' ')
export function MarksGradesPage({
  accessToken: token,
  selectedBranch,
  examTools,
}: {
  accessToken: string
  selectedBranch: string
  examTools?: ReactNode
}) {
  const [bootstrapRevision, setBootstrapRevision] = useState(0)
  const [bootstrap, setBootstrap] = useState<Bootstrap | null>(null)
  const [sectionId, setSectionId] = useState('')
  const [yearId, setYearId] = useState('')
  const [gradeId, setGradeId] = useState('')
  const [exams, setExams] = useState<Exam[]>([])
  const [examId, setExamId] = useState('')
  const [detail, setDetail] = useState<ExamDetail | null>(null)
  const [reportStudent, setReportStudent] = useState('')
  const [tab, setTab] = useState<Tab>('Overview')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [setup, setSetup] = useState(false)
  const [editingExam, setEditingExam] = useState<Exam | undefined>()
  const [importOpen, setImportOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const [sheetId, setSheetId] = useState('')
  const [query, setQuery] = useState('')
  const [drafts, setDrafts] = useState<Record<string, Mark>>({})
  const [entryView, setEntryView] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(max-width: 700px)').matches
      ? 'student'
      : 'subject',
  )
  const [studentId, setStudentId] = useState('')
  const [candidateEditor, setCandidateEditor] = useState('')
  const [history, setHistory] = useState<
    { action: string; actor: string; date: string; detail: unknown }[] | null
  >(null)
  const [compare, setCompare] = useState<ExamDetail | null>(null)
  const [legacyRecord, setLegacyRecord] = useState<{
    id: string
    kind: string
    title: string
    payload: Record<string, unknown>
  } | null>(null)
  const [legacy, setLegacy] = useState<
    | {
        id: string
        kind: string
        title: string
        status: string
        payload: Record<string, unknown>
      }[]
    | null
  >(null)
  const [studioDirty, setStudioDirty] = useState(false)
  const dirty = Object.keys(drafts).length > 0
  const onError = useCallback((message: string) => setError(message), [])
  const reload = () => setRevision((r) => r + 1)
  const guard = () => {
    if (!dirty && !studioDirty) return true
    const confirmed = window.confirm(
      studioDirty
        ? 'You have unsaved studio edits. Discard them and continue?'
        : 'You have unsaved marks. Discard them and continue?',
    )
    if (confirmed) setStudioDirty(false)
    return confirmed
  }
  useEffect(() => {
    const listener = (e: BeforeUnloadEvent) => {
      if (dirty || studioDirty) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [dirty, studioDirty])
  useEffect(() => {
    const c = new AbortController()
    void resultsRequest<Bootstrap>(
      token,
      `bootstrap?branchId=${selectedBranch}`,
      undefined,
      'GET',
      c.signal,
    )
      .then((data) => {
        setBootstrap(data)
        setSetup(false)
        setEditingExam(undefined)
        setSectionId('')
        setYearId('')
        setGradeId('')
        setExams([])
        setExamId('')
        setDetail(null)
        setDrafts({})
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e))
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [token, selectedBranch, bootstrapRevision])
  const sections = bootstrap?.sections || []
  const years = Array.from(
    new Map(
      sections.map((s) => [s.yearId, { id: s.yearId, name: s.year, current: s.current }]),
    ).values(),
  )
  const activeYear = yearId || years.find((y) => y.current)?.id || years[0]?.id || ''
  const yearSections = sections.filter((s) => s.yearId === activeYear)
  const grades = Array.from(
    new Map(yearSections.map((s) => [s.gradeId, { id: s.gradeId, name: s.grade }])).values(),
  )
  const activeGrade = gradeId || grades[0]?.id || ''
  const classSections = yearSections.filter((s) => s.gradeId === activeGrade)
  const activeSectionId =
    sectionId && classSections.some((s) => s.id === sectionId)
      ? sectionId
      : classSections[0]?.id || ''
  const section = sections.find((s) => s.id === activeSectionId)
  useEffect(() => {
    if (!activeSectionId) return
    const c = new AbortController()
    void resultsRequest<Exam[]>(
      token,
      `exams?sectionId=${activeSectionId}`,
      undefined,
      'GET',
      c.signal,
    )
      .then((data) => {
        setExams(data)
        setExamId((id) =>
          data.some((e) => e.id === id)
            ? id
            : data.find((e) => !e.archived)?.id || data[0]?.id || '',
        )
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e))
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [token, activeSectionId, revision])
  useEffect(() => {
    if (!examId) return
    const c = new AbortController()
    void resultsRequest<ExamDetail>(token, `exams/${examId}`, undefined, 'GET', c.signal)
      .then((data) => {
        setDetail(data)
        setSheetId((id) =>
          data.subjects.some((s) => s.id === id) ? id : data.subjects[0]?.id || '',
        )
        setStudentId((id) =>
          data.candidates.some((c) => c.id === id) ? id : data.candidates[0]?.id || '',
        )
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e))
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false)
      })
    return () => c.abort()
  }, [token, examId, revision])
  const act = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      setNotice(message)
      reload()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    if (!detail) return
    await act(async () => {
      await resultsRequest(token, `exams/${examId}/marks`, {
        entries: Object.values(drafts),
        revisions: Object.fromEntries(detail.subjects.map((s) => [s.id, s.revision])),
      })
      setDrafts({})
    }, 'Marks saved as drafts.')
  }
  const markIndex = useMemo(
    () =>
      new Map(
        (detail?.marks || []).map((mark) => [`${mark.candidateId}:${mark.componentId}`, mark]),
      ),
    [detail],
  )
  const candidateIndex = useMemo(
    () => new Map((detail?.candidates || []).map((candidate) => [candidate.id, candidate])),
    [detail],
  )
  const getMark = (candidateId: string, componentId: string): Mark =>
    drafts[`${candidateId}:${componentId}`] ||
    markIndex.get(`${candidateId}:${componentId}`) || {
      candidateId,
      componentId,
      score: null,
      status: 'PRESENT',
      note: '',
    }
  const editMark = (candidateId: string, componentId: string, patch: Partial<Mark>) => {
    const mark = getMark(candidateId, componentId)
    setDrafts((d) => ({
      ...d,
      [`${candidateId}:${componentId}`]: { ...mark, ...patch },
    }))
  }
  const sheet = detail?.subjects.find((s) => s.id === sheetId)
  const candidates = (detail?.candidates || []).filter((c) =>
    `${c.name} ${c.roll} ${c.admission}`.toLowerCase().includes(query.toLowerCase()),
  )
  const review = async (sheetId: string, action: string, revision: number) => {
    let reason = ''
    if (action === 'return' || action === 'reopen') {
      reason = window.prompt('Reason for returning / reopening results') || ''
      if (!reason.trim()) return
    }
    await act(
      () =>
        resultsRequest(token, `exams/${examId}/sheets/${sheetId}/review`, {
          action,
          revision,
          reason,
        }),
      'Result review updated.',
    )
  }
  const templateDownload = () => {
    if (!detail) return
    const data = detail.candidates.map((c) =>
      Object.fromEntries([
        ['Roll number', c.roll],
        ['Student name', c.name],
        ['Admission number', c.admission],
        ...detail.subjects.flatMap((s) =>
          s.components.map((c) => [`${s.name}${s.components.length > 1 ? ` ${c.name}` : ''}`, '']),
        ),
      ]),
    )
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(data), 'Marks')
    XLSX.writeFile(book, `${detail.exam.name}-marks-template.xlsx`)
  }
  const renderInputs = (candidateId: string, s: NonNullable<typeof sheet>) =>
    s.components.map((component) => {
      const mark = getMark(candidateId, component.id)
      const excluded = detail?.candidates
        .find((c) => c.id === candidateId)
        ?.excludedSubjectIds.includes(s.subjectId)
      const disabled = s.state !== 'DRAFT' || detail?.exam.archived || busy || excluded
      const invalid =
        mark.score !== null &&
        mark.score !== '' &&
        (Number(mark.score) < 0 || Number(mark.score) > Number(component.maximum))
      return (
        <td key={component.id}>
          <div className="mr-score-input">
            <input
              aria-label={`Marks for ${candidateIndex.get(candidateId)?.name}, ${s.name}, ${component.name}`}
              type="number"
              min="0"
              max={component.maximum}
              step=".01"
              value={mark.score ?? ''}
              placeholder={excluded ? 'N/A' : '—'}
              disabled={disabled || mark.status !== 'PRESENT'}
              aria-invalid={invalid || undefined}
              onChange={(e) =>
                editMark(candidateId, component.id, {
                  score: e.target.value || null,
                })
              }
              onPaste={(e) => {
                const lines = e.clipboardData.getData('text').trim().split(/\r?\n/)
                if (lines.length > 1 && entryView === 'subject') {
                  e.preventDefault()
                  const start = candidates.findIndex((c) => c.id === candidateId)
                  for (const [i, line] of lines.entries()) {
                    const c = candidates[start + i]
                    if (c && !c.excludedSubjectIds.includes(s.subjectId))
                      editMark(c.id, component.id, {
                        score: line.trim(),
                        status: 'PRESENT',
                      })
                  }
                }
              }}
            />
            <span>/ {component.maximum}</span>
          </div>
          <select
            aria-label={`Status for ${candidateIndex.get(candidateId)?.name}, ${s.name}, ${component.name}`}
            disabled={disabled}
            value={mark.status}
            onChange={(e) =>
              editMark(candidateId, component.id, {
                status: e.target.value,
                score: e.target.value === 'PRESENT' ? mark.score : null,
              })
            }
          >
            <option value="PRESENT">Present</option>
            <option value="ABSENT">Absent</option>
            <option value="EXEMPT">Exempt</option>
            <option value="NOT_APPLICABLE">Not applicable</option>
          </select>
          {invalid && (
            <small role="alert" className="mr-field-error">
              Enter 0–{component.maximum}
            </small>
          )}
        </td>
      )
    })
  const complete = detail?.results.filter((r) => !r.missing).length || 0
  const approved = detail?.subjects.filter((s) => s.state === 'APPROVED').length || 0
  const missing = detail?.results.reduce((a, r) => a + r.missing, 0) || 0
  return (
    <section className="mr-page" aria-label="Marks and grades">
      <header className="mr-page-header">
        <div className="mr-title-icon">
          <ClipboardList size={27} />
        </div>
        <div>
          <h1>Marks & Grades</h1>
          <p>From the first mark to a report you’re ready to share.</p>
        </div>
        {bootstrap?.canManage && (
          <button
            className="button-primary"
            disabled={!section || busy}
            onClick={() => {
              if (guard()) setSetup(true)
            }}
          >
            <Plus size={17} />
            Set up exam
          </button>
        )}
      </header>
      {error && (
        <div role="alert" className="mr-error mr-split">
          <span>{error}</span>
          <button className="mr-icon" aria-label="Dismiss error" onClick={() => setError('')}>
            <X size={16} />
          </button>
        </div>
      )}
      {notice && (
        <div role="status" className="mr-notice mr-split">
          <span>
            <CheckCircle2 size={16} />
            {notice}
          </span>
          <button
            className="mr-icon"
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className="mr-context" aria-label="Result context">
        <label>
          Academic year
          <select
            value={activeYear}
            onChange={(e) => {
              if (guard()) {
                setLoading(true)
                setExams([])
                setExamId('')
                setDetail(null)
                setYearId(e.target.value)
                setGradeId('')
                setSectionId('')
                setDrafts({})
              }
            }}
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Class
          <select
            value={activeGrade}
            onChange={(e) => {
              if (guard()) {
                setLoading(true)
                setExams([])
                setExamId('')
                setDetail(null)
                setGradeId(e.target.value)
                setSectionId('')
                setDrafts({})
              }
            }}
          >
            {grades.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Section
          <select
            value={activeSectionId}
            onChange={(e) => {
              if (guard()) {
                setLoading(true)
                setExams([])
                setExamId('')
                setDetail(null)
                setSectionId(e.target.value)
                setDrafts({})
              }
            }}
          >
            {classSections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.section} · {s.branch}
              </option>
            ))}
          </select>
        </label>
        <label>
          Exam
          <select
            value={examId}
            onChange={(e) => {
              if (guard()) {
                setLoading(true)
                setDetail(null)
                setCompare(null)
                setHistory(null)
                setExamId(e.target.value)
                setDrafts({})
              }
            }}
          >
            <option value="">Choose an exam</option>
            {exams.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
                {e.archived ? ' (archived)' : ''}
              </option>
            ))}
          </select>
        </label>
        <button
          className="mr-icon"
          aria-label="Refresh results"
          disabled={loading || dirty}
          onClick={() => (bootstrap ? reload() : setBootstrapRevision((r) => r + 1))}
        >
          <RefreshCw size={18} />
        </button>
      </section>
      <nav className="mr-tabs" aria-label="Marks and grades workspace">
        {tabs
          .filter(
            (t) =>
              bootstrap?.canManage ||
              !['Marksheets', 'Review Results', 'Analytics', 'Studio v5', 'Setup'].includes(t),
          )
          .map((t) => (
            <button
              key={t}
              aria-current={tab === t ? 'page' : undefined}
              onClick={() => {
                if (tab !== 'Studio v5' || t === 'Studio v5' || guard()) setTab(t)
              }}
            >
              {t}
            </button>
          ))}
      </nav>
      {loading && (
        <p role="status" className="mr-loading">
          Loading academic results…
        </p>
      )}
      {!loading && !sections.length && !error && (
        <div className="mr-panel mr-empty">
          <BookOpen size={38} />
          <h2>Set up your academic structure first</h2>
          <p>Add an academic year, class section, subjects, and student enrollments to begin.</p>
          <a className="button-primary" href="/institute/academic-structure">
            Open academic structure
          </a>
        </div>
      )}
      {!loading && section && !exams.length && tab !== 'Setup' && tab !== 'Studio v5' && (
        <div className="mr-panel mr-start">
          <div>
            <span className="mr-start-icon">
              <ClipboardList size={38} />
            </span>
            <h2>Your next exam starts here</h2>
            <p>
              Set up marks for {section.name}, enter them manually or import a spreadsheet, then
              generate branded reports for the whole class.
            </p>
            <div className="mr-actions">
              {bootstrap?.canManage && (
                <button className="button-primary" onClick={() => setSetup(true)}>
                  <Plus size={16} />
                  Set up your first exam
                </button>
              )}
              <button className="button-secondary" onClick={() => setTab('Setup')}>
                See how it works
              </button>
            </div>
          </div>
          <ol>
            <li>
              <strong>Set up</strong>
              <span>Choose subjects, maximum marks, and grades.</span>
            </li>
            <li>
              <strong>Enter & review</strong>
              <span>Use the class grid or map an Excel file.</span>
            </li>
            <li>
              <strong>Preview & generate</strong>
              <span>Choose exams and a school-branded template.</span>
            </li>
          </ol>
        </div>
      )}
      {tab === 'Overview' && detail && (
        <>
          <div className="mr-overview-strip">
            <div>
              <Users size={20} />
              <strong>{detail.candidates.length}</strong>
              <span>Students on roster</span>
            </div>
            <div>
              <CheckCircle2 size={20} />
              <strong>{complete}</strong>
              <span>Complete results</span>
            </div>
            <div>
              <ClipboardList size={20} />
              <strong>
                {approved} / {detail.subjects.length}
              </strong>
              <span>Subjects approved</span>
            </div>
            <div>
              <FileText size={20} />
              <strong>{missing}</strong>
              <span>Missing marks</span>
            </div>
          </div>
          <section className="mr-panel">
            <div className="mr-split">
              <div>
                <h2>{detail.exam.name}</h2>
                <p className="mr-muted">Follow each subject from draft to approval.</p>
              </div>
              <button className="button-secondary" onClick={() => setTab('Enter Marks')}>
                Continue marks entry
                <ArrowRight size={16} />
              </button>
            </div>
            <div className="mr-subject-progress">
              {detail.subjects.map((s) => {
                const cells = detail.marks.filter((m) =>
                  s.components.some((c) => c.id === m.componentId),
                ).length
                const expected =
                  detail.candidates.filter((c) => !c.excludedSubjectIds.includes(s.subjectId))
                    .length * s.components.length
                return (
                  <button
                    key={s.id}
                    onClick={() => {
                      setSheetId(s.id)
                      setTab('Enter Marks')
                    }}
                  >
                    <div>
                      <strong>{s.name}</strong>
                      <span className={`mr-badge ${s.state.toLowerCase()}`}>
                        {statusLabel(s.state)}
                      </span>
                    </div>
                    <progress max={expected || 1} value={cells} />
                    <small>
                      {cells} of {expected} marks entered
                    </small>
                  </button>
                )
              })}
            </div>
          </section>
          <section className="mr-panel mr-split">
            <div>
              <h2>Ready to turn results into reports?</h2>
              <p className="mr-muted">
                Pick one exam or combine unit tests, half-yearly, and annual results.
              </p>
            </div>
            <button
              className="button-primary"
              disabled={!bootstrap?.canManage}
              onClick={() => setTab('Marksheets')}
            >
              Build marksheets
              <ArrowRight size={16} />
            </button>
          </section>
        </>
      )}
      {tab === 'Enter Marks' && detail && (
        <section className="mr-panel mr-entry">
          <div className="mr-split">
            <div>
              <h2>Enter marks</h2>
              <p className="mr-muted">
                Save a draft anytime. Submit each completed subject for review.
              </p>
            </div>
            <div className="mr-actions">
              <button className="button-secondary" disabled={busy} onClick={templateDownload}>
                <Download size={15} />
                Excel template
              </button>
              <button
                className="button-secondary"
                disabled={
                  busy ||
                  dirty ||
                  detail.exam.archived ||
                  !detail.subjects.some((s) => s.state === 'DRAFT')
                }
                onClick={() => setImportOpen(true)}
              >
                <Upload size={15} />
                Import marks
              </button>
            </div>
          </div>
          <div className="mr-entry-toolbar">
            <label>
              Entry view
              <select value={entryView} onChange={(e) => setEntryView(e.target.value)}>
                <option value="subject">Subject sheet</option>
                <option value="student">One student</option>
              </select>
            </label>
            {entryView === 'subject' ? (
              <label>
                Subject
                <select value={sheetId} onChange={(e) => setSheetId(e.target.value)}>
                  {detail.subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · {statusLabel(s.state)}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                Student
                <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                  {detail.candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.roll} · {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="mr-search">
              <Search size={16} />
              <input
                aria-label="Search marks students"
                placeholder="Find a student…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="mr-table-wrap">
            <table className="mr-marks-table">
              <thead>
                {entryView === 'subject' ? (
                  <tr>
                    <th>Roll</th>
                    <th>Student</th>
                    {sheet?.components.map((c) => (
                      <th key={c.id}>
                        {c.name}
                        <small>
                          Pass {c.passMarks} / {c.maximum}
                        </small>
                      </th>
                    ))}
                    <th>Note</th>
                  </tr>
                ) : (
                  <tr>
                    <th>Subject</th>
                    <th>Component / marks / status</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {entryView === 'subject' && sheet
                  ? candidates.map((c) => (
                      <tr key={c.id}>
                        <td>{c.roll}</td>
                        <th scope="row">
                          <strong>{c.name}</strong>
                          <small>{c.admission}</small>
                        </th>
                        {renderInputs(c.id, sheet)}
                        <td>
                          <input
                            aria-label={`Note for ${c.name}`}
                            maxLength={500}
                            disabled={busy || sheet.state !== 'DRAFT' || detail.exam.archived}
                            value={getMark(c.id, sheet.components[0]?.id).note}
                            placeholder="Optional note"
                            onChange={(e) =>
                              editMark(c.id, sheet.components[0].id, {
                                note: e.target.value,
                              })
                            }
                          />
                        </td>
                      </tr>
                    ))
                  : detail.subjects.flatMap((s) =>
                      s.components.map((component) => (
                        <tr key={component.id}>
                          <th scope="row">
                            {s.name}
                            <small>{component.name}</small>
                          </th>
                          {renderInputs(studentId, {
                            ...s,
                            components: [component],
                          })}
                        </tr>
                      )),
                    )}
              </tbody>
            </table>
          </div>
          {!detail.candidates.length && (
            <div className="mr-empty">
              No enrolled students in this exam. Add enrollments, then sync the roster in Setup.
            </div>
          )}
          <div className="mr-entry-footer">
            <span role="status">
              {dirty
                ? `${Object.keys(drafts).length} unsaved mark values`
                : 'All loaded marks are saved'}
              <small>Blank ≠ zero. Paste a vertical column to fill consecutive students.</small>
            </span>
            <div className="mr-actions">
              <button
                className="button-secondary"
                disabled={busy || !dirty}
                onClick={() => {
                  if (guard()) setDrafts({})
                }}
              >
                Discard changes
              </button>
              <button
                className="button-primary"
                disabled={busy || !dirty}
                onClick={() => void save()}
              >
                <Save size={16} />
                {busy ? 'Saving…' : 'Save draft'}
              </button>
              {sheet?.state === 'DRAFT' && (
                <button
                  className="button-secondary"
                  disabled={busy || dirty}
                  onClick={() => void review(sheet.id, 'submit', sheet.revision)}
                >
                  Submit subject
                </button>
              )}
            </div>
          </div>
        </section>
      )}
      {tab === 'Analytics' && detail && (
        <MeritAnalytics
          detail={detail}
          onReport={(id) => {
            setReportStudent(id)
            setTab('Marksheets')
          }}
        />
      )}
      {tab === 'Review Results' && detail && (
        <section className="mr-panel">
          <div className="mr-split">
            <div>
              <h2>Review class results</h2>
              <p className="mr-muted">
                Missing marks block submission. Approved sheets are locked until reopened with a
                reason.
              </p>
            </div>
            <button
              className="button-secondary"
              onClick={async () => {
                try {
                  setHistory(await resultsRequest(token, `exams/${examId}/history`))
                } catch (e) {
                  setError(errorMessage(e))
                }
              }}
            >
              <History size={15} />
              Change history
            </button>
          </div>
          <div className="mr-review-sheets">
            {detail.subjects.map((s) => (
              <div key={s.id}>
                <strong>{s.name}</strong>
                <span className={`mr-badge ${s.state.toLowerCase()}`}>{statusLabel(s.state)}</span>
                <div className="mr-actions">
                  {s.state === 'DRAFT' ? (
                    <button
                      className="button-secondary"
                      disabled={busy || dirty}
                      onClick={() => void review(s.id, 'submit', s.revision)}
                    >
                      Submit
                    </button>
                  ) : s.state === 'SUBMITTED' ? (
                    <>
                      <button
                        className="button-primary"
                        disabled={busy}
                        onClick={() => void review(s.id, 'approve', s.revision)}
                      >
                        Approve
                      </button>
                      <button
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => void review(s.id, 'return', s.revision)}
                      >
                        Return
                      </button>
                    </>
                  ) : (
                    <button
                      className="button-secondary"
                      disabled={busy}
                      onClick={() => void review(s.id, 'reopen', s.revision)}
                    >
                      Reopen
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mr-split">
            <label>
              Compare with another exam
              <select
                aria-label="Compare exam"
                defaultValue=""
                onChange={async (e) => {
                  if (!e.target.value) {
                    setCompare(null)
                    return
                  }
                  try {
                    setCompare(await resultsRequest(token, `exams/${e.target.value}`))
                  } catch (err) {
                    setError(errorMessage(err))
                  }
                }}
              >
                <option value="">No comparison</option>
                {exams
                  .filter((e) => e.id !== examId)
                  .map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className="mr-search">
              <Search size={15} />
              <input
                aria-label="Search review students"
                placeholder="Find a student…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="mr-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Student</th>
                  {detail.subjects.map((s) => (
                    <th key={s.id}>{s.name}</th>
                  ))}
                  <th>Total / %</th>
                  <th>Result</th>
                  {compare && <th>{compare.exam.name}</th>}
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((c) => {
                  const r = detail.results.find((r) => r.candidateId === c.id)
                  const other = compare?.results.find(
                    (r) =>
                      compare.candidates.find((c) => c.id === r.candidateId)?.enrollmentId ===
                      c.enrollmentId,
                  )
                  return (
                    <tr key={c.id}>
                      <th scope="row">
                        {c.name}
                        <small>Roll {c.roll}</small>
                      </th>
                      {detail.subjects.map((s) => {
                        const row = r?.rows.find((row) => row.subjectId === s.subjectId)
                        return (
                          <td key={s.id}>
                            {row ? `${row.score ?? 'Missing'} / ${row.maximum}` : 'Not applicable'}
                            <small>{row?.grade}</small>
                          </td>
                        )
                      })}
                      <td>
                        {r?.total} / {r?.maximum}
                        <small>{r?.percentage ?? '—'}%</small>
                      </td>
                      <td>{r?.result}</td>
                      {compare && (
                        <td>
                          {other?.percentage ?? '—'}%
                          <small>{other?.result || 'Not in roster'}</small>
                        </td>
                      )}
                      <td>
                        <button className="mr-link" onClick={() => setCandidateEditor(c.id)}>
                          View / remarks
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <ResultAnalytics detail={detail} />
        </section>
      )}
      {tab === 'Hall Tickets' && section && bootstrap && (
        <section className="mr-panel">
          <HallTicketManager
            token={token}
            section={section}
            detail={detail}
            bootstrap={bootstrap}
            onReload={reload}
            onError={onError}
          />
        </section>
      )}
      {tab === 'Marksheets' && section && bootstrap?.canManage && (
        <section className="mr-panel">
          <ReportBuilder
            initialEnrollmentId={reportStudent}
            key={section.id}
            token={token}
            section={section}
            exams={exams}
            detail={detail}
            templates={bootstrap.templates}
            onError={onError}
          />
        </section>
      )}
      {tab === 'Studio v5' && section && bootstrap?.canManage && (
        <StudioV5
          key={section.id}
          token={token}
          section={section}
          examId={examId}
          onDirty={setStudioDirty}
        />
      )}
      {tab === 'Setup' && section && (
        <section className="mr-panel">
          <div className="mr-split">
            <div>
              <h2>Exams & result settings</h2>
              <p className="mr-muted">
                One marking scheme per exam and class section. Existing subjects and enrollments are
                reused.
              </p>
            </div>
            <button className="button-primary" onClick={() => setSetup(true)}>
              <Plus size={16} />
              New exam
            </button>
          </div>
          {exams.length > 0 ? (
            <div className="mr-exam-settings">
              {exams.map((e) => (
                <article key={e.id}>
                  <div>
                    <strong>{e.name}</strong>
                    <p>
                      {statusLabel(e.examType)} · {e.candidateCount} students · {e.subjects.length}{' '}
                      subjects
                      {e.archived ? ' · Archived' : ''}
                    </p>
                  </div>
                  <div className="mr-actions">
                    <button
                      className="button-secondary"
                      disabled={busy || dirty || e.archived}
                      onClick={() => {
                        setEditingExam(e)
                        setSetup(true)
                      }}
                    >
                      Edit marking scheme
                    </button>
                    <button
                      className="button-secondary"
                      disabled={busy || dirty}
                      onClick={() => {
                        setExamId(e.id)
                        setTab('Enter Marks')
                      }}
                    >
                      Open marks
                    </button>
                    <button
                      className="button-secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            resultsRequest(token, `exams/${e.id}`, { syncRoster: true }, 'PATCH'),
                          'New enrollments added to the exam roster.',
                        )
                      }
                    >
                      Sync roster
                    </button>
                    <button
                      className="button-secondary"
                      disabled={busy}
                      onClick={() =>
                        void act(
                          () =>
                            resultsRequest(
                              token,
                              `exams/${e.id}`,
                              { archived: !e.archived },
                              'PATCH',
                            ),
                          'Exam settings saved.',
                        )
                      }
                    >
                      {e.archived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mr-empty">
              <BookOpen />
              <p>Create your first exam using the subjects configured for {section.name}.</p>
            </div>
          )}
          <h3>Result policy</h3>
          <ul className="mr-policy">
            <li>Missing marks remain incomplete. Zero is a recorded score.</li>
            <li>
              Absent marks count as zero and do not pass. Exempt and not-applicable components are
              excluded from totals.
            </li>
            <li>Every configured component must meet its passing mark.</li>
            <li>Grading and decimal precision are configured when creating an exam.</li>
            <li>
              Approved results require a reason to reopen. Issued PDFs retain their original data
              and branding.
            </li>
          </ul>
          <button
            className="button-secondary"
            onClick={async () => {
              try {
                setLegacy(await resultsRequest(token, 'legacy'))
              } catch (e) {
                setError(errorMessage(e))
              }
            }}
          >
            Review previous academic records
          </button>
          {legacy && (
            <div className="mr-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Previous record</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th>Stored details</th>
                    <th>Reconcile</th>
                  </tr>
                </thead>
                <tbody>
                  {legacy.map((r) => (
                    <tr key={r.id}>
                      <td>{r.title}</td>
                      <td>{r.kind}</td>
                      <td>{r.status}</td>
                      <td>{JSON.stringify(r.payload)}</td>
                      <td>
                        <button
                          className="mr-link"
                          disabled={!detail}
                          onClick={() => setLegacyRecord(r)}
                        >
                          Map to selected exam
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!legacy.length && <p>No previous exam or mark records.</p>}
            </div>
          )}
          {examTools && (
            <details className="mr-legacy-tools">
              <summary>Existing exam schedules, question bank & hall tickets</summary>
              {examTools}
            </details>
          )}
        </section>
      )}
      {setup && section && (
        <ExamSetup
          key={`${section.id}:${editingExam?.id || 'new'}`}
          token={token}
          section={section}
          initialExam={editingExam}
          onClose={() => {
            setSetup(false)
            setEditingExam(undefined)
          }}
          onCreated={(id) => {
            setSetup(false)
            setEditingExam(undefined)
            setExamId(id)
            setTab('Enter Marks')
            setDrafts({})
            reload()
          }}
        />
      )}
      {importOpen && detail && (
        <MarksImport
          token={token}
          detail={detail}
          onClose={() => {
            setImportOpen(false)
            reload()
          }}
          onImported={() =>
            setNotice('Marks imported successfully. Review the results before issuance.')
          }
        />
      )}
      {candidateEditor && detail && (
        <CandidateDialog
          token={token}
          detail={detail}
          candidateId={candidateEditor}
          onClose={() => setCandidateEditor('')}
          onSaved={() => {
            setCandidateEditor('')
            reload()
          }}
        />
      )}
      {legacyRecord && detail && (
        <LegacyMigration
          token={token}
          record={legacyRecord}
          detail={detail}
          onClose={() => setLegacyRecord(null)}
          onSaved={() => {
            setLegacyRecord(null)
            setNotice('Previous record reconciled; original retained.')
            reload()
          }}
        />
      )}
      {history && (
        <Modal open title="Result change history" onClose={() => setHistory(null)} size="large">
          <section className="mr-history">
            {history.map((h, i) => (
              <article key={i}>
                <strong>
                  {h.action} · {h.actor}
                </strong>
                <p>{new Date(h.date).toLocaleString()}</p>
                <details>
                  <summary>Changed values</summary>
                  <pre>{JSON.stringify(h.detail, null, 2)}</pre>
                </details>
              </article>
            ))}
            {!history.length && <p>No changes recorded.</p>}
          </section>
        </Modal>
      )}
    </section>
  )
}
function ResultAnalytics({ detail }: { detail: ExamDetail }) {
  const complete = detail.results.filter((r) => r.percentage !== null)
  const average = complete.length
    ? complete.reduce((sum, r) => sum + Number(r.percentage), 0) / complete.length
    : null
  const grades = complete.reduce<Record<string, number>>(
    (a, r) => ({ ...a, [r.grade]: (a[r.grade] || 0) + 1 }),
    {},
  )
  return (
    <div className="mr-analytics">
      <h3>Class performance</h3>
      <p>
        {complete.length} complete results · Average{' '}
        {average === null ? '—' : `${average.toFixed(2)}%`} · Pass rate{' '}
        {complete.length
          ? `${Math.round((complete.filter((r) => r.result === 'Pass').length / complete.length) * 100)}%`
          : '—'}
      </p>
      <div>
        {Object.entries(grades).map(([g, n]) => (
          <span key={g}>
            Grade {g}
            <strong>{n}</strong>
          </span>
        ))}
      </div>
      <p className="mr-muted">
        Incomplete and exempt results are excluded from averages and pass rates.
      </p>
    </div>
  )
}
function CandidateDialog({
  token,
  detail,
  candidateId,
  onClose,
  onSaved,
}: {
  token: string
  detail: ExamDetail
  candidateId: string
  onClose: () => void
  onSaved: () => void
}) {
  const candidate = detail.candidates.find((c) => c.id === candidateId)!
  const result = detail.results.find((r) => r.candidateId === candidateId)
  const [remark, setRemark] = useState(candidate.remark)
  const [excluded, setExcluded] = useState(candidate.excludedSubjectIds)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const locked = detail.subjects.some((s) => s.state !== 'DRAFT')
  return (
    <Modal
      open
      title={candidate.name}
      onClose={() => {
        if (!busy) onClose()
      }}
      closeOnEscape={!busy}
      closeOnBackdrop={!busy}
      size="large"
    >
      <section className="mr-history">
        {result?.rows.map((r) => (
          <article key={r.subjectId}>
            <strong>
              {r.subject} · {r.score ?? 'Missing'} / {r.maximum} · {r.grade}
            </strong>
            {r.components.map((c, i) => (
              <p key={i}>
                {c.name}: {c.score ?? statusLabel(c.status)} / {c.maximum}
              </p>
            ))}
          </article>
        ))}
        <label>
          Report remarks
          <textarea
            maxLength={2000}
            disabled={locked}
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
          />
        </label>
        <h3>Subjects not taken by this student</h3>
        <p className="mr-muted">
          Use for elective subjects only. Excluded subjects do not contribute to the result.
        </p>
        {detail.subjects.map((s) => (
          <label key={s.id} className="mr-check">
            <input
              type="checkbox"
              disabled={locked}
              checked={excluded.includes(s.subjectId)}
              onChange={(e) =>
                setExcluded((ids) =>
                  e.target.checked ? [...ids, s.subjectId] : ids.filter((id) => id !== s.subjectId),
                )
              }
            />
            {s.name}
          </label>
        ))}
        {locked && (
          <p className="mr-warning">
            Reopen all subject sheets to edit remarks or subject eligibility.
          </p>
        )}
        {error && (
          <p className="mr-error" role="alert">
            {error}
          </p>
        )}
        <footer className="mr-actions">
          <button
            className="button-primary"
            disabled={busy || locked}
            onClick={async () => {
              setBusy(true)
              try {
                await resultsRequest(
                  token,
                  `exams/${detail.exam.id}/candidates/${candidateId}`,
                  { remark, excludedSubjectIds: excluded },
                  'PATCH',
                )
                onSaved()
              } catch (e) {
                setError(errorMessage(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Save remarks & eligibility
          </button>
        </footer>
      </section>
    </Modal>
  )
}
