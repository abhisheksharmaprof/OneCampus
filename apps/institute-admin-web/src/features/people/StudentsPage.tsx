import { type ReactNode, FormEvent, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertCircle, ChevronLeft, ChevronRight, Eye, Plus, Search, Trash2 } from 'lucide-react'
import { DataTable, Modal, type DataTableColumn, type TableSort } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, AdminApiError, type PageData } from '../admin/admin.api'
import { StudentBulkImport } from './StudentBulkImport'

/* ─────────────────────────── types ─────────────────────────── */
type Branch = { id: string; name: string; isHeadOffice?: boolean }
type Student = {
  id: string
  admissionNumber: string
  firstName: string
  lastName: string
  fatherName?: string
  motherName?: string
  studentNicId?: string
  srNumber?: string
  aadharNumber?: string
  dateOfBirth?: string | null
  gender?: string
  socialCategory?: string
  religion?: string
  motherTongue?: string
  ruralUrban?: string
  habitationLocality?: string
  dateOfAdmission?: string | null
  belongsToBpl?: boolean | null
  belongsToDisadvantagedGroup?: boolean | null
  gettingFreeEducation?: boolean | null
  previousClass?: string
  previousYearStatus?: string
  previousYearAttendanceDays?: number | null
  mediumOfInstruction?: string
  disabilityType?: string
  cwsnFacilities?: string
  uniformSets?: number | null
  freeTextBooks?: boolean | null
  freeTransport?: boolean | null
  freeEscort?: boolean | null
  mdmBeneficiary?: boolean | null
  freeHostelFacility?: boolean | null
  attendedSpecialTraining?: boolean | null
  lastExaminationAppeared?: boolean | null
  lastExaminationPassed?: boolean | null
  lastExaminationPercentage?: string | null
  stream?: string
  tradeSector?: string
  ironFolicAcidTablets?: boolean | null
  dewormingTablets?: boolean | null
  vitaminASupplement?: boolean | null
  mobileNumber?: string
  emailAddress?: string
  studyingInClass?: string
  classSectionName?: string
  session?: string
  isActive: boolean
  branch: { id: string; name: string; code: string }
}

/* ─── form data shape — every field lives here ─── */
type FormData = {
  // Step 0 – Identity
  firstName: string; lastName: string; fatherName: string; motherName: string
  dateOfBirth: string; gender: string; studentNicId: string; aadharNumber: string
  mobileNumber: string; emailAddress: string; socialCategory: string; religion: string
  motherTongue: string
  // Step 1 – Academic & Location
  branchId: string; admissionDate: string; srNumber: string
  ruralUrban: string; habitationLocality: string
  mediumOfInstruction: string; previousClass: string; previousYearStatus: string
  previousYearAttendanceDays: string; lastExaminationAppeared: string
  lastExaminationPassed: string; lastExaminationPercentage: string; stream: string; tradeSector: string
  // Step 2 – Welfare
  belongsToBpl: string; belongsToDisadvantagedGroup: string; gettingFreeEducation: string
  disabilityType: string; cwsnFacilities: string; attendedSpecialTraining: string
  uniformSets: string; freeTextBooks: string; freeTransport: string; freeEscort: string
  mdmBeneficiary: string; freeHostelFacility: string
  ironFolicAcidTablets: string; dewormingTablets: string; vitaminASupplement: string
  // Step 3 – Class Placement
  academicYearId: string; classId: string; sectionId: string
  // Step 4 – Parent
  parentName: string; relationship: string; parentPhone: string; parentEmail: string
  primaryContact: string; consent: boolean
}

const EMPTY_FORM: FormData = {
  firstName: '', lastName: '', fatherName: '', motherName: '',
  dateOfBirth: '', gender: '', studentNicId: '', aadharNumber: '',
  mobileNumber: '', emailAddress: '', socialCategory: '', religion: '', motherTongue: '',
  branchId: '', admissionDate: '', srNumber: '',
  ruralUrban: '', habitationLocality: '',
  mediumOfInstruction: 'English', previousClass: '', previousYearStatus: '',
  previousYearAttendanceDays: '', lastExaminationAppeared: '', lastExaminationPassed: '',
  lastExaminationPercentage: '', stream: '', tradeSector: '',
  belongsToBpl: '', belongsToDisadvantagedGroup: '', gettingFreeEducation: '',
  disabilityType: '', cwsnFacilities: '', attendedSpecialTraining: '',
  uniformSets: '', freeTextBooks: '', freeTransport: '', freeEscort: '',
  mdmBeneficiary: '', freeHostelFacility: '',
  ironFolicAcidTablets: '', dewormingTablets: '', vitaminASupplement: '',
  academicYearId: '', classId: '', sectionId: '',
  parentName: '', relationship: '', parentPhone: '', parentEmail: '',
  primaryContact: 'true', consent: false,
}

/* ── per-step required fields and their labels ── */
const STEP_REQUIRED: Array<Array<{ key: keyof FormData; label: string }>> = [
  [ // Step 0
    { key: 'firstName',   label: 'First Name' },
    { key: 'dateOfBirth', label: 'Date of Birth' },
    { key: 'gender',      label: 'Gender' },
  ],
  [ // Step 1
    { key: 'admissionDate', label: 'Date of Admission' },
  ],
  [ // Step 2
    { key: 'classId', label: 'Class / Grade' },
    { key: 'sectionId', label: 'Section' },
  ],
  [ // Step 3
    { key: 'consent', label: 'Consent confirmation' },
  ],
]

const emptyPage = <T,>(): PageData<T> => ({
  count: 0, page: 1, pageSize: 0, totalPages: 1, next: null, previous: null, items: [],
})

