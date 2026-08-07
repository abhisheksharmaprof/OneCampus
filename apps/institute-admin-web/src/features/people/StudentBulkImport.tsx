import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { CheckCircle2, FileSpreadsheet, Upload, XCircle } from 'lucide-react'
import { Modal } from '../../components/admin-ui'
import { AdminApiError, adminRequest } from '../admin/admin.api'

type Branch = { id: string; name: string; isHeadOffice?: boolean }
type Grade = { id: string; name: string }
type Section = { id: string; gradeId: string; branchId: string; sectionName: string }
type Row = Record<string, unknown>
type Field = { key: string; label: string; required?: boolean }
type Failure = { row: number; name: string; reason: string; studentCreated?: boolean }

// Keep a small, fixed number of requests in flight so large files finish quickly
// without overwhelming the API or the browser connection pool.
const IMPORT_CONCURRENCY = 6

const fields: Field[] = [
  { key: 'fullName', label: 'Student name', required: true }, { key: 'admissionNumber', label: 'Admission number' },
  { key: 'dateOfBirth', label: 'Date of birth (YYYY-MM-DD)', required: true }, { key: 'gender', label: 'Gender', required: true },
  { key: 'fatherName', label: 'Father name' }, { key: 'motherName', label: 'Mother name' },
  { key: 'aadharNumber', label: 'Aadhar number' }, { key: 'socialCategory', label: 'Social category' }, { key: 'religion', label: 'Religion' },
  { key: 'dateOfAdmission', label: 'Admission date (YYYY-MM-DD)', required: true }, { key: 'mobileNumber', label: 'Parent mobile number' }, { key: 'emailAddress', label: 'Parent email ID' },
]

