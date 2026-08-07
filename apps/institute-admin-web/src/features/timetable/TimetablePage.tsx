import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Grid3x3 } from 'lucide-react'
import { PageSkeleton } from '../../components/admin-ui'
import { Card } from '../../components/ui/primitives'
import { adminRequest, type PageData } from '../admin/admin.api'
import { createClassSubject, createSubjectTeacherAssignment, deleteSubjectTeacherAssignment, updateClassSubject, updateSubjectTeacherAssignment } from '../academics/academics.api'
import type { ClassSubject } from '../academics/academics.types'
import { IntegratedTimetableGenerator, SavedTimetableViewer, type TimetableBundle } from './TimetableGenerator.jsx'

type StaffRecord = {
  id?: string
  userId: string
  fullName: string
  email?: string
  employeeCode?: string
  department?: string
  branch?: { id: string }
  role: string
  employmentType?: 'FULL_TIME' | 'PART_TIME'
  availableDays?: string[]
  availablePeriods?: number[]
  maxPeriodsPerDay?: number
  maxPeriodsPerWeek?: number
  availableStartTime?: string | null
  availableEndTime?: string | null
}
type SubjectRecord = { id: string; name: string; subjectCode?: string }
type SectionRecord = {
  id: string
  branch: { id: string }
  grade: { id: string; name: string }
  academicYear: { isCurrent: boolean }
  sectionName: string
}
type AssignmentRecord = {
  id: string
  classSectionId: string
  subject: { id: string }
  teacher: { id: string }
}
type RoomRecord = { id: string; name: string; roomType?: string; capacity?: number | null; floor?: number; equipment?: string[]; isActive?: boolean }
type StructureOptions = {
  branches: Array<{ id: string; name: string }>
  years: Array<{ id: string; name: string; isCurrent: boolean }>
  classes: Array<{ id: string; name: string }>
}
type SavedTimetableRecord = {
  id: string
  recordType: string
  title: string
  status: string
  branch?: { id: string; name: string } | null
  updatedAt: string
  data: { scope?: string; bundle?: TimetableBundle }
}
type SavedTimetableResponse = { records: PageData<SavedTimetableRecord> }

const periods: TimetableBundle['config']['periods'] = [
  { number: 1, type: 'teaching', start: '08:00', end: '08:40' },
  { number: 2, type: 'teaching', start: '08:40', end: '09:20' },
  { number: 3, type: 'teaching', start: '09:20', end: '10:00' },
  { number: 4, type: 'teaching', start: '10:00', end: '10:40' },
  { number: 5, type: 'break', start: '10:40', end: '11:20' },
  { number: 6, type: 'teaching', start: '11:20', end: '12:00' },
  { number: 7, type: 'teaching', start: '12:00', end: '12:40' },
  { number: 8, type: 'teaching', start: '12:40', end: '13:20' },
  { number: 9, type: 'teaching', start: '13:20', end: '14:00' },
]
const emptyBundle: TimetableBundle = { config: { workingDays: ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], periods }, teachers: [], subjects: [], classes: [], rooms: [], assignments: [], lastResult: null }
const emptyBranches: Array<{ id: string; name: string }> = []

function params(selectedBranch: string, scoped: boolean) {
  const query = new URLSearchParams({ page: '1', pageSize: '100' })
  if (scoped && selectedBranch !== 'all') query.set('branchId', selectedBranch)
  return query.toString()
}

function mapStaff(person: StaffRecord, config: TimetableBundle['config']) {
  const teachingNumbers = config.periods.filter((period) => period.type === 'teaching').map((period) => period.number)
  const availableTeachingNumbers = person.availablePeriods?.length
    ? person.availablePeriods.map((ordinal) => teachingNumbers[ordinal - 1]).filter((number): number is number => number !== undefined)
    : teachingNumbers
  return {
    id: person.userId,
    profileId: person.id,
    name: person.fullName,
    email: person.email ?? '',
    branchId: person.branch?.id ?? '',
    employeeCode: person.employeeCode ?? '',
    department: person.department ?? '',
    employmentType: person.employmentType ?? 'FULL_TIME',
    maxPeriodsPerDay: person.maxPeriodsPerDay ?? 6,
    maxPeriodsPerWeek: person.maxPeriodsPerWeek ?? 36,
    availableDays: person.availableDays?.length ? person.availableDays : config.workingDays,
    availablePeriods: availableTeachingNumbers.filter((periodNumber) => {
      if (person.employmentType !== 'PART_TIME' || !person.availableStartTime || !person.availableEndTime) return true
      const period = config.periods.find((candidate) => candidate.number === periodNumber)
      return Boolean(period && period.start >= person.availableStartTime && period.end <= person.availableEndTime)
    }),
  }
}