/* ─────────────────────────── step labels ─────────────────────────── */
const STEPS = [
  { key: 'identity', label: 'Identity & Family' },
  { key: 'academic', label: 'Academic & Location' },
  { key: 'class',    label: 'Class Placement' },
  { key: 'parent',   label: 'Parent / Guardian' },
]

/* ─────────────────────────── form helpers ─────────────────────────── */

/** Controlled select helper */
function SField({ name, label, required, children, fd, set }: {
  name: keyof FormData; label: string; required?: boolean; fd: FormData
  set: (patch: Partial<FormData>) => void; children: ReactNode
}) {
  return (
    <label className="sa-field">
      <span>{label}{required && <em className="req">*</em>}</span>
      <select
        name={name as string}
        value={fd[name] as string}
        required={required}
        onChange={(e) => set({ [name]: e.target.value })}
      >
        {children}
      </select>
    </label>
  )
}

/** Controlled text/date/tel/email/number input helper */
function IField({ name, label, required, type = 'text', placeholder, fd, set, className }: {
  name: keyof FormData; label: string; required?: boolean; type?: string; placeholder?: string
  fd: FormData; set: (patch: Partial<FormData>) => void; className?: string
}) {
  return (
    <label className={`sa-field${className ? ` ${className}` : ''}`}>
      <span>{label}{required && <em className="req">*</em>}</span>
      <input
        name={name as string}
        type={type}
        placeholder={placeholder}
        required={required}
        value={fd[name] as string}
        onChange={(e) => set({ [name]: e.target.value })}
        onPointerDown={type === 'date' ? (e) => e.stopPropagation() : undefined}
        onClick={type === 'date' ? (e) => e.stopPropagation() : undefined}
      />
    </label>
  )
}

/** Yes / No / Not specified tri-bool select */
function TriBool({ name, label, fd, set }: {
  name: keyof FormData; label: string; fd: FormData; set: (patch: Partial<FormData>) => void
}) {
  return (
    <label className="sa-field">
      <span>{label}</span>
      <select name={name as string} value={fd[name] as string} onChange={(e) => set({ [name]: e.target.value })}>
        <option value="">Not specified</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  )
}

/* ─────────────────────────── validation error banner ─────────────────────────── */
function ValidationBanner({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null
  return (
    <div className="sa-validation-banner" role="alert">
      <AlertCircle size={16} />
      <div>
        <strong>Please fill in the required fields before continuing:</strong>
        <ul className="sa-validation-list">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      </div>
    </div>
  )
}

function QuickStudentModal({ open, accessToken, branches, selectedBranch, classes, sections, onClose, onSaved }: {
  open: boolean
  accessToken: string
  branches: Branch[]
  selectedBranch: string
  classes: Array<{ id: string; name: string }>
  sections: Array<{ id: string; gradeId: string; branchId: string; sectionName: string }>
  onClose: () => void
  onSaved: (studentId: string) => void
}) {
  const assignedBranch = branches.find((branch) => branch.id === selectedBranch) ?? branches.find((branch) => branch.isHeadOffice) ?? branches[0]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const matchingSections = sections.filter((section) => section.gradeId === classId && section.branchId === assignedBranch?.id)

  useEffect(() => {
    if (matchingSections.length === 1) setSectionId(matchingSections[0].id)
    else if (!matchingSections.some((section) => section.id === sectionId)) setSectionId('')
  }, [matchingSections, sectionId])

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    const raw = new FormData(event.currentTarget)
    const fullName = String(raw.get('fullName') ?? '').trim()
    const [firstName, ...lastParts] = fullName.split(/\s+/)
    try {
      const created = await adminRequest<Student>(accessToken, 'students', {
        method: 'POST',
        body: JSON.stringify({
          branchId: assignedBranch?.id,
          firstName,
          lastName: lastParts.join(' '),
          fatherName: String(raw.get('fatherName') ?? '').trim(),
          motherName: String(raw.get('motherName') ?? '').trim(),
          dateOfBirth: raw.get('dateOfBirth'),
          gender: raw.get('gender'),
          aadharNumber: String(raw.get('aadharNumber') ?? '').trim(),
          socialCategory: raw.get('socialCategory') || undefined,
          religion: raw.get('religion') || undefined,
          dateOfAdmission: raw.get('dateOfAdmission'),
          admissionNumber: String(raw.get('admissionNumber') ?? '').trim() || undefined,
          mobileNumber: String(raw.get('mobileNumber') ?? '').trim() || undefined,
          emailAddress: String(raw.get('emailAddress') ?? '').trim() || undefined,
          ...(sectionId ? { classSectionId: sectionId } : {}),
        }),
      })
      const parentName = String(raw.get('fatherName') ?? '').trim() || String(raw.get('motherName') ?? '').trim()
      const parentRelationship = String(raw.get('fatherName') ?? '').trim() ? 'FATHER' : 'MOTHER'
      const parentPhone = String(raw.get('mobileNumber') ?? '').trim()
      const parentEmail = String(raw.get('emailAddress') ?? '').trim()
      if (parentName && parentPhone) {
        const lookup = parentPhone || parentEmail
        const parentSearch = await adminRequest<{ items: Array<{ id: string }> }>(accessToken, `parents?search=${encodeURIComponent(lookup)}&page=1&pageSize=20`)
        const parentPayload = { studentId: created.id, relationship: parentRelationship, isPrimaryContact: true }
        if (parentSearch.items[0]) {
          await adminRequest(accessToken, `parents/${parentSearch.items[0].id}/link`, { method: 'POST', body: JSON.stringify(parentPayload) })
        } else {
          await adminRequest(accessToken, 'parents', { method: 'POST', body: JSON.stringify({ fullName: parentName, email: parentEmail || undefined, phone: parentPhone, ...parentPayload }) })
        }
      }
      event.currentTarget.reset()
      setClassId('')
      setSectionId('')
      onSaved(created.id)
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause.message : 'Student could not be added.')
    } finally {
      setSaving(false)
    }
  }

  return <Modal open={open} title="Add Student" description="Enter the essential student registration details. Class placement can be completed later if it is not applicable yet." onClose={() => !saving && onClose()} size="large" footer={<><button className="button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="button-primary" type="submit" form="quick-student-form" disabled={saving}>{saving ? 'Saving…' : 'Add Student'}</button></>}>
    <form id="quick-student-form" className="sa-form" onSubmit={submit}>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {assignedBranch && <div className="auto-assigned-banner">Branch: <strong>{assignedBranch.name}</strong></div>}
      <div className="sa-grid sa-grid-3">
        <label className="sa-field"><span>Student name<em className="req">*</em></span><input name="fullName" required placeholder="Full name" /></label>
        <label className="sa-field"><span>Father name</span><input name="fatherName" /></label>
        <label className="sa-field"><span>Mother name</span><input name="motherName" /></label>
        <label className="sa-field"><span>Date of birth<em className="req">*</em></span><input name="dateOfBirth" required type="date" /></label>
        <label className="sa-field"><span>Gender<em className="req">*</em></span><select name="gender" required defaultValue=""><option value="" disabled>Select gender</option><option>Male</option><option>Female</option><option>Other</option></select></label>
        <label className="sa-field"><span>Aadhar number</span><input name="aadharNumber" /></label>
        <label className="sa-field"><span>Social category</span><select name="socialCategory" defaultValue=""><option value="">Select category</option><option>General</option><option>OBC</option><option>SC</option><option>ST</option><option>EWS</option></select></label>
        <label className="sa-field"><span>Religion</span><select name="religion" defaultValue=""><option value="">Select religion</option><option>Hindu</option><option>Muslim</option><option>Christian</option><option>Sikh</option><option>Buddhist</option><option>Jain</option><option>Other</option></select></label>
        <label className="sa-field"><span>Date of admission<em className="req">*</em></span><input name="dateOfAdmission" required type="date" /></label>
        <label className="sa-field"><span>Admission no. / serial no.</span><input name="admissionNumber" /></label>
        <label className="sa-field"><span>Parent mobile number</span><input name="mobileNumber" type="tel" /></label>
        <label className="sa-field"><span>Parent email ID</span><input name="emailAddress" type="email" /></label>
      </div>
      <h3 className="sa-section-title">Class placement (optional)</h3>
      <div className="sa-grid sa-grid-3">
        <label className="sa-field"><span>Grade / class</span><select name="classId" value={classId} onChange={(event) => { setClassId(event.target.value); setSectionId('') }}><option value="">Not applicable yet</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="sa-field"><span>Section</span><select name="sectionId" value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!classId || matchingSections.length === 0}><option value="">Not applicable yet</option>{matchingSections.map((item) => <option key={item.id} value={item.id}>{item.sectionName}</option>)}</select></label>
      </div>
    </form>
  </Modal>
}

