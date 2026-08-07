import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Building2, BookOpen, CalendarDays, CheckCircle2, ChevronRight, Download, Eye, Pencil, Plus, Search, Settings, Users, GraduationCap, School, Check, TrendingUp, Clock, Star } from 'lucide-react'
import {
  DataTable,
  ErrorSummary,
  FormField,
  Modal,
  Tabs,
  type DataTableColumn,
  type FormError,
} from '../../components/admin-ui'
import { BoneScreen } from '../../components/admin-ui'
import {
  AcademicsApiError,
  createAcademicRecord,
  createClassSubject,
  deleteClassSubject,
  updateClassSubject,
  listAcademicYears,
  listAcademicTerms,
  createAcademicTerm,
  updateAcademicTerm,
  listClasses,
  listClassSubjects,
  listSections,
  listRooms,
  listSubjects,
  listSubjectTeacherAssignments,
  createSubjectTeacherAssignment,
  deleteSubjectTeacherAssignment,
  updateAcademicRecord,
} from './academics.api'
import type {
  AcademicBranchOption,
  AcademicClass,
  ClassSubject,
  AcademicResource,
  AcademicTeacherOption,
  AcademicYear,
  AcademicTerm,
  ClassSection,
  ListParams,
  PageData,
  PageSize,
  Subject,
  Room,
  SubjectTeacherAssignment,
} from './academics.types'
import './academics.css'
import { Card } from '../../components/ui/primitives'
import { adminRequest } from '../admin/admin.api'

type TabId = 'years' | 'classes' | 'subjects' | 'sections'
type AcademicRecord = AcademicYear | AcademicClass | Subject | ClassSection

export interface AcademicStructurePageProps {
  accessToken: string
  branches: readonly AcademicBranchOption[]
  selectedBranch: string
  teachers?: readonly AcademicTeacherOption[]
  initialTab?: TabId
  pageTitle?: string
  pageDescription?: string
  showTabs?: boolean
}

interface EditorState {
  resource: AcademicResource
  record?: AcademicRecord
}

const emptyPage = <T,>(): PageData<T> => ({
  count: 0,
  page: 1,
  pageSize: 0,
  totalPages: 1,
  next: null,
  previous: null,
  items: [],
})