function staffPayload(input: Record<string, unknown>, config: TimetableBundle['config']) {
  const teachingNumbers = config.periods.filter((period) => period.type === 'teaching').map((period) => period.number)
  const selected = Array.isArray(input.availablePeriods) ? input.availablePeriods : []
  return {
    ...input,
    availablePeriods: selected.map((number) => teachingNumbers.indexOf(Number(number)) + 1).filter((ordinal) => ordinal > 0),
  }
}

function mapBundle(staff: StaffRecord[], subjects: SubjectRecord[], sections: SectionRecord[], assignments: AssignmentRecord[], curriculum: ClassSubject[], rooms: RoomRecord[] = []): TimetableBundle {
  const currentSections = sections.some((section) => section.academicYear.isCurrent) ? sections.filter((section) => section.academicYear.isCurrent) : sections
  const sectionIds = new Set(currentSections.map((section) => section.id))
  // `staff` is already scoped by the staff API's role=TEACHER filter. Do not
  // filter its serialized membership role a second time: users with multiple
  // active memberships can otherwise be incorrectly dropped here.
  const teacherIds = new Set(staff.map((person) => person.userId))
  const subjectIds = new Set(subjects.map((subject) => subject.id))
  const curriculumByClassAndSubject = new Map(curriculum.map((item) => [`${item.classId}:${item.subjectId}`, item]))
  return {
    ...emptyBundle,
    curriculum: curriculum.map((item) => ({ id: item.id, classId: item.classId, subjectId: item.subjectId, periodsPerWeek: item.periodsPerWeek ?? 0 })),
    teachers: staff.map((person) => mapStaff(person, emptyBundle.config)),
    subjects: subjects.map((subject) => ({ id: subject.id, name: subject.name, subjectCode: subject.subjectCode ?? '', isDouble: false, requiresRoomId: null })),
    classes: currentSections.map((section) => ({ id: section.id, gradeId: section.grade.id, name: `${section.grade.name} - ${section.sectionName}` })),
    assignments: assignments.filter((assignment) => sectionIds.has(assignment.classSectionId) && teacherIds.has(assignment.teacher.id) && subjectIds.has(assignment.subject.id)).map((assignment) => ({
      id: assignment.id,
      teacherId: assignment.teacher.id,
      subjectId: assignment.subject.id,
      classId: assignment.classSectionId,
      curriculumId: curriculumByClassAndSubject.get(`${currentSections.find((section) => section.id === assignment.classSectionId)?.grade.id}:${assignment.subject.id}`)?.id,
      periodsPerWeek: curriculumByClassAndSubject.get(`${currentSections.find((section) => section.id === assignment.classSectionId)?.grade.id}:${assignment.subject.id}`)?.periodsPerWeek ?? 0,
      avoidRepeatSameDay: true,
    })),
    rooms: rooms.filter((room) => room.isActive !== false).map((room) => ({ id: room.id, name: room.name })),
  }
}