const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const HEADER_ALIASES: Record<string, string[]> = {
  fullName: ['fullname', 'studentname', 'name'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate'],
  dateOfAdmission: ['dateofadmission', 'admissiondate', 'joiningdate'],
  admissionNumber: ['admissionnumber', 'admissionno', 'admissionid'],
  fatherName: ['fathername', 'fathersname'],
  motherName: ['mothername', 'mothersname'],
  mobileNumber: ['mobilenumber', 'mobile', 'phone', 'parentmobile', 'parentphone'],
  emailAddress: ['emailaddress', 'email', 'emailid', 'parentemail'],
}
const initialMapping = (headers: string[]) => Object.fromEntries(fields.map((field) => {
  const aliases = HEADER_ALIASES[field.key] ?? [normalise(field.key)]
  const match = headers.find((header) => aliases.includes(normalise(header)))
  return [field.key, match ?? '']
})) as Record<string, string>
const text = (value: unknown) => value === null || value === undefined ? '' : String(value).trim()
const isoDate = (value: unknown) => {
  const checked = (year: string | number, month: string | number, day: string | number) => {
    const y = Number(year); const m = Number(month); const d = Number(day)
    const candidate = new Date(Date.UTC(y, m - 1, d))
    return candidate.getUTCFullYear() === y && candidate.getUTCMonth() === m - 1 && candidate.getUTCDate() === d
      ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : ''
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  if (typeof value === 'number' && value > 0) {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return checked(parsed.y, parsed.m, parsed.d)
  }
  const source = text(value)
  if (!source) return ''
  const iso = source.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) return checked(iso[1], iso[2], iso[3])
  const indian = source.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (indian) return checked(indian[3], indian[2], indian[1])
  const parsed = new Date(source)
  return Number.isNaN(parsed.getTime()) ? '' : checked(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
}

export function StudentBulkImport({ open, onClose, accessToken, branches, selectedBranch, classes, sections, onComplete }: {
  open: boolean; onClose: () => void; accessToken: string; branches: Branch[]; selectedBranch: string; classes: Grade[]; sections: Section[]; onComplete: () => void
}) {
  const [stage, setStage] = useState<'upload' | 'map' | 'progress' | 'results'>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<Row[]>([])
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [branchId, setBranchId] = useState(selectedBranch === 'all' ? (branches.find((branch) => branch.isHeadOffice)?.id ?? branches[0]?.id ?? '') : selectedBranch)
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [done, setDone] = useState(0)
  const [failures, setFailures] = useState<Failure[]>([])
  const [error, setError] = useState('')

  const availableSections = useMemo(() => sections.filter((section) => String(section.gradeId) === String(classId) && String(section.branchId) === String(branchId)), [sections, classId, branchId])
  useEffect(() => {
    if (branchId || !branches.length) return
    setBranchId(selectedBranch === 'all' ? (branches.find((branch) => branch.isHeadOffice)?.id ?? branches[0].id) : selectedBranch)
  }, [branchId, branches, selectedBranch])
  useEffect(() => {
    // A class with exactly one section can be placed without another click.
    // Multiple sections still require an explicit user choice.
    if (availableSections.length === 1 && sectionId !== availableSections[0].id) setSectionId(availableSections[0].id)
    if (availableSections.length !== 1 && sectionId && !availableSections.some((section) => section.id === sectionId)) setSectionId('')
  }, [availableSections, sectionId])
  const reset = () => { setStage('upload'); setHeaders([]); setRows([]); setMapping({}); setClassId(''); setSectionId(''); setDone(0); setFailures([]); setError('') }
  const close = () => { reset(); onClose() }

  const readFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setError('')
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const imported = XLSX.utils.sheet_to_json<Row>(sheet, { defval: '', raw: false })
      const nextHeaders = imported.length ? Object.keys(imported[0]) : []
      if (!nextHeaders.length) throw new Error('The file does not contain a header row or student data.')
      setHeaders(nextHeaders); setRows(imported); setMapping(initialMapping(nextHeaders)); setStage('map')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The file could not be read.') }
  }

  const startImport = async () => {
    const missing = fields.filter((field) => field.required && !mapping[field.key]).map((field) => field.label)
    const placementError = !classId
      ? 'Choose a class from the institute database before importing.'
      : !sectionId
        ? availableSections.length ? 'Choose a section before importing.' : 'No section is configured for the selected class and branch. Configure a section before importing.'
        : ''
    const scopeError = !branchId ? 'Choose a branch before importing.' : ''
    if (missing.length || placementError || scopeError) {
      setError([
        missing.length ? `Map: ${missing.join(', ')} (or map Full name).` : '',
        placementError,
        scopeError,
      ].filter(Boolean).join(' '))
      return
    }
    setError(''); setStage('progress'); setDone(0)
    const nextFailures: Failure[] = []
    const parentLocks = new Map<string, Promise<void>>()
    let nextIndex = 0
    const linkParent = async (studentId: string, parentName: string, parentPhone: string, parentEmail: string, relationshipValue: string, isPrimaryContact: boolean) => {
      const phoneKey = parentPhone.replace(/\D/g, '')
      if (!phoneKey) return
      const previous = parentLocks.get(phoneKey) ?? Promise.resolve()
      const operation = previous.catch(() => undefined).then(async () => {
        if (!parentName) throw new Error('Parent name is required when a parent phone is provided.')
        const relationship = ['FATHER', 'MOTHER', 'GUARDIAN'].includes(relationshipValue.toUpperCase()) ? relationshipValue.toUpperCase() : 'GUARDIAN'
        const parentSearch = await adminRequest<{ items: Array<{ id: string }> }>(accessToken, `parents?search=${encodeURIComponent(parentPhone || parentEmail)}&page=1&pageSize=20`)
        const parentPayload = { studentId, relationship, isPrimaryContact }
        if (parentSearch.items[0]) {
          await adminRequest(accessToken, `parents/${parentSearch.items[0].id}/students`, { method: 'POST', body: JSON.stringify(parentPayload) })
        } else {
          await adminRequest(accessToken, 'parents', { method: 'POST', body: JSON.stringify({ fullName: parentName, email: parentEmail || undefined, phone: parentPhone, ...parentPayload }) })
        }
      })
      parentLocks.set(phoneKey, operation)
      try { await operation } finally { if (parentLocks.get(phoneKey) === operation) parentLocks.delete(phoneKey) }
    }
    const processRow = async (index: number, row: Row) => {
      const value = (key: string) => text(row[mapping[key]])
      const fullName = value('fullName')
      const nameParts = fullName.split(/\s+/).filter(Boolean)
      // Full name is authoritative. Never allow an unrelated mapped column
      // (for example "Last examination passed" = "Yes") to become a surname.
      const usingFullName = Boolean(mapping.fullName)
      const firstName = usingFullName ? (nameParts.shift() || '') : (value('firstName') || '')
      const lastName = usingFullName ? nameParts.join(' ') : (value('lastName') || '')
      const missingRow = fields.filter((field) => field.required && (field.key === 'firstName' ? !firstName : !value(field.key))).map((field) => field.label)
      const parentName = value('fatherName') || value('motherName')
      const parentCandidates = parentName && value('mobileNumber')
        ? [{ name: parentName, phone: value('mobileNumber'), email: value('emailAddress'), relationship: value('fatherName') ? 'FATHER' : 'MOTHER' }]
        : []
      const hasCompleteParent = parentCandidates.some((parent) => parent.name && parent.phone)
      const hasPartialParent = Boolean(value('fatherName') || value('motherName') || value('mobileNumber') || value('emailAddress')) && !hasCompleteParent
      const birthDate = isoDate(row[mapping.dateOfBirth])
      const admissionDate = isoDate(row[mapping.dateOfAdmission])
      const name = [firstName, lastName].filter(Boolean).join(' ') || `Row ${index + 2}`
      if (missingRow.length || !birthDate || !admissionDate || !hasCompleteParent || hasPartialParent) {
        const reason = missingRow.length ? `Missing required values: ${missingRow.join(', ')}` : !birthDate ? 'Date of birth has an unsupported format.' : !admissionDate ? 'Admission date has an unsupported format.' : hasPartialParent ? 'Enter a father or mother name together with the mobile number.' : 'At least one father or mother name and mobile number is required.'
        nextFailures.push({ row: index + 2, name, reason })
      } else {
        try {
          const created = await adminRequest<{ id: string }>(accessToken, 'students', { method: 'POST', body: JSON.stringify({ branchId, admissionNumber: value('admissionNumber') || undefined, ...(sectionId ? { classSectionId: sectionId } : {}), firstName, lastName, fatherName: value('fatherName') || undefined, motherName: value('motherName') || undefined, dateOfBirth: birthDate, gender: value('gender'), aadharNumber: value('aadharNumber') || undefined, socialCategory: value('socialCategory') || undefined, religion: value('religion') || undefined, dateOfAdmission: admissionDate, mobileNumber: value('mobileNumber') || undefined, emailAddress: value('emailAddress') || undefined }) })
          for (const [parentIndex, parent] of parentCandidates.entries()) {
            try {
              await linkParent(created.id, parent.name, parent.phone, parent.email, parent.relationship, parentIndex === 0)
            } catch (cause) {
              const reason = cause instanceof AdminApiError ? Object.values(cause.fieldErrors).flat().join(', ') || cause.message : cause instanceof Error ? cause.message : 'The parent could not be linked.'
              nextFailures.push({ row: index + 2, name, reason: `Student added, but parent linking failed: ${reason}`, studentCreated: true })
            }
          }
        } catch (cause) {
          const reason = cause instanceof AdminApiError ? Object.values(cause.fieldErrors).flat().join(', ') || cause.message : 'The student could not be added.'
          nextFailures.push({ row: index + 2, name, reason })
        }
      }
      setDone((current) => current + 1)
    }

    // A worker pool gives predictable back-pressure and allows each row to
    // finish independently, so one bad record never stops the import.
    const workerCount = Math.min(IMPORT_CONCURRENCY, rows.length)
    await Promise.all(Array.from({ length: workerCount }, async () => {
      while (nextIndex < rows.length) {
        const index = nextIndex
        nextIndex += 1
        await processRow(index, rows[index])
      }
    }))
    nextFailures.sort((left, right) => left.row - right.row)
    setFailures(nextFailures); setStage('results'); onComplete()
  }

  return <Modal open={open} title="Bulk add students" description="Upload a CSV or Excel file, map its columns, then import students and their parents into one class section." onClose={() => stage === 'progress' ? undefined : close()} size="large">
    <div className="student-import">
      <div className="student-import__steps"><span className={stage === 'upload' ? 'is-active' : ''}>1. Upload</span><span className={stage === 'map' ? 'is-active' : ''}>2. Map columns</span><span className={stage === 'progress' ? 'is-active' : ''}>3. Import</span><span className={stage === 'results' ? 'is-active' : ''}>4. Results</span></div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {stage === 'upload' && <label className="student-import__dropzone"><FileSpreadsheet size={32} /><strong>Choose a CSV or Excel file</strong><span>Use the first worksheet; the first row must contain column names.</span><input type="file" accept=".csv,.xlsx,.xls" onChange={readFile} /><span className="button-primary"><Upload size={16} /> Select file</span></label>}
      {stage === 'map' && <><p className="section-caption">{rows.length} rows found. Map the required columns, then choose the branch, class, and section where these students will be enrolled. Father and mother details are automatically created as parent/guardian records and linked to the student; map each parent’s name, mobile number, and email address. Select either <strong>Full name</strong> or the separate first/last name columns. A section is required so class and session details appear in the directory.</p><div className="student-import__placement"><label>Branch<select value={branchId} onChange={(event) => { setBranchId(event.target.value); setSectionId('') }}>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><label>Class<select value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId('') }}><option value="">Select class</option>{classes.map((grade) => <option key={grade.id} value={grade.id}>{grade.name}</option>)}</select></label>{availableSections.length > 0 && <label>Section<select value={sectionId} onChange={(event) => setSectionId(event.target.value)}><option value="">{availableSections.length === 1 ? 'Auto-selected section' : 'Select section'}</option>{availableSections.map((section) => <option key={section.id} value={section.id}>{section.sectionName}</option>)}</select></label>}</div>{classId && availableSections.length === 0 && <p className="section-caption">No section is configured for this class and branch. Add a section before importing students.</p>}{mapping.fullName && <div className="student-import__name-note"><strong>Full name selected</strong><span>First name and last name are derived from this column. Separate name mappings are ignored.</span></div>}<div className="student-import__map">{fields.filter((field) => !mapping.fullName || !['firstName', 'lastName'].includes(field.key)).map((field) => <label key={field.key}><span>{field.label}{field.required && <em className="req">*</em>}</span><select value={mapping[field.key] ?? ''} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value }))}><option value="">Do not import</option>{headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div><div className="student-import__actions"><button className="button-secondary" type="button" onClick={reset}>Choose another file</button><button className="button-primary" type="button" onClick={() => void startImport()}>Start import</button></div></>}
      {stage === 'progress' && <div className="student-import__progress"><strong>Adding students…</strong><span>{done} of {rows.length} processed</span><small>Processing up to {Math.min(IMPORT_CONCURRENCY, rows.length)} students in parallel. Each row is tracked independently.</small><progress value={done} max={rows.length} /></div>}
      {stage === 'results' && <><div className="student-import__result"><CheckCircle2 /><strong>{rows.length - failures.filter((failure) => !failure.studentCreated).length} students added</strong><span>{failures.length} rows need attention</span></div>{failures.length > 0 && <div className="student-import__failures"><h3><XCircle size={17} /> Rows needing attention</h3>{failures.map((failure) => <div key={`${failure.row}-${failure.name}`}><b>Row {failure.row} · {failure.name}</b><span>{failure.reason}</span></div>)}</div>}<div className="student-import__actions"><button className="button-primary" type="button" onClick={close}>Done</button></div></>}
    </div>
  </Modal>
}