const dateFormatter = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T00:00:00`))
const toIsoDate = (value: FormDataEntryValue | null) => {
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : text
}

function asApiError(cause: unknown, fallback: string) {
  return cause instanceof AcademicsApiError ? cause : new AcademicsApiError(fallback)
}

function errorContent(error: AcademicsApiError) {
  return <>{error.message}{error.traceId ? <small className="academics-trace">Reference: {error.traceId}</small> : null}</>
}

function useDebouncedValue(value: string, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay)
    return () => window.clearTimeout(timer)
  }, [delay, value])
  return debounced
}

function resourceLoader(resource: AcademicResource) {
  if (resource === 'academic-years') return listAcademicYears
  if (resource === 'classes') return listClasses
  if (resource === 'subjects') return listSubjects
  return listSections
}

interface ResourcePanelProps<T extends AcademicRecord> {
  accessToken: string
  resource: AcademicResource
  title: string
  description: string
  addLabel: string
  columns: readonly DataTableColumn<T>[]
  branchId?: string
  extraFilters?: Pick<ListParams, 'academicYearId' | 'gradeId'>
  filterControls?: ReactNode
  refreshKey: number
  onCreate: () => void
}

function ResourcePanel<T extends AcademicRecord>({
  accessToken,
  resource,
  title,
  description,
  addLabel,
  columns,
  branchId,
  extraFilters,
  filterControls,
  refreshKey,
  onCreate,
}: ResourcePanelProps<T>) {
  const [data, setData] = useState<PageData<T>>(emptyPage)
  const [loadedQuery, setLoadedQuery] = useState('')
  const [error, setError] = useState<AcademicsApiError | null>(null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<PageSize>(25)
  const [search, setSearch] = useState('')
  const [retryKey, setRetryKey] = useState(0)
  const debouncedSearch = useDebouncedValue(search)
  const academicYearId = extraFilters?.academicYearId
  const gradeId = extraFilters?.gradeId
  const queryKey = [resource, page, pageSize, debouncedSearch, branchId, academicYearId, gradeId, refreshKey, retryKey].join('|')

  useEffect(() => {
    const controller = new AbortController()
    const loader = resourceLoader(resource) as (token: string, params: ListParams, signal?: AbortSignal) => Promise<PageData<T>>
    void loader(accessToken, { page, pageSize, search: debouncedSearch, branchId, academicYearId, gradeId }, controller.signal)
      .then((response) => {
        setData(response)
        setLoadedQuery(queryKey)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setLoadedQuery(queryKey)
          setError(asApiError(cause, `${title} could not be loaded.`))
        }
      })
    return () => controller.abort()
  }, [accessToken, academicYearId, branchId, debouncedSearch, gradeId, page, pageSize, queryKey, resource, title])

  return (
    <section className="academics-panel" aria-label={title}>
      <div className="academics-panel__heading">
        <div><h2>{title}</h2><p>{description}</p></div>
        <button className="admin-button admin-button--primary academics-action" type="button" onClick={onCreate}><Plus aria-hidden="true" />{addLabel}</button>
      </div>
      <DataTable
        caption={title}
        columns={columns}
        rows={loadedQuery === queryKey ? data.items : []}
        getRowId={(row) => row.id}
        rowLabel={(row) => ('name' in row ? row.name : `${row.grade.name} ${row.sectionName}`)}
        totalRows={loadedQuery === queryKey ? data.count : 0}
        page={page}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value)
          setPage(1)
        }}
        loading={loadedQuery !== queryKey}
        error={loadedQuery === queryKey && error ? errorContent(error) : undefined}
        onRetry={() => setRetryKey((value) => value + 1)}
        filters={
          <div className="academics-filters">
            <label>
              <span>Search</span>
              <span className="admin-input-with-icon">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value)
                    setPage(1)
                  }}
                  placeholder={`Search ${title.toLowerCase()}…`}
                />
              </span>
            </label>
            {filterControls}
          </div>
        }
        emptyTitle={`No ${title.toLowerCase()} found`}
        emptyDescription={search ? 'Try a different search or clear the filters.' : `Create the first ${title.toLowerCase().replace(/s$/, '')} for this institute.`}
        emptyAction={!search ? <button className="button-primary" type="button" onClick={onCreate}>{addLabel}</button> : undefined}
      />
    </section>
  )
}

function ClassesSectionsReference({ accessToken, branchId, branchName, classes, onAddClass, onAddSection, onEditClass, onEditSection, refreshKey }: { accessToken: string; branchId?: string; branchName: string; classes: AcademicClass[]; onAddClass: () => void; onAddSection: () => void; onEditClass: (row: AcademicClass) => void; onEditSection: (row: ClassSection) => void; refreshKey: number }) {
  const [sections, setSections] = useState<ClassSection[]>([])
  const [expanded, setExpanded] = useState<string | null>(classes[0]?.id ?? null)
  useEffect(() => { const c = new AbortController(); void listSections(accessToken, { page: 1, pageSize: 100, branchId }, c.signal).then((result) => setSections(result.items)).catch(() => setSections([])); return () => c.abort() }, [accessToken, branchId, refreshKey])
  const visibleExpanded = classes.some((grade) => grade.id === expanded) ? expanded : classes[0]?.id ?? null
  const enrolled = sections.reduce((sum, item) => sum + item.enrollmentCount, 0)
  const capacity = sections.reduce((sum, item) => sum + (item.maxStrength ?? 0), 0)
  return <div className="classes-reference">
    <div className="classes-reference-actions"><button className="button-secondary" type="button">✎ Bulk Edit</button><button className="button-primary" type="button" onClick={onAddClass}><Plus size={16} /> Add Class</button></div>
    <div className="classes-kpis"><ReferenceMetric label="Grade Levels" value={classes.length} hint={`▲ in ${branchName}`} icon={<School size={19} />} /><ReferenceMetric label="Total Sections" value={sections.length} hint="▲ across all grades" icon={<Users size={19} />} /><ReferenceMetric label="Total Capacity" value={capacity} hint="▲ seats" icon={<GraduationCap size={19} />} /><ReferenceMetric label="Enrolled" value={enrolled} hint="▲ students" icon={<Check size={19} />} /></div>
    <div className="classes-grade-list">{classes.map((grade) => { const gradeSections = sections.filter((item) => item.grade.id === grade.id); const gradeEnrolled = gradeSections.reduce((sum, item) => sum + item.enrollmentCount, 0); const gradeCapacity = gradeSections.reduce((sum, item) => sum + (item.maxStrength ?? 0), 0); const percent = gradeCapacity ? Math.round((gradeEnrolled / gradeCapacity) * 100) : 0; const open = visibleExpanded === grade.id; const toggle = () => setExpanded(open ? null : grade.id); return <section className="grade-reference-card" key={grade.id}><header onClick={toggle}><button className="grade-summary" type="button" aria-expanded={open} onClick={(event) => { event.stopPropagation(); toggle() }}><b>{grade.name.replace('Grade ', 'G').replace('Pre-KG', 'PK')}</b><span><strong>{grade.name}</strong><small>{gradeSections.length} sections · {gradeEnrolled}/{gradeCapacity || '—'} enrolled</small></span></button><div className="grade-actions"><span className="grade-progress"><i><em style={{ width: `${percent}%` }} /></i><small>{percent}% full</small></span><button className="button-secondary btn-sm" type="button" onClick={(event) => { event.stopPropagation(); onAddSection() }}><Plus size={14} /> Section</button><button className="button-secondary btn-sm" type="button" onClick={(event) => { event.stopPropagation(); onEditClass(grade) }}><Pencil size={14} /></button><ChevronRight className={open ? 'grade-chevron open' : 'grade-chevron'} size={16} /></div></header>{open ? <div className="grade-section-grid">{gradeSections.length ? gradeSections.map((section) => { const fill = section.maxStrength ? Math.round((section.enrollmentCount / section.maxStrength) * 100) : 0; return <article key={section.id} className="section-reference-card"><div><strong>{grade.name} – {section.sectionName}</strong><button className="button-secondary btn-sm" type="button" onClick={() => onEditSection(section)}><Pencil size={13} /></button></div><small>Capacity: {section.enrollmentCount} / {section.maxStrength ?? '—'}</small><i><em style={{ width: `${fill}%` }} /></i><button type="button" onClick={() => onEditSection(section)}>{section.classTeacher?.fullName ?? 'Assign Class Teacher'}</button></article> }) : <p className="grade-empty">No sections yet. Add the first section for this class.</p>}</div> : null}</section> })}</div>
  </div>
}

function AcademicYearsReference({ accessToken, years, onAdd, onEdit }: { accessToken: string; years: AcademicYear[]; onAdd: () => void; onEdit: (year: AcademicYear) => void }) {
  const current = years.find((year) => year.isCurrent) ?? years[0]
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [termEditor, setTermEditor] = useState<AcademicTerm | 'new' | null>(null)
  const [termsRevision, setTermsRevision] = useState(0)
  useEffect(() => {
    if (!current) { setTerms([]); return }
    const controller = new AbortController()
    void listAcademicTerms(accessToken, current.id, controller.signal).then((page) => setTerms(page.items)).catch(() => { if (!controller.signal.aborted) setTerms([]) })
    return () => controller.abort()
  }, [accessToken, current?.id, termsRevision])
  const [today] = useState(() => Date.now())
  const elapsed = current ? Math.max(0, Math.min(100, Math.round(((today - new Date(`${current.startDate}T00:00:00`).getTime()) / (new Date(`${current.endDate}T00:00:00`).getTime() - new Date(`${current.startDate}T00:00:00`).getTime())) * 100))) : 0
  const workingDays = current ? Math.max(0, Math.round((new Date(`${current.endDate}T00:00:00`).getTime() - new Date(`${current.startDate}T00:00:00`).getTime()) / 86400000 * 6 / 7)) : 0
  return <div className="years-reference"><table className="sr-only"><caption>Academic years</caption><thead><tr><th>Year</th><th>Dates</th><th>Status</th></tr></thead><tbody>{years.map((year) => <tr key={year.id}><td>{year.name}</td><td>{formatDate(year.startDate)} — {formatDate(year.endDate)}</td><td>{year.isCurrent ? 'Current' : 'Archived'}</td></tr>)}</tbody></table><div className="classes-reference-actions"><button className="button-secondary" type="button" onClick={() => document.getElementById('academic-working-days')?.scrollIntoView({ behavior: 'smooth' })}><Settings size={16} /> Settings</button><button className="button-primary" type="button" onClick={onAdd}><Plus size={16} /> Add Year</button></div><div className="classes-kpis"><ReferenceMetric label="Current Year" value={current?.name ?? '—'} hint="▲ Term 2 in progress" icon={<CalendarDays size={19} />} /><ReferenceMetric label="Year Progress" value={`${elapsed}%`} hint="▲ academic year" icon={<TrendingUp size={19} />} /><ReferenceMetric label="Working Days" value={workingDays} hint="▲ calculated excluding Sundays" icon={<Clock size={19} />} /><ReferenceMetric label="Holidays" value={0} hint="▲ manage in calendar" icon={<Star size={19} />} /></div>{current ? <section className="year-progress-card"><header><strong><CalendarDays size={17} /> Year Progress — {current.name}</strong><span>Active Year</span></header><div><p><small>{formatDate(current.startDate)}</small><small>Today</small><small>{formatDate(current.endDate)}</small></p><i><em style={{ width: `${elapsed}%` }} /></i><small>{elapsed}% of academic year elapsed</small><div className="term-grid">{terms.map((term) => <Term key={term.id} title={term.name} start={term.startDate} end={term.endDate} value={0} active={false} onEdit={() => setTermEditor(term)} />)}{!terms.length && <p className="section-caption">No terms configured yet. Add the first term below.</p>}</div></div></section> : null}<div className="year-list">{years.map((year) => <section className="year-reference-card" key={year.id}><header><div><b>AY</b><span><strong>{year.name}</strong><small>{formatDate(year.startDate)} — {formatDate(year.endDate)} · {year.isCurrent ? workingDays : '—'} working days</small></span></div><aside><em className={year.isCurrent ? 'active' : ''}>{year.isCurrent ? 'Active' : 'Archived'}</em><button className="button-secondary btn-sm" type="button" onClick={() => onEdit(year)}><Pencil size={14} /> Edit</button></aside></header><div className="year-details">{terms.map((term) => <YearCell key={term.id} title={term.name} text={`${formatDate(term.startDate)} — ${formatDate(term.endDate)}`} />)}<YearCell title="Active Branches" text={year.isCurrent ? 'All' : '0'} /><YearCell title="Holidays" text="Manage in calendar" /></div>{year.isCurrent ? <footer id="academic-working-days"><button className="button-secondary btn-sm" type="button" onClick={() => setTermEditor('new')}><Plus size={14} /> Add Term</button><button className="button-secondary btn-sm" type="button" onClick={() => document.getElementById('academic-working-days')?.scrollIntoView({ behavior: 'smooth' })}>Working Days</button><button className="button-secondary btn-sm" type="button" onClick={() => { window.location.href = '/setup/holidays-calendar' }}>Holidays</button></footer> : <small className="archive-note">Archived · Data preserved for historical reports</small>}</section>)}</div><TermEditor accessToken={accessToken} year={current} editor={termEditor} onClose={() => setTermEditor(null)} onSaved={() => { setTermEditor(null); setTermsRevision((value) => value + 1) }} /></div>
}

function SubjectsReference({ accessToken, branchId, curriculum, classes, loadingReference, onAdd, onEdit, refreshKey }: { accessToken: string; branchId?: string; curriculum: ClassSubject[]; classes: AcademicClass[]; loadingReference: boolean; onAdd: () => void; onEdit: (subject: Subject) => void; refreshKey: number }) {
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [loadingSubjects, setLoadingSubjects] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All Categories')
  const [tab, setTab] = useState(() => new URLSearchParams(window.location.search).get('tab') === 'teacher-mapping' ? 'Teacher Mapping' : 'Subjects')
  const [viewing, setViewing] = useState<Subject | null>(null)
  useEffect(() => { const controller = new AbortController(); setLoadingSubjects(true); void listSubjects(accessToken, { page: 1, pageSize: 100, branchId }, controller.signal).then((result) => setSubjects(result.items)).catch(() => { if (!controller.signal.aborted) setSubjects([]) }).finally(() => { if (!controller.signal.aborted) setLoadingSubjects(false) }); return () => controller.abort() }, [accessToken, branchId, refreshKey])
  const info = (subject: Subject) => {
    const mappings = curriculum.filter((item) => item.subjectId === subject.id)
    const name = subject.name.toLowerCase()
    const categoryName = mappings.some((item) => item.isElective) ? 'Elective' : /english|hindi|kannada|sanskrit|language/.test(name) ? 'Language' : /physical|art|music|yoga/.test(name) ? 'Co-curricular' : 'Core'
    return { mappings, categoryName, periods: mappings.length ? Math.round(mappings.reduce((sum, item) => sum + (item.periodsPerWeek ?? 0), 0) / mappings.length) : 0, lab: mappings.some((item) => item.isLab) || /science|physics|chemistry|biology|computer/.test(name) }
  }
  const rows = subjects.filter((subject) => { const details = info(subject); return (!search || `${subject.name} ${subject.subjectCode}`.toLowerCase().includes(search.toLowerCase())) && (category === 'All Categories' || details.categoryName === category) })
  const totals = subjects.reduce((all, subject) => { const details = info(subject); all[details.categoryName] = (all[details.categoryName] ?? 0) + 1; return all }, {} as Record<string, number>)
  const exportRows = () => {
    const text = ['Code,Subject,Category,Weekly periods,Lab,Classes', ...rows.map((subject) => { const details = info(subject); return [subject.subjectCode, subject.name, details.categoryName, details.periods, details.lab ? 'Yes' : 'No', subject.classesCount].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',') })].join('\n')
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = 'subjects.csv'; link.click(); URL.revokeObjectURL(url)
  }
  if (loadingReference || loadingSubjects) return <AcademicWorkspaceSkeleton />
  return <section className="subjects-reference" aria-label="Subjects and curriculum">
    <div className="subject-reference-tabs" role="tablist">{['Subjects', 'Class Mapping', 'Teacher Mapping', 'Curriculum'].map((label) => <button key={label} type="button" role="tab" aria-selected={tab === label} className={tab === label ? 'active' : ''} onClick={() => setTab(label)}>{label}</button>)}</div>
    {tab === 'Subjects' ? <>
      <div className="subject-reference-filters"><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search subjects..." aria-label="Search subjects" /><select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter subject category">{['All Categories', 'Language', 'Core', 'Elective', 'Co-curricular'].map((item) => <option key={item}>{item}</option>)}</select><div><button className="button-secondary btn-sm" type="button" onClick={exportRows}><Download size={14} /> Export</button><button aria-label="Add subject" className="button-primary btn-sm" type="button" onClick={onAdd}><Plus size={14} /> Add Subject</button></div></div>
      <div className="classes-kpis"><ReferenceMetric label="Total Subjects" value={subjects.length} hint="▲ This branch" icon={<BookOpen size={19} />} /><ReferenceMetric label="Core Subjects" value={totals.Core ?? 0} hint="▲ Required subjects" icon={<CheckCircle2 size={19} />} /><ReferenceMetric label="Lab Subjects" value={subjects.filter((subject) => info(subject).lab).length} hint="▲ Require lab rooms" icon={<School size={19} />} /><ReferenceMetric label="Electives" value={totals.Elective ?? 0} hint="▲ Optional subjects" icon={<Star size={19} />} /></div>
      <div className="subject-table-wrap"><table className="subject-reference-table"><thead><tr><th>Code</th><th>Subject</th><th>Category</th><th>Weekly Periods</th><th>Lab</th><th>Classes</th><th>Teachers</th><th>Actions</th></tr></thead><tbody>{rows.map((subject) => { const details = info(subject); return <tr key={subject.id}><td><code>{subject.subjectCode}</code></td><td><strong>{subject.name}</strong></td><td><span className={`subject-category ${details.categoryName.toLowerCase().replaceAll(' ', '-')}`}>{details.categoryName}</span></td><td><b>{details.periods}</b> <small>per week</small></td><td>{details.lab ? <span className="yes-pill"><Check size={13} /> Yes</span> : '—'}</td><td>{subject.classesCount || details.mappings.length} classes</td><td><span className="teacher-pill">0 assigned</span></td><td><span className="academics-row-actions"><button className="button-secondary btn-sm" type="button" aria-label={`View ${subject.name}`} onClick={() => setViewing(subject)}><Eye size={15} /></button><button className="button-secondary btn-sm" type="button" aria-label={`Edit ${subject.name}`} onClick={() => onEdit(subject)}><Pencil size={15} /></button></span></td></tr> })}</tbody></table>{!rows.length ? <p className="subject-empty">No subjects match the selected filters.</p> : null}</div>
    </> : tab === 'Class Mapping' ? <ClassMapping accessToken={accessToken} curriculum={curriculum} subjects={subjects} classes={classes} /> : tab === 'Teacher Mapping' ? <TeacherMapping accessToken={accessToken} branchId={branchId} subjects={subjects} curriculum={curriculum} classes={classes} /> : <CurriculumOverview curriculum={curriculum} subjects={subjects} classes={classes} onOpenMapping={() => setTab('Class Mapping')} />}
    <Modal open={Boolean(viewing)} title={viewing?.name ?? 'Subject'} description="Subject details" onClose={() => setViewing(null)} footer={<button className="button-primary" type="button" onClick={() => { if (viewing) onEdit(viewing); setViewing(null) }}>Edit subject</button>}>{viewing ? <div className="subject-modal"><p><b>Code:</b> {viewing.subjectCode}</p><p><b>Category:</b> {info(viewing).categoryName}</p><p><b>Weekly periods:</b> {info(viewing).periods}</p><p><b>Mapped classes:</b> {viewing.classesCount || info(viewing).mappings.length}</p></div> : null}</Modal>
  </section>
}

function CurriculumOverview({ curriculum, subjects, classes, onOpenMapping }: { curriculum: ClassSubject[]; subjects: Subject[]; classes: AcademicClass[]; onOpenMapping: () => void }) {
  const [selectedClass, setSelectedClass] = useState(classes[0]?.id ?? '')
  useEffect(() => {
    if (!classes.some((item) => item.id === selectedClass)) setSelectedClass(classes[0]?.id ?? '')
  }, [classes, selectedClass])
  const selectedClassName = classes.find((item) => item.id === selectedClass)?.name ?? 'Select a class'
  const rows = curriculum.filter((item) => item.classId === selectedClass)
  const totalPeriods = rows.reduce((sum, item) => sum + (item.periodsPerWeek ?? 0), 0)
  const labCount = rows.filter((item) => item.isLab).length
  const electiveCount = rows.filter((item) => item.isElective).length
  const subjectName = (id: string) => subjects.find((item) => item.id === id)?.name ?? 'Unknown subject'
  const subjectCode = (id: string, fallback: string) => subjects.find((item) => item.id === id)?.subjectCode || fallback || '—'
  return <section className="class-mapping-panel curriculum-overview"><div className="class-mapping-toolbar"><div><strong>Curriculum overview</strong><p>Review the complete subject plan for each class and academic year.</p></div><div className="class-mapping-controls"><select aria-label="Curriculum class" value={selectedClass} onChange={(event) => setSelectedClass(event.target.value)}><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button-secondary btn-sm" type="button" onClick={onOpenMapping}><Pencil size={14} /> Edit class mapping</button></div></div><div className="classes-kpis"><ReferenceMetric label="Subjects" value={rows.length} hint={selectedClassName} icon={<BookOpen size={19} />} /><ReferenceMetric label="Weekly periods" value={totalPeriods} hint="Total scheduled periods" icon={<CalendarDays size={19} />} /><ReferenceMetric label="Lab subjects" value={labCount} hint="Require lab allocation" icon={<School size={19} />} /><ReferenceMetric label="Electives" value={electiveCount} hint="Optional subjects" icon={<Star size={19} />} /></div><div className="subject-table-wrap"><table className="subject-reference-table"><thead><tr><th>Subject</th><th>Code</th><th>Type</th><th>Periods / week</th><th>Lab / room</th><th>Status</th></tr></thead><tbody>{rows.map((mapping) => <tr key={mapping.id}><td><strong>{subjectName(mapping.subjectId)}</strong></td><td><code>{subjectCode(mapping.subjectId, mapping.subjectCode)}</code></td><td>{mapping.isElective ? 'Elective' : 'Core'}</td><td>{mapping.periodsPerWeek ?? '—'}</td><td>{mapping.isLab ? (mapping.roomId ? 'Lab allocated' : 'Lab room pending') : 'Not applicable'}</td><td><span className={`status-badge ${mapping.isLab && !mapping.roomId ? 'tone-warning' : 'tone-success'}`}>{mapping.isLab && !mapping.roomId ? 'Needs setup' : 'Configured'}</span></td></tr>)}</tbody></table>{!rows.length && <div className="subject-empty"><strong>No curriculum configured for {selectedClassName}.</strong><p>Use Edit class mapping to assign subjects to this class.</p><button className="button-primary btn-sm" type="button" onClick={onOpenMapping}><Plus size={14} /> Add class subject</button></div>}</div><small className="section-caption">Showing {rows.length} subject{rows.length === 1 ? '' : 's'} for {selectedClassName}.</small></section>
}

function AcademicWorkspaceSkeleton() {
  const content = <section className="subjects-reference academics-loading-skeleton"><div className="skeleton-heading"><span className="skeleton-line skeleton-title" /><span className="skeleton-line skeleton-copy" /></div><div className="skeleton-tabs"><span /><span /><span /><span /></div><div className="skeleton-toolbar"><span className="skeleton-line" /><span className="skeleton-line" /><span className="skeleton-button" /></div><div className="skeleton-metrics"><span /><span /><span /><span /></div><div className="skeleton-table"><span /><span /><span /><span /><span /></div></section>
  return <BoneScreen name="academic-structure-subjects" loading label="Loading subjects and curriculum" fallback={content}>{content}</BoneScreen>
}

type StaffMappingOption = { id: string; userId?: string; fullName: string; role?: string }
function TeacherMapping({ accessToken, branchId, subjects, curriculum, classes }: { accessToken: string; branchId?: string; subjects: Subject[]; curriculum: ClassSubject[]; classes: AcademicClass[] }) {
  const [sections, setSections] = useState<ClassSection[]>([])
  const [teachers, setTeachers] = useState<StaffMappingOption[]>([])
  const [assignments, setAssignments] = useState<SubjectTeacherAssignment[]>([])
  const [classId, setClassId] = useState('')
  const [sectionId, setSectionId] = useState('')
  const [subjectId, setSubjectId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all([
      listSections(accessToken, { page: 1, pageSize: 100, branchId }, controller.signal),
      adminRequest<{ items: StaffMappingOption[] }>(accessToken, `staff?page=1&pageSize=100${branchId ? `&branchId=${encodeURIComponent(branchId)}` : ''}`, { signal: controller.signal }),
    ]).then(([sectionPage, staffPage]) => {
      setSections(sectionPage.items)
      setTeachers(staffPage.items.filter((staff) => !staff.role || staff.role.toUpperCase() === 'TEACHER').map((staff) => ({ ...staff, id: staff.userId ?? staff.id })))
    }).catch(() => { if (!controller.signal.aborted) setError('Classes, sections, or teachers could not be loaded.') })
    return () => controller.abort()
  }, [accessToken, branchId])
  useEffect(() => {
    const controller = new AbortController()
    void listSubjectTeacherAssignments(accessToken, { page: 1, pageSize: 100 }, controller.signal).then((page) => setAssignments(page.items)).catch(() => { if (!controller.signal.aborted) setError('Teacher mappings could not be loaded.') })
    return () => controller.abort()
  }, [accessToken, revision])
  const save = async () => {
    if (!classId || !subjectId || !teacherId || (classSections.length > 0 && !sectionId)) { setError(classSections.length ? 'Select a class, section, subject, and teacher.' : 'Select a class, subject, and teacher.'); return }
    setBusy(true); setError('')
    try { await createSubjectTeacherAssignment(accessToken, sectionId ? { classSectionId: sectionId, subjectId, teacherId } : { classId, subjectId, teacherId }); setClassId(''); setSectionId(''); setSubjectId(''); setTeacherId(''); setRevision((value) => value + 1) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Teacher mapping could not be saved.') } finally { setBusy(false) }
  }
  const remove = async (assignment: SubjectTeacherAssignment) => {
    if (!window.confirm(`Remove ${assignment.teacher.fullName} from ${assignment.subject.name}?`)) return
    setBusy(true); setError('')
    try { await deleteSubjectTeacherAssignment(accessToken, assignment.id); setRevision((value) => value + 1) } catch (cause) { setError(cause instanceof Error ? cause.message : 'Teacher mapping could not be removed.') } finally { setBusy(false) }
  }
  const classSections = sections.filter((section) => section.grade.id === classId)
  const availableSubjects = classId ? curriculum.filter((mapping) => mapping.classId === classId).map((mapping) => subjects.find((subject) => subject.id === mapping.subjectId)).filter((subject): subject is Subject => Boolean(subject)) : []
  const changeClass = (value: string) => { setError(''); setClassId(value); setSectionId(''); setSubjectId('') }
  return <section className="class-mapping-panel"><div className="class-mapping-toolbar"><div><strong>Teacher mapping</strong><p>Select a class, then a section when sections are configured, followed by a mapped subject and teacher.</p></div><div className="class-mapping-controls"><select aria-label="Mapping class" value={classId} onChange={(event) => changeClass(event.target.value)}><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>{classSections.length > 0 && <select aria-label="Mapping section" value={sectionId} onChange={(event) => setSectionId(event.target.value)} disabled={!classId}><option value="">Select section</option>{classSections.map((section) => <option key={section.id} value={section.id}>{section.sectionName}</option>)}</select>}<select aria-label="Mapping subject" value={subjectId} disabled={!classId} onChange={(event) => setSubjectId(event.target.value)}><option value="">{classId ? (availableSubjects.length ? 'Select subject' : 'No subjects mapped') : 'Select class first'}</option>{availableSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select><select aria-label="Mapping teacher" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}><option value="">Select teacher</option>{teachers.map((teacher) => <option key={teacher.id} value={teacher.id}>{teacher.fullName}</option>)}</select><button className="button-primary btn-sm" type="button" disabled={busy} onClick={() => void save()}><Plus size={14} /> Map teacher</button></div></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="subject-table-wrap"><table className="subject-reference-table"><thead><tr><th>Class section</th><th>Subject</th><th>Teacher</th><th>Actions</th></tr></thead><tbody>{assignments.map((assignment) => <tr key={assignment.id}><td>{assignment.classSectionLabel ?? assignment.classSectionId}</td><td><strong>{assignment.subject.name}</strong><small>{assignment.subject.subjectCode}</small></td><td>{assignment.teacher.fullName}</td><td><button className="button-secondary btn-sm danger-text" type="button" disabled={busy} onClick={() => void remove(assignment)}>Remove</button></td></tr>)}</tbody></table>{!assignments.length && <p className="subject-empty">No teacher mappings yet. Select a class, section if available, subject, and teacher above.</p>}</div><small className="section-caption">Showing {assignments.length} teacher mapping{assignments.length === 1 ? '' : 's'}.</small></section>
}

function Term({ title, start, end, value, active, onEdit }: { title: string; start: string; end: string; value: number; active: boolean; onEdit?: () => void }) { return <article><strong>{title}</strong><em className={active ? 'active' : ''}>{active ? 'Current' : 'Upcoming'}</em><small>{formatDate(start)} — {formatDate(end)}</small><i><b style={{ width: `${value}%` }} /></i><small>{Math.round(value)}% complete</small>{onEdit && <button className="button-secondary btn-sm" type="button" onClick={onEdit}><Pencil size={13} /> Edit</button>}</article> }

function ClassMapping({ accessToken, curriculum, subjects, classes }: { accessToken: string; curriculum: ClassSubject[]; subjects: Subject[]; classes: AcademicClass[] }) {
  const [selectedClass, setSelectedClass] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [periods, setPeriods] = useState('5')
  const [maxMarks, setMaxMarks] = useState('100')
  const [elective, setElective] = useState(false)
  const [editing, setEditing] = useState<ClassSubject | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const className = (id: string) => classes.find((item) => item.id === id)?.name ?? 'Unknown class'
  const saveMapping = async () => {
    if (!selectedClass || !selectedSubject) {
      setError('Select both a class and a subject before mapping.')
      return
    }
    const duplicate = curriculum.some((mapping) => mapping.classId === selectedClass && mapping.subjectId === selectedSubject && mapping.id !== editing?.id)
    if (duplicate) {
      setError('This subject is already mapped to the selected class.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const input = { classId: selectedClass, subjectId: selectedSubject, periodsPerWeek: Number(periods), isElective: elective, defaultMaxMarks: Number(maxMarks), sortOrder: editing?.sortOrder ?? 0 }
      if (editing) await updateClassSubject(accessToken, editing.id, input)
      else await createClassSubject(accessToken, input)
      setEditing(null); setSelectedClass(''); setSelectedSubject(''); setPeriods('5'); setMaxMarks('100'); setElective(false); window.location.reload()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The class-subject mapping could not be saved.')
    } finally { setBusy(false) }
  }
  const editMapping = (mapping: ClassSubject) => { setError(''); setEditing(mapping); setSelectedClass(mapping.classId); setSelectedSubject(mapping.subjectId); setPeriods(String(mapping.periodsPerWeek ?? 5)); setMaxMarks(String(mapping.defaultMaxMarks ?? 100)); setElective(mapping.isElective) }
  const removeMapping = async (mapping: ClassSubject) => { if (!window.confirm(`Remove ${mapping.subject.name} from ${className(mapping.classId)}?`)) return; setBusy(true); setError(''); try { await deleteClassSubject(accessToken, mapping.id); window.location.reload() } catch (cause) { setError(cause instanceof Error ? cause.message : 'The mapping could not be removed.') } finally { setBusy(false) } }
  const cancelMapping = () => { setEditing(null); setSelectedClass(''); setSelectedSubject(''); setPeriods('5'); setMaxMarks('100'); setElective(false); setError('') }
  return <section className="class-mapping-panel"><div className="class-mapping-toolbar"><div><strong>Class mapping</strong><p>Assign subjects to classes and edit their weekly periods, marks, and elective status.</p></div><div className="class-mapping-controls"><select aria-label="Mapping class" value={selectedClass} onChange={(event) => { setError(''); setSelectedClass(event.target.value) }}><option value="">Select class</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Mapping subject" value={selectedSubject} onChange={(event) => { setError(''); setSelectedSubject(event.target.value) }}><option value="">Select subject</option>{subjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="button-primary btn-sm" type="button" disabled={busy} onClick={() => void saveMapping()}><Plus size={14} /> {editing ? 'Save mapping' : 'Map subject'}</button>{(editing || selectedClass || selectedSubject) && <button className="button-secondary btn-sm" type="button" disabled={busy} onClick={cancelMapping}>Cancel</button>}</div></div>{error && <p className="form-error" role="alert">{error}</p>}<div className="subject-table-wrap"><table className="subject-reference-table"><thead><tr><th>Class</th><th>Subject</th><th>Code</th><th>Weekly periods</th><th>Max marks</th><th>Type</th><th>Actions</th></tr></thead><tbody>{curriculum.map((mapping) => <tr key={mapping.id}><td><strong>{className(mapping.classId)}</strong></td><td>{mapping.subject.name}</td><td><code>{mapping.subjectCode}</code></td><td>{mapping.periodsPerWeek ?? '—'}</td><td>{mapping.defaultMaxMarks ?? '—'}</td><td>{mapping.isElective ? 'Elective' : 'Core'}</td><td><span className="academics-row-actions"><button className="button-secondary btn-sm" type="button" onClick={() => editMapping(mapping)}><Pencil size={14} /> Edit</button><button className="button-secondary btn-sm danger-text" type="button" disabled={busy} onClick={() => void removeMapping(mapping)}>Remove</button></span></td></tr>)}</tbody></table>{!curriculum.length && <p className="subject-empty">No mappings yet. Select a class and subject above to create the first mapping.</p>}</div><small className="section-caption">Showing {curriculum.length} mapping{curriculum.length === 1 ? '' : 's'} · refreshed with catalogue changes.</small></section>
}

function TermEditor({ accessToken, year, editor, onClose, onSaved }: { accessToken: string; year?: AcademicYear; editor: AcademicTerm | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  if (!editor || !year) return null
  const record = editor === 'new' ? undefined : editor
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSaving(true)
    const form = new FormData(event.currentTarget)
    const input = { academicYearId: year.id, name: String(form.get('name') ?? ''), startDate: String(form.get('startDate') ?? ''), endDate: String(form.get('endDate') ?? ''), sortOrder: Number(form.get('sortOrder') ?? 0) }
    try { if (record) await updateAcademicTerm(accessToken, record.id, input); else await createAcademicTerm(accessToken, input); onSaved() } finally { setSaving(false) }
  }
  return <Modal open title={record ? `Edit ${record.name}` : 'Add academic term'} description={`Configure a term within ${year.name}. Dates must fall inside the academic year.`} onClose={() => !saving && onClose()} footer={<><button className="button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button-primary" type="submit" form="academic-term-form" disabled={saving}>{saving ? 'Saving…' : 'Save term'}</button></>}><form id="academic-term-form" className="academics-form" onSubmit={submit}><FormField id="academic-term-name" label="Term name" required><input name="name" defaultValue={record?.name ?? `Term ${2}`} required maxLength={80} /></FormField><FormField id="academic-term-start" label="Start date" required><input name="startDate" type="date" defaultValue={record?.startDate ?? year.startDate} required /></FormField><FormField id="academic-term-end" label="End date" required><input name="endDate" type="date" defaultValue={record?.endDate ?? year.endDate} required /></FormField><FormField id="academic-term-order" label="Display order"><input name="sortOrder" type="number" min={0} step={1} defaultValue={record?.sortOrder ?? 0} /></FormField></form></Modal>
}
function YearCell({ title, text }: { title: string; text: string }) { return <div><strong>{title}</strong><span>{text}</span></div> }

function ReferenceMetric({ label, value, hint, icon }: { label: string; value: string | number; hint: string; icon: ReactNode }) { return <div><span>{label}</span><i>{icon}</i><strong>{typeof value === 'number' ? value.toLocaleString() : value}</strong><small>{hint}</small></div> }

function fieldErrors(error: AcademicsApiError | null): FormError[] {
  if (!error) return []
  const labels: Record<string, string> = {
    name: 'Name',
    startDate: 'Start date',
    endDate: 'End date',
    sortOrder: 'Sort order',
    subjectCode: 'Subject code',
    branchId: 'Branch',
    gradeId: 'Class',
    academicYearId: 'Academic year',
    sectionName: 'Section name',
    classTeacherId: 'Class teacher',
    maxStrength: 'Maximum strength',
    nonFieldErrors: 'Form',
  }
  const entries: FormError[] = Object.entries(error.fieldErrors).flatMap(([field, messages]) =>
    messages.map((message) => ({
      fieldId: `academics-field-${field}`,
      label: labels[field] ?? field,
      message,
    }))
  )
  if (!entries.length) entries.push({ fieldId: 'academics-editor-form', message: error.message })
  return entries
}

function AcademicEditor({
  accessToken,
  editor,
  branches,
  teachers,
  years,
  classes,
  rooms,
  curriculum,
  selectedBranch,
  onClose,
  onSaved,
}: {
  accessToken: string
  editor: EditorState | null
  branches: readonly AcademicBranchOption[]
  teachers: readonly AcademicTeacherOption[]
  years: readonly AcademicYear[]
  classes: readonly AcademicClass[]
  rooms: readonly Room[]
  curriculum: readonly ClassSubject[]
  selectedBranch: string
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<AcademicsApiError | null>(null)
  const record = editor?.record
  const section = editor?.resource === 'sections' ? (record as ClassSection | undefined) : undefined
  const defaultBranchId = section?.branch.id ?? (selectedBranch === 'all' ? '' : selectedBranch)
  const [sectionBranchId, setSectionBranchId] = useState(defaultBranchId)

  if (!editor) return null

  const resourceLabels: Record<AcademicResource, string> = {
    'academic-years': 'academic year',
    classes: 'class',
    subjects: 'subject',
    sections: 'section',
  }
  const resourceLabel = resourceLabels[editor.resource]
  const title = `${record ? 'Edit' : 'Add'} ${resourceLabel}`
  const availableTeachers = teachers.filter((teacher) => !sectionBranchId || teacher.branchId === sectionBranchId)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    let input: Record<string, unknown>
    if (editor.resource === 'academic-years') {
      input = {
        name: form.get('name'),
        startDate: toIsoDate(form.get('startDate')),
        endDate: toIsoDate(form.get('endDate')),
        isCurrent: form.get('isCurrent') === 'on',
      }
    } else if (editor.resource === 'classes') {
      input = { name: form.get('name'), sortOrder: Number(form.get('sortOrder') || 0) }
    } else if (editor.resource === 'subjects') {
      input = { name: form.get('name'), subjectCode: form.get('subjectCode') }
    } else {
      input = {
        branchId: form.get('branchId'),
        gradeId: form.get('gradeId'),
        academicYearId: form.get('academicYearId'),
        sectionName: form.get('sectionName'),
        classTeacherId: form.get('classTeacherId') || null,
        maxStrength: form.get('maxStrength') ? Number(form.get('maxStrength')) : null,
      }
    }
    setSaving(true)
    setError(null)
    try {
      if (record) await updateAcademicRecord(accessToken, editor.resource, record.id, input as never)
      else {
        const created = await createAcademicRecord<Subject>(accessToken, editor.resource, input as never)
        const classId = editor.resource === 'subjects' ? String(form.get('classId') || '') : ''
        if (classId) await createClassSubject(accessToken, { classId, subjectId: created.id, periodsPerWeek: Number(form.get('periodsPerWeek') || 5), isElective: form.get('isElective') === 'on', isLab: form.get('isLab') === 'on', roomId: form.get('roomId') || null })
      }
      if (editor.resource === 'subjects' && record) {
        const mapping = curriculum.find((item) => item.subjectId === record.id)
        const classId = String(form.get('classId') || '')
        if (mapping && classId) await updateClassSubject(accessToken, mapping.id, { classId, subjectId: record.id, periodsPerWeek: Number(form.get('periodsPerWeek') || 5), isElective: form.get('isElective') === 'on', isLab: form.get('isLab') === 'on', roomId: form.get('roomId') || null })
      }
      onSaved()
    } catch (cause) {
      setError(asApiError(cause, `The ${resourceLabel.toLowerCase()} could not be saved.`))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      title={title}
      description={`Fields marked with an asterisk are required.`}
      size={editor.resource === 'sections' ? 'large' : 'medium'}
      closeOnBackdrop={!saving}
      closeOnEscape={!saving}
      onClose={() => {
        if (!saving) onClose()
      }}
      footer={
        <>
          <button className="button-secondary" type="button" disabled={saving} onClick={onClose}>
            Cancel
          </button>
          <button className="button-primary" type="submit" form="academics-editor-form" disabled={saving}>
            {saving ? 'Saving…' : `Save ${resourceLabel}`}
          </button>
        </>
      }
    >
      <form id="academics-editor-form" className="academics-form" noValidate onSubmit={submit}>
        <ErrorSummary errors={fieldErrors(error)} />
        {error?.traceId ? <p className="academics-trace academics-form__wide">Reference: {error.traceId}</p> : null}
        {editor.resource === 'academic-years' && (
          <AcademicYearFields record={record as AcademicYear | undefined} errors={error?.fieldErrors} />
        )}
        {editor.resource === 'classes' && (
          <ClassFields record={record as AcademicClass | undefined} errors={error?.fieldErrors} />
        )}
        {editor.resource === 'subjects' && (
          <SubjectFields record={record as Subject | undefined} classes={classes} rooms={rooms} mapping={curriculum.find((item) => item.subjectId === record?.id)} errors={error?.fieldErrors} />
        )}
        {editor.resource === 'sections' && (
          <SectionFields
            record={section}
            teachers={availableTeachers}
            years={years}
            classes={classes}
            branchId={sectionBranchId}
            errors={error?.fieldErrors}
          />
        )}
      </form>
    </Modal>
  )
}

const firstError = (errors: Record<string, string[]> | undefined, field: string) => errors?.[field]?.[0]

function AcademicYearFields({ record, errors }: { record?: AcademicYear; errors?: Record<string, string[]> }) {
  return (
    <>
      <FormField id="academics-field-name" label="Year name" required error={firstError(errors, 'name')} hint="e.g. 2026-27">
        <input name="name" defaultValue={record?.name} maxLength={20} required autoFocus placeholder="2026-27" />
      </FormField>
      <FormField id="academics-field-startDate" label="Start date" required error={firstError(errors, 'startDate')}>
        <input name="startDate" type="date" defaultValue={record?.startDate ?? ''} required />
      </FormField>
      <FormField id="academics-field-endDate" label="End date" required error={firstError(errors, 'endDate')}>
        <input name="endDate" type="date" defaultValue={record?.endDate ?? ''} required />
      </FormField>
      <FormField id="academics-field-isCurrent" label="Set as Current Year" hint="Making this current replaces the institute's existing current year.">
        <input name="isCurrent" type="checkbox" defaultChecked={record?.isCurrent} />
      </FormField>
    </>
  )
}

function ClassFields({ record, errors }: { record?: AcademicClass; errors?: Record<string, string[]> }) {
  return (
    <>
      <FormField id="academics-field-name" label="Class name" required error={firstError(errors, 'name')}>
        <input name="name" defaultValue={record?.name} maxLength={50} required autoFocus placeholder="e.g. Grade 8" />
      </FormField>
      <FormField id="academics-field-sortOrder" label="Sort order" required error={firstError(errors, 'sortOrder')} hint="Lower numbers appear first in lists.">
        <input name="sortOrder" type="number" defaultValue={record?.sortOrder ?? 0} min={0} step={1} required />
      </FormField>
    </>
  )
}

function SubjectFields({ record, classes, rooms, mapping, errors }: { record?: Subject; classes: readonly AcademicClass[]; rooms: readonly Room[]; mapping?: ClassSubject; errors?: Record<string, string[]> }) {
  const [isLab, setIsLab] = useState(mapping?.isLab ?? false)
  return (
    <>
      <FormField id="academics-field-name" label="Subject name" required error={firstError(errors, 'name')}>
        <input name="name" defaultValue={record?.name} maxLength={100} required autoFocus placeholder="e.g. Mathematics" />
      </FormField>
      <FormField id="academics-field-subjectCode" label="Subject code" error={firstError(errors, 'subjectCode')} hint="Short code, e.g. MATH">
        <input name="subjectCode" defaultValue={record?.subjectCode} maxLength={20} placeholder="MATH" />
      </FormField>
      <>
        <FormField id="academics-field-classId" label="Add to class" hint="Optional. The subject will also be added to this class curriculum.">
          <select name="classId" defaultValue={mapping?.classId ?? ''}><option value="">Do not assign yet</option>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        </FormField>
        <FormField id="academics-field-periodsPerWeek" label="Weekly periods" hint="How many periods this subject has each week.">
          <input name="periodsPerWeek" type="number" min={1} max={60} defaultValue={mapping?.periodsPerWeek ?? 5} required />
        </FormField>
        <FormField id="academics-field-isElective" label="Elective subject" hint="Mark this subject as optional for the selected class.">
          <input name="isElective" type="checkbox" defaultChecked={mapping?.isElective ?? false} />
        </FormField>
        <FormField id="academics-field-isLab" label="Lab subject" hint="Mark this subject as requiring a laboratory room.">
          <input name="isLab" type="checkbox" checked={isLab} onChange={(event) => setIsLab(event.target.checked)} />
        </FormField>
        {isLab && <FormField id="academics-field-roomId" label="Laboratory room" hint="Optional. Only rooms created as laboratories are shown.">
          <select name="roomId" defaultValue={mapping?.roomId ?? ''}><option value="">No laboratory allocated</option>{rooms.filter((room) => ['LAB', 'LABORATORY'].includes(room.roomType.toUpperCase())).map((room) => <option key={room.id} value={room.id}>{room.name} · {room.branch.name}</option>)}</select>
        </FormField>}
      </>
    </>
  )
}

function SectionFields({
  record,
  teachers,
  years,
  classes,
  branchId,
  errors,
}: {
  record?: ClassSection
  teachers: readonly AcademicTeacherOption[]
  years: readonly AcademicYear[]
  classes: readonly AcademicClass[]
  branchId: string
  errors?: Record<string, string[]>
}) {
  return (
    <>
      <input type="hidden" name="branchId" value={branchId} />
      <FormField id="academics-field-academicYearId" label="Academic year" required error={firstError(errors, 'academicYearId')}>
        <select name="academicYearId" defaultValue={record?.academicYear.id ?? years.find((year) => year.isCurrent)?.id ?? ''} required>
          <option value="" disabled>Select academic year</option>
          {years.map((year) => (
            <option key={year.id} value={year.id}>
              {year.name} {year.isCurrent ? ' — Current' : ''}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="academics-field-gradeId" label="Class" required error={firstError(errors, 'gradeId')}>
        <select name="gradeId" defaultValue={record?.grade.id ?? ''} required>
          <option value="" disabled>Select class</option>
          {classes.map((grade) => (
            <option key={grade.id} value={grade.id}>
              {grade.name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="academics-field-sectionName" label="Section name" required error={firstError(errors, 'sectionName')} hint="For example, A, B, or Blue.">
        <input name="sectionName" defaultValue={record?.sectionName} maxLength={20} required placeholder="A" />
      </FormField>
      <FormField id="academics-field-classTeacherId" label="Class teacher" error={firstError(errors, 'classTeacherId')} hint={!branchId ? 'Select a branch first.' : teachers.length ? 'Optional.' : 'No teachers found for this branch.'}>
        <select name="classTeacherId" defaultValue={record?.classTeacher?.id ?? ''} disabled={!branchId}>
          <option value="">Unassigned</option>
          {teachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>
              {teacher.fullName} {teacher.email ? `— ${teacher.email}` : ''}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="academics-field-maxStrength" label="Maximum strength" error={firstError(errors, 'maxStrength')} hint="Leave blank for unlimited.">
        <input name="maxStrength" type="number" defaultValue={record?.maxStrength ?? ''} min={1} step={1} placeholder="35" />
      </FormField>
    </>
  )
}

function RecordAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="button-secondary btn-sm academics-action" aria-label={label} type="button" onClick={onClick}>
      <Pencil size={13} aria-hidden="true" /> Edit
    </button>
  )
}

async function loadReferenceData(accessToken: string, branchId: string | undefined, signal: AbortSignal) {
  const params = { page: 1, pageSize: 100 as const }
  const scopedParams = { ...params, branchId }
  const [years, classes] = await Promise.all([listAcademicYears(accessToken, scopedParams, signal), listClasses(accessToken, scopedParams, signal)])
  return { years: years.items, classes: classes.items }
}

export function AcademicStructurePage({ accessToken, branches, selectedBranch, teachers = [], initialTab = 'years', pageTitle = 'Academic Structure', pageDescription = 'Configure academic years, classes, subjects, and branch sections.', showTabs = true }: AcademicStructurePageProps) {
  const [activeTab, setActiveTab] = useState<TabId>(initialTab)
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [years, setYears] = useState<AcademicYear[]>([])
  const [classesList, setClassesList] = useState<AcademicClass[]>([])
  const [curriculum, setCurriculum] = useState<ClassSubject[]>([])
  const [rooms, setRooms] = useState<Room[]>([])
  const [loadingClasses, setLoadingClasses] = useState(true)
  const [loadingCurriculum, setLoadingCurriculum] = useState(false)
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [curriculumClass, setCurriculumClass] = useState<AcademicClass | null>(null)
  const [sectionYear, setSectionYear] = useState('')
  const [sectionClass, setSectionClass] = useState('')
  const [actionError, setActionError] = useState<AcademicsApiError | null>(null)
  const branchId = selectedBranch === 'all' ? undefined : selectedBranch
  const branchName = selectedBranch === 'all' ? 'All branches' : branches.find((branch) => branch.id === selectedBranch)?.name ?? 'Selected branch'

  useEffect(() => {
    const controller = new AbortController()
    setLoadingClasses(true)
    void listClasses(accessToken, { page: 1, pageSize: 100, branchId }, controller.signal)
      .then((page) => { setClassesList(page.items); setActionError(null) })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setActionError(asApiError(cause, 'Classes could not be loaded.')) })
      .finally(() => { if (!controller.signal.aborted) setLoadingClasses(false) })
    return () => controller.abort()
  }, [accessToken, branchId, refreshKey])

  useEffect(() => {
    const controller = new AbortController()
    void listAcademicYears(accessToken, { page: 1, pageSize: 100, branchId }, controller.signal).then((page) => setYears(page.items)).catch(() => undefined)
    return () => controller.abort()
  }, [accessToken, branchId, refreshKey])

  useEffect(() => {
    if (activeTab !== 'subjects') return
    const controller = new AbortController()
    setLoadingCurriculum(true); setLoadingRooms(true)
    void listClassSubjects(accessToken, { page: 1, pageSize: 100, branchId }, controller.signal).then((page) => setCurriculum(page.items)).catch((cause: unknown) => { if (!controller.signal.aborted) setActionError(asApiError(cause, 'Curriculum mappings could not be loaded.')) }).finally(() => { if (!controller.signal.aborted) setLoadingCurriculum(false) })
    void listRooms(accessToken, { page: 1, pageSize: 100, branchId }, controller.signal).then((page) => setRooms(page.items)).catch(() => undefined).finally(() => { if (!controller.signal.aborted) setLoadingRooms(false) })
    return () => controller.abort()
  }, [accessToken, activeTab, branchId, refreshKey])

  const saved = () => {
    setEditor(null)
    setRefreshKey((value) => value + 1)
  }
  const edit = useCallback((resource: AcademicResource, record: AcademicRecord) => setEditor({ resource, record }), [])

  const sectionColumns = useMemo<DataTableColumn<ClassSection>[]>(() => [
    { id: 'section', header: 'Class & section', cell: (row) => <span className="academics-record-title"><strong>{row.grade.name} — {row.sectionName}</strong><small>{row.academicYear.name}</small></span> },
    { id: 'branch', header: 'Branch', cell: (row) => <span className="academics-record-title"><strong>{row.branch.name}</strong><small>{row.branch.code}</small></span> },
    { id: 'teacher', header: 'Class teacher', cell: (row) => row.classTeacher?.fullName ?? <span className="academics-muted">Unassigned</span>, hideOnSmall: true },
    { id: 'strength', header: 'Students', cell: (row) => `${row.enrollmentCount}${row.maxStrength ? ` / ${row.maxStrength}` : ''}`, align: 'end' },
    { id: 'actions', header: <span className="admin-sr-only">Actions</span>, align: 'end', cell: (row) => <RecordAction label={`Edit ${row.grade.name} ${row.sectionName}`} onClick={() => edit('sections', row)} /> },
  ], [edit])

  const tabs = [
    {
      id: 'years',
      label: 'Academic years',
      panel: (
        <AcademicYearsReference accessToken={accessToken} years={years} onAdd={() => setEditor({ resource: 'academic-years' })} onEdit={(year) => edit('academic-years', year)} />
      ),
    },
    {
      id: 'classes',
      label: 'Classes',
      panel: (
        <ClassesSectionsReference accessToken={accessToken} branchId={branchId} branchName={branchName} classes={classesList} onAddClass={() => setEditor({ resource: 'classes' })} onAddSection={() => setEditor({ resource: 'sections' })} onEditClass={(record) => edit('classes', record)} onEditSection={(record) => edit('sections', record)} refreshKey={refreshKey} />
      ),
    },
    {
      id: 'subjects',
      label: 'Subjects',
      panel: (
        <SubjectsReference accessToken={accessToken} branchId={branchId} curriculum={curriculum} classes={classesList} loadingReference={loadingClasses || loadingCurriculum} onAdd={() => setEditor({ resource: 'subjects' })} onEdit={(subject) => edit('subjects', subject)} refreshKey={refreshKey} />
      ),
    },
    {
      id: 'sections',
      label: 'Sections',
      panel: (
        <ResourcePanel
          key={`sections-${branchId ?? 'all'}-${sectionYear}-${sectionClass}`}
          accessToken={accessToken}
          resource="sections"
          title="Sections"
          description="Organise classes into sections per academic year and branch."
          addLabel="Add section"
          columns={sectionColumns}
          branchId={branchId}
          extraFilters={{ academicYearId: sectionYear || undefined, gradeId: sectionClass || undefined }}
          refreshKey={refreshKey}
          onCreate={() => setEditor({ resource: 'sections' })}
          filterControls={
            <>
              <label>
                <span>Academic year</span>
                <select aria-label="Filter sections by academic year" value={sectionYear} onChange={(event) => setSectionYear(event.target.value)}>
                  <option value="">All years</option>
                  {years.map((year) => (
                    <option key={year.id} value={year.id}>{year.name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Class</span>
                <select aria-label="Filter sections by class" value={sectionClass} onChange={(event) => setSectionClass(event.target.value)}>
                  <option value="">All classes</option>
                  {classesList.map((grade) => (
                    <option key={grade.id} value={grade.id}>{grade.name}</option>
                  ))}
                </select>
              </label>
            </>
          }
        />
      ),
    },
  ]

  return (
    <main className="academics-page entity-page" aria-labelledby="academic-structure-title">
      <div className="page-heading institute-subpage-heading">
        <div>
          <p className="breadcrumb">Institute Setup / {pageTitle}</p>
          <h1 id="academic-structure-title">{pageTitle}</h1>
          <p className="page-subtitle">{pageDescription}</p>
        </div>
      </div>

      {showTabs !== false ? <div className="academics-context" aria-label="Active branch context">
        <Building2 aria-hidden="true" />
        <strong>Active branch context:</strong>
        <span>{branchName}</span>
        {activeTab !== 'sections' ? <span> — Showing real records relevant to the selected branch.</span> : null}
      </div> : null}

      {actionError ? (
        <div className="admin-error-summary" role="alert">
          <strong>{actionError.message}</strong>
          {actionError.traceId ? <small className="academics-trace">Reference: {actionError.traceId}</small> : null}
          <button
            className="button-secondary"
            type="button"
            onClick={() => {
              setActionError(null)
              setRefreshKey((value) => value + 1)
            }}
          >
            Try again
          </button>
        </div>
      ) : null}

      {showTabs ? <Tabs label="Academic structure areas" tabs={tabs} activeId={activeTab} onChange={(id) => setActiveTab(id as TabId)} /> : tabs.find((tab) => tab.id === activeTab)?.panel}

      {curriculumClass ? <CurriculumManager accessToken={accessToken} grade={curriculumClass} subjects={curriculum.filter((item) => item.classId === curriculumClass.id)} onClose={() => setCurriculumClass(null)} onSaved={() => { setCurriculumClass(null); setRefreshKey((value) => value + 1) }} /> : null}

      <AcademicEditor
        key={editor ? `${editor.resource}-${editor.record?.id ?? 'new'}` : 'closed'}
        accessToken={accessToken}
        editor={editor}
        branches={branches}
        teachers={teachers}
        years={years}
        classes={classesList}
        rooms={rooms}
        curriculum={curriculum}
        selectedBranch={selectedBranch}
        onClose={() => setEditor(null)}
        onSaved={saved}
      />
    </main>
  )
}

function CurriculumManager({ accessToken, grade, subjects, onClose, onSaved }: { accessToken: string; grade: AcademicClass; subjects: ClassSubject[]; onClose: () => void; onSaved: () => void }) {
  const [catalog, setCatalog] = useState<Subject[]>([])
  const [subjectId, setSubjectId] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { void listSubjects(accessToken, { page: 1, pageSize: 100 }).then((result) => setCatalog(result.items)).catch(() => undefined) }, [accessToken])
  const available = catalog.filter((subject) => !subjects.some((item) => item.subjectId === subject.id))
  const add = async () => { if (!subjectId) return; setSaving(true); try { await createClassSubject(accessToken, { classId: grade.id, subjectId, periodsPerWeek: 5 }); onSaved() } finally { setSaving(false) } }
  return <Card className="curriculum-manager"><div className="academics-panel__heading"><div><h2>{grade.name} curriculum</h2><p>Choose subjects from the institute catalogue and set weekly periods.</p></div><button className="button-secondary" type="button" onClick={onClose}>Close</button></div><div className="curriculum-add"><select aria-label="Subject to add" value={subjectId} onChange={(event) => setSubjectId(event.target.value)}><option value="">Select subject</option>{available.map((subject) => <option key={subject.id} value={subject.id}>{subject.name} {subject.subjectCode ? `(${subject.subjectCode})` : ''}</option>)}</select><button className="button-primary" type="button" disabled={!subjectId || saving} onClick={() => void add()}>+ Add subject</button></div><div className="curriculum-list">{subjects.length ? subjects.map((item) => <div className="curriculum-row" key={item.id}><strong>{item.subject.name}</strong><span>{item.subjectCode || 'No code'}</span><span>{item.isElective ? 'Elective' : 'Core'}</span><span>{item.periodsPerWeek ?? '—'} periods/week</span><button className="button-secondary btn-sm" type="button" onClick={() => void deleteClassSubject(accessToken, item.id).then(onSaved)}>Remove</button></div>) : <p className="section-caption">No subjects assigned yet.</p>}</div></Card>
}
