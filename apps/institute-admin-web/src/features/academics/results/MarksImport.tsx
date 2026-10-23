import { Modal } from '../../../components/admin-ui/Modal'
import { useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { Upload, CheckCircle2, ArrowRight } from 'lucide-react'
import { initialMapping, mapImportRows, type CellRow, type Mapping } from './import-mapping'
import { errorMessage, resultsRequest, type ExamDetail, type ImportResult } from './results.api'

export function MarksImport({
  token,
  detail,
  onClose,
  onImported,
}: {
  token: string
  detail: ExamDetail
  onClose: () => void
  onImported: () => void
}) {
  const [paste, setPaste] = useState('')
  const [page, setPage] = useState(0)
  const [column, setColumn] = useState('')
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [headerRow, setHeaderRow] = useState(1)
  const [filename, setFilename] = useState('')
  const [rows, setRows] = useState<CellRow[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [mapping, setMapping] = useState<Mapping | null>(null)
  const [stage, setStage] = useState<'upload' | 'map' | 'review' | 'done'>('upload')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [job, setJob] = useState<ImportResult | null>(null)
  const [replace, setReplace] = useState(false)
  const [validOnly, setValidOnly] = useState(false)
  const [count, setCount] = useState(0)
  const sheets = detail.subjects.filter((s) => s.state === 'DRAFT')
  const components = sheets.flatMap((s) =>
    s.components.map((c) => ({
      ...c,
      label: `${s.name}${s.components.length > 1 ? ` / ${c.name}` : ''}`,
    })),
  )
  const load = (book: XLSX.WorkBook, name: string, start: number) => {
    const matrix = XLSX.utils.sheet_to_json<string[]>(book.Sheets[name], {
      header: 1,
      defval: '',
      raw: false,
      range: start - 1,
    })
    const nextHeaders = (matrix[0] || []).map(String)
    if (
      !nextHeaders.length ||
      nextHeaders.length > 700 ||
      nextHeaders.length * matrix.length > 200000 ||
      nextHeaders.some((h) => !h.trim()) ||
      new Set(nextHeaders).size !== nextHeaders.length
    )
      throw new Error(
        'Use unique, non-empty headers and at most 700 columns / 200,000 cells. Split large worksheets before importing.',
      )
    const data = matrix
      .slice(1)
      .filter((row) => row.some((c) => String(c).trim()))
      .map(
        (row) =>
          Object.fromEntries(nextHeaders.map((h, i) => [h, String(row[i] ?? '')])) as CellRow,
      )
    if (!data.length || data.length > 10000)
      throw new Error('Upload between 1 and 10,000 data rows.')
    setPage(0)
    setHeaders(nextHeaders)
    setRows(data)
    setMapping(initialMapping(nextHeaders, sheets))
    setStage('map')
    setError('')
  }
  const readFile = async (file: File) => {
    setError('')
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error('Choose a file smaller than 10 MB.')
      const book = XLSX.read(await file.arrayBuffer(), { type: 'array', sheetRows: 10002 })
      setWorkbook(book)
      setFilename(file.name)
      setSheetName(book.SheetNames[0])
      load(book, book.SheetNames[0], 1)
    } catch (cause) {
      setError(errorMessage(cause))
    }
  }
  const read = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await readFile(file)
    e.target.value = ''
  }
  const validate = async () => {
    if (!mapping) return
    if (
      !mapping.identifier ||
      (mapping.format === 'long' && !mapping.score) ||
      (mapping.format === 'wide' && !Object.values(mapping.wide).some(Boolean))
    ) {
      setError('Map a student identifier and at least one marks column.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await resultsRequest<ImportResult>(token, `exams/${detail.exam.id}/imports`, {
        key: crypto.randomUUID(),
        filename,
        mapping,
        matchBy: mapping.matchBy,
        replace,
        rows: mapImportRows(rows, mapping, sheets),
      })
      setJob(result)
      setStage('review')
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const commit = async () => {
    if (!job) return
    setBusy(true)
    setError('')
    try {
      const result = await resultsRequest<{ importedCount: number }>(
        token,
        `exams/${detail.exam.id}/imports/${job.id}/commit`,
        { validOnly },
      )
      setCount(result.importedCount)
      setStage('done')
      onImported()
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setBusy(false)
    }
  }
  const select = (field: keyof Mapping, label: string, optional = true) => (
    <label>
      {label}
      <select
        value={String(mapping?.[field] || '')}
        onChange={(e) => setMapping((m) => (m ? { ...m, [field]: e.target.value } : m))}
      >
        <option value="">
          {optional ? 'Not in file / use configured value' : 'Choose a column'}
        </option>
        {headers.map((h) => (
          <option key={h}>{h}</option>
        ))}
      </select>
      {mapping?.[field] && <small>Example: {rows[0]?.[String(mapping[field])] || 'Empty'}</small>}
    </label>
  )
  return (
    <Modal
      open
      title="Import exam marks"
      onClose={() => {
        if (!busy) onClose()
      }}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      size="large"
    >
      <section className="mr-import">
        <ol className="mr-steps">
          {['Upload', 'Map columns', 'Review', 'Import'].map((s, i) => (
            <li
              key={s}
              aria-current={
                ['upload', 'map', 'review', 'done'].indexOf(stage) === i ? 'step' : undefined
              }
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>
        {error && (
          <p className="mr-error" role="alert">
            {error}
          </p>
        )}
        {stage === 'upload' && (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file) void readFile(file)
            }}
          >
            <label className="mr-drop">
              <Upload size={32} />
              <strong>Choose an Excel or CSV file</strong>
              <span>.xlsx, .xls, .csv · up to 10 MB</span>
              <input
                aria-label="Upload marks file"
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={read}
              />
            </label>
            <div className="mr-paste">
              <h3>Or paste from Excel / Google Sheets</h3>
              <label>
                Spreadsheet cells including headers
                <textarea
                  rows={5}
                  value={paste}
                  maxLength={5000000}
                  onChange={(e) => setPaste(e.target.value)}
                  placeholder="Roll number&#9;Student name&#9;English&#10;01&#9;Student name&#9;85"
                />
              </label>
              <button
                className="button-secondary"
                disabled={!paste.trim()}
                onClick={() => {
                  try {
                    const book = XLSX.read(paste, { type: 'string', sheetRows: 10002 })
                    setWorkbook(book)
                    setFilename('Pasted spreadsheet')
                    setSheetName(book.SheetNames[0])
                    load(book, book.SheetNames[0], 1)
                  } catch (e) {
                    setError(errorMessage(e))
                  }
                }}
              >
                Parse & map pasted data
              </button>
            </div>
          </div>
        )}
        {stage === 'map' && mapping && (
          <>
            <div className="mr-fields">
              <label>
                Worksheet
                <select
                  value={sheetName}
                  onChange={(e) => {
                    setSheetName(e.target.value)
                    try {
                      if (workbook) load(workbook, e.target.value, headerRow)
                    } catch (cause) {
                      setError(errorMessage(cause))
                    }
                  }}
                >
                  {workbook?.SheetNames.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label>
                Header row
                <input
                  type="number"
                  min="1"
                  value={headerRow}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    setHeaderRow(n)
                    try {
                      if (workbook && n >= 1) load(workbook, sheetName, n)
                    } catch (cause) {
                      setError(errorMessage(cause))
                    }
                  }}
                />
              </label>
              <label>
                Spreadsheet format
                <select
                  value={mapping.format}
                  onChange={(e) => setMapping({ ...mapping, format: e.target.value })}
                >
                  <option value="long">One subject / one mark per row</option>
                  <option value="wide">Multiple subject columns per student</option>
                </select>
              </label>
              <label>
                Match students by
                <select
                  value={mapping.matchBy}
                  onChange={(e) => setMapping({ ...mapping, matchBy: e.target.value })}
                >
                  <option value="roll">Roll number in this class section</option>
                  <option value="admission">Admission number</option>
                  <option value="name">Exact name (review matches)</option>
                </select>
              </label>
              {select('identifier', 'Student identifier', false)}
              {select('name', 'Student name cross-check')}
              {mapping.format === 'long' ? (
                <>
                  {select('score', 'Obtained marks', false)}
                  {select('subject', 'Subject name')}
                  <label>
                    Subject / component when no subject column
                    <select
                      value={mapping.defaultComponent}
                      disabled={!!mapping.subject}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          defaultComponent: e.target.value,
                        })
                      }
                    >
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} / {c.maximum}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : null}
              {select('status', 'Attendance status')}
              {select('maximum', 'Maximum marks')}
              <label>
                Default maximum (optional)
                <input
                  type="number"
                  min=".01"
                  step=".01"
                  value={mapping.defaultMaximum}
                  disabled={!!mapping.maximum}
                  onChange={(e) => setMapping({ ...mapping, defaultMaximum: e.target.value })}
                  placeholder="Use each exam subject’s maximum"
                />
              </label>
            </div>
            <details>
              <summary>Student profile fields & imported totals (optional)</summary>
              <p className="mr-muted">
                Exam-specific values only; student master records are preserved. Dates use
                YYYY-MM-DD. Imported totals apply only to the explicit imported-total aggregate
                rule.
              </p>
              <div className="mr-fields">
                {Object.entries({
                  fatherName: 'Father / guardian',
                  motherName: 'Mother',
                  dob: 'Date of birth',
                  attendance: 'Attendance text',
                  remarks: 'Report remarks',
                  importedTotal: 'Pre-calculated obtained total',
                }).map(([field, label]) => (
                  <label key={field}>
                    {label}
                    <select
                      value={mapping.profile?.[field] || ''}
                      onChange={(e) =>
                        setMapping({
                          ...mapping,
                          profile: {
                            ...mapping.profile,
                            [field]: e.target.value,
                          },
                        })
                      }
                    >
                      <option value="">Use existing value</option>
                      {headers.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
            <details>
              <summary>Edit staged spreadsheet · {rows.length} rows</summary>
              <p className="mr-muted">
                Correct cells before validation. New rows must match an enrolled student. Adding a
                column here does not create a school subject.
              </p>
              <div className="mr-actions">
                <button
                  className="button-secondary"
                  disabled={rows.length >= 10000}
                  onClick={() => {
                    setRows([...rows, Object.fromEntries(headers.map((h) => [h, '']))])
                    setPage(Math.floor(rows.length / 25))
                  }}
                >
                  Add student row
                </button>
                <input
                  aria-label="New spreadsheet column name"
                  placeholder="New column name"
                  maxLength={120}
                  value={column}
                  onChange={(e) => setColumn(e.target.value)}
                />
                <button
                  className="button-secondary"
                  disabled={
                    !column.trim() || headers.includes(column.trim()) || headers.length >= 100
                  }
                  onClick={() => {
                    const name = column.trim()
                    setHeaders([...headers, name])
                    setRows(rows.map((row) => ({ ...row, [name]: '' })))
                    setColumn('')
                  }}
                >
                  Add column
                </button>
                <button
                  className="button-secondary"
                  onClick={() => setMapping(initialMapping(headers, sheets))}
                >
                  Auto-detect columns
                </button>
              </div>
              <div className="mr-table-scroll">
                <table className="mr-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      {headers.map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                      <th>Remove</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(page * 25, page * 25 + 25).map((row, i) => (
                      <tr key={page * 25 + i}>
                        <th>{page * 25 + i + 1}</th>
                        {headers.map((h) => (
                          <td key={h}>
                            <input
                              aria-label={`Row ${page * 25 + i + 1} ${h}`}
                              value={row[h] ?? ''}
                              maxLength={2000}
                              onChange={(e) =>
                                setRows(
                                  rows.map((v, n) =>
                                    n === page * 25 + i ? { ...v, [h]: e.target.value } : v,
                                  ),
                                )
                              }
                            />
                          </td>
                        ))}
                        <td>
                          <button
                            className="mr-link"
                            onClick={() => {
                              setRows(rows.filter((_, n) => n !== page * 25 + i))
                              setPage(0)
                            }}
                          >
                            Remove staged row
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mr-actions">
                <button
                  className="button-secondary"
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  Previous rows
                </button>
                <span>
                  Page {page + 1} / {Math.max(1, Math.ceil(rows.length / 25))}
                </span>
                <button
                  className="button-secondary"
                  disabled={(page + 1) * 25 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next rows
                </button>
              </div>
            </details>
            {mapping.format === 'wide' && (
              <div className="mr-wide-mapping">
                <h3>Map marks columns to subjects</h3>
                {headers
                  .filter((h) => h !== mapping.identifier && h !== mapping.name)
                  .map((h) => (
                    <label key={h}>
                      {h}
                      <select
                        value={mapping.wide[h] || ''}
                        onChange={(e) =>
                          setMapping({
                            ...mapping,
                            wide: { ...mapping.wide, [h]: e.target.value },
                          })
                        }
                      >
                        <option value="">Ignore column</option>
                        {components.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label} (max {c.maximum})
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
              </div>
            )}
            <p className="mr-muted">
              Blank marks remain missing and are flagged. Use AB for absent, EX for exempt, and NA
              for not applicable. Maximum marks must match the configured exam. Totals are
              calculated using the configured exam rules.
            </p>
            <label className="mr-check">
              <input
                type="checkbox"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              Replace existing draft marks (otherwise skip them)
            </label>
            <div className="mr-actions">
              <span>{rows.length} student rows loaded</span>
              <button className="button-primary" disabled={busy} onClick={validate}>
                {busy ? 'Checking…' : 'Validate & review'}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
        {stage === 'review' && job && (
          <>
            <div className="mr-import-summary">
              <strong>{job.validCount} valid mark values</strong>
              <span>{job.errors.length} errors</span>
            </div>
            {job.errors.length > 0 && (
              <>
                <div className="mr-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Student identifier</th>
                        <th>Issue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.errors.slice(0, 100).map((e, i) => (
                        <tr key={i}>
                          <td>{e.row}</td>
                          <td>{e.identifier}</td>
                          <td>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  className="button-secondary"
                  onClick={() => {
                    const sheet = XLSX.utils.json_to_sheet(job.errors)
                    const book = XLSX.utils.book_new()
                    XLSX.utils.book_append_sheet(book, sheet, 'Import errors')
                    XLSX.writeFile(book, 'marks-import-errors.xlsx')
                  }}
                >
                  Download all errors
                </button>
                <label className="mr-check">
                  <input
                    type="checkbox"
                    checked={validOnly}
                    onChange={(e) => setValidOnly(e.target.checked)}
                  />
                  Import valid rows only; keep the listed errors unresolved
                </label>
              </>
            )}
            <div className="mr-actions">
              <button className="button-secondary" disabled={busy} onClick={() => setStage('map')}>
                Back to mapping
              </button>
              <button
                className="button-primary"
                disabled={busy || !job.validCount || (job.errors.length > 0 && !validOnly)}
                onClick={commit}
              >
                {busy ? 'Importing…' : `Import ${job.validCount} marks`}
              </button>
            </div>
          </>
        )}
        {stage === 'done' && (
          <div className="mr-empty">
            <CheckCircle2 size={40} />
            <h3>{count} marks imported</h3>
            <p>Saved as drafts. Review the results before issuing marksheets.</p>
            <button className="button-primary" onClick={onClose}>
              Return to marks
            </button>
          </div>
        )}
      </section>
    </Modal>
  )
}
