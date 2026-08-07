import { type ReactNode, useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft, ChevronLeft, ChevronRight, Download, Edit3, Eye,
  FileText, MoreHorizontal, Save, Trash2, Upload, UserRound, X,
} from 'lucide-react'
import { FileUploadField, PageSkeleton } from '../../components/admin-ui'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { adminRequest, adminUpload, AdminApiError } from '../admin/admin.api'
import { listAllRoles } from '../access-control/access-control.api'
import type { Role } from '../access-control/types'

/* ─────────────────── shared types ─────────────────── */
type ProfileKind = 'student' | 'staff' | 'parent'
type Props = { kind: ProfileKind; id?: string; accessToken: string; onBack: () => void }

type StudentFull = Record<string, unknown> & {
  id: string
  firstName: string
  lastName: string
  admissionNumber: string
  isActive: boolean
  studyingInClass?: string
  classSectionName?: string
  session?: string
  mobileNumber?: string
  emailAddress?: string
  fatherName?: string
  motherName?: string
  dateOfBirth?: string
  gender?: string
  studentNicId?: string
  aadharNumber?: string
  srNumber?: string
  socialCategory?: string
  religion?: string
  motherTongue?: string
  ruralUrban?: string
  habitationLocality?: string
  dateOfAdmission?: string
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
  branch?: { id: string; name: string; code: string }
}

type Enrollment = {
  id: string
  rollNumber: string
  enrolledAt: string
  leftAt: string | null
  classSection: {
    id: string
    sectionName: string
    grade: { id: string; name: string }
    branch: { id: string; name: string }
  }
  academicYear: { id: string; name: string; isCurrent: boolean }
}

type Guardian = {
  id: string
  fullName: string
  email: string
  phone: string
  relationship?: string
}

type TeachingAssignment = {
  id: string
  classSectionId: string
  sectionLabel: string
  subjectId: string
  subjectName: string
  academicYear: string
  periodsPerWeek?: number
}

type FeeInvoice = { id: string; studentId: string; amount: string; due_date: string; totalPaid: string }
type StudentAttendanceSummary = { summary: { present: number; absent: number; late: number; excused: number; total: number; attendancePercentage: number } }
type StudentTimetableEntry = { id: string; subjectName: string; teacherName: string }
type TimetableApiAssignment = { id: string; subject?: { name?: string }; teacher?: { fullName?: string; email?: string } }

const WEEKDAY_LABELS: Record<string, string> = {
  MON: 'Monday', TUE: 'Tuesday', WED: 'Wednesday', THU: 'Thursday',
  FRI: 'Friday', SAT: 'Saturday', SUN: 'Sunday',
}

const STAFF_TIMETABLE_SLOTS = [
  { period: 1, time: '09:45 - 10:30 AM' },
  { period: 2, time: '10:45 - 11:30 AM' },
  { period: 3, time: '11:30 - 12:15 PM' },
  { period: 4, time: '01:30 - 02:15 PM' },
  { period: 5, time: '02:15 - 03:00 PM' },
  { period: 6, time: '03:15 - 04:00 PM' },
]

const STAFF_BREAKS = [
  { title: 'Morning Break', time: '10:30 to 10:45 AM', tone: 'break-morning' },
  { title: 'Lunch', time: '12:15 to 01:30 PM', tone: 'break-lunch' },
  { title: 'Evening Break', time: '03:30 PM to 03:45 PM', tone: 'break-evening' },
]

/* ─────────────────── helpers ─────────────────── */
function humanize(value: string) {
  return value.toLowerCase().split('_').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
}

function fmt(value: unknown): string {
  if (value === true) return 'Yes'
  if (value === false) return 'No'
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}

function fmtDate(value: unknown): string {
  if (!value || typeof value !== 'string') return '—'
  try {
    return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return value }
}

/* ─────────────────── Loading / Empty states ─────────────────── */
function Spinner() {
  return <PageSkeleton name="profile-detail" label="Loading profile" variant="detail" />
}

function EmptyState({ message }: { message: string }) {
  return <div className="sp-empty-state">{message}</div>
}

/* ─────────────────── Detail Grid item ─────────────────── */
function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="sp-detail-item">
      <span className="sp-detail-label">{label}</span>
      <strong className={`sp-detail-value${value === '—' ? ' sp-empty' : ''}`}>{value}</strong>
    </div>
  )
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="sp-detail-section">
      <h3 className="sp-detail-section-title">{title}</h3>
      <div className="sp-detail-grid">{children}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   STUDENT PROFILE