/* ─────────────────────────── main page ─────────────────────────── */
export function StudentsPage({ accessToken, branches = [], selectedBranch, selectedStudentId, onSelectStudent }: {
  accessToken: string
  branches: Branch[]
  selectedBranch: string
  selectedStudentId: string | null
  onSelectStudent: (studentId: string) => void
}) {
  const navigate = useNavigate()
  const formRef = useRef<HTMLFormElement>(null)

  /* list state */
  const [data, setData] = useState<PageData<Student>>(emptyPage)
  const [loadedQuery, setLoadedQuery] = useState('')
  const [listError, setListError] = useState('')
  const [search, setSearch] = useState('')
  const [genderFilter, setGenderFilter] = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const [sort, setSort] = useState<TableSort>({ columnId: 'student', direction: 'asc' })
  const [revision, setRevision] = useState(0)
  const [selectedStudentIds, setSelectedStudentIds] = useState<Set<string>>(new Set())

  /* form ui state */
  const [showForm, setShowForm] = useState(false)
  const [showBulkImport, setShowBulkImport] = useState(false)
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [createdStudent, setCreatedStudent] = useState<string | null>(null)

  /* ── Persistent form data — survives step changes ── */
  const [fd, setFdRaw] = useState<FormData>({ ...EMPTY_FORM })
  const setFd = (patch: Partial<FormData>) => setFdRaw((prev) => ({ ...prev, ...patch }))

  /* reference data */
  const [academicClasses, setAcademicClasses]   = useState<Array<{ id: string; name: string }>>([])
  const [academicYears, setAcademicYears]        = useState<Array<{ id: string; name: string; isCurrent: boolean }>>([])
  const [academicSections, setAcademicSections]  = useState<Array<{ id: string; gradeId: string; branchId: string; sectionName: string }>>([])

  const queryKey = [accessToken, selectedBranch, page, pageSize, search.trim(), genderFilter, classFilter, statusFilter, sort.columnId, sort.direction, revision].join('|')

  /* ── fetch students ── */
  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (selectedBranch !== 'all') query.set('branchId', selectedBranch)
    if (search.trim()) query.set('search', search.trim())
    if (genderFilter) query.set('gender', genderFilter)
    if (classFilter) query.set('classId', classFilter)
    if (statusFilter) query.set('status', statusFilter)
    query.set('ordering', `${sort.direction === 'desc' ? '-' : ''}${sort.columnId === 'student' ? 'name' : sort.columnId}`)
    void adminRequest<PageData<Student>>(accessToken, `students?${query}`, { signal: controller.signal })
      .then((res) => {
        setData({
          ...emptyPage,
          ...res,
          count: Number.isFinite(Number(res.count)) ? Number(res.count) : 0,
          items: Array.isArray(res.items) ? res.items : [],
        })
        setListError('')
        setLoadedQuery(queryKey)
      })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setListError(err instanceof Error ? err.message : 'Students could not be loaded.'); setLoadedQuery(queryKey) } })
    return () => controller.abort()
  }, [accessToken, page, pageSize, queryKey, revision, search, selectedBranch, sort, genderFilter, classFilter, statusFilter])

  /* ── fetch reference data ── */
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      adminRequest<{ items: Array<{ id: string; name: string }> }>(accessToken, 'academics/classes?page=1&pageSize=100', { signal: controller.signal }),
      adminRequest<{ items: Array<{ id: string; name: string; isCurrent: boolean }> }>(accessToken, 'academics/academic-years?page=1&pageSize=100', { signal: controller.signal }),
      adminRequest<{ items: Array<{ id: string; grade: { id: string }; branch: { id: string }; sectionName: string }> }>(accessToken, 'academics/sections?page=1&pageSize=100', { signal: controller.signal }),
    ]).then(([classes, years, sections]) => {
      setAcademicClasses(classes.items ?? [])
      setAcademicYears(years.items ?? [])
      setAcademicSections((sections.items ?? []).map((s) => ({ id: s.id, gradeId: s.grade.id, branchId: s.branch.id, sectionName: s.sectionName })))
    }).catch(() => undefined)
    return () => controller.abort()
  }, [accessToken])

  /* ── per-step validation ── */
  const validateStep = (stepIndex: number): string[] => {
    const required = STEP_REQUIRED[stepIndex] ?? []
    return required
      .filter(({ key }) => {
        const v = fd[key]
        if (typeof v === 'boolean') return !v // consent must be checked
        return !String(v).trim()
      })
      .map(({ label }) => label)
  }

  /* ── navigate steps with validation ── */
  const goToStep = (target: number) => {
    // When going forward, validate the current step
    if (target > step) {
      const errors = validateStep(step)
      if (errors.length > 0) {
        setValidationErrors(errors)
        return
      }
    }
    setValidationErrors([])
    setStep(target)
  }

  /* ── submit ── */
  const createStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Validate all steps before final submit
    const allErrors: string[] = []
    STEPS.forEach((_, i) => {
      const errs = validateStep(i)
      if (errs.length > 0) {
        allErrors.push(...errs.map((e) => `Step ${i + 1} (${STEPS[i]?.label}): ${e}`))
      }
    })
    if (allErrors.length > 0) {
      setValidationErrors(allErrors)
      setActionError('Some required fields are missing. Please review all steps.')
      return
    }

    const bool = (key: keyof FormData) => {
      const v = fd[key]
      if (v === 'true') return true
      if (v === 'false') return false
      return null
    }
    const str  = (key: keyof FormData) => String(fd[key] ?? '').trim() || undefined
    const num  = (key: keyof FormData) => { const v = fd[key]; return v ? Number(v) : undefined }

    setSaving(true)
    setActionError('')
    setValidationErrors([])
    try {
      /* ── create student ── */
      const created = await adminRequest<Student>(accessToken, 'students', {
        method: 'POST',
        body: JSON.stringify({
          branchId:                    resolvedBranchId || undefined,
          firstName:                   str('firstName'),
          lastName:                    str('lastName'),
          fatherName:                  str('fatherName'),
          motherName:                  str('motherName'),
          studentNicId:                str('studentNicId'),
          aadharNumber:                str('aadharNumber'),
          dateOfBirth:                 str('dateOfBirth') || null,
          gender:                      str('gender'),
          socialCategory:              str('socialCategory'),
          religion:                    str('religion'),
          motherTongue:                str('motherTongue'),
          ruralUrban:                  str('ruralUrban'),
          habitationLocality:          str('habitationLocality'),
          dateOfAdmission:             str('admissionDate') || null,
          srNumber:                    str('srNumber'),
          belongsToBpl:                bool('belongsToBpl'),
          belongsToDisadvantagedGroup: bool('belongsToDisadvantagedGroup'),
          gettingFreeEducation:        bool('gettingFreeEducation'),
          previousClass:               str('previousClass'),
          previousYearStatus:          str('previousYearStatus'),
          previousYearAttendanceDays:  num('previousYearAttendanceDays'),
          mediumOfInstruction:         str('mediumOfInstruction'),
          disabilityType:              str('disabilityType'),
          cwsnFacilities:              str('cwsnFacilities'),
          uniformSets:                 num('uniformSets'),
          freeTextBooks:               bool('freeTextBooks'),
          freeTransport:               bool('freeTransport'),
          freeEscort:                  bool('freeEscort'),
          mdmBeneficiary:              bool('mdmBeneficiary'),
          freeHostelFacility:          bool('freeHostelFacility'),
          attendedSpecialTraining:     bool('attendedSpecialTraining'),
          lastExaminationAppeared:     bool('lastExaminationAppeared'),
          lastExaminationPassed:       bool('lastExaminationPassed'),
          lastExaminationPercentage:   str('lastExaminationPercentage') || null,
          stream:                      str('stream'),
          tradeSector:                 str('tradeSector'),
          ironFolicAcidTablets:        bool('ironFolicAcidTablets'),
          dewormingTablets:            bool('dewormingTablets'),
          vitaminASupplement:          bool('vitaminASupplement'),
          mobileNumber:                str('mobileNumber'),
          emailAddress:                str('emailAddress'),
          classSectionId:              str('sectionId'),
        }),
      })

      /* ── create / link parent ── */
      const parentPhone = fd.parentPhone.trim()
      if (parentPhone) {
        const parentSearch = await adminRequest<{ items: Array<{ id: string }> }>(
          accessToken, `parents?search=${encodeURIComponent(parentPhone)}&page=1&pageSize=20`,
        )
        const relationship  = (fd.relationship || 'GUARDIAN').toUpperCase()
        const isPrimary     = fd.primaryContact !== 'false'
        const parentPayload = { studentId: created.id, relationship, isPrimaryContact: isPrimary }

        if (parentSearch.items[0]) {
          await adminRequest(accessToken, `parents/${parentSearch.items[0].id}/link`, {
            method: 'POST', body: JSON.stringify(parentPayload),
          })
        } else {
          await adminRequest(accessToken, 'parents', {
            method: 'POST',
            body: JSON.stringify({
              fullName: fd.parentName,
              email:    fd.parentEmail || undefined,
              phone:    parentPhone,
              ...parentPayload,
            }),
          })
        }
      }

      setShowForm(false)
      setStep(0)
      setFdRaw({ ...EMPTY_FORM })
      setCreatedStudent(created.id)
      setPage(1)
      setRevision((v) => v + 1)
    } catch (err) {
      setActionError(err instanceof AdminApiError ? err.message : 'Student could not be added.')
    } finally {
      setSaving(false)
    }
  }

  /* ── open / close form ── */
  const openForm = () => {
    // Resolve the most specific branch we know about right now
    const presetBranchId =
      branches.length > 0
        ? (branches.find((branch) => branch.isHeadOffice)?.id ?? branches[0]?.id ?? '')
        : selectedBranch !== 'all'
        ? selectedBranch
        : ''
    setShowForm(true)
    setStep(0)
    setActionError('')
    setValidationErrors([])
    // Pre-seed branchId so it is always in state before the user even visits Step 1
    setFdRaw((prev) => ({ ...prev, branchId: presetBranchId }))
  }
  const closeForm = () => {
    setShowForm(false)
    setFdRaw({ ...EMPTY_FORM })
    setActionError('')
    setValidationErrors([])
  }

  /* ── keep branchId in fd in sync when context changes while form is open ── */
  useEffect(() => {
    if (!showForm) return
    if (fd.branchId) return // user already picked or it was pre-filled — don't overwrite
    const auto =
      branches.length > 0
        ? (branches.find((branch) => branch.isHeadOffice)?.id ?? branches[0]?.id ?? '')
        : selectedBranch !== 'all'
        ? selectedBranch
        : ''
    if (auto) setFd({ branchId: auto })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, branches, selectedBranch])

  /* ── computed ── */
  const queryLoaded      = loadedQuery === queryKey
  const assignedBranch   = branches.find((branch) => branch.id === (fd.branchId || (selectedBranch !== 'all' ? selectedBranch : ''))) ?? branches.find((branch) => branch.isHeadOffice) ?? branches[0]
  const currentYear      = academicYears.find((y) => y.isCurrent) ?? (academicYears.length === 1 ? academicYears[0] : undefined)
  // The effective branchId to use for section filtering and submit — always resolved
  const resolvedBranchId =
    fd.branchId ||
    assignedBranch?.id ||
    (selectedBranch !== 'all' ? selectedBranch : '')
  const matchingSections = academicSections.filter((s) => s.gradeId === fd.classId && s.branchId === resolvedBranchId)

  /* ── auto-sync sectionId in fd state whenever classId or matchingSections change ── */
  useEffect(() => {
    if (!fd.classId) {
      if (fd.sectionId) setFd({ sectionId: '' })
      return
    }
    if (matchingSections.length === 1) {
      const autoId = matchingSections[0].id
      if (fd.sectionId !== autoId) {
        setFd({ sectionId: autoId })
      }
    } else if (matchingSections.length > 1) {
      if (fd.sectionId && !matchingSections.some((s) => s.id === fd.sectionId)) {
        setFd({ sectionId: '' })
      }
    } else if (matchingSections.length === 0) {
      if (fd.sectionId) setFd({ sectionId: '' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fd.classId, fd.sectionId, matchingSections])

  const isLastStep       = step === STEPS.length - 1

  /* step completion indicators */
  const stepComplete = STEPS.map((_, i) => validateStep(i).length === 0)

  const deleteStudent = async (studentId: string, studentName: string) => {
    if (!window.confirm(`Delete ${studentName || 'this student'}? The student will be deactivated and hidden from the active directory.`)) return
    try {
      await adminRequest(accessToken, `students/${studentId}`, { method: 'DELETE' })
      setRevision((value) => value + 1)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The student could not be deleted.')
    }
  }

  const deleteSelectedStudents = async () => {
    const count = selectedStudentIds.size
    if (!count || !window.confirm(`Delete ${count} selected student${count === 1 ? '' : 's'}? They will be deactivated and removed from the active directory.`)) return
    try {
      await adminRequest(accessToken, 'students/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ studentIds: Array.from(selectedStudentIds) }),
      })
      setSelectedStudentIds(new Set())
      setRevision((value) => value + 1)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The selected students could not be deleted.')
    }
  }

  /* ── columns ── */
  const columns: DataTableColumn<Student>[] = [
    {
      id: 'student', header: 'Student', sortable: true,
      cell: (s) => (
        <span className="sa-name-cell">
          <span className="sa-avatar">{(s.firstName[0] ?? '').toUpperCase()}{(s.lastName?.[0] ?? '').toUpperCase()}</span>
          <span>
            <strong>{`${s.firstName} ${s.lastName}`.trim()}</strong>
            <small>{s.admissionNumber}</small>
          </span>
        </span>
      ),
    },
    { id: 'admissionNumber', header: 'Admission No.', sortable: true, cell: (s) => s.admissionNumber },
    { id: 'session',  header: 'Session',       cell: (s) => s.session  || '—' },
    {
      id: 'class', header: 'Class & Section', sortable: true,
      cell: (s) => s.studyingInClass ? (s.classSectionName ? `${s.studyingInClass} (${s.classSectionName})` : s.studyingInClass) : '—',
    },
    { id: 'gender',   header: 'Gender', sortable: true, cell: (s) => s.gender   || '—' },
    { id: 'branch',   header: 'Branch', sortable: true, cell: (s) => s.branch.name },
    {
      id: 'status', header: 'Status',
      cell: (s) => <span className={`status-badge ${s.isActive ? 'tone-success' : 'tone-danger'}`}>{s.isActive ? 'Active' : 'Inactive'}</span>,
    },
    {
      id: 'actions', header: 'Actions', align: 'end',
      cell: (student) => (
        <span className="table-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="button-secondary btn-sm" title="View student profile" onClick={() => navigate(`/students/profile?student=${student.id}`)}>
            <Eye size={14} /> View
          </button>
          <button type="button" className="button-secondary btn-sm danger-text" title="Delete student" onClick={() => void deleteStudent(student.id, `${student.firstName} ${student.lastName ?? ''}`.trim())}>
            <Trash2 size={14} /> Delete
          </button>
        </span>
      ),
    },
  ]

  /* ─────────────────────── render ─────────────────────── */
  return (
    <div className="entity-page">
      {/* page heading */}
      <div className="page-heading">
        <div>
          <p className="breadcrumb">People / Students</p>
          <h1>Students</h1>
          <p className="section-caption">Click a student row to open Profile &amp; Uploads for the profile photo and documents.</p>
        </div>
        <div className="page-actions"><button className="button-secondary" type="button" onClick={() => setShowBulkImport(true)}>Bulk add</button><button className="button-primary" type="button" onClick={openForm}><Plus />Add Student</button></div>
      </div>

      {/* action error */}
      {actionError && <div className="inline-error" role="alert">{actionError}</div>}

      {/* success banner */}
      {createdStudent && (
        <div className="profile-completion-banner">
          <div>
            <strong>Student added successfully.</strong>
            <span>Complete the profile with address, medical details, documents, and consent.</span>
          </div>
          <button className="button-secondary" type="button" onClick={() => navigate(`/students/profile?student=${createdStudent}`)}>
            Complete profile
          </button>
        </div>
      )}

      {/* ─── multi-step add form ─── */}
      {/* The legacy multi-step form remains in source for migration safety but is no longer exposed. */}
      <Modal open={false} title="Add New Student" description="" onClose={() => undefined} size="large">
        <Card className="sa-form-card">
          <div className="sa-form-header">
            <p className="section-caption">Fields marked <em className="req">*</em> are required. Your data is kept while switching steps.</p>
          </div>

          {/* step indicator */}
          <nav className="sa-steps" aria-label="Form steps">
            {STEPS.map((s, i) => (
              <button key={s.key} type="button"
                className={`sa-step-btn ${i === step ? 'active' : ''} ${stepComplete[i] && i !== step ? 'done' : ''} ${!stepComplete[i] && i < step ? 'has-error' : ''}`}
                onClick={() => goToStep(i)}>
                <span className="sa-step-num">
                  {stepComplete[i] && i !== step ? '✓' : !stepComplete[i] && i < step ? '!' : i + 1}
                </span>
                <span className="sa-step-label">{s.label}</span>
              </button>
            ))}
          </nav>

          {/* validation banner (shown inside the form above fields) */}
          <ValidationBanner errors={validationErrors} />

          <form ref={formRef} className="sa-form" onSubmit={createStudent}>

            {/* ════ STEP 0 – Identity & Family ════ */}
            {step === 0 && (
              <div className="sa-step-body">
                <h3 className="sa-section-title">Basic Identity</h3>
                <div className="sa-grid sa-grid-3">
                  <IField name="firstName"   label="First Name"    required fd={fd} set={setFd} placeholder="e.g. Aarav" />
                  <IField name="lastName"    label="Last Name"     fd={fd} set={setFd} placeholder="e.g. Sharma" />
                  <IField name="fatherName"  label="Father Name"   fd={fd} set={setFd} placeholder="e.g. Rajesh Sharma" />
                  <IField name="motherName"  label="Mother Name"   fd={fd} set={setFd} placeholder="e.g. Priya Sharma" />
                  <IField name="dateOfBirth" label="Date of Birth" required type="date" fd={fd} set={setFd} />
                  <SField name="gender" label="Gender" required fd={fd} set={setFd}>
                    <option value="" disabled>Select gender</option>
                    <option>Male</option>
                    <option>Female</option>
                    <option>Other</option>
                  </SField>
                  <IField name="studentNicId"  label="Student NIC ID"   fd={fd} set={setFd} placeholder="National Identity Card No." />
                  <IField name="aadharNumber"  label="Aadhar Number"    fd={fd} set={setFd} placeholder="12-digit Aadhar" />
                  <IField name="mobileNumber"  label="Mobile Number"    type="tel"   fd={fd} set={setFd} placeholder="98765 43210" />
                  <IField name="emailAddress"  label="Email Address"    type="email" fd={fd} set={setFd} placeholder="student@example.com" />
                </div>

                <h3 className="sa-section-title">Religion &amp; Social Background</h3>
                <div className="sa-grid sa-grid-3">
                  <SField name="socialCategory" label="Social Category" fd={fd} set={setFd}>
                    <option value="">Select category</option>
                    <option>General</option>
                    <option>OBC</option>
                    <option>SC</option>
                    <option>ST</option>
                    <option>EWS</option>
                  </SField>
                  <SField name="religion" label="Religion" fd={fd} set={setFd}>
                    <option value="">Select religion</option>
                    <option>Hindu</option>
                    <option>Muslim</option>
                    <option>Christian</option>
                    <option>Sikh</option>
                    <option>Buddhist</option>
                    <option>Jain</option>
                    <option>Other</option>
                  </SField>
                  <IField name="motherTongue" label="Mother Tongue" fd={fd} set={setFd} placeholder="e.g. Hindi" />
                </div>
              </div>
            )}

            {/* ════ STEP 1 – Academic & Location ════ */}
            {step === 1 && (
              <div className="sa-step-body">
                <h3 className="sa-section-title">Admission Details</h3>
                <div className="sa-grid sa-grid-3">
                  {assignedBranch
                    ? <div className="auto-assigned-field"><span>Default branch</span><strong>{assignedBranch.name}</strong><small>Automatically selected for this institute</small><input type="hidden" name="branchId" value={assignedBranch.id} /></div>
                    : <div className="auto-assigned-field"><span>Default branch</span><strong>Loading branch context…</strong><small>Select a branch in the global header before adding a student.</small><input type="hidden" name="branchId" value={selectedBranch === 'all' ? '' : selectedBranch} /></div>}
                  <IField name="admissionDate" label="Date of Admission" required type="date"
                    fd={fd} set={setFd} placeholder={new Date().toISOString().slice(0, 10)} />
                  <IField name="srNumber" label="Admission Number / SR No" fd={fd} set={setFd} placeholder="Will be auto-generated if blank" />
                </div>

                <h3 className="sa-section-title">Location &amp; Residence</h3>
                <div className="sa-grid sa-grid-3">
                  <SField name="ruralUrban" label="Rural / Urban" fd={fd} set={setFd}>
                    <option value="">Select type</option>
                    <option value="Rural">Rural</option>
                    <option value="Urban">Urban</option>
                  </SField>
                  <IField name="habitationLocality" label="Habitation or Locality" fd={fd} set={setFd}
                    placeholder="Village / Ward / Colony name" className="sa-span-2" />
                </div>

                <h3 className="sa-section-title">Previous Year Academic Details</h3>
                <div className="sa-grid sa-grid-3">
                  <SField name="mediumOfInstruction" label="Medium of Instruction" fd={fd} set={setFd}>
                    <option>English</option>
                    <option>Hindi</option>
                    <option>Bengali</option>
                    <option>Telugu</option>
                    <option>Marathi</option>
                    <option>Tamil</option>
                    <option>Urdu</option>
                    <option>Gujarati</option>
                    <option>Kannada</option>
                    <option>Odia</option>
                    <option>Malayalam</option>
                    <option>Punjabi</option>
                    <option>Other</option>
                  </SField>
                  <IField name="previousClass" label="Class Studied in Prev. Year" fd={fd} set={setFd} placeholder="e.g. Class 7" />
                  <SField name="previousYearStatus" label="If in Class 1, Status of Previous Year" fd={fd} set={setFd}>
                    <option value="">Not applicable</option>
                    <option value="Pre-primary">Pre-primary (KG/LKG/UKG)</option>
                    <option value="Home-schooled">Home-schooled</option>
                    <option value="Never enrolled">Never enrolled</option>
                  </SField>
                  <IField name="previousYearAttendanceDays" label="Days Child Attended School (prev. year)"
                    type="number" fd={fd} set={setFd} placeholder="e.g. 210" />
                  <TriBool name="lastExaminationAppeared" label="In Last Examination — Appeared" fd={fd} set={setFd} />
                  <TriBool name="lastExaminationPassed"   label="In Last Examination — Passed"   fd={fd} set={setFd} />
                  <IField name="lastExaminationPercentage" label="In Last Examination — % Marks"
                    type="number" fd={fd} set={setFd} placeholder="e.g. 78.50" />
                  <SField name="stream" label="Stream (Grades 11 & 12)" fd={fd} set={setFd}>
                    <option value="">Not applicable</option>
                    <option>Science</option>
                    <option>Commerce</option>
                    <option>Arts / Humanities</option>
                    <option>Vocational</option>
                  </SField>
                  <IField name="tradeSector" label="Trade / Sector (Grades 9–12)" fd={fd} set={setFd} placeholder="e.g. IT & Electronics" />
                </div>
              </div>
            )}

            {/* ════ STEP 2 – Class Placement ════ */}
            {step === 2 && (
              <div className="sa-step-body">
                <h3 className="sa-section-title">Academic Session</h3>
                {currentYear
                  ? <div className="auto-assigned-banner">Academic year auto-assigned: <strong>{currentYear.name}</strong><input type="hidden" name="academicYearId" value={currentYear.id} /></div>
                  : (
                    <div className="sa-grid sa-grid-3">
                      <SField name="academicYearId" label="Academic Year" required fd={fd} set={setFd}>
                        <option value="">Select year</option>
                        {academicYears.map((y) => <option value={y.id} key={y.id}>{y.name}</option>)}
                      </SField>
                    </div>
                  )}

                <h3 className="sa-section-title">Studying in Class</h3>
                <div className="sa-grid sa-grid-3">
                  <SField name="classId" label="Class / Grade" required fd={fd}
                    set={(patch) => { setFd({ ...patch, sectionId: '' }) }}>
                    <option value="">Select class</option>
                    {academicClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </SField>

                  {matchingSections.length > 1 ? (
                    <SField name="sectionId" label="Section" required fd={fd} set={setFd}>
                      <option value="">Select section</option>
                      {matchingSections.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.sectionName}
                        </option>
                      ))}
                    </SField>
                  ) : matchingSections.length === 1 ? (
                    <div className="auto-assigned-field">
                      <span>Section</span>
                      <strong>{matchingSections[0].sectionName} (assigned automatically)</strong>
                    </div>
                  ) : (
                    <div className="auto-assigned-field" style={{ borderColor: 'var(--color-warning)' }}>
                      <span>Section</span>
                      <strong style={{ color: 'var(--color-warning)' }}>No section exists for this class</strong>
                    </div>
                  )}
                </div>
                <p className="section-caption" style={{ marginTop: '0.5rem' }}>Roll numbers can be assigned later in the class roster.</p>
              </div>
            )}

            {/* ════ STEP 3 – Parent / Guardian ════ */}
            {step === 3 && (
              <div className="sa-step-body">
                <h3 className="sa-section-title">Parent / Guardian Details</h3>
                <p className="section-caption">
                  If a parent with this phone number already exists they will be automatically linked.
                  Otherwise a new parent account will be created and saved to the database.
                </p>
                <div className="sa-grid sa-grid-3">
                  <IField name="parentName"  label="Parent / Guardian Name" fd={fd} set={setFd} placeholder="e.g. Rohit Sharma" />
                  <SField name="relationship" label="Relationship" fd={fd} set={setFd}>
                    <option value="">Select relationship</option>
                    <option value="FATHER">Father</option>
                    <option value="MOTHER">Mother</option>
                    <option value="GUARDIAN">Guardian</option>
                  </SField>
                  <IField name="parentPhone" label="Phone Number"      type="tel"   fd={fd} set={setFd} placeholder="98765 43210" />
                  <IField name="parentEmail" label="Email (optional)"  type="email" fd={fd} set={setFd} placeholder="parent@example.com" />
                  <SField name="primaryContact" label="Primary Contact" fd={fd} set={setFd}>
                    <option value="true">Yes – mark as primary</option>
                    <option value="false">No</option>
                  </SField>
                </div>

                <div className="sa-consent-box">
                  <label className="checkbox-field">
                    <input
                      name="consent"
                      type="checkbox"
                      checked={fd.consent}
                      onChange={(e) => setFd({ consent: e.target.checked })}
                    />
                    Parent / guardian has agreed to data processing and school communication. <em className="req">*</em>
                  </label>
                </div>
              </div>
            )}

            {/* navigation */}
            <div className="sa-nav">
              {step > 0 && (
                <button type="button" className="button-secondary sa-nav-prev" onClick={() => goToStep(step - 1)}>
                  <ChevronLeft size={16} /> Previous
                </button>
              )}
              <div className="sa-nav-spacer" />
              {!isLastStep
                ? (
                  <button type="button" className="button-primary" onClick={() => goToStep(step + 1)}>
                    Next <ChevronRight size={16} />
                  </button>
                )
                : (
                  <button type="submit" className="button-primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Add Student'}
                  </button>
                )}
            </div>
          </form>
        </Card>
      </Modal>

      <QuickStudentModal
        open={showForm}
        accessToken={accessToken}
        branches={branches}
        selectedBranch={selectedBranch}
        classes={academicClasses}
        sections={academicSections}
        onClose={closeForm}
        onSaved={(studentId) => { setShowForm(false); setCreatedStudent(studentId); setPage(1); setRevision((value) => value + 1) }}
      />

      <StudentBulkImport open={showBulkImport} onClose={() => setShowBulkImport(false)} accessToken={accessToken} branches={branches} selectedBranch={selectedBranch} classes={academicClasses} sections={academicSections} onComplete={() => { setPage(1); setRevision((value) => value + 1) }} />

      <section className="student-summary-grid" aria-label="Student directory summary">
        <Card className="student-summary-card"><span>Total students</span><strong>{queryLoaded ? data.count : '—'}</strong><small>In the selected branch scope</small></Card>
        <Card className="student-summary-card"><span>Active on this page</span><strong>{queryLoaded ? data.items.filter((student) => student.isActive).length : '—'}</strong><small>Current paginated results</small></Card>
        <Card className="student-summary-card"><span>Class placement</span><strong>{queryLoaded ? data.items.filter((student) => student.studyingInClass).length : '—'}</strong><small>Students assigned to a class</small></Card>
        <Card className="student-summary-card"><span>Needs placement</span><strong>{queryLoaded ? data.items.filter((student) => !student.studyingInClass).length : '—'}</strong><small>Assign class and section</small></Card>
      </section>

      {/* ─── student table ─── */}
      <Card className="entity-table-card">
        <SectionHeader title={`Students (${queryLoaded ? data.count : 0})`} />
        <DataTable
          caption="Students"
          columns={columns}
          rows={queryLoaded ? data.items : []}
          getRowId={(s) => s.id}
          selectedRowIds={selectedStudentIds}
          onSelectionChange={setSelectedStudentIds}
          bulkActions={<button type="button" className="button-secondary danger-text" onClick={() => void deleteSelectedStudents()}><Trash2 size={14} /> Delete selected</button>}
          rowLabel={(s) => `${s.firstName} ${s.lastName}`.trim()}
          totalRows={queryLoaded ? data.count : 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(v) => { setPageSize(v); setPage(1) }}
          onRowClick={(student) => navigate(`/students/profile?student=${student.id}`)}
          loading={!queryLoaded}
          error={queryLoaded && listError ? listError : undefined}
          onRetry={() => setRevision((v) => v + 1)}
          sort={sort}
          onSortChange={(next) => { setSort(next); setPage(1) }}
          filters={
            <div className="entity-filter-row">
              <label className="search-control"><Search aria-hidden="true" /><span className="sr-only">Search students</span><input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }} placeholder="Search by name or admission no." /></label>
              <select aria-label="Filter by gender" value={genderFilter} onChange={(e) => { setGenderFilter(e.target.value); setPage(1) }}><option value="">All genders</option><option>Male</option><option>Female</option><option>Other</option></select>
              <select aria-label="Filter by class" value={classFilter} onChange={(e) => { setClassFilter(e.target.value); setPage(1) }}><option value="">All classes</option>{academicClasses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select>
            </div>
          }
          emptyTitle="No students found"
          emptyDescription={search ? 'Try a different search.' : 'Add the first student to start building live attendance, fee, and academic data.'}
        />
      </Card>
    </div>
  )
}
