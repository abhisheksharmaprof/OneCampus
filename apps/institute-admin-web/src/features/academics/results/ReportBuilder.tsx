import { PdfPreview } from './PdfPreview'
import { DocumentVerification } from './DocumentVerification'
import { TemplateAppearance } from './TemplateAppearance'
import { useEffect, useRef, useState } from 'react'
import { Check, FileText, Eye, Download, Printer, ArrowLeft, ArrowRight } from 'lucide-react'
import {
  downloadBatch,
  errorMessage,
  pdfUrl,
  resultsRequest,
  type Batch,
  type Bootstrap,
  type Exam,
  type ExamDetail,
  type ReportConfig,
  type Section,
} from './results.api'

const designs = [
  {
    name: 'Term report',
    title: 'Classic School Report',
    description: 'A familiar school report with subject marks, grades, remarks, and signatures.',
    className: 'classic',
  },
  {
    name: 'Compact result slip',
    title: 'Compact Exam Result',
    description: 'An economical layout for unit tests and shorter assessments.',
    className: 'compact',
  },
  {
    name: 'Detailed with rank',
    title: 'Comprehensive Progress Report',
    description: 'Compare exams side by side and include a consolidated result.',
    className: 'comprehensive',
  },
]
export function ReportBuilder({
  token,
  initialEnrollmentId,
  section,
  exams,
  detail,
  templates,
  onError,
}: {
  token: string
  initialEnrollmentId?: string
  section: Section
  exams: Exam[]
  detail: ExamDetail | null
  templates: Bootstrap['templates']
  onError: (message: string) => void
}) {
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<string[]>(
    initialEnrollmentId ? [initialEnrollmentId] : [],
  )
  const [query, setQuery] = useState('')
  const [config, setConfig] = useState<ReportConfig>({
    sectionId: section.id,
    examIds: detail ? [detail.exam.id] : [],
    enrollmentIds: [],
    templateId: templates.find((t) => t.name === 'Term report')?.id || templates[0]?.id || '',
    title: '',
    mode: 'single',
    weights: {},
    showGrades: true,
    showComponents: false,
    showSignatures: true,
    teacherLabel: 'Class teacher',
    principalLabel: 'Principal',
    footer: '',
  })
  const [busy, setBusy] = useState(false)
  const [batchPreview, setBatchPreview] = useState('')
  const [preview, setPreview] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [index, setIndex] = useState(0)
  const [batches, setBatches] = useState<Batch[]>([])
  const [issue, setIssue] = useState(false)
  const [saved, setSaved] = useState<{ id: string; name: string; config: ReportConfig }[]>([])
  const [reportRoster, setReportRoster] = useState<ExamDetail | null>(detail)
  const generationKey = useRef(crypto.randomUUID())
  const [notice, setNotice] = useState('')
  const hasPending = batches.some((batch) => batch.state === 'QUEUED' || batch.state === 'RUNNING')
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const refresh = () =>
      resultsRequest<Batch[]>(
        token,
        `batches?sectionId=${section.id}`,
        undefined,
        'GET',
        controller.signal,
      )
        .then((b) => {
          if (active) setBatches(b)
        })
        .catch((e) => {
          if (!controller.signal.aborted) onError(errorMessage(e))
        })
    void refresh()
    const id = hasPending ? setInterval(() => void refresh(), 5000) : undefined
    void resultsRequest<typeof saved>(token, 'reports')
      .then((s) => {
        if (active) setSaved(s.filter((x) => x.config.sectionId === section.id))
      })
      .catch((e) => {
        if (active) onError(errorMessage(e))
      })
    return () => {
      active = false
      controller.abort()
      if (id !== undefined) clearInterval(id)
    }
  }, [token, section.id, onError, hasPending])
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview)
    },
    [preview],
  )
  const firstExam = config.examIds[0]
  useEffect(() => {
    const controller = new AbortController()
    if (!firstExam) return
    void resultsRequest<ExamDetail>(
      token,
      `exams/${firstExam}`,
      undefined,
      'GET',
      controller.signal,
    )
      .then((d) => {
        setReportRoster(d)
        setSelected((current) =>
          current.filter((id) => d.candidates.some((c) => c.enrollmentId === id)),
        )
      })
      .catch((e) => {
        if (!controller.signal.aborted) onError(errorMessage(e))
      })
    return () => controller.abort()
  }, [token, firstExam, onError])
  const students = reportRoster && reportRoster.exam.id === firstExam ? reportRoster.candidates : []
  const visible = students.filter((c) =>
    `${c.name} ${c.roll} ${c.admission}`.toLowerCase().includes(query.toLowerCase()),
  )
  const payload = { ...config, enrollmentIds: selected }
  const update = (patch: Partial<ReportConfig>) => {
    setConfig((c) => ({ ...c, ...patch }))
    setPreview('')
    setNotice('')
    generationKey.current = crypto.randomUUID()
  }
  const getPreview = async (i = index) => {
    const nextIndex = Math.min(Math.max(i, 0), Math.max(selected.length - 1, 0))
    setBusy(true)
    onError('')
    try {
      const data = await resultsRequest<{
        pdf: string
        warnings: string[]
        total: number
      }>(token, 'preview', { ...payload, previewIndex: nextIndex })
      setBatchPreview('')
      setPreview(pdfUrl(data.pdf))
      setWarnings(data.warnings)
      setIndex(nextIndex)
      setStep(3)
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const livePayload = JSON.stringify({
    ...config,
    enrollmentIds: selected.slice(0, 1),
  })
  const [liveKey, setLiveKey] = useState('')
  const [livePreview, setLivePreview] = useState('')
  const [liveError, setLiveError] = useState('')
  useEffect(() => {
    if (step !== 2 || !selected.length || !config.examIds.length) return
    const controller = new AbortController()
    const timer = setTimeout(() => {
      void resultsRequest<{ pdf: string }>(
        token,
        'preview',
        JSON.parse(livePayload),
        'POST',
        controller.signal,
      )
        .then((data) => {
          if (!controller.signal.aborted) {
            setLivePreview(pdfUrl(data.pdf))
            setLiveKey(livePayload)
            setLiveError('')
          }
        })
        .catch((e) => {
          if (!controller.signal.aborted) setLiveError(errorMessage(e))
        })
    }, 600)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [step, livePayload, token, selected.length, config.examIds.length])
  useEffect(
    () => () => {
      if (livePreview) URL.revokeObjectURL(livePreview)
    },
    [livePreview],
  )
  const generate = async () => {
    setBusy(true)
    onError('')
    try {
      const batch = await resultsRequest<Batch>(token, 'batches', {
        ...payload,
        issue,
        key: generationKey.current,
      })
      setBatches((b) => [batch, ...b.filter((x) => x.id !== batch.id)])
      setNotice(
        issue
          ? 'Approved marksheets queued for generation.'
          : 'Draft marksheets queued for generation.',
      )
      generationKey.current = crypto.randomUUID()
      setStep(4)
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const download = async (batch: Batch, format: string, documentId?: string) => {
    setBusy(true)
    try {
      await downloadBatch(token, batch.id, format, documentId)
    } catch (cause) {
      onError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const toggleExam = (id: string) => {
    const ids = config.examIds.includes(id)
      ? config.examIds.filter((x) => x !== id)
      : [...config.examIds, id]
    update({
      examIds: ids,
      mode: ids.length > 1 ? (config.mode === 'single' ? 'comparison' : config.mode) : 'single',
    })
  }
  const saveDefinition = async () => {
    setBusy(true)
    try {
      const item = await resultsRequest<{ id: string }>(token, 'reports', payload)
      setSaved((s) => [
        ...s,
        { id: item.id, name: config.title || 'Saved report', config: payload },
      ])
      setNotice('Report configuration saved.')
    } catch (e) {
      onError(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="mr-report">
      <div className="mr-split">
        <div>
          <h2>Build your marksheets</h2>
          <p className="mr-muted">
            Choose students and exams, then see exactly what families will receive.
          </p>
        </div>
        {saved.length > 0 && (
          <label>
            Use saved configuration
            <select
              aria-label="Saved report configuration"
              defaultValue=""
              onChange={(e) => {
                const item = saved.find((s) => s.id === e.target.value)
                if (item) {
                  setConfig(item.config)
                  setSelected(item.config.enrollmentIds)
                  setStep(0)
                  setPreview('')
                }
              }}
            >
              <option value="">Choose a saved report</option>
              {saved.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <nav className="mr-builder-steps" aria-label="Marksheet builder">
        {['Students', 'Exams & calculation', 'Template', 'Preview', 'Generate'].map((name, i) => (
          <button
            key={name}
            type="button"
            aria-current={step === i ? 'step' : undefined}
            onClick={() => setStep(i)}
          >
            <span>{step > i ? <Check size={14} /> : i + 1}</span>
            {name}
          </button>
        ))}
      </nav>
      {notice && (
        <p className="mr-notice" role="status">
          {notice}
        </p>
      )}
      {step === 0 && (
        <>
          <div className="mr-split">
            <h3>
              Select students <small>{selected.length} selected</small>
            </h3>
            <input
              aria-label="Search report students"
              placeholder="Search name, roll, admission…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <p className="mr-muted">
            The first selected exam provides the student roster. Missing students in other exams are
            flagged before issuance.
          </p>
          <label className="mr-check">
            <input
              type="checkbox"
              checked={
                visible.length > 0 && visible.every((c) => selected.includes(c.enrollmentId))
              }
              onChange={(e) => {
                setSelected((s) =>
                  e.target.checked
                    ? [...new Set([...s, ...visible.map((c) => c.enrollmentId)])]
                    : s.filter((id) => !visible.some((c) => c.enrollmentId === id)),
                )
                setPreview('')
              }}
            />
            Select all {visible.length} matching students
          </label>
          <div className="mr-student-list">
            {visible.map((c) => (
              <label className="mr-student-option" key={c.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(c.enrollmentId)}
                  onChange={(e) => {
                    setSelected((s) =>
                      e.target.checked
                        ? [...s, c.enrollmentId]
                        : s.filter((id) => id !== c.enrollmentId),
                    )
                    setPreview('')
                  }}
                />
                <span className="mr-avatar">
                  {c.name
                    .split(' ')
                    .map((s) => s[0])
                    .slice(0, 2)
                    .join('')}
                </span>
                <span>
                  <strong>{c.name}</strong>
                  <small>
                    Roll {c.roll} · {c.admission}
                  </small>
                </span>
              </label>
            ))}
          </div>
          {!students.length && (
            <p className="mr-empty">Choose an exam with a student roster to begin.</p>
          )}
        </>
      )}
      {step === 1 && (
        <>
          <h3>Which results should appear?</h3>
          <div className="mr-exam-picks">
            {exams
              .filter((e) => !e.archived)
              .map((e) => (
                <label className="mr-exam-pick" key={e.id}>
                  <input
                    type="checkbox"
                    checked={config.examIds.includes(e.id)}
                    onChange={() => toggleExam(e.id)}
                  />
                  <strong>{e.name}</strong>
                  <small>
                    {e.examType.replaceAll('_', ' ').toLowerCase()} · {e.candidateCount} students
                  </small>
                </label>
              ))}
          </div>
          <details>
            <summary>Exam and subject display order</summary>
            <p className="mr-muted">
              Exams appear in this order. The last exam supplies the grade boundaries for a
              consolidated result.
            </p>
            {config.examIds.map((id, i) => (
              <div className="mr-split" key={id}>
                <span>
                  {i + 1}. {exams.find((e) => e.id === id)?.name}
                </span>
                <button
                  className="mr-link"
                  disabled={!i}
                  onClick={() => {
                    const ids = [...config.examIds]
                    ;[ids[i - 1], ids[i]] = [ids[i], ids[i - 1]]
                    update({ examIds: ids })
                  }}
                >
                  Move up
                </button>
              </div>
            ))}
            <h3>Subject order</h3>
            {(config.subjectOrder?.length
              ? config.subjectOrder
              : reportRoster?.subjects.map((s) => s.subjectId) || []
            ).map((id, i, ids) => (
              <div className="mr-split" key={id}>
                <span>
                  {i + 1}. {reportRoster?.subjects.find((s) => s.subjectId === id)?.name}
                </span>
                <button
                  className="mr-link"
                  disabled={!i}
                  onClick={() => {
                    const next = [...ids]
                    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
                    update({ subjectOrder: next })
                  }}
                >
                  Move up
                </button>
              </div>
            ))}
          </details>
          <div className="mr-fields">
            <label>
              Report mode
              <select value={config.mode} onChange={(e) => update({ mode: e.target.value })}>
                <option value="single" disabled={config.examIds.length !== 1}>
                  Single exam
                </option>
                <option value="comparison">Compare selected exams</option>
                <option value="sum">Consolidated: sum marks and maxima</option>
                <option value="weighted">Consolidated: weighted percentages</option>
              </select>
            </label>
            <label>
              Report title
              <input
                maxLength={120}
                placeholder="e.g. Annual Progress Report"
                value={config.title}
                onChange={(e) => update({ title: e.target.value })}
              />
            </label>
          </div>
          <p className="mr-muted">
            Comparison keeps results separate. Consolidation requires matching subject sets. Missing
            marks block official issuance. Exempt components are excluded from the denominator;
            absence counts as zero.
          </p>
          {config.mode === 'weighted' && (
            <div className="mr-fields">
              {config.examIds.map((id) => (
                <label key={id}>
                  {exams.find((e) => e.id === id)?.name} weight %
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step=".01"
                    value={config.weights[id] || ''}
                    onChange={(e) =>
                      update({
                        weights: { ...config.weights, [id]: e.target.value },
                      })
                    }
                  />
                </label>
              ))}
              <p>
                Weight total:{' '}
                <strong>
                  {Object.entries(config.weights)
                    .filter(([id]) => config.examIds.includes(id))
                    .reduce((a, [, v]) => a + Number(v || 0), 0)}
                  %
                </strong>{' '}
                / 100%
              </p>
            </div>
          )}
        </>
      )}
      {step === 2 && (
        <>
          <h3>Choose a school-branded design</h3>
          <p className="mr-muted">
            Your institute name, logo, address, and colours are applied automatically. These designs
            use the existing Template Studio presets.
          </p>
          <div className="mr-template-grid">
            {designs.map((design) => {
              const t = templates.find((t) => t.name === design.name)
              return (
                <button
                  key={design.name}
                  disabled={!t}
                  className={`mr-template ${config.templateId === t?.id ? 'selected' : ''}`}
                  onClick={() => update({ templateId: t?.id || '' })}
                >
                  <span className={`mr-paper ${design.className}`} aria-hidden="true">
                    <span className="mr-paper-logo" />
                    <i />
                    <i />
                    <span className="mr-paper-lines">
                      {Array.from({ length: design.className === 'compact' ? 4 : 7 }, (_, i) => (
                        <b key={i} />
                      ))}
                    </span>
                    <em />
                    <em />
                  </span>
                  <strong>{design.title}</strong>
                  <span>{design.description}</span>
                  {config.templateId === t?.id && (
                    <small>
                      <Check size={14} />
                      Selected
                    </small>
                  )}
                </button>
              )
            })}
          </div>
          <div className="mr-fields">
            <label className="mr-check">
              <input
                type="checkbox"
                checked={config.showRank || false}
                onChange={(e) => update({ showRank: e.target.checked })}
              />
              Show class rank using exam ranking rules
            </label>
            <label className="mr-check">
              <input
                type="checkbox"
                checked={config.showGuardian !== false}
                onChange={(e) => update({ showGuardian: e.target.checked })}
              />
              Show guardian name
            </label>
            <label className="mr-check">
              <input
                type="checkbox"
                checked={config.showAttendance || false}
                onChange={(e) => update({ showAttendance: e.target.checked })}
              />
              Include recorded daily attendance
            </label>
            {config.showAttendance && (
              <>
                <label>
                  Attendance from
                  <input
                    type="date"
                    value={config.attendanceStart || ''}
                    onChange={(e) => update({ attendanceStart: e.target.value })}
                  />
                </label>
                <label>
                  Attendance through
                  <input
                    type="date"
                    value={config.attendanceEnd || ''}
                    onChange={(e) => update({ attendanceEnd: e.target.value })}
                  />
                </label>
                <p className="mr-muted">
                  Uses recorded daily attendance only. Missing attendance is explicitly labelled;
                  unrecorded days are not counted.
                </p>
              </>
            )}
            <label className="mr-check">
              <input
                type="checkbox"
                checked={config.showGrades}
                onChange={(e) => update({ showGrades: e.target.checked })}
              />
              Show grades
            </label>
            <label className="mr-check">
              <input
                type="checkbox"
                checked={config.showComponents}
                onChange={(e) => update({ showComponents: e.target.checked })}
              />
              Show subject components
            </label>
            <label className="mr-check">
              <input
                type="checkbox"
                checked={config.showSignatures}
                onChange={(e) => update({ showSignatures: e.target.checked })}
              />
              Show signature lines
            </label>
            <label>
              Teacher signature label
              <input
                maxLength={80}
                value={config.teacherLabel}
                onChange={(e) => update({ teacherLabel: e.target.value })}
              />
            </label>
            <label>
              Principal signature label
              <input
                maxLength={80}
                value={config.principalLabel}
                onChange={(e) => update({ principalLabel: e.target.value })}
              />
            </label>
            <label>
              Footer / school note
              <textarea
                maxLength={500}
                value={config.footer}
                onChange={(e) => update({ footer: e.target.value })}
              />
            </label>
          </div>
          <TemplateAppearance
            value={config.appearance || {}}
            onChange={(appearance) => update({ appearance })}
            detail={reportRoster}
            onError={onError}
          />
          <section className="mr-live-preview">
            <h3>Live marksheet preview</h3>
            <p className="mr-muted">
              First selected student · updates after template changes · same PDF renderer as
              exports.
            </p>
            {liveError && <p className="mr-warning">{liveError}</p>}
            {!selected.length ? (
              <p>Select a student to see a live preview.</p>
            ) : livePreview && liveKey === livePayload ? (
              <PdfPreview key={livePreview} url={livePreview} />
            ) : (
              <p role="status">Preparing preview…</p>
            )}
          </section>
        </>
      )}
      {step === 3 && (
        <>
          <div className="mr-split">
            <div>
              <h3>{batchPreview ? 'Stored batch preview' : 'Preview before generating'}</h3>
              <p className="mr-muted">
                {batchPreview ||
                  `Draft preview · ${selected.length} students · Same PDF renderer as the final export`}
              </p>
            </div>
            <div className="mr-actions">
              {!batchPreview && (
                <>
                  <button
                    className="button-secondary"
                    disabled={busy || !!batchPreview || index === 0}
                    onClick={() => void getPreview(index - 1)}
                    aria-label="Previous student"
                  >
                    <ArrowLeft size={16} />
                  </button>
                  <span>
                    {Math.min(index + 1, selected.length)} / {selected.length}
                  </span>
                  <button
                    className="button-secondary"
                    disabled={busy || !!batchPreview || index >= selected.length - 1}
                    onClick={() => void getPreview(index + 1)}
                    aria-label="Next student"
                  >
                    <ArrowRight size={16} />
                  </button>
                </>
              )}
              <button
                className="button-secondary"
                disabled={!preview}
                onClick={() => {
                  const win = window.open(preview, '_blank')
                  if (!win) onError('Allow popups to open the printable PDF.')
                }}
              >
                <Printer size={16} />
                Open PDF
              </button>
            </div>
          </div>
          {warnings.length > 0 && (
            <details className="mr-warning" open>
              <summary>{warnings.length} checks need attention</summary>
              <ul>
                {warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {preview ? (
            <PdfPreview key={preview} url={preview} />
          ) : (
            <div className="mr-empty">
              <Eye size={32} />
              <p>Generate a preview using the selected students and exams.</p>
              <button
                className="button-primary"
                disabled={busy || !selected.length || !config.examIds.length}
                onClick={() => void getPreview(0)}
              >
                Load preview
              </button>
            </div>
          )}
        </>
      )}
      {step === 4 && (
        <>
          <h3>Generate & download</h3>
          <p>
            {selected.length} students selected. PDFs include the chosen exam results, school
            branding, and template settings.
          </p>
          <label className="mr-check">
            <input type="checkbox" checked={issue} onChange={(e) => setIssue(e.target.checked)} />
            Issue approved marksheets (all selected results must be approved and complete)
          </label>
          <p className="mr-muted">
            Leave unchecked to generate watermarked drafts. Generation creates private files; it
            does not send them to families.
          </p>
          <div className="mr-actions">
            <button
              className="button-secondary"
              disabled={busy || !selected.length}
              onClick={() => void saveDefinition()}
            >
              Save configuration
            </button>
            <button
              className="button-primary"
              disabled={busy || !selected.length || !config.examIds.length}
              onClick={() => void generate()}
            >
              <FileText size={16} />
              {busy ? 'Starting…' : issue ? 'Issue marksheets' : 'Generate draft marksheets'}
            </button>
          </div>
        </>
      )}
      <footer className="mr-builder-footer">
        <span>
          {selected.length} students · {config.examIds.length} exams
        </span>
        <div className="mr-actions">
          <button
            className="button-secondary"
            disabled={busy || step === 0}
            onClick={() => setStep((s) => s - 1)}
          >
            Back
          </button>
          {step < 4 && (
            <button
              className="button-primary"
              disabled={busy || !selected.length || !config.examIds.length}
              onClick={() => (step === 2 ? void getPreview(0) : setStep((s) => s + 1))}
            >
              {busy ? 'Loading…' : 'Continue'}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      </footer>
      <section className="mr-batch-history">
        <h3>Recent generations</h3>
        {!batches.length && (
          <p className="mr-muted">
            Your generated marksheets will appear here. You can leave this page while a batch is
            running.
          </p>
        )}
        {batches.map((batch) => (
          <article key={batch.id}>
            <div className="mr-split">
              <div>
                <strong>{batch.title || 'Marksheets'}</strong>
                <p>
                  {batch.issue ? 'Issued' : 'Draft'} · {batch.completed} / {batch.total} ready ·{' '}
                  <span className={`mr-badge ${batch.state.toLowerCase()}`}>
                    {batch.state.toLowerCase()}
                  </span>
                </p>
              </div>
              <div className="mr-actions">
                {batch.state === 'COMPLETED' ? (
                  <>
                    <button
                      className="button-secondary"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        try {
                          const file = await resultsRequest<{ content: string; mime: string }>(
                            token,
                            `batches/${batch.id}/download?fileType=pdf`,
                          )
                          setBatchPreview(
                            `${batch.issue ? 'Issued' : 'Draft'} batch · ${batch.total} students · ${batch.title || 'Marksheets'} · stored original`,
                          )
                          setPreview(pdfUrl(file.content, file.mime))
                          setWarnings([])
                          setStep(3)
                        } catch (e) {
                          onError(errorMessage(e))
                        } finally {
                          setBusy(false)
                        }
                      }}
                    >
                      Preview batch
                    </button>
                    {['pdf', 'zip', 'csv', 'xlsx'].map((format) => (
                      <button
                        key={format}
                        className="button-secondary"
                        disabled={busy}
                        onClick={() => void download(batch, format)}
                      >
                        <Download size={14} />
                        {format === 'pdf' ? 'Combined PDF' : format.toUpperCase()}
                      </button>
                    ))}
                  </>
                ) : (
                  <button
                    className="button-secondary"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await resultsRequest(token, `batches/${batch.id}`, {})
                        setNotice('Generation queued again.')
                      } catch (e) {
                        onError(errorMessage(e))
                      }
                    }}
                  >
                    Retry generation
                  </button>
                )}
              </div>
            </div>
            {batch.errors.length > 0 && <p className="mr-error">{batch.errors.join(' ')}</p>}
            {batch.state === 'COMPLETED' && (
              <details>
                <summary>Individual student PDFs</summary>
                <div className="mr-student-downloads">
                  {batch.documents.map((d) => (
                    <button
                      key={d.id}
                      className="mr-link"
                      disabled={busy}
                      onClick={() => void download(batch, 'pdf', d.id)}
                    >
                      <Download size={14} />
                      {d.name}
                    </button>
                  ))}
                </div>
              </details>
            )}
          </article>
        ))}
        <DocumentVerification token={token} />
      </section>
    </div>
  )
}