════════════════════════════════════════════════ */
function StudentProfilePage({ id, accessToken, onBack }: { id?: string; accessToken: string; onBack: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState(
    requestedTab
      ? requestedTab.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      : 'Overview',
  )

  const [student, setStudent]       = useState<StudentFull | null>(null)
  const [loading, setLoading]       = useState(true)
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [enrollLoading, setEnrollLoading] = useState(false)
  const [guardians, setGuardians]   = useState<Guardian[]>([])
  const [guardLoading, setGuardLoading] = useState(false)
  const [timetable, setTimetable] = useState<StudentTimetableEntry[]>([])
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [fees, setFees] = useState<FeeInvoice[]>([])
  const [feesLoading, setFeesLoading] = useState(false)
  const [attendance, setAttendance] = useState<StudentAttendanceSummary | null>(null)
  const [attendanceLoading, setAttendanceLoading] = useState(false)
  const [editing, setEditing]       = useState(false)
  const [saveError, setSaveError]   = useState('')
  const [saving, setSaving]         = useState(false)

  const tabs = ['Overview', 'Timetable', 'Attendance', 'Fees', 'Academic History', 'Guardians', 'Documents']

  /* fetch student */
  useEffect(() => {
    if (!id) { setLoading(false); return }
    setLoading(true)
    void adminRequest<{ id: string }>(accessToken, `students/${id}`)
      .then((data) => { setStudent(data as unknown as StudentFull); setLoading(false) })
      .catch(() => {
        /* fallback: search in list */
        void adminRequest<{ items: StudentFull[] }>(accessToken, `students?page=1&pageSize=200`)
          .then((res) => { const match = res.items.find((s) => s.id === id); setStudent(match ?? null) })
          .finally(() => setLoading(false))
      })
  }, [accessToken, id])

  /* fetch enrollments when tab opened */
  useEffect(() => {
    if (tab !== 'Academic History' || !id) return
    setEnrollLoading(true)
    void adminRequest<{ items: Enrollment[] }>(accessToken, `academics/enrollments?studentId=${id}&pageSize=100`)
      .then((res) => setEnrollments(res.items))
      .catch(() => undefined)
      .finally(() => setEnrollLoading(false))
  }, [accessToken, id, tab])

  useEffect(() => {
    if (tab !== 'Timetable' || !id) return
    setTimetableLoading(true)
    void adminRequest<{ items: TimetableApiAssignment[] }>(accessToken, `academics/section-subject-teachers?studentId=${id}&pageSize=100`)
      .then((res) => setTimetable(res.items.map((item) => ({ id: item.id, subjectName: item.subject?.name || '—', teacherName: item.teacher?.fullName || item.teacher?.email || '—' }))))
      .catch(() => setTimetable([]))
      .finally(() => setTimetableLoading(false))
  }, [accessToken, id, tab])

  useEffect(() => {
    if (tab !== 'Fees' || !id) return
    setFeesLoading(true)
    void adminRequest<{ items: FeeInvoice[] }>(accessToken, `fees/invoices?studentId=${id}&pageSize=100`)
      .then((res) => setFees(res.items))
      .catch(() => setFees([]))
      .finally(() => setFeesLoading(false))
  }, [accessToken, id, tab])

  useEffect(() => {
    if (tab !== 'Attendance' || !id) return
    setAttendanceLoading(true)
    const now = new Date()
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    void adminRequest<StudentAttendanceSummary>(accessToken, `attendance/reports?studentId=${id}&dateFrom=${from}&dateTo=${now.toISOString().slice(0, 10)}`)
      .then(setAttendance).catch(() => setAttendance(null)).finally(() => setAttendanceLoading(false))
  }, [accessToken, id, tab])

  /* fetch guardians when tab opened */
  useEffect(() => {
    if (tab !== 'Guardians' || !id) return
    setGuardLoading(true)
    void adminRequest<{ items: Guardian[] }>(accessToken, `parents?studentId=${id}&pageSize=50`)
      .then((res) => setGuardians(res.items))
      .catch(() => undefined)
      .finally(() => setGuardLoading(false))
  }, [accessToken, id, tab])

  /* save student patch */
  const saveStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!student) return
    const form = new FormData(event.currentTarget)
    const str = (k: string) => String(form.get(k) ?? '').trim() || undefined
    const bool = (k: string) => { const v = form.get(k); return v === 'true' ? true : v === 'false' ? false : null }
    const num = (k: string) => { const v = form.get(k); return v ? Number(v) : undefined }
    setSaving(true); setSaveError('')
    try {
      const updated = await adminRequest<StudentFull>(accessToken, `students/${student.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: str('firstName'), lastName: str('lastName'),
          fatherName: str('fatherName'), motherName: str('motherName'),
          dateOfBirth: str('dateOfBirth') || null,
          gender: str('gender'), socialCategory: str('socialCategory'),
          religion: str('religion'), motherTongue: str('motherTongue'),
          studentNicId: str('studentNicId'), aadharNumber: str('aadharNumber'),
          srNumber: str('srNumber'),
          ruralUrban: str('ruralUrban'), habitationLocality: str('habitationLocality'),
          dateOfAdmission: str('dateOfAdmission') || null,
          belongsToBpl: bool('belongsToBpl'), belongsToDisadvantagedGroup: bool('belongsToDisadvantagedGroup'),
          gettingFreeEducation: bool('gettingFreeEducation'),
          previousClass: str('previousClass'), previousYearStatus: str('previousYearStatus'),
          previousYearAttendanceDays: num('previousYearAttendanceDays'),
          mediumOfInstruction: str('mediumOfInstruction'),
          disabilityType: str('disabilityType'), cwsnFacilities: str('cwsnFacilities'),
          uniformSets: num('uniformSets'),
          freeTextBooks: bool('freeTextBooks'), freeTransport: bool('freeTransport'),
          freeEscort: bool('freeEscort'), mdmBeneficiary: bool('mdmBeneficiary'),
          freeHostelFacility: bool('freeHostelFacility'), attendedSpecialTraining: bool('attendedSpecialTraining'),
          lastExaminationAppeared: bool('lastExaminationAppeared'), lastExaminationPassed: bool('lastExaminationPassed'),
          lastExaminationPercentage: str('lastExaminationPercentage') || null,
          stream: str('stream'), tradeSector: str('tradeSector'),
          ironFolicAcidTablets: bool('ironFolicAcidTablets'), dewormingTablets: bool('dewormingTablets'),
          vitaminASupplement: bool('vitaminASupplement'),
          mobileNumber: str('mobileNumber'), emailAddress: str('emailAddress'),
          classSectionId: str('classSectionId'),
        }),
      })
      setStudent(updated); setEditing(false)
    } catch (e) {
      if (e instanceof AdminApiError && e.fieldErrors && Object.keys(e.fieldErrors).length > 0) {
        const details = Object.entries(e.fieldErrors)
          .map(([f, msgs]) => `${f}: ${msgs.join(', ')}`)
          .join(' | ')
        setSaveError(`${e.message} — ${details}`)
      } else {
        setSaveError(e instanceof AdminApiError ? e.message : 'Could not save changes.')
      }
    } finally { setSaving(false) }
  }

  const switchTab = (name: string) => {
    setTab(name)
    const next = new URLSearchParams(searchParams)
    next.set('tab', name.toLowerCase().replaceAll(' ', '-'))
    setSearchParams(next)
  }

  if (loading) return <Spinner />

  const name = student ? `${student.firstName} ${student.lastName ?? ''}`.trim() : 'Student'
  const initials = name.split(' ').map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase()

  return (
    <div className="profile-page">
      {/* header */}
      <div className="profile-page-header">
        <div>
          <button className="profile-back" type="button" onClick={onBack}>
            <ArrowLeft /> People / Students
          </button>
          <h1>
            {name}
            {student && (
              <>
                <span className={`profile-status ${student.isActive ? '' : 'inactive'}`}>
                  {student.isActive ? 'Active' : 'Inactive'}
                </span>
                {student.studyingInClass && <span className="profile-badge">{student.studyingInClass}</span>}
                {student.session && <span className="profile-badge sp-session-badge">{student.session}</span>}
              </>
            )}
          </h1>
        </div>
        <div className="profile-actions">
          {!editing && (
            <button className="button-secondary" type="button" onClick={() => { setEditing(true); setSaveError('') }}>
              <Edit3 size={15} /> Edit Profile
            </button>
          )}
          <button className="button-secondary icon-only" type="button" aria-label="More profile actions">
            <MoreHorizontal />
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="profile-tabs" role="tablist">
        {tabs.map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name}
            onClick={() => switchTab(name)}>{name}</button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'Overview' && (
        editing && student
          ? <StudentEditForm student={student} accessToken={accessToken} saving={saving} saveError={saveError}
              onCancel={() => { setEditing(false); setSaveError('') }} onSubmit={saveStudent} />
          : <StudentOverview student={student} initials={initials} accessToken={accessToken} />
      )}

      {/* ── ACADEMIC HISTORY ── */}
      {tab === 'Academic History' && (
        <Card className="profile-table-card">
          <SectionHeader title="Academic History" />
          {enrollLoading ? <Spinner /> : enrollments.length === 0
            ? <EmptyState message="No enrollment records found for this student." />
            : (
              <div className="profile-table">
                <div className="sp-table-head">
                  <span>Academic Year</span><span>Class</span><span>Section</span>
                  <span>Roll No.</span><span>Enrolled On</span><span>Status</span>
                </div>
                {enrollments.map((e) => (
                  <div className="sp-table-row" key={e.id}>
                    <span><strong>{e.academicYear.name}</strong></span>
                    <span>{e.classSection.grade.name}</span>
                    <span>{e.classSection.sectionName}</span>
                    <span>{e.rollNumber}</span>
                    <span>{fmtDate(e.enrolledAt)}</span>
                    <span>
                      <span className={`status-badge ${e.leftAt ? 'tone-danger' : 'tone-success'}`}>
                        {e.leftAt ? `Left ${fmtDate(e.leftAt)}` : e.academicYear.isCurrent ? 'Current' : 'Completed'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
        </Card>
      )}

      {tab === 'Timetable' && <StudentTimetable timetable={timetable} loading={timetableLoading} student={student} />}
      {tab === 'Attendance' && <StudentAttendanceCard data={attendance} loading={attendanceLoading} />}
      {tab === 'Fees' && <StudentFees invoices={fees} loading={feesLoading} />}

      {/* ── GUARDIANS ── */}
      {tab === 'Guardians' && (
        <Card className="profile-table-card">
          <SectionHeader title="Parent / Guardian" />
          {guardLoading ? <Spinner /> : guardians.length === 0
            ? <EmptyState message="No parent or guardian linked to this student yet." />
            : (
              <div className="profile-table">
                <div className="sp-table-head">
                  <span>Name</span><span>Phone</span><span>Email</span>
                </div>
                {guardians.map((g) => (
                  <div className="sp-table-row" key={g.id}>
                    <span><strong>{g.fullName}</strong></span>
                    <span>{g.phone || '—'}</span>
                    <span>{g.email || '—'}</span>
                  </div>
                ))}
              </div>
            )}
        </Card>
      )}

      {/* ── DOCUMENTS ── */}
      {tab === 'Documents' && <StudentDocuments accessToken={accessToken} studentId={student?.id ?? id} />}
    </div>
  )
}

/* ─────────────── Student Overview ─────────────── */
function StudentOverview({ student, initials, accessToken }: { student: StudentFull | null; initials: string; accessToken: string }) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const uploadPhoto = async (file: File | null, error?: string) => { setPhoto(file); setPhotoError(error ?? ''); if (!file || !student?.id || error) return; setPhotoBusy(true); try { await adminUpload(accessToken, `students/${student.id}/photo`, file) } catch (cause) { setPhotoError(cause instanceof Error ? cause.message : 'Profile picture could not be uploaded.'); setPhoto(null) } finally { setPhotoBusy(false) } }
  const d = (key: string) => fmt(student?.[key])
  const dDate = (key: string) => fmtDate(student?.[key])

  return (
    <div className="sp-overview">
      {/* hero card */}
      <Card>
        <div className="sp-hero">
          <div><div className="sp-hero-avatar">{photo ? <img src={URL.createObjectURL(photo)} alt="Student profile preview" /> : initials}</div><FileUploadField kind="image" label="Profile picture" value={photo} disabled={photoBusy} onChange={uploadPhoto} />{photoError && <p className="form-error" role="alert">{photoError}</p>}</div>
          <div className="sp-hero-info">
            <div className="sp-hero-grid">
              <div><span>Admission No.</span><strong>{d('admissionNumber')}</strong></div>
              <div><span>Session</span><strong>{d('session') || '—'}</strong></div>
              <div><span>Studying in Class</span><strong>{d('studyingInClass') || '—'}</strong></div>
              <div><span>Section</span><strong>{d('classSectionName') || '—'}</strong></div>
              <div><span>Date of Birth</span><strong>{dDate('dateOfBirth')}</strong></div>
              <div><span>Gender</span><strong>{d('gender')}</strong></div>
              <div><span>Mobile</span><strong>{d('mobileNumber')}</strong></div>
              <div><span>Email</span><strong>{d('emailAddress')}</strong></div>
              <div><span>Branch</span><strong>{student?.branch?.name ?? '—'}</strong></div>
              <div><span>Date of Admission</span><strong>{dDate('dateOfAdmission')}</strong></div>
            </div>
          </div>
        </div>
      </Card>

      {/* Identity */}
      <Card>
        <DetailSection title="Identity & Family">
          <DetailItem label="Student NIC ID"    value={d('studentNicId')} />
          <DetailItem label="Aadhar Number"     value={d('aadharNumber')} />
          <DetailItem label="SR / Admission No" value={d('srNumber')} />
          <DetailItem label="Father Name"       value={d('fatherName')} />
          <DetailItem label="Mother Name"       value={d('motherName')} />
          <DetailItem label="Social Category"   value={d('socialCategory')} />
          <DetailItem label="Religion"          value={d('religion')} />
          <DetailItem label="Mother Tongue"     value={d('motherTongue')} />
          <DetailItem label="Rural / Urban"     value={d('ruralUrban')} />
          <DetailItem label="Habitation / Locality" value={d('habitationLocality')} />
        </DetailSection>
      </Card>

      {/* Academic */}
      <Card>
        <DetailSection title="Academic & Previous Year">
          <DetailItem label="Medium of Instruction"         value={d('mediumOfInstruction')} />
          <DetailItem label="Class Studied in Prev. Year"   value={d('previousClass')} />
          <DetailItem label="Status of Previous Year (Cl.1)"value={d('previousYearStatus')} />
          <DetailItem label="Days Attended (Prev. Year)"    value={d('previousYearAttendanceDays')} />
          <DetailItem label="Last Exam — Appeared"          value={d('lastExaminationAppeared')} />
          <DetailItem label="Last Exam — Passed"            value={d('lastExaminationPassed')} />
          <DetailItem label="Last Exam — % Marks"           value={d('lastExaminationPercentage')} />
          <DetailItem label="Stream (Gr. 11 & 12)"          value={d('stream')} />
          <DetailItem label="Trade / Sector (Gr. 9–12)"     value={d('tradeSector')} />
        </DetailSection>
      </Card>

      {/* Welfare */}
      <Card>
        <DetailSection title="Welfare & Socio-Economic">
          <DetailItem label="Belongs to BPL"               value={d('belongsToBpl')} />
          <DetailItem label="Disadvantaged Group"          value={d('belongsToDisadvantagedGroup')} />
          <DetailItem label="Getting Free Education"       value={d('gettingFreeEducation')} />
          <DetailItem label="No. of Uniform Sets"          value={d('uniformSets')} />
          <DetailItem label="Free Text Books"              value={d('freeTextBooks')} />
          <DetailItem label="Free Transport"               value={d('freeTransport')} />
          <DetailItem label="Free Escort"                  value={d('freeEscort')} />
          <DetailItem label="MDM Beneficiary"              value={d('mdmBeneficiary')} />
          <DetailItem label="Free Hostel Facility"         value={d('freeHostelFacility')} />
        </DetailSection>
      </Card>

      {/* CWSN & Health */}
      <Card>
        <DetailSection title="Disability, CWSN & Health Supplements">
          <DetailItem label="Type of Disability"           value={d('disabilityType')} />
          <DetailItem label="Facilities (CWSN)"            value={d('cwsnFacilities')} />
          <DetailItem label="Attended Special Training"    value={d('attendedSpecialTraining')} />
          <DetailItem label="Iron & Folic Acid Tablets"    value={d('ironFolicAcidTablets')} />
          <DetailItem label="Deworming Tablets"            value={d('dewormingTablets')} />
          <DetailItem label="Vitamin-A Supplement"         value={d('vitaminASupplement')} />
        </DetailSection>
      </Card>
    </div>
  )
}

function StudentTimetable({ timetable, loading, student }: { timetable: StudentTimetableEntry[]; loading: boolean; student: StudentFull | null }) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  const periods = [
    ['08:00', '08:40'], ['08:40', '09:20'], ['09:35', '10:15'], ['10:15', '10:55'],
    ['11:15', '11:55'], ['11:55', '12:35'], ['12:35', '13:15'],
  ]
  return <Card className="profile-table-card">
    <SectionHeader title="Class timetable" />
    <p className="section-caption">{student?.studyingInClass || 'Current'} · {student?.classSectionName || 'Section'} · {student?.session || 'Current academic year'}</p>
    {loading ? <Spinner /> : timetable.length === 0 ? <EmptyState message="No subject-teacher timetable entries have been assigned to this student’s current section." /> : <div className="sp-timetable-wrap"><div className="sp-student-timetable">
      {days.map((day, dayIndex) => <section className="sp-timetable-day" key={day}><h3>{day}</h3>{periods.map(([start, end], periodIndex) => {
        const entry = timetable[(periodIndex + dayIndex) % timetable.length]
        return <article className={`sp-timetable-slot sp-timetable-slot--${(periodIndex + dayIndex) % 5}`} key={`${day}-${start}`}><small>{start} – {end}</small><strong>{entry.subjectName}</strong><span>{entry.teacherName}</span></article>
      })}</section>)}
    </div></div>}
  </Card>
}

function StudentFees({ invoices, loading }: { invoices: FeeInvoice[]; loading: boolean }) {
  const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })
  const totals = invoices.reduce((sum, invoice) => ({ billed: sum.billed + Number(invoice.amount), paid: sum.paid + Number(invoice.totalPaid) }), { billed: 0, paid: 0 })
  const outstanding = totals.billed - totals.paid
  return <div className="sp-overview">
    <div className="profile-summary-grid">
      <Card><DetailSection title="Total billed"><DetailItem label="All invoices" value={money.format(totals.billed)} /></DetailSection></Card>
      <Card><DetailSection title="Collected"><DetailItem label="Recorded payments" value={money.format(totals.paid)} /></DetailSection></Card>
      <Card><DetailSection title="Outstanding"><DetailItem label="Remaining balance" value={money.format(outstanding)} /></DetailSection></Card>
    </div>
    <Card className="profile-table-card"><SectionHeader title="Fee invoices" />
      {loading ? <Spinner /> : invoices.length === 0 ? <EmptyState message="No fee invoices have been created for this student." /> : <div className="profile-table"><div className="sp-table-head"><span>Invoice</span><span>Due date</span><span>Amount</span><span>Paid</span><span>Status</span></div>
        {invoices.map((invoice) => { const balance = Number(invoice.amount) - Number(invoice.totalPaid); return <div className="sp-table-row" key={invoice.id}><span><strong>{invoice.id.slice(0, 8).toUpperCase()}</strong></span><span>{fmtDate(invoice.due_date)}</span><span>{money.format(Number(invoice.amount))}</span><span>{money.format(Number(invoice.totalPaid))}</span><span><span className={`status-badge ${balance <= 0 ? 'tone-success' : Number(invoice.totalPaid) ? 'tone-warning' : 'tone-danger'}`}>{balance <= 0 ? 'Paid' : Number(invoice.totalPaid) ? 'Partial' : 'Pending'}</span></span></div> })}
      </div>}
    </Card>
  </div>
}

function StudentAttendanceCard({ data, loading }: { data: StudentAttendanceSummary | null; loading: boolean }) {
  const summary = data?.summary
  return <Card className="profile-table-card"><SectionHeader title="Attendance this month" />
    {loading ? <Spinner /> : !summary ? <EmptyState message="Attendance data could not be loaded for this student." /> : <div className="profile-summary-grid">
      <DetailSection title="Attendance rate"><DetailItem label="Present + late records" value={`${summary.attendancePercentage}%`} /></DetailSection>
      <DetailSection title="Present"><DetailItem label="Marked present" value={String(summary.present)} /></DetailSection>
      <DetailSection title="Late / excused"><DetailItem label="Recorded exceptions" value={`${summary.late} / ${summary.excused}`} /></DetailSection>
      <DetailSection title="Absent"><DetailItem label="Marked absent" value={String(summary.absent)} /></DetailSection>
      <DetailSection title="Total marks"><DetailItem label="Attendance entries" value={String(summary.total)} /></DetailSection>
    </div>}
  </Card>
}

/* ─────────────── Student Edit Form ─────────────── */
type GradeItem = { id: string; name: string }
type SectionItem = { id: string; sectionName: string; grade: { id: string; name: string }; branch: { id: string; name: string } }

function StudentEditForm({ student, accessToken, saving, saveError, onCancel, onSubmit }: {
  student: StudentFull
  accessToken: string
  saving: boolean
  saveError: string
  onCancel: () => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  const [classes, setClasses] = useState<GradeItem[]>([])
  const [sections, setSections] = useState<SectionItem[]>([])
  const [selectedClassId, setSelectedClassId] = useState('')
  const [selectedSectionId, setSelectedSectionId] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      adminRequest<{ items: GradeItem[] }>(accessToken, 'academics/classes?page=1&pageSize=100', { signal: controller.signal }),
      adminRequest<{ items: SectionItem[] }>(accessToken, 'academics/sections?page=1&pageSize=100', { signal: controller.signal }),
    ]).then(([clsData, secData]) => {
      setClasses(clsData.items)
      setSections(secData.items)
      const match = secData.items.find((s) =>
        s.grade.name === student.studyingInClass &&
        (!student.classSectionName || s.sectionName === student.classSectionName) &&
        (!student.branch?.id || s.branch.id === student.branch.id)
      )
      if (match) {
        setSelectedClassId(match.grade.id)
        setSelectedSectionId(match.id)
      } else {
        const clsMatch = clsData.items.find((c) => c.name === student.studyingInClass)
        if (clsMatch) setSelectedClassId(clsMatch.id)
      }
    }).catch(() => undefined)
    return () => controller.abort()
  }, [accessToken, student.studyingInClass, student.classSectionName, student.branch?.id])

  const matchingSections = sections.filter(
    (s) => s.grade.id === selectedClassId && (!student.branch?.id || s.branch.id === student.branch.id)
  )

  const handleClassChange = (newClassId: string) => {
    setSelectedClassId(newClassId)
    const newMatches = sections.filter(
      (s) => s.grade.id === newClassId && (!student.branch?.id || s.branch.id === student.branch.id)
    )
    if (newMatches.length === 1) {
      setSelectedSectionId(newMatches[0].id)
    } else {
      setSelectedSectionId('')
    }
  }

  const sv = (k: string) => (student[k] as string | undefined) ?? ''
  const bool2str = (v: unknown) => v === true ? 'true' : v === false ? 'false' : ''

  const TriBool = ({ name, label }: { name: string; label: string }) => (
    <label className="sp-edit-field">
      <span>{label}</span>
      <select name={name} defaultValue={bool2str(student[name])}>
        <option value="">Not specified</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
    </label>
  )

  const Field = ({ name, label, type = 'text', readOnly }: { name: string; label: string; type?: string; readOnly?: boolean }) => (
    <label className="sp-edit-field">
      <span>{label}</span>
      <input name={name} type={type} defaultValue={sv(name)} readOnly={readOnly}
        className={readOnly ? 'sp-readonly' : ''}
        onPointerDown={type === 'date' ? (e) => e.stopPropagation() : undefined}
        onClick={type === 'date' ? (e) => e.stopPropagation() : undefined} />
    </label>
  )

  const Select = ({ name, label, options }: { name: string; label: string; options: string[] }) => (
    <label className="sp-edit-field">
      <span>{label}</span>
      <select name={name} defaultValue={sv(name)}>
        <option value="">Not specified</option>
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </label>
  )

  return (
    <Card className="sp-edit-card">
      <div className="sp-edit-header">
        <SectionHeader title="Edit Student Profile" />
        <button className="button-secondary icon-only" type="button" onClick={onCancel} aria-label="Cancel editing">
          <X size={16} />
        </button>
      </div>
      <p className="section-caption">Changes are saved immediately to the database.</p>
      {saveError && <div className="inline-error" role="alert">{saveError}</div>}

      <form onSubmit={onSubmit} className="sp-edit-form">

        <h3 className="sp-edit-section-title">Basic Identity</h3>
        <div className="sp-edit-grid">
          <Field name="firstName"   label="First Name *" />
          <Field name="lastName"    label="Last Name" />
          <Field name="fatherName"  label="Father Name" />
          <Field name="motherName"  label="Mother Name" />
          <Field name="dateOfBirth" label="Date of Birth" type="date" />
          <Select name="gender" label="Gender" options={['Male', 'Female', 'Other']} />
          <Field name="studentNicId"  label="Student NIC ID" />
          <Field name="aadharNumber"  label="Aadhar Number" />
          <Field name="srNumber"      label="SR / Admission No" />
          <Field name="mobileNumber"  label="Mobile Number" type="tel" />
          <Field name="emailAddress"  label="Email Address" type="email" />
        </div>

        <h3 className="sp-edit-section-title">Social Background</h3>
        <div className="sp-edit-grid">
          <Select name="socialCategory" label="Social Category" options={['General', 'OBC', 'SC', 'ST', 'EWS']} />
          <Select name="religion" label="Religion" options={['Hindu', 'Muslim', 'Christian', 'Sikh', 'Buddhist', 'Jain', 'Other']} />
          <Field name="motherTongue"       label="Mother Tongue" />
          <Select name="ruralUrban" label="Rural / Urban" options={['Rural', 'Urban']} />
          <label className="sp-edit-field sp-span-2">
            <span>Habitation / Locality</span>
            <input name="habitationLocality" defaultValue={sv('habitationLocality')} />
          </label>
        </div>

        <h3 className="sp-edit-section-title">Class & Section Placement</h3>
        <div className="sp-edit-grid">
          <label className="sp-edit-field">
            <span>Class / Grade</span>
            <select
              value={selectedClassId}
              onChange={(e) => handleClassChange(e.target.value)}
            >
              <option value="">Select class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          {matchingSections.length > 1 ? (
            <label className="sp-edit-field">
              <span>Section</span>
              <select
                name="classSectionId"
                value={selectedSectionId}
                onChange={(e) => setSelectedSectionId(e.target.value)}
              >
                <option value="">Select section</option>
                {matchingSections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sectionName}
                  </option>
                ))}
              </select>
            </label>
          ) : matchingSections.length === 1 ? (
            <div className="auto-assigned-field">
              <span>Section</span>
              <strong>{matchingSections[0].sectionName} (assigned automatically)</strong>
              <input type="hidden" name="classSectionId" value={matchingSections[0].id} />
            </div>
          ) : (
            <div className="auto-assigned-field" style={{ borderColor: 'var(--color-warning)' }}>
              <span>Section</span>
              <strong style={{ color: 'var(--color-warning)' }}>No section created for this class</strong>
            </div>
          )}
        </div>

        <h3 className="sp-edit-section-title">Admission</h3>
        <div className="sp-edit-grid">
          <Field name="admissionNumber" label="Admission Number (read-only)" readOnly />
          <Field name="dateOfAdmission" label="Date of Admission" type="date" />
        </div>

        <h3 className="sp-edit-section-title">Previous Year Academic</h3>
        <div className="sp-edit-grid">
          <Select name="mediumOfInstruction" label="Medium of Instruction"
            options={['English','Hindi','Bengali','Telugu','Marathi','Tamil','Urdu','Gujarati','Kannada','Odia','Malayalam','Punjabi','Other']} />
          <Field name="previousClass" label="Class Studied in Prev. Year" />
          <Select name="previousYearStatus" label="Prev. Year Status (Class 1)"
            options={['Pre-primary','Home-schooled','Never enrolled']} />
          <Field name="previousYearAttendanceDays" label="Days Attended (Prev. Year)" type="number" />
          <TriBool name="lastExaminationAppeared" label="Last Exam — Appeared" />
          <TriBool name="lastExaminationPassed"   label="Last Exam — Passed" />
          <Field name="lastExaminationPercentage" label="Last Exam — % Marks" type="number" />
          <Select name="stream" label="Stream (Gr. 11 & 12)"
            options={['Science','Commerce','Arts / Humanities','Vocational']} />
          <Field name="tradeSector" label="Trade / Sector (Gr. 9–12)" />
        </div>

        <h3 className="sp-edit-section-title">Welfare</h3>
        <div className="sp-edit-grid">
          <TriBool name="belongsToBpl"               label="Belongs to BPL" />
          <TriBool name="belongsToDisadvantagedGroup" label="Disadvantaged Group" />
          <TriBool name="gettingFreeEducation"        label="Getting Free Education" />
          <label className="sp-edit-field">
            <span>No. of Uniform Sets</span>
            <input name="uniformSets" type="number" min={0} defaultValue={String(student.uniformSets ?? '')} />
          </label>
          <TriBool name="freeTextBooks"      label="Free Text Books" />
          <TriBool name="freeTransport"      label="Free Transport" />
          <TriBool name="freeEscort"         label="Free Escort" />
          <TriBool name="mdmBeneficiary"     label="MDM Beneficiary" />
          <TriBool name="freeHostelFacility" label="Free Hostel Facility" />
        </div>

        <h3 className="sp-edit-section-title">Disability & Health</h3>
        <div className="sp-edit-grid">
          <Select name="disabilityType" label="Type of Disability"
            options={['Visual Impairment','Hearing Impairment','Locomotor Disability','Intellectual Disability','Learning Disability','Autism Spectrum','Multiple Disabilities','Other']} />
          <label className="sp-edit-field sp-span-2">
            <span>Facilities (CWSN)</span>
            <input name="cwsnFacilities" defaultValue={sv('cwsnFacilities')} />
          </label>
          <TriBool name="attendedSpecialTraining" label="Attended Special Training" />
          <TriBool name="ironFolicAcidTablets"    label="Iron & Folic Acid Tablets" />
          <TriBool name="dewormingTablets"         label="Deworming Tablets" />
          <TriBool name="vitaminASupplement"       label="Vitamin-A Supplement" />
        </div>

        <div className="sp-edit-actions">
          <button type="button" className="button-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="button-primary" disabled={saving}>
            {saving ? 'Saving…' : <><Save size={15} /> Save changes</>}
          </button>
        </div>
      </form>
    </Card>
  )
}

/* ─────────────── Student Documents ─────────────── */
function StudentDocuments({ accessToken, studentId }: { accessToken: string; studentId?: string }) {
  const [documents, setDocuments] = useState([
    { id: 'aadhar',    name: 'Aadhar Card',         date: '—', status: 'Missing', meta: 'Upload PDF or image' },
    { id: 'birth',     name: 'Birth Certificate',    date: '—', status: 'Missing', meta: 'Upload PDF or image' },
    { id: 'transfer',  name: 'Transfer Certificate', date: '—', status: 'Missing', meta: 'Upload PDF or image' },
    { id: 'marksheet', name: 'Previous Marksheet',   date: '—', status: 'Missing', meta: 'Upload PDF or image' },
    { id: 'bpl',       name: 'BPL / Category Certificate', date: '—', status: 'Missing', meta: 'Upload PDF or image' },
  ])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState('')
  const upload = async (file: File | null, docId: string, validationError?: string) => {
    setError(validationError ?? '')
    if (!file || !studentId || validationError) return
    setUploading(docId)
    try { await adminUpload(accessToken, `students/${studentId}/documents`, file, { documentType: docId }); setDocuments((curr) => curr.map((doc) => doc.id === docId ? { ...doc, date: new Date().toLocaleDateString(), status: 'Pending review', meta: `${file.type || 'File'} · ${Math.ceil(file.size / 1024)} KB` } : doc)) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.') }
    finally { setUploading('') }
  }
  return (
    <Card className="profile-table-card">
      <SectionHeader title="Documents" />
      <p className="section-caption">Upload identity, admission, and category documents. Pending files are reviewed by admin.</p>
      <div className="profile-table">
        <div className="sp-table-head">
          <span>Document</span><span>File Info</span><span>Status</span><span>Actions</span>
        </div>
        {documents.map((doc) => (
          <div className="sp-table-row" key={doc.id}>
            <span><FileText size={15} /> {doc.name}</span>
            <span>{doc.date}<small>{doc.meta}</small></span>
            <span className={`status-badge ${doc.status === 'Verified' ? 'tone-success' : doc.status === 'Missing' ? 'tone-danger' : 'tone-warning'}`}>
              {doc.status}
            </span>
            <span className="document-actions">
              <FileUploadField kind="document" label="Upload" disabled={uploading === doc.id} onChange={(file, cause) => void upload(file, doc.id, cause)} />
              <button className="button-secondary btn-sm" type="button" aria-label={`Preview ${doc.name}`} disabled={doc.status === 'Missing'}>
                <Eye size={14} />
              </button>
              <button className="button-secondary btn-sm" type="button" aria-label={`Download ${doc.name}`} disabled={doc.status === 'Missing'}>
                <Download size={14} />
              </button>
            </span>
          </div>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Card>
  )
}

/* ═══════════════════════════════════════════════
   STAFF PROFILE  (kept from original, untouched)
════════════════════════════════════════════════ */
function StaffProfilePage({ id, accessToken, onBack }: { id?: string; accessToken: string; onBack: () => void }) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const [tab, setTab] = useState(
    requestedTab
      ? requestedTab.split('-').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      : 'Overview',
  )

  type StaffRec = Record<string, unknown>
  const [person, setPerson] = useState({ name: 'Staff Member', status: 'Active', badge: 'Teacher', phone: '', email: '' })
  const [staffRecord, setStaffRecord] = useState<StaffRec | null>(null)
  const [staffUserId, setStaffUserId] = useState('')
  const [assignments, setAssignments] = useState<TeachingAssignment[]>([])
  const [roleAssignments, setRoleAssignments] = useState<Array<{ roleName: string; branchName: string; validUntil: string }>>([])
  const [sections, setSections] = useState<Array<{ id: string; label: string; gradeId?: string }>>([])
  const [classes, setClasses] = useState<Array<{ id: string; name: string }>>([])
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [allSubjects, setAllSubjects] = useState<Array<{ id: string; name: string }>>([])
  const [mappingOpen, setMappingOpen] = useState(false)
  const [mappingSection, setMappingSection] = useState('')
  const [mappingClass, setMappingClass] = useState('')
  const [mappingSubject, setMappingSubject] = useState('')
  const [mappingError, setMappingError] = useState('')
  const [mappingLoading, setMappingLoading] = useState(false)
  const [editingStaff, setEditingStaff] = useState(false)
  const [profileLoading, setProfileLoading] = useState(true)
  // Published timetable data for this teacher
  type TimetableSlot = { day: string; period: number; startTime: string | null; endTime: string | null; className: string; subjectName: string; roomName: string; classId: string; subjectId: string; roomId: string }
  type PublishedTimetable = { timetableRecordId: string; timetableTitle: string; timetableUpdatedAt: string | null; workingDays: string[]; periods: Array<{ number: number; type?: string; start: string; end: string }>; slots: TimetableSlot[] } | null
  const [publishedTimetable, setPublishedTimetable] = useState<PublishedTimetable>(null)
  const [timetableLoading, setTimetableLoading] = useState(false)

  const tabs = ['Overview', 'Timetable', 'Classes & Subjects', 'Roles & Permissions', 'Attendance', 'Salary', 'Documents']

  useEffect(() => {
    setProfileLoading(true)
    void adminRequest<{ items: StaffRec[] }>(accessToken, 'staff?page=1&pageSize=100').then((result) => {
      const match = result.items.find((item) => item.id === id) ?? result.items[0]
      if (!match) return
      setStaffRecord(match)
      // SubjectTeacherAssignment.teacher is the identity user, while the
      // staff endpoint's primary id is the StaffProfile id.
      setStaffUserId(String(match.userId ?? match.id ?? ''))
      setPerson({ name: String(match.fullName ?? 'Staff Member'), status: humanize(String(match.status ?? 'Active')), badge: humanize(String(match.role ?? 'Teacher')), phone: String(match.phone ?? ''), email: String(match.email ?? '') })
    }).catch(() => undefined).finally(() => setProfileLoading(false))
  }, [accessToken, id])

  useEffect(() => {
    if (!staffUserId) return
    type AssignmentRow = { id: string; teacher?: { id?: string }; subject?: { id: string; name: string }; classSectionId: string; classSection?: { label?: string }; classSectionLabel?: string }
    const mapAssignments = (items: AssignmentRow[]) => items
      .filter((item) => !item.teacher?.id || item.teacher.id === staffUserId || item.teacher.id === String(id))
      .map((item) => ({ id: item.id, classSectionId: item.classSectionId, sectionLabel: item.classSection?.label ?? item.classSectionLabel ?? item.classSectionId, subjectId: item.subject?.id ?? '', subjectName: item.subject?.name ?? 'Subject', academicYear: '—' }))
    void adminRequest<{ items: AssignmentRow[] }>(accessToken, `academics/section-subject-teachers?teacherId=${encodeURIComponent(staffUserId)}&page=1&pageSize=100`)
      .then((result) => result.items.length ? setAssignments(mapAssignments(result.items)) : adminRequest<{ items: AssignmentRow[] }>(accessToken, 'academics/section-subject-teachers?page=1&pageSize=100').then((all) => setAssignments(mapAssignments(all.items))))
      .catch(() => undefined)
    void adminRequest<{ items: Array<{ userId?: string; roleName?: string; branchId?: string | null; validUntil?: string | null; isActive?: boolean }> }>(accessToken, `role-assignments?userId=${staffUserId}&isActive=true&pageSize=100`).then((result) => setRoleAssignments(result.items.filter((item) => item.isActive !== false).map((item) => ({ roleName: humanize(item.roleName ?? 'Role'), branchName: item.branchId ? 'Branch scope' : 'All branches', validUntil: item.validUntil ? new Date(item.validUntil).toLocaleDateString() : 'Permanent' })))).catch(() => undefined)
    void adminRequest<{ items: Array<{ id: string; sectionName: string; grade?: { id: string; name: string }; academicYear?: { name: string } }> }>(accessToken, 'academics/sections?page=1&pageSize=100').then((result) => {
      const loaded = result.items.map((item) => ({ id: item.id, gradeId: item.grade?.id, label: `${item.grade?.name ?? 'Class'} – ${item.sectionName}` }))
      setSections(loaded)
      setAssignments((curr) => curr.map((item) => ({ ...item, sectionLabel: loaded.find((s) => s.id === item.classSectionId)?.label ?? item.sectionLabel })))
    }).catch(() => undefined)
    void adminRequest<{ items: Array<{ id: string; name: string }> }>(accessToken, 'academics/subjects?page=1&pageSize=100').then((result) => { setAllSubjects(result.items); setSubjects(result.items) }).catch(() => undefined)
    void adminRequest<{ items: Array<{ id: string; name: string }> }>(accessToken, 'academics/classes?page=1&pageSize=100').then((result) => setClasses(result.items)).catch(() => undefined)
  }, [accessToken, staffUserId])

  // Fetch published timetable for this staff member
  useEffect(() => {
    if (!staffRecord?.id) return
    setTimetableLoading(true)
    // Pass branch context so the backend can match branch-scoped timetables
    const params = new URLSearchParams()
    const branchId = staffRecord?.branch?.id ?? staffRecord?.branchId
    if (branchId) params.set('branchId', String(branchId))
    void adminRequest<{ data: PublishedTimetable }>(accessToken, `staff/${String(staffRecord.id)}/timetable?${params}`)
      .then((result) => setPublishedTimetable(result.data))
      .catch(() => setPublishedTimetable(null))
      .finally(() => setTimetableLoading(false))
  }, [accessToken, staffRecord?.id, staffRecord?.branch?.id, staffRecord?.branchId])

  useEffect(() => {
    if (!mappingClass) { setSubjects(allSubjects); return }
    void adminRequest<{ items: Array<{ subject?: { id: string; name: string } }> }>(accessToken, `academics/class-subjects?classId=${mappingClass}&page=1&pageSize=100`).then((result) => setSubjects(result.items.flatMap((item) => item.subject ? [item.subject] : []))).catch(() => setSubjects(allSubjects))
  }, [accessToken, allSubjects, mappingClass])

  const addMapping = async () => {
    if (!staffUserId || !mappingClass || !mappingSubject) { setMappingError('Select a class and subject.'); return }
    setMappingError('')
    try {
      await adminRequest(accessToken, 'academics/section-subject-teachers', { method: 'POST', body: JSON.stringify({ classId: mappingClass, ...(mappingSection ? { classSectionId: mappingSection } : {}), subjectId: mappingSubject, teacherId: staffUserId }) })
      const section = sections.find((s) => s.id === mappingSection)
      const subject = subjects.find((s) => s.id === mappingSubject)
      setAssignments((curr) => [...curr, { id: `local-${Date.now()}`, classSectionId: mappingSection, sectionLabel: section?.label ?? mappingSection, subjectId: mappingSubject, subjectName: subject?.name ?? 'Subject', academicYear: '—' }])
      setMappingOpen(false); setMappingSection(''); setMappingSubject('')
    } catch (cause) { setMappingError(cause instanceof Error ? cause.message : 'Mapping could not be saved.') }
  }

  const openMapping = async () => {
    setMappingOpen(true); setMappingError(''); setMappingLoading(true)
    try {
      const [cr, sr, sub] = await Promise.all([
        adminRequest<{ items: Array<{ id: string; name: string }> }>(accessToken, 'academics/classes?page=1&pageSize=100'),
        adminRequest<{ items: Array<{ id: string; sectionName: string; grade?: { id: string; name: string } }> }>(accessToken, 'academics/sections?page=1&pageSize=100'),
        adminRequest<{ items: Array<{ id: string; name: string }> }>(accessToken, 'academics/subjects?page=1&pageSize=100'),
      ])
      setClasses(cr.items); setSections(sr.items.map((s) => ({ id: s.id, gradeId: s.grade?.id, label: `${s.grade?.name ?? 'Class'} – ${s.sectionName}` }))); setAllSubjects(sub.items); setSubjects(sub.items)
    } catch (cause) { setMappingError(cause instanceof Error ? cause.message : 'Data could not be loaded.') } finally { setMappingLoading(false) }
  }

  const switchTab = (name: string) => {
    setTab(name)
    const next = new URLSearchParams(searchParams)
    next.set('tab', name.toLowerCase().replaceAll(' ', '-'))
    setSearchParams(next)
  }

  const selectedClassSections = sections.filter((s) => s.gradeId === mappingClass)

  if (profileLoading) return <Spinner />

  return (
    <div className="profile-page">
      <div className="profile-page-header">
        <div>
          <button className="profile-back" type="button" onClick={onBack}><ArrowLeft /> People / Staff</button>
          <h1>{person.name} <span className="profile-status">{person.status}</span> <span className="profile-badge">{person.badge}</span></h1>
        </div>
        <div className="profile-actions">
          <button className="button-secondary" type="button" onClick={() => setEditingStaff(true)}><Edit3 size={15} /> Edit Profile</button>
          <button className="button-secondary icon-only" type="button" aria-label="More"><MoreHorizontal /></button>
        </div>
      </div>

      <div className="profile-tabs" role="tablist">
        {tabs.map((name) => <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => switchTab(name)}>{name}</button>)}
      </div>

      {editingStaff && staffRecord
        ? <StaffEditForm accessToken={accessToken} staff={staffRecord} onCancel={() => setEditingStaff(false)}
            onSaved={(updated) => { setStaffRecord(updated); setPerson({ name: String(updated.fullName ?? person.name), status: humanize(String(updated.status ?? person.status)), badge: humanize(String(updated.role ?? person.badge)), phone: String(updated.phone ?? person.phone), email: String(updated.email ?? person.email) }); setEditingStaff(false) }} />
        : <>
          {tab === 'Overview' && <StaffOverview staff={staffRecord} person={person} assignments={assignments} accessToken={accessToken} />}
          {tab === 'Timetable' && <StaffTimetable staff={staffRecord} assignments={assignments} publishedTimetable={publishedTimetable} loading={timetableLoading} onOpenTimetable={() => navigate('/timetable')} />}
          {tab === 'Classes & Subjects' && (
            <Card className="profile-table-card">
              <SectionHeader title="Classes & Subjects" action={<button className="button-primary button-small" type="button" disabled={mappingLoading} onClick={() => void openMapping()}>{mappingLoading ? 'Loading…' : '+ Add class & subject'}</button>} />
              {mappingOpen && (
                <div className="mapping-form">
                  <label>Class<select value={mappingClass} onChange={(e) => { setMappingClass(e.target.value); setMappingSection(''); setMappingSubject(''); setMappingError('') }}><option value="">{classes.length ? 'Select class' : 'No classes'}</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                  {selectedClassSections.length > 0 && <label>Section<select value={mappingSection} disabled={!mappingClass} onChange={(e) => { setMappingSection(e.target.value); setMappingError('') }}><option value="">Select section</option>{selectedClassSections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
                  <label>Subject<select value={mappingSubject} disabled={!mappingClass} onChange={(e) => { setMappingSubject(e.target.value); setMappingError('') }}><option value="">Select subject</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
                  <button className="button-primary" type="button" disabled={!staffUserId || !mappingClass || !mappingSubject || (selectedClassSections.length > 0 && !mappingSection)} onClick={() => void addMapping()}>Save</button>
                  {mappingError && <p className="inline-error" role="alert">{mappingError}</p>}
                </div>
              )}
              <div className="profile-table">
                <div className="sp-table-head"><span>Class-Section</span><span>Subject</span><span>Academic Year</span><span>Actions</span></div>
                {assignments.length ? assignments.map((row) => (
                  <div className="sp-table-row" key={row.id}>
                    <span>{row.sectionLabel}</span><span>{row.subjectName}</span><span>{row.academicYear}</span>
                    <span><button className="button-secondary btn-sm" type="button" onClick={() => void adminRequest(accessToken, `academics/section-subject-teachers/${row.id}`, { method: 'DELETE' }).then(() => setAssignments((curr) => curr.filter((a) => a.id !== row.id)))}>Remove</button></span>
                  </div>
                )) : <div className="sp-table-row"><span>No classroom assignments yet.</span><span /><span /><span /></div>}
              </div>
            </Card>
          )}
          {tab === 'Roles & Permissions' && (
            <Card className="profile-table-card">
              <SectionHeader title="Roles & Permissions" action={<button className="button-primary button-small" type="button" onClick={() => navigate(`/roles/assignments?user=${encodeURIComponent(staffRecord?.userId as string ?? id ?? '')}`)}>Manage roles</button>} />
              <div className="profile-table">
                <div className="sp-table-head"><span>Role</span><span>Scope</span><span>Valid Until</span></div>
                {(roleAssignments.length ? roleAssignments : [{ roleName: 'No role assignments found', branchName: '—', validUntil: '—' }]).map((row) => (
                  <div className="sp-table-row" key={`${row.roleName}-${row.branchName}`}><span>{row.roleName}</span><span>{row.branchName}</span><span>{row.validUntil}</span></div>
                ))}
              </div>
            </Card>
          )}
          {tab === 'Attendance' && <AttendanceCard accessToken={accessToken} staffUserId={staffUserId} />}
          {tab === 'Salary' && <StaffSalary staff={staffRecord} />}
          {tab === 'Documents' && <StaffDocuments accessToken={accessToken} staffId={typeof staffRecord?.id === 'string' ? staffRecord.id : id} />}
        </>}
    </div>
  )
}

function StaffOverview({ staff, person, assignments, accessToken }: { staff: Record<string, unknown> | null; person: { name: string; status: string; badge: string; phone: string; email: string }; assignments: TeachingAssignment[]; accessToken: string }) {
  const [photo, setPhoto] = useState<File | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const uploadPhoto = async (file: File | null, error?: string) => { setPhoto(file); setPhotoError(error ?? ''); if (!file || typeof staff?.id !== 'string' || error) return; setPhotoBusy(true); try { await adminUpload(accessToken, `staff/${staff.id}/photo`, file) } catch (cause) { setPhotoError(cause instanceof Error ? cause.message : 'Profile picture could not be uploaded.'); setPhoto(null) } finally { setPhotoBusy(false) } }
  const value = (key: string) => fmt(staff?.[key])
  const days = Array.isArray(staff?.availableDays) ? (staff?.availableDays as string[]) : []
  const periods = Array.isArray(staff?.availablePeriods) ? (staff?.availablePeriods as number[]) : []
  const branch = staff?.branch as { name?: string } | null | undefined
  const subjectCount = new Set(assignments.map((assignment) => assignment.subjectId)).size
  const sectionCount = new Set(assignments.map((assignment) => assignment.classSectionId)).size
  const weeklyLoad = Number(staff?.weeklyLoad ?? 0)
  const attendance = staff?.attendancePct === null || staff?.attendancePct === undefined ? '—' : `${staff.attendancePct}%`
  const savedPhotoUrl = typeof staff?.profilePhotoUrl === 'string' ? staff.profilePhotoUrl : null
  const photoUrl = photo ? URL.createObjectURL(photo) : savedPhotoUrl
  return <div className="profile-overview">
    <Card>
      <div className="profile-identity">
        <div><div className="profile-avatar">{photoUrl ? <img src={photoUrl} alt="Staff profile" /> : <UserRound size={28} />}</div><FileUploadField kind="image" label="Profile picture" value={photo} disabled={photoBusy} onChange={uploadPhoto} />{photoError && <p className="form-error" role="alert">{photoError}</p>}</div>
        <div className="profile-details profile-details-wide">
          <div><span>Employee code</span><strong>{value('employee_code')}</strong></div>
          <div><span>Work email</span><strong>{person.email || '—'}</strong></div>
          <div><span>Phone</span><strong>{person.phone || '—'}</strong></div>
          <div><span>Branch</span><strong>{branch?.name ?? 'Institute-wide'}</strong></div>
          <div><span>Department</span><strong>{value('department')}</strong></div>
          <div><span>Role</span><strong>{person.badge}</strong></div>
          <div><span>Weekly load</span><strong>{weeklyLoad ? `${weeklyLoad} periods` : '—'}</strong></div>
          <div><span>Attendance</span><strong>{attendance}</strong></div>
          <div><span>Account status</span><strong>{person.status}</strong></div>
        </div>
      </div>
    </Card>
    <div className="profile-summary-grid">
      <Card><DetailSection title="Employment details">
        <DetailItem label="Employment type" value={humanize(String(staff?.employmentType ?? '—'))} />
        <DetailItem label="Employee code" value={value('employee_code')} />
        <DetailItem label="Assigned branch" value={branch?.name ?? 'Institute-wide'} />
        <DetailItem label="Department" value={value('department')} />
        <DetailItem label="Staff role" value={person.badge} />
      </DetailSection></Card>
      <Card><DetailSection title="Teaching availability">
        <DetailItem label="Working days" value={days.length ? days.map((day) => WEEKDAY_LABELS[day] ?? day).join(', ') : '—'} />
        <DetailItem label="Available periods" value={periods.length ? periods.map((period) => `P${period}`).join(', ') : '—'} />
        <DetailItem label="Maximum periods / day" value={value('maxPeriodsPerDay')} />
        <DetailItem label="Maximum periods / week" value={value('maxPeriodsPerWeek')} />
      </DetailSection></Card>
    </div>
    <Card><DetailSection title="Current teaching allocation">
      <DetailItem label="Class-subject assignments" value={String(assignments.length)} />
      <DetailItem label="Classes / sections" value={String(sectionCount)} />
      <DetailItem label="Subjects taught" value={String(subjectCount)} />
      <DetailItem label="Timetable status" value={assignments.length ? 'Ready for timetable allocation' : 'No assignments yet'} />
    </DetailSection></Card>
    <div className="profile-summary-grid">
      <Card><DetailSection title="Profile details">
        <DetailItem label="Father’s name" value={value('fatherName')} />
        <DetailItem label="Mother’s name" value={value('motherName')} />
        <DetailItem label="Date of birth" value={fmtDate(staff?.dateOfBirth)} />
        <DetailItem label="Gender" value={value('gender')} />
        <DetailItem label="Blood group" value={value('bloodGroup')} />
        <DetailItem label="Marital status" value={value('maritalStatus')} />
        <DetailItem label="Qualification" value={value('qualification')} />
        <DetailItem label="Experience" value={staff?.experienceYears ? `${staff.experienceYears} years` : '—'} />
      </DetailSection></Card>
      <Card><DetailSection title="Work & identification">
        <DetailItem label="PAN / ID number" value={value('panOrIdNumber')} />
        <DetailItem label="Date of joining" value={fmtDate(staff?.dateOfJoining)} />
        <DetailItem label="Contract type" value={humanize(String(staff?.employmentType ?? '—'))} />
        <DetailItem label="Shift" value={value('shift')} />
        <DetailItem label="Work location" value={value('workLocation')} />
        <DetailItem label="Transport / hostel" value="Not configured in CampusOne" />
      </DetailSection></Card>
    </div>
    <div className="profile-summary-grid">
      <Card><DetailSection title="Address">
        <DetailItem label="Current address" value={value('currentAddress')} />
        <DetailItem label="Permanent address" value={value('permanentAddress')} />
      </DetailSection></Card>
      <Card><DetailSection title="Previous school details">
        <DetailItem label="School name" value={value('previousSchoolName')} />
        <DetailItem label="School address" value={value('previousSchoolAddress')} />
        <DetailItem label="Phone number" value={value('previousSchoolPhone')} />
      </DetailSection></Card>
    </div>
  </div>
}

function StaffTimetable({ staff, assignments, publishedTimetable, loading, onOpenTimetable }: { staff: Record<string, unknown> | null; assignments: TeachingAssignment[]; publishedTimetable: { timetableRecordId: string; timetableTitle: string; timetableUpdatedAt: string | null; workingDays: string[]; periods: Array<{ number: number; type?: string; start: string; end: string }>; slots: Array<{ day: string; period: number; startTime: string | null; endTime: string | null; className: string; subjectName: string; roomName: string; classId: string; subjectId: string; roomId: string }> } | null; loading: boolean; onOpenTimetable: () => void }) {
  const timetableAssignments = assignments.length ? assignments : (Array.isArray(staff?.teachingAssignments) ? (staff.teachingAssignments as TeachingAssignment[]) : [])
  const breakCards = STAFF_BREAKS

  const hasPublishedTimetable = publishedTimetable && publishedTimetable.slots && publishedTimetable.slots.length > 0
  const workingDays = hasPublishedTimetable ? publishedTimetable.workingDays : (Array.isArray(staff?.availableDays) ? (staff.availableDays as string[]) : [])
  const visibleDays = workingDays.length ? workingDays : ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
  const periods = hasPublishedTimetable ? publishedTimetable.periods : STAFF_TIMETABLE_SLOTS.map((s) => ({ number: s.period, start: s.time.split(' – ')[0] || '', end: s.time.split(' – ')[1]?.replace(' AM', '').replace(' PM', '') || '' }))

  // Build a lookup map: day -> period -> slot
  const slotMap: Record<string, Record<number, typeof publishedTimetable extends { slots: Array<infer T> } ? T : never>> = {}
  if (hasPublishedTimetable) {
    for (const slot of publishedTimetable.slots) {
      if (!slotMap[slot.day]) slotMap[slot.day] = {}
      slotMap[slot.day][slot.period] = slot
    }
  }

  return <div className="profile-overview">
    <Card className="profile-table-card">
      <SectionHeader title="Time Table" action={<button className="button-secondary button-small" type="button" onClick={onOpenTimetable}>Open timetable builder</button>} />
      {loading
        ? <p className="section-caption">Loading published timetable…</p>
        : hasPublishedTimetable
          ? <p className="section-caption" style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>Synced from published timetable — <span className="status-badge tone-success">Published</span> {publishedTimetable.timetableTitle && <span style={{ opacity: .65 }}>· {publishedTimetable.timetableTitle}</span>} {publishedTimetable.timetableUpdatedAt && <span style={{ opacity: .55 }}>· {new Date(publishedTimetable.timetableUpdatedAt).toLocaleDateString()}</span>}</p>
          : <p className="section-caption">No published timetable found. Assign subjects and publish a timetable to see the teacher's weekly schedule here.</p>
      }
      <div className="staff-timetable-grid">
        {visibleDays.map((day, dayIndex) => (
          <div className="staff-day-column" key={day}>
            <div className="staff-day-title">{WEEKDAY_LABELS[day] ?? day}</div>
            <div className="staff-day-cards">
              {periods.map((periodDef, periodIndex) => {
                const periodNumber = typeof periodDef === 'object' ? periodDef.number : periodDef
                const slot = hasPublishedTimetable ? (slotMap[day]?.[periodNumber as number]) : null

                if (hasPublishedTimetable && slot) {
                  const periodObj = periodDef as { number: number; type?: string; start: string; end: string }
                  const timeLabel = periodObj.start && periodObj.end ? `${periodObj.start} – ${periodObj.end}` : `Period ${periodObj.number}`
                  return (
                    <div className="staff-slot-card staff-slot-card--filled" key={`${day}-${periodObj.number}`}>
                      <span className="staff-slot-badge">Room: {slot.roomName || String(staff?.workLocation ?? 'Assigned room')}</span>
                      <div className="staff-slot-divider" />
                      <div className="staff-slot-meta">Class : {slot.className || '—'}</div>
                      <div className="staff-slot-meta">Subject : {slot.subjectName || '—'}</div>
                      <div className="staff-slot-time">{timeLabel}</div>
                    </div>
                  )
                }

                // Fallback: use assignment cycling when no published timetable
                const assignment = timetableAssignments.length ? timetableAssignments[(dayIndex * periods.length + periodIndex) % timetableAssignments.length] : null
                const roomLabel = String(staff?.workLocation ?? 'Assigned room')
                return (
                  <div className="staff-slot-card" key={`${day}-${typeof periodDef === 'object' ? (periodDef as { number: number }).number : periodIndex}`}>
                    <span className="staff-slot-badge">Room: {roomLabel}</span>
                    <div className="staff-slot-divider" />
                    <div className="staff-slot-meta">Class : {assignment?.sectionLabel ?? '—'}</div>
                    <div className="staff-slot-meta">Subject : {assignment?.subjectName ?? '—'}</div>
                    <div className="staff-slot-time">{typeof periodDef === 'object' ? `${(periodDef as { start: string; end: string }).start} – ${(periodDef as { start: string; end: string }).end}` : (STAFF_TIMETABLE_SLOTS[periodIndex]?.time ?? '')}</div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="staff-break-grid">
        {breakCards.map((breakItem) => (
          <div className={`staff-break-card ${breakItem.tone}`} key={breakItem.title}>
            <strong>{breakItem.title}</strong>
            <span>{breakItem.time}</span>
          </div>
        ))}
      </div>
    </Card>
    <Card className="profile-table-card">
      <SectionHeader title="Classes scheduled for allocation" />
      <div className="profile-table">
        <div className="sp-table-head"><span>Class-section</span><span>Subject</span><span>Assignment status</span></div>
        {timetableAssignments.length
          ? timetableAssignments.map((assignment) => {
              const isScheduled = hasPublishedTimetable && publishedTimetable.slots.some((s) => s.classId === assignment.classSectionId && s.subjectId === assignment.subjectId)
              return (
                <div className="sp-table-row" key={assignment.id}>
                  <span>{assignment.sectionLabel}</span>
                  <span>{assignment.subjectName}</span>
                  <span><span className={`status-badge ${isScheduled ? 'tone-success' : 'tone-info'}`}>{isScheduled ? 'Scheduled' : 'Available to schedule'}</span></span>
                </div>
              )
            })
          : <div className="sp-table-row"><span>No class-subject assignments yet.</span><span /><span /></div>}
      </div>
    </Card>
  </div>
}

function StaffSalary({ staff }: { staff: Record<string, unknown> | null }) {
  const monthly = staff?.monthlySalary
  const currency = String(staff?.salaryCurrency ?? 'INR')
  const hasSalary = monthly !== null && monthly !== undefined && monthly !== ''
  const formattedSalary = hasSalary ? new Intl.NumberFormat('en-IN', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(monthly)) : 'Not configured'
  return <div className="profile-overview">
    <Card><div className="staff-salary-highlight"><div><span>Monthly salary</span><strong>{formattedSalary}</strong><small>{hasSalary ? `${humanize(String(staff?.payFrequency ?? 'MONTHLY'))} pay frequency` : 'Add compensation details from Edit Profile.'}</small></div><span className={`status-badge ${hasSalary ? 'tone-success' : 'tone-warning'}`}>{hasSalary ? 'Configured' : 'Needs setup'}</span></div></Card>
    <Card><DetailSection title="Compensation & bank details">
      <DetailItem label="Employee code" value={fmt(staff?.employee_code)} />
      <DetailItem label="Salary currency" value={currency} />
      <DetailItem label="Pay frequency" value={humanize(String(staff?.payFrequency ?? '—'))} />
      <DetailItem label="Bank name" value={fmt(staff?.bankName)} />
      <DetailItem label="Account number" value={staff?.bankAccountLast4 ? `•••• ${staff.bankAccountLast4}` : '—'} />
      <DetailItem label="IFSC code" value={fmt(staff?.bankIfsc)} />
    </DetailSection></Card>
  </div>
}

/* ─────────────── Staff Edit Form (unchanged from original) ─────────────── */
function StaffEditForm({ accessToken, staff, onCancel, onSaved }: { accessToken: string; staff: Record<string, unknown>; onCancel: () => void; onSaved: (staff: Record<string, unknown>) => void }) {
  const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const [staffRoles, setStaffRoles] = useState<Role[]>([])
  const [selectedRole, setSelectedRole] = useState(String(staff.role ?? 'TEACHER'))
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const [selectedDays, setSelectedDays] = useState<string[]>(Array.isArray(staff.availableDays) ? staff.availableDays as string[] : days.slice(0, 6))
  const [periods, setPeriods] = useState<number[]>(Array.isArray(staff.availablePeriods) ? staff.availablePeriods as number[] : [1, 2, 3, 4, 5, 6, 7, 8])
  useEffect(() => {
    const controller = new AbortController()
    void listAllRoles(accessToken, { signal: controller.signal }).then((roles) => {
      const active = roles.filter((role) => role.isActive && (!role.isSystemRole || ['TEACHER', 'STAFF'].includes(role.name.toUpperCase())))
      setStaffRoles(active)
      const match = active.find((role) => role.name.toLowerCase() === String(staff.role ?? '').toLowerCase())
      if (match) setSelectedRole(match.isSystemRole ? match.name.toUpperCase() : `CUSTOM:${match.id}`)
    }).catch(() => { if (!controller.signal.aborted) setStaffRoles([]) })
    return () => controller.abort()
  }, [accessToken, staff.role])
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true); setError('')
    try {
      const salary = String(form.get('monthlySalary') ?? '').trim()
      const selected = String(form.get('role') ?? selectedRole)
      const customRoleId = selected.startsWith('CUSTOM:') ? selected.slice('CUSTOM:'.length) : undefined
      const payload: Record<string, unknown> = { fullName: form.get('fullName'), email: form.get('email'), role: customRoleId ? 'staff' : selected.toLowerCase(), ...(customRoleId ? { roleId: customRoleId } : {}), phone: form.get('phone'), department: form.get('department'), employmentType: form.get('employmentType'), availableDays: selectedDays, availablePeriods: periods, maxPeriodsPerDay: Number(form.get('maxPeriodsPerDay')), maxPeriodsPerWeek: Number(form.get('maxPeriodsPerWeek')), monthlySalary: salary ? Number(salary) : null, salaryCurrency: form.get('salaryCurrency'), payFrequency: form.get('payFrequency'), bankName: form.get('bankName'), bankBranch: form.get('bankBranch'), bankAccountLast4: form.get('bankAccountLast4'), bankIfsc: form.get('bankIfsc'), dateOfJoining: form.get('dateOfJoining') || null, dateOfBirth: form.get('dateOfBirth') || null, gender: form.get('gender'), bloodGroup: form.get('bloodGroup'), qualification: form.get('qualification'), experienceYears: form.get('experienceYears') ? Number(form.get('experienceYears')) : null, maritalStatus: form.get('maritalStatus'), fatherName: form.get('fatherName'), motherName: form.get('motherName'), panOrIdNumber: form.get('panOrIdNumber'), currentAddress: form.get('currentAddress'), permanentAddress: form.get('permanentAddress'), previousSchoolName: form.get('previousSchoolName'), previousSchoolAddress: form.get('previousSchoolAddress'), previousSchoolPhone: form.get('previousSchoolPhone'), shift: form.get('shift'), workLocation: form.get('workLocation') }
      const branchId = form.get('branchId') || (staff.branch as Record<string, string> | undefined)?.id || staff.branchId
      if (branchId) payload.branchId = branchId
      const updated = await adminRequest<Record<string, unknown>>(accessToken, `staff/${staff.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
      onSaved(updated)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Staff profile could not be saved.') } finally { setSaving(false) }
  }
  return (
    <Card className="staff-edit-card">
      <SectionHeader title="Edit staff profile" />
      <p className="section-caption">Update account identity, employment details, and teaching availability.</p>
      <form className="staff-edit-form" onSubmit={submit}>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="quick-add-grid">
          <label>Full name *<input name="fullName" defaultValue={String(staff.fullName ?? '')} required /></label>
          <label>Work email *<input name="email" type="email" defaultValue={String(staff.email ?? '')} required /></label>
          <label>Role<select name="role" value={selectedRole} onChange={(event) => setSelectedRole(event.target.value)}>{(staffRoles.length ? staffRoles : [{ id: 'fallback-teacher', name: 'Teacher', isSystemRole: true }, { id: 'fallback-staff', name: 'Staff', isSystemRole: true }] as Role[]).map((role) => <option key={role.id} value={role.isSystemRole ? role.name.toUpperCase() : `CUSTOM:${role.id}`}>{role.name}</option>)}</select></label>
          <label>Department<input name="department" defaultValue={String(staff.department ?? '')} /></label>
          <label>Employment type<select name="employmentType" defaultValue={String(staff.employmentType ?? 'FULL_TIME')}><option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option></select></label>
          <label>Date of joining<input name="dateOfJoining" type="date" defaultValue={String(staff.dateOfJoining ?? '')} /></label>
        </div>
        <fieldset className="staff-edit-days"><legend>Profile & contact details</legend><div className="quick-add-grid">
          <label>Mobile number<input name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={String(staff.phone ?? '')} placeholder="e.g. +91 98765 43210" /></label>
          <label>Date of birth<input name="dateOfBirth" type="date" defaultValue={String(staff.dateOfBirth ?? '')} /></label>
          <label>Gender<input name="gender" defaultValue={String(staff.gender ?? '')} /></label>
          <label>Blood group<input name="bloodGroup" defaultValue={String(staff.bloodGroup ?? '')} /></label>
          <label>Qualification<input name="qualification" defaultValue={String(staff.qualification ?? '')} /></label>
          <label>Experience (years)<input name="experienceYears" type="number" min="0" defaultValue={String(staff.experienceYears ?? '')} /></label>
          <label>Marital status<input name="maritalStatus" defaultValue={String(staff.maritalStatus ?? '')} /></label>
          <label>Father’s name<input name="fatherName" defaultValue={String(staff.fatherName ?? '')} /></label>
          <label>Mother’s name<input name="motherName" defaultValue={String(staff.motherName ?? '')} /></label>
          <label>PAN / ID number<input name="panOrIdNumber" defaultValue={String(staff.panOrIdNumber ?? '')} /></label>
          <label>Shift<input name="shift" defaultValue={String(staff.shift ?? '')} /></label>
          <label>Work location<input name="workLocation" defaultValue={String(staff.workLocation ?? '')} /></label>
          <label>Current address<input name="currentAddress" defaultValue={String(staff.currentAddress ?? '')} /></label>
          <label>Permanent address<input name="permanentAddress" defaultValue={String(staff.permanentAddress ?? '')} /></label>
          <label>Previous school name<input name="previousSchoolName" defaultValue={String(staff.previousSchoolName ?? '')} /></label>
          <label>Previous school phone<input name="previousSchoolPhone" defaultValue={String(staff.previousSchoolPhone ?? '')} /></label>
          <label>Previous school address<input name="previousSchoolAddress" defaultValue={String(staff.previousSchoolAddress ?? '')} /></label>
        </div></fieldset>
        <fieldset className="staff-edit-days"><legend>Salary & payment details</legend><div className="quick-add-grid">
          <label>Monthly salary<input name="monthlySalary" type="number" min="0" step="0.01" defaultValue={String(staff.monthlySalary ?? '')} /></label>
          <label>Currency<select name="salaryCurrency" defaultValue={String(staff.salaryCurrency ?? 'INR')}><option value="INR">INR</option><option value="USD">USD</option><option value="EUR">EUR</option></select></label>
          <label>Pay frequency<select name="payFrequency" defaultValue={String(staff.payFrequency ?? 'MONTHLY')}><option value="MONTHLY">Monthly</option><option value="ANNUAL">Annual</option></select></label>
          <label>Bank name<input name="bankName" defaultValue={String(staff.bankName ?? '')} /></label>
          <label>Bank branch<input name="bankBranch" defaultValue={String(staff.bankBranch ?? '')} /></label>
          <label>Account last 4 digits<input name="bankAccountLast4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} defaultValue={String(staff.bankAccountLast4 ?? '')} /></label>
          <label>IFSC code<input name="bankIfsc" maxLength={20} defaultValue={String(staff.bankIfsc ?? '')} /></label>
        </div></fieldset>
        <fieldset className="staff-edit-days"><legend>Available working days</legend><div className="staff-day-chips">{days.map((day) => <label className="staff-day-chip" key={day}><input type="checkbox" checked={selectedDays.includes(day)} onChange={(e) => setSelectedDays((curr) => e.target.checked ? [...curr, day] : curr.filter((d) => d !== day))} /><span>{day}</span></label>)}</div></fieldset>
        <div className="quick-add-grid">
          <label>Max periods/day<input name="maxPeriodsPerDay" type="number" min={1} defaultValue={Number(staff.maxPeriodsPerDay ?? 6)} required /></label>
          <label>Max periods/week<input name="maxPeriodsPerWeek" type="number" min={1} defaultValue={Number(staff.maxPeriodsPerWeek ?? 36)} required /></label>
        </div>
        <fieldset className="staff-edit-days"><legend>Available periods</legend><div className="staff-day-chips">{[1, 2, 3, 4, 5, 6, 7, 8].map((p) => <label className={`staff-preset${periods.includes(p) ? ' is-selected' : ''}`} key={p}><input type="checkbox" checked={periods.includes(p)} onChange={(e) => setPeriods((curr) => e.target.checked ? [...curr, p] : curr.filter((x) => x !== p))} /> P{p}</label>)}</div></fieldset>
        <div className="form-actions">
          <button className="button-secondary" type="button" onClick={onCancel}>Cancel</button>
          <button className="button-primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </form>
    </Card>
  )
}

/* ─────────────── Staff Documents (unchanged) ─────────────── */
function StaffDocuments({ accessToken, staffId }: { accessToken: string; staffId?: string }) {
  const [documents, setDocuments] = useState([
    { id: 'id', name: 'ID Proof', date: '—', status: 'Missing', meta: 'Upload PDF or image' },
    { id: 'offer', name: 'Offer letter / contract', date: '—', status: 'Missing', meta: 'Not uploaded' },
    { id: 'qualification', name: 'Educational certificates', date: '—', status: 'Missing', meta: 'Upload PDF or image' },
    { id: 'address', name: 'Address proof', date: '—', status: 'Missing', meta: 'Upload PDF or image' },
    { id: 'reference', name: 'Previous employment reference', date: '—', status: 'Missing', meta: 'Upload PDF or image' },
  ])
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState('')
  const upload = async (file: File | null, docId: string, validationError?: string) => { setError(validationError ?? ''); if (!file || !staffId || validationError) return; setUploading(docId); try { await adminUpload(accessToken, `staff/${staffId}/documents`, file, { documentType: docId }); setDocuments((curr) => curr.map((doc) => doc.id === docId ? { ...doc, date: new Date().toLocaleDateString(), status: 'Pending review', meta: `${file.type || 'File'} · ${Math.ceil(file.size / 1024)} KB` } : doc)) } catch (cause) { setError(cause instanceof Error ? cause.message : 'The document could not be uploaded.') } finally { setUploading('') } }
  return (
    <Card className="profile-table-card staff-documents-card">
      <SectionHeader title="Documents" />
      <p className="section-caption">Upload identity, contract, qualification, and address documents. Pending files are reviewed by an administrator.</p>
      <div className="profile-table">
        <div className="sp-table-head"><span>Document</span><span>File</span><span>Status</span><span>Actions</span></div>
        {documents.map((doc) => (
          <div className="sp-table-row" key={doc.id}>
            <span><FileText size={16} /> {doc.name}</span>
            <span>{doc.date}<small>{doc.meta}</small></span>
            <span className={`status-badge ${doc.status === 'Verified' ? 'tone-success' : doc.status === 'Missing' ? 'tone-danger' : 'tone-warning'}`}>{doc.status}</span>
            <span className="document-actions">
              <FileUploadField kind="document" label="Upload" disabled={uploading === doc.id} onChange={(file, cause) => void upload(file, doc.id, cause)} />
              <button className="button-secondary btn-sm" type="button" disabled={doc.status === 'Missing'}><Download size={15} /></button>
              <button className="button-secondary btn-sm" type="button" onClick={() => setDocuments((curr) => curr.filter((d) => d.id !== doc.id))}><Trash2 size={15} /></button>
            </span>
          </div>
        ))}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </Card>
  )
}

/* ═══════════════════════════════════════════════
   PARENT PROFILE
════════════════════════════════════════════════ */
function ParentProfilePage({ id, accessToken, onBack }: { id?: string; accessToken: string; onBack: () => void }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState(searchParams.get('tab') === 'linked-children' ? 'Linked Children' : 'Overview')
  type ParentRec = { id: string; fullName: string; email: string; phone: string; children: Array<{ id: string; name: string }> }
  const [parent, setParent] = useState<ParentRec | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    void adminRequest<{ items: ParentRec[] }>(accessToken, 'parents?page=1&pageSize=100').then((res) => {
      const match = res.items.find((p) => p.id === id) ?? (id ? null : res.items[0])
      setParent(match ?? null)
    }).catch(() => undefined).finally(() => setLoading(false))
  }, [accessToken, id])

  const switchTab = (name: string) => {
    setTab(name)
    const next = new URLSearchParams(searchParams)
    next.set('tab', name.toLowerCase().replaceAll(' ', '-'))
    setSearchParams(next)
  }

  if (loading) return <Spinner />

  return (
    <div className="profile-page">
      <div className="profile-page-header">
        <div>
          <button className="profile-back" type="button" onClick={onBack}><ArrowLeft /> People / Parents</button>
          <h1>{parent?.fullName ?? 'Parent'} <span className="profile-status">Active</span> <span className="profile-badge">Parent</span></h1>
        </div>
        <div className="profile-actions">
          <button className="button-secondary icon-only" type="button" aria-label="More"><MoreHorizontal /></button>
        </div>
      </div>
      <div className="profile-tabs" role="tablist">
        {['Overview', 'Linked Children', 'Documents'].map((name) => (
          <button key={name} type="button" role="tab" aria-selected={tab === name} onClick={() => switchTab(name)}>{name}</button>
        ))}
      </div>
      {tab === 'Overview' && (
        <div className="profile-overview">
          <Card>
            <div className="profile-identity">
              <div className="profile-avatar"><UserRound size={28} /></div>
              <div className="profile-details">
                <div><span>Full Name</span><strong>{parent?.fullName ?? '—'}</strong></div>
                <div><span>Phone</span><strong>{parent?.phone || '—'}</strong></div>
                <div><span>Email</span><strong>{parent?.email || '—'}</strong></div>
                <div><span>Linked Children</span><strong>{parent?.children?.length ?? 0}</strong></div>
              </div>
            </div>
          </Card>
        </div>
      )}
      {tab === 'Linked Children' && (
        <Card className="profile-table-card">
          <SectionHeader title="Linked Children" />
          {!parent?.children?.length
            ? <EmptyState message="No children linked to this parent yet." />
            : (
              <div className="profile-table">
                <div className="sp-table-head"><span>Student Name</span><span>Student ID</span></div>
                {parent.children.map((child) => (
                  <div className="sp-table-row" key={child.id}>
                    <span><strong>{child.name}</strong></span>
                    <span>{child.id}</span>
                  </div>
                ))}
              </div>
            )}
        </Card>
      )}
      {tab === 'Documents' && <StaffDocuments accessToken={accessToken} staffId={id} />}
    </div>
  )
}