function GenerateTimetablePage({ accessToken, selectedBranch, branches = emptyBranches, onNavigate }: { accessToken: string; selectedBranch: string; branches?: Array<{ id: string; name: string }>; onNavigate?: (path: string) => void }) {
  const [bundle, setBundle] = useState<TimetableBundle>(emptyBundle)
  const [loadedQuery, setLoadedQuery] = useState('')
  const [error, setError] = useState('')
  const [structureOptions, setStructureOptions] = useState<StructureOptions>({ branches, years: [], classes: [] })
  const branchQuery = useMemo(() => params(selectedBranch, true), [selectedBranch])
  const teacherQuery = useMemo(() => {
    const query = new URLSearchParams(branchQuery)
    query.set('role', 'TEACHER')
    return query.toString()
  }, [branchQuery])
  const instituteQuery = useMemo(() => params(selectedBranch, false), [selectedBranch])
  const branchSignature = branches.map((branch) => `${branch.id}:${branch.name}`).join('|')
  const queryKey = `${accessToken}|${teacherQuery}`

  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      adminRequest<PageData<StaffRecord>>(accessToken, `staff?${teacherQuery}`, { signal: controller.signal }),
      adminRequest<PageData<SubjectRecord>>(accessToken, `academics/subjects?${instituteQuery}`, { signal: controller.signal }),
      adminRequest<PageData<SectionRecord>>(accessToken, `academics/sections?${branchQuery}`, { signal: controller.signal }),
      adminRequest<PageData<AssignmentRecord>>(accessToken, `academics/section-subject-teachers?${instituteQuery}`, { signal: controller.signal }),
      adminRequest<PageData<ClassSubject>>(accessToken, `academics/class-subjects?${instituteQuery}`, { signal: controller.signal }),
      adminRequest<PageData<RoomRecord>>(accessToken, `academics/rooms?${branchQuery}`, { signal: controller.signal }),
      adminRequest<PageData<{ id: string; name: string; isCurrent: boolean }>>(accessToken, `academics/academic-years?${instituteQuery}`, { signal: controller.signal }),
      adminRequest<PageData<{ id: string; name: string }>>(accessToken, `academics/classes?${instituteQuery}`, { signal: controller.signal }),
    ]).then(([staff, subjects, sections, assignments, curriculum, rooms, years, classes]) => {
      setBundle(mapBundle(staff.items, subjects.items, sections.items, assignments.items, curriculum.items, rooms.items))
      setStructureOptions({ branches, years: years.items, classes: classes.items })
      setError('')
      setLoadedQuery(queryKey)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : 'Timetable data could not be loaded.')
        setLoadedQuery(queryKey)
      }
    })
    return () => controller.abort()
  }, [accessToken, branchQuery, teacherQuery, instituteQuery, queryKey, branchSignature, branches])

  const selectedBranchId = selectedBranch === 'all' ? structureOptions.branches[0]?.id ?? '' : selectedBranch
  const api = {
    accessToken,
    selectedBranch: selectedBranchId,
    structureOptions,
    createTeacher: (input: Record<string, unknown>, config: TimetableBundle['config']) => adminRequest<StaffRecord>(accessToken, 'staff', { method: 'POST', body: JSON.stringify(staffPayload(input, config)) }).then((record) => mapStaff(record, config)),
    updateTeacher: (profileId: string, input: Record<string, unknown>, config: TimetableBundle['config']) => adminRequest<StaffRecord>(accessToken, `staff/${profileId}`, { method: 'PATCH', body: JSON.stringify(staffPayload(input, config)) }).then((record) => mapStaff(record, config)),
    createSubject: (input: Record<string, unknown>) => adminRequest<SubjectRecord & { subjectCode?: string }>(accessToken, 'academics/subjects', { method: 'POST', body: JSON.stringify(input) }).then((record) => ({ id: record.id, name: record.name, isDouble: false, requiresRoomId: null })),
    createSection: (input: Record<string, unknown>) => adminRequest<SectionRecord>(accessToken, 'academics/sections', { method: 'POST', body: JSON.stringify(input) }).then((record) => ({ id: record.id, gradeId: record.grade.id, name: `${record.grade.name} - ${record.sectionName}` })),
    createRoom: (input: Record<string, unknown>) => adminRequest<RoomRecord>(accessToken, 'academics/rooms', { method: 'POST', body: JSON.stringify(input) }).then((record) => ({ id: record.id, name: record.name })),
    saveAssignment: async (input: { id?: string; classSectionId: string; gradeId: string; subjectId: string; teacherId: string; periodsPerWeek: number }) => {
      if (!input.gradeId) throw new Error('The selected section is not linked to a class in Academic Structure.')
      const curriculumQuery = new URLSearchParams({ page: '1', pageSize: '100', gradeId: input.gradeId })
      const curriculum = await adminRequest<PageData<ClassSubject>>(accessToken, `academics/class-subjects?${curriculumQuery}`)
      const mapping = curriculum.items.find((item) => item.subjectId === input.subjectId)
      const savedCurriculum = mapping
        ? await updateClassSubject(accessToken, mapping.id, { periodsPerWeek: input.periodsPerWeek })
        : await createClassSubject(accessToken, { classId: input.gradeId, subjectId: input.subjectId, periodsPerWeek: input.periodsPerWeek })
      const assignmentInput = { classSectionId: input.classSectionId, subjectId: input.subjectId, teacherId: input.teacherId }
      const assignment = input.id
        ? await updateSubjectTeacherAssignment(accessToken, input.id, assignmentInput)
        : await createSubjectTeacherAssignment(accessToken, assignmentInput)
      return { ...assignment, curriculumId: savedCurriculum.id, periodsPerWeek: savedCurriculum.periodsPerWeek ?? input.periodsPerWeek }
    },
    deleteAssignment: (id: string) => deleteSubjectTeacherAssignment(accessToken, id),
    saveTimetable: (savedBundle: TimetableBundle, status: 'DRAFT' | 'PUBLISHED') => {
      return adminRequest<SavedTimetableRecord>(accessToken, 'screens/TT1/records', {
        method: 'POST',
        body: JSON.stringify({
          branchId: selectedBranch === 'all' ? null : selectedBranch,
          recordType: 'generated-timetable',
          title: 'All Classes Timetable',
          // Always save as DRAFT first; publish happens via the dedicated endpoint
          status: 'DRAFT',
          data: { scope: 'all', lifecycleStatus: status, bundle: savedBundle },
        }),
      }).then((saved) => {
        // If publishing, call the dedicated publish endpoint to trigger archive/sync
        if (status === 'PUBLISHED') {
          return adminRequest<{ record: SavedTimetableRecord }>(accessToken, 'timetable/publish', {
            method: 'POST',
            body: JSON.stringify({ recordId: saved.id }),
          }).then((result) => ({
            ...result.record,
            data: { ...result.record.data, bundle: savedBundle },
          }))
        }
        return saved
      })
    },
  }
  return <main aria-label="Timetable"><IntegratedTimetableGenerator initialBundle={bundle} loading={loadedQuery !== queryKey} loadError={loadedQuery === queryKey ? error : ''} onNavigate={onNavigate} {...api} /></main>
}