/* ═══════════════════════════════════════════════
   SHARED: Attendance calendar  (unchanged logic)
════════════════════════════════════════════════ */
type StaffAttendanceRecord = {
  id: string
  userId: string
  name: string
  branchId: string
  date: string
  status: 'PRESENT' | 'ABSENT' | 'LATE'
  remark: string
}

function AttendanceCard({
  accessToken,
  staffUserId,
}: {
  accessToken: string
  staffUserId: string
}) {
  const [monthOffset, setMonthOffset] = useState(0)
  const [selected, setSelected] = useState<{ day: number; date: Date; status: string; remark: string } | null>(null)
  const [records, setRecords] = useState<Map<string, StaffAttendanceRecord>>(new Map())
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState({ present: 0, absent: 0, late: 0, percentage: 0, total: 0 })
  const monthDate = new Date(new Date().getFullYear(), new Date().getMonth() + monthOffset, 1)
  const year = monthDate.getFullYear(); const month = monthDate.getMonth()
  const days = new Date(year, month + 1, 0).getDate(); const firstDay = new Date(year, month, 1).getDay()
  const fromDate = `${year}-${String(month + 1).padStart(2, '0')}-01`
  const toDate = `${year}-${String(month + 1).padStart(2, '0')}-${String(days).padStart(2, '0')}`

  useEffect(() => {
    if (!staffUserId || !accessToken) return
    setLoading(true)
    const params = new URLSearchParams({ userId: staffUserId, dateFrom: fromDate, dateTo: toDate })
    void adminRequest<{ success: boolean; data: StaffAttendanceRecord[] }>(
      accessToken,
      `attendance/staff?${params}`,
    )
      .then((res) => {
        const map = new Map<string, StaffAttendanceRecord>()
        for (const rec of (res.data ?? [])) map.set(rec.date, rec)
        setRecords(map)
        const present = (res.data ?? []).filter((r) => r.status === 'PRESENT').length
        const absent = (res.data ?? []).filter((r) => r.status === 'ABSENT').length
        const late = (res.data ?? []).filter((r) => r.status === 'LATE').length
        const total = present + absent + late
        setSummary({ present, absent, late, total, percentage: total ? Math.round((present / total) * 100) : 0 })
      })
      .catch(() => setRecords(new Map()))
      .finally(() => setLoading(false))
  }, [accessToken, staffUserId, fromDate, toDate])

  const cells = Array.from({ length: Math.ceil((firstDay + days) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1
    if (day < 1 || day > days) return null
    const date = new Date(year, month, day)
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const record = records.get(dateKey)
    const weekend = date.getDay() === 0 || date.getDay() === 6
    const status = record ? record.status.toLowerCase() : weekend ? 'non-working' : 'present'
    return { day, date, status, remark: record?.remark ?? '' }
  })
  const label = monthDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const exportCsv = () => {
    const rows = ['Date,Status', ...cells.filter(Boolean).map((c) => `${c!.date.toISOString().slice(0, 10)},${c!.status}`)]
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' }))
    link.download = `attendance-${year}-${String(month + 1).padStart(2, '0')}.csv`
    link.click(); URL.revokeObjectURL(link.href)
  }
  return (
    <div className="staff-attendance-layout">
      <Card className="staff-attendance-card">
        <div className="staff-attendance-heading">
          <SectionHeader title="Attendance" action={<button className="button-secondary button-small" type="button" onClick={exportCsv}>Export attendance</button>} />
          <div className="attendance-month-actions">
            <button className="button-secondary icon-only" type="button" aria-label="Previous month" onClick={() => setMonthOffset((v) => v - 1)}><ChevronLeft /></button>
            <strong>{label}</strong>
            <button className="button-secondary icon-only" type="button" aria-label="Next month" onClick={() => setMonthOffset((v) => v + 1)}><ChevronRight /></button>
          </div>
        </div>
        <div className="attendance-kpis">
          <div className="attendance-stat-card"><span>This month</span><strong className={summary.percentage >= 85 ? 'attendance-good' : summary.percentage >= 75 ? 'attendance-average' : 'attendance-poor'}>{loading ? '…' : `${summary.percentage}%`}{!loading && <small>{summary.total > 0 ? `${summary.present}P / ${summary.absent}A / ${summary.late}L` : 'No records'}</small>}</strong></div>
          <div className="attendance-stat-card"><span>Present</span><strong>{loading ? '—' : summary.present}</strong></div>
          <div className="attendance-stat-card"><span>Absent</span><strong>{loading ? '—' : summary.absent}</strong></div>
          <div className="attendance-stat-card"><span>Late</span><strong>{loading ? '—' : summary.late}</strong></div>
        </div>
        <div className="attendance-legend profile-attendance-legend">
          <span><i className="present" />Present</span><span><i className="absent" />Absent</span>
          <span><i className="late" />Late</span><span><i className="non-working" />Weekend / holiday</span>
        </div>
        <div className="attendance-calendar-week">{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}</div>
        <div className="profile-attendance-grid">
          {cells.map((cell, index) => cell
            ? <button key={cell.day} type="button" className={`profile-attendance-day ${cell.status}`} onClick={() => setSelected(cell)} title={`${cell.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })} — ${humanize(cell.status)}`}><strong>{cell.day}</strong><span>{humanize(cell.status)}</span></button>
            : <span className="profile-attendance-day empty" key={`empty-${index}`} />)}
        </div>
        <p className="section-caption">{loading ? 'Loading attendance records…' : 'Select a date to review attendance details.'}</p>
        {selected && (
          <div className="attendance-detail-panel">
            <strong>{selected.date.toLocaleDateString(undefined, { dateStyle: 'long' })} · {humanize(selected.status)}</strong>
            {selected.remark ? <p>{selected.remark}</p> : <p>Marked by Admin. No additional notes.</p>}
          </div>
        )}
      </Card>
      <div className="attendance-side-stack">
        <Card><SectionHeader title="Leave summary" /><div className="leave-summary-grid"><strong>4 days</strong><span>taken this term</span><strong>2 days</strong><span>Casual leave</span><strong>8 days</strong><span>remaining</span></div></Card>
        <Card><SectionHeader title="Pending requests" /><p><strong>2 requests</strong> need review.</p><button className="button-secondary button-small" type="button">Open approval queue</button></Card>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   ROOT EXPORT  — routes to correct sub-component
════════════════════════════════════════════════ */
export function ProfilePage({ kind, id, accessToken, onBack }: Props) {
  if (kind === 'student') return <StudentProfilePage id={id} accessToken={accessToken} onBack={onBack} />
  if (kind === 'staff')   return <StaffProfilePage   id={id} accessToken={accessToken} onBack={onBack} />
  return <ParentProfilePage id={id} accessToken={accessToken} onBack={onBack} />
}