function ViewTimetablePage({ accessToken, selectedBranch }: { accessToken: string; selectedBranch: string }) {
  const [records, setRecords] = useState<SavedTimetableRecord[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const queryKey = `${accessToken}|${selectedBranch}`

  useEffect(() => {
    const controller = new AbortController()
    const query = new URLSearchParams({ page: '1', pageSize: '100', order: '-updatedAt' })
    if (selectedBranch !== 'all') query.set('branchId', selectedBranch)
    setLoading(true)
    void adminRequest<SavedTimetableResponse>(accessToken, `screens/TT1?${query}`, { signal: controller.signal })
      .then((response) => {
        const saved = response.records.items.filter((record) => record.recordType === 'generated-timetable' && record.data?.bundle)
        setRecords(saved)
        setSelectedId((current) => saved.some((record) => record.id === current) ? current : saved[0]?.id ?? '')
        setError('')
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Saved timetables could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [queryKey, accessToken, selectedBranch])

  const selected = records.find((record) => record.id === selectedId)
  return <main className="entity-page" aria-label="View Timetable">
    <div className="page-heading"><div><p className="breadcrumb">Timetable / View Timetable</p><h1>View Timetable</h1><p className="section-caption">Open previously generated and saved timetable versions.</p></div></div>
    {loading ? <PageSkeleton name="timetable-saved-list" label="Loading saved timetables" variant="list" /> : error ? <div className="inline-error" role="alert">{error}</div> : !records.length ? <Card className="admin-state"><div className="admin-state__icon"><Grid3x3 aria-hidden="true" /></div><h2>No saved timetables</h2><p className="admin-state__description">Use Generate Timetable from the left navigation to build and save the first timetable.</p></Card> : <div style={{ display: 'grid', gridTemplateColumns: '18rem minmax(0, 1fr)', gap: '1rem', alignItems: 'start' }}>
      <Card><div className="section-header"><h2>Saved versions</h2></div><div style={{ display: 'grid', gap: '.5rem', marginTop: '1rem' }}>{records.map((record) => <button key={record.id} type="button" title={`Open ${record.title}`} aria-pressed={record.id === selectedId} onClick={() => setSelectedId(record.id)} style={{ display: 'grid', gap: '.3rem', padding: '.8rem', textAlign: 'left', border: `1px solid ${record.id === selectedId ? 'var(--color-primary)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-button)', background: record.id === selectedId ? 'var(--color-primary-subtle)' : 'var(--color-surface)', color: 'var(--color-text-primary)', cursor: 'pointer' }}><span style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'center' }}><strong>{record.title}</strong><span className={`status-badge ${record.status === 'PUBLISHED' ? 'tone-success' : record.status === 'DRAFT' ? 'tone-warning' : 'tone-info'}`}>{record.status === 'PUBLISHED' ? 'Published' : record.status === 'DRAFT' ? 'Draft' : 'Saved'}</span></span><small style={{ display: 'flex', alignItems: 'center', gap: '.35rem', color: 'var(--color-text-secondary)' }}><CalendarDays size={13} />{new Date(record.updatedAt).toLocaleString()}</small>{record.branch?.name ? <small>{record.branch.name}</small> : null}</button>)}</div></Card>
      <SavedTimetableViewer initialBundle={selected?.data.bundle} />
    </div>}
  </main>
}

export function TimetablePage({ mode = 'view', accessToken, selectedBranch, branches = emptyBranches, onNavigate }: { mode?: 'view' | 'generate'; accessToken: string; selectedBranch: string; branches?: Array<{ id: string; name: string }>; onNavigate?: (path: string) => void }) {
  return mode === 'generate'
    ? <GenerateTimetablePage accessToken={accessToken} selectedBranch={selectedBranch} branches={branches} onNavigate={onNavigate} />
    : <ViewTimetablePage accessToken={accessToken} selectedBranch={selectedBranch} />
}
