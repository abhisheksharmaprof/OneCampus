import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import {
  Award, BarChart3, BookOpen, CalendarDays, Check, CheckCircle2, Clock3, Download,
  Edit3, FileText, FlaskConical, GraduationCap, NotebookPen, Plus, Search, Trash2, Users,
} from 'lucide-react'
import {
  createAcademicOperation, deleteAcademicOperation, listAcademicOperations, listClasses,
  listClassSubjects, updateAcademicOperation, type AcademicOperation,
  type AcademicOperationInput, type AcademicOperationKind,
} from './academics.api'
import type { AcademicClass, ClassSubject } from './academics.types'
import { BoneScreen } from '../../components/admin-ui'
import './academic-operations.css'

export type AcademicOperationsPageId = 'ACL1' | 'ACH1' | 'ACE1' | 'ACM1' | 'ACC1' | 'AHT1' | 'AAR1'
type Metric = { label: string; value: string | number; hint: string; icon: ReactNode; tone?: 'blue' | 'green' | 'amber' | 'violet' | 'red' }
type EditorKind = AcademicOperationKind | null

const value = (record: AcademicOperation, key: string, fallback = '—') => String(record.payload[key] ?? fallback)
const numeric = (record: AcademicOperation, key: string, fallback = 0) => Number(record.payload[key] ?? fallback)
const labelStatus = (status: string) => status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

function MetricGrid({ items }: { items: Metric[] }) {
  return <section className="aop-metrics" aria-label="Page summary">{items.map((item) => <article className={`aop-metric tone-${item.tone ?? 'blue'}`} key={item.label}><span>{item.label}</span><i>{item.icon}</i><strong>{item.value}</strong><small>{item.hint}</small></article>)}</section>
}

function PageHeader({ title, description, action, secondary }: { title: string; description: string; action: ReactNode; secondary?: ReactNode }) {
  return <header className="aop-header"><div><p>Academics / {title}</p><h1>{title}</h1><span>{description}</span></div><aside>{secondary}{action}</aside></header>
}

function Tabs<T extends string>({ tabs, active, onChange, label }: { tabs: readonly T[]; active: T; onChange: (tab: T) => void; label: string }) {
  return <nav className="aop-tabs" aria-label={label}>{tabs.map((tab) => <button key={tab} type="button" className={active === tab ? 'active' : ''} aria-current={active === tab ? 'page' : undefined} onClick={() => onChange(tab)}>{tab}</button>)}</nav>
}

function Status({ children }: { children: ReactNode }) {
  const tone = String(children).toLowerCase().replaceAll(' ', '-').replaceAll('_', '-')
  return <span className={`aop-status is-${tone}`}>{children}</span>
}

function Progress({ value: width }: { value: number }) { return <span className="aop-progress"><i style={{ width: `${Math.min(100, Math.max(0, width))}%` }} /></span> }

function EmptyState({ noun, onCreate }: { noun: string; onCreate?: () => void }) {
  return <div className="aop-empty"><FileText /><h2>No {noun} yet</h2><p>Create the first record. It will be saved to the institute database.</p>{onCreate && <button className="button-primary" type="button" onClick={onCreate}><Plus /> Create {noun.replace(/s$/, '')}</button>}</div>
}

function LoadingState() {
  const content = <div className="aop-empty"><span className="aop-spinner" /><h2>Loading academic data…</h2></div>
  return <BoneScreen name="academics-operations" loading label="Loading academic data" fallback={content}>{content}</BoneScreen>
}

function downloadRecords(filename: string, records: unknown) {
  const href = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a'); anchor.href = href; anchor.download = filename; anchor.click(); URL.revokeObjectURL(href)
}

function useOperations(accessToken: string, kinds: AcademicOperationKind[], selectedBranch: string) {
  const [records, setRecords] = useState<AcademicOperation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const branchId = selectedBranch === 'all' ? undefined : selectedBranch
  const kindKey = kinds.join(',')
  useEffect(() => {
    const controller = new AbortController()
    void Promise.all(kinds.map((kind) => listAcademicOperations(accessToken, kind, branchId, controller.signal)))
      .then((pages) => setRecords(pages.flatMap((page) => page.items)))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Academic data could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, branchId, kindKey, revision]) // eslint-disable-line react-hooks/exhaustive-deps
  return { records, loading, error, reload: () => setRevision((current) => current + 1), branchId }
}

function RecordEditor({ kind, record, branchId, busy, onClose, onSave }: { kind: EditorKind; record?: AcademicOperation; branchId?: string; busy: boolean; onClose: () => void; onSave: (input: AcademicOperationInput) => Promise<void> }) {
  if (!kind) return null
  const defaults = record?.payload ?? {}
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget)
    const title = String(form.get('title')).trim()
    const payload: AcademicOperation['payload'] = {
      subject: String(form.get('subject') ?? '').trim(), className: String(form.get('className') ?? '').trim(),
      teacher: String(form.get('teacher') ?? '').trim(), date: String(form.get('date') ?? '').trim(),
      description: String(form.get('description') ?? '').trim(), score: Number(form.get('score') ?? 0),
      maxMarks: Number(form.get('maxMarks') ?? 100), type: String(form.get('type') ?? '').trim(),
    }
    void onSave({ kind, title, status: String(form.get('status')), branchId: record?.branchId ?? branchId ?? null, payload })
  }
  const titleLabel = kind === 'LESSON_PLAN' ? 'Lesson topic' : kind === 'HOMEWORK' ? 'Assignment title' : kind === 'QUESTION' ? 'Question' : kind === 'MARK' ? 'Student name' : 'Exam name'
  return <div className="modal-backdrop"><form className="modal-card aop-editor" role="dialog" aria-modal="true" aria-label={record ? `Edit ${titleLabel}` : `Create ${titleLabel}`} onSubmit={submit}><header><div><h2>{record ? 'Edit' : 'Create'} {titleLabel}</h2><p>Changes are saved to the institute database.</p></div><button type="button" className="modal-close" aria-label="Close" onClick={onClose}>×</button></header><div className="aop-editor-grid"><label className="wide">{titleLabel}<input name="title" required maxLength={250} defaultValue={record?.title} /></label><label>Subject<input name="subject" defaultValue={String(defaults.subject ?? '')} /></label><label>Class / Grade<input name="className" defaultValue={String(defaults.className ?? '')} /></label>{kind === 'LESSON_PLAN' && <label>Teacher<input name="teacher" defaultValue={String(defaults.teacher ?? '')} /></label>}<label>{kind === 'HOMEWORK' ? 'Due date' : 'Date'}<input name="date" type="date" defaultValue={String(defaults.date ?? '')} /></label>{kind === 'QUESTION' && <label>Question type<select name="type" defaultValue={String(defaults.type ?? 'Short Answer')}><option>MCQ</option><option>Short Answer</option><option>Essay</option></select></label>}{kind === 'MARK' && <><label>Score<input name="score" type="number" min="0" defaultValue={Number(defaults.score ?? 0)} /></label><label>Maximum marks<input name="maxMarks" type="number" min="1" defaultValue={Number(defaults.maxMarks ?? 100)} /></label></>}<label>Status<select name="status" defaultValue={record?.status ?? 'DRAFT'}><option value="DRAFT">Draft</option><option value="SUBMITTED">Submitted</option><option value="APPROVED">Approved</option><option value="SCHEDULED">Scheduled</option><option value="ACTIVE">Active</option><option value="COMPLETED">Completed</option><option value="PUBLISHED">Published</option></select></label><label className="wide">Description<textarea name="description" rows={3} defaultValue={String(defaults.description ?? '')} /></label></div><footer><button className="button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save record'}</button></footer></form></div>
}

function RecordActions({ record, onEdit, onPatch, onDelete }: { record: AcademicOperation; onEdit: () => void; onPatch: (status: string) => void; onDelete: () => void }) {
  return <aside>{record.status === 'SUBMITTED' && <button className="button-primary" type="button" onClick={() => onPatch('APPROVED')}><Check /> Approve</button>}<button className="button-secondary" type="button" onClick={onEdit}><Edit3 /> Edit</button><button className="aop-icon-button" type="button" aria-label={`Delete ${record.title}`} onClick={onDelete}><Trash2 /></button></aside>
}

function LessonPlans({ records, loading, open, edit, patch, remove, exportData }: OperationViewProps) {
  const [query, setQuery] = useState(''); const plans = records.filter((item) => item.kind === 'LESSON_PLAN' && item.title.toLowerCase().includes(query.toLowerCase()))
  return <><PageHeader title="Lesson Plans" description="Weekly lesson plans by teacher, subject, and class. Review and approve." secondary={<button className="button-secondary" type="button" onClick={exportData}><Download /> Export</button>} action={<button className="button-primary" type="button" onClick={() => open('LESSON_PLAN')}><Plus /> New Plan</button>} /><MetricGrid items={[{ label: 'Total Plans', value: plans.length, hint: 'Persisted records', icon: <FileText /> }, { label: 'Draft', value: plans.filter((item) => item.status === 'DRAFT').length, hint: 'Awaiting submission', icon: <Clock3 />, tone: 'amber' }, { label: 'Submitted', value: plans.filter((item) => item.status === 'SUBMITTED').length, hint: 'Pending review', icon: <NotebookPen />, tone: 'violet' }, { label: 'Approved', value: plans.filter((item) => item.status === 'APPROVED').length, hint: 'Ready to teach', icon: <CheckCircle2 />, tone: 'green' }]} /><section className="aop-card aop-list-card"><div className="aop-toolbar"><label className="aop-search"><Search /><input aria-label="Search lesson plans" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search lesson plans…" /></label></div>{loading ? <LoadingState /> : plans.length === 0 ? <EmptyState noun="lesson plans" onCreate={() => open('LESSON_PLAN')} /> : <div className="aop-record-list">{plans.map((plan) => <article className="aop-record" key={plan.id}><i className={`aop-record-icon is-${plan.status.toLowerCase()}`}><FileText /></i><div><h2>{plan.title} <Status>{labelStatus(plan.status)}</Status></h2><p>{value(plan, 'teacher')} · {value(plan, 'subject')} · {value(plan, 'className')} · {value(plan, 'date')}</p><small>{value(plan, 'description')}</small></div><RecordActions record={plan} onEdit={() => edit(plan)} onPatch={(status) => patch(plan, status)} onDelete={() => remove(plan)} /></article>)}</div>}</section></>
}

function Homework({ records, loading, open, edit, patch, remove }: OperationViewProps) {
  const [tab, setTab] = useState<'Assignments' | 'Analytics'>('Assignments'); const items = records.filter((item) => item.kind === 'HOMEWORK')
  const completed = items.filter((item) => item.status === 'COMPLETED').length; const rate = items.length ? Math.round(completed / items.length * 100) : 0
  return <><PageHeader title="Homework" description="Assign, track, and analyse homework submissions." action={<button className="button-primary" type="button" onClick={() => open('HOMEWORK')}><Plus /> Assign Homework</button>} /><Tabs tabs={['Assignments', 'Analytics'] as const} active={tab} onChange={setTab} label="Homework views" /><MetricGrid items={[{ label: 'Assignments', value: items.length, hint: 'Persisted records', icon: <FileText /> }, { label: 'Completion', value: `${rate}%`, hint: 'Completed assignments', icon: <CheckCircle2 />, tone: 'green' }, { label: 'Active', value: items.filter((item) => item.status === 'ACTIVE').length, hint: 'Open for submission', icon: <Clock3 />, tone: 'amber' }, { label: 'Due Today', value: items.filter((item) => value(item, 'date') === new Date().toISOString().slice(0, 10)).length, hint: 'Needs attention', icon: <CalendarDays />, tone: 'red' }]} />{tab === 'Analytics' ? <Analytics records={items} /> : <section className="aop-card aop-list-card">{loading ? <LoadingState /> : items.length === 0 ? <EmptyState noun="assignments" onCreate={() => open('HOMEWORK')} /> : <div className="aop-record-list">{items.map((item) => <article className="aop-record" key={item.id}><i className={`aop-percent is-${item.status.toLowerCase()}`}>{item.status === 'COMPLETED' ? <Check /> : <BookOpen />}</i><div><h2>{item.title} <Status>{labelStatus(item.status)}</Status></h2><p>{value(item, 'className')} · {value(item, 'subject')} · Due {value(item, 'date')}</p><small>{value(item, 'description')}</small></div><RecordActions record={item} onEdit={() => edit(item)} onPatch={(status) => patch(item, status)} onDelete={() => remove(item)} /></article>)}</div>}</section>}</>
}

function Analytics({ records }: { records: AcademicOperation[] }) {
  const groups = useMemo(() => Object.entries(records.reduce<Record<string, number>>((result, item) => { const key = value(item, 'subject', 'Unassigned'); result[key] = (result[key] ?? 0) + 1; return result }, {})), [records])
  return <section className="aop-card"><h2>Records by Subject</h2>{groups.length === 0 ? <EmptyState noun="analytics data" /> : groups.map(([subject, count]) => <div className="aop-bar" key={subject}><span>{subject}</span><Progress value={count / records.length * 100} /><strong>{count}</strong></div>)}</section>
}

function Exams({ records, loading, open, edit, patch, remove }: OperationViewProps) {
  const tabs = ['Schedule', 'Question Bank', 'Online Exams', 'Hall Tickets', 'Analytics'] as const; const [tab, setTab] = useState<(typeof tabs)[number]>('Schedule')
  const exams = records.filter((item) => item.kind === 'EXAM'); const questions = records.filter((item) => item.kind === 'QUESTION'); const shown = tab === 'Question Bank' ? questions : exams
  return <><PageHeader title="Exams" description="Manage exam schedules, question bank, online exams, and hall tickets." action={<button className="button-primary" type="button" onClick={() => open(tab === 'Question Bank' ? 'QUESTION' : 'EXAM')}><Plus /> {tab === 'Question Bank' ? 'Add Question' : 'New Exam'}</button>} /><Tabs tabs={tabs} active={tab} onChange={setTab} label="Exam views" /><MetricGrid items={[{ label: 'Total Exams', value: exams.length, hint: 'Persisted schedules', icon: <Award /> }, { label: 'Questions', value: questions.length, hint: 'Question bank', icon: <FileText />, tone: 'green' }, { label: 'Upcoming', value: exams.filter((item) => item.status === 'SCHEDULED').length, hint: 'Scheduled', icon: <CalendarDays />, tone: 'amber' }, { label: 'Completed', value: exams.filter((item) => item.status === 'COMPLETED').length, hint: 'Results ready', icon: <CheckCircle2 />, tone: 'violet' }]} />{tab === 'Analytics' ? <Analytics records={exams} /> : tab === 'Hall Tickets' ? <HallTicketList exams={exams} /> : <section className="aop-card aop-list-card">{loading ? <LoadingState /> : shown.length === 0 ? <EmptyState noun={tab === 'Question Bank' ? 'questions' : 'exams'} onCreate={() => open(tab === 'Question Bank' ? 'QUESTION' : 'EXAM')} /> : <div className="aop-record-list">{shown.map((item) => <article className="aop-record aop-exam" key={item.id}><i className="aop-date-chip"><CalendarDays /></i><div><h2>{item.title} <Status>{labelStatus(item.status)}</Status></h2><p>{value(item, 'subject')} · {value(item, 'className')} · {value(item, 'date')}</p><small>{value(item, 'description')}</small></div><RecordActions record={item} onEdit={() => edit(item)} onPatch={(status) => patch(item, status)} onDelete={() => remove(item)} /></article>)}</div>}</section>}</>
}

function HallTicketList({ exams }: { exams: AcademicOperation[] }) { return <section className="aop-card"><h2>Hall Ticket Exams</h2>{exams.length === 0 ? <EmptyState noun="scheduled exams" /> : <div className="aop-ticket-grid">{exams.map((exam) => <article className="aop-ticket" key={exam.id}><b>CampusOne School</b><small>Hall Ticket Configuration</small><i><Award /></i><h2>{exam.title}</h2><p>{value(exam, 'className')}</p><span>{value(exam, 'date')}</span><Status>{labelStatus(exam.status)}</Status></article>)}</div>}</section> }

function MarksGrades({ records, loading, open, edit, patch, remove, exportData }: OperationViewProps) {
  const tabs = ['Entry', 'Class Dashboard', 'Report Cards', 'Grade Analysis'] as const; const [tab, setTab] = useState<(typeof tabs)[number]>('Entry'); const marks = records.filter((item) => item.kind === 'MARK')
  const percentages = marks.map((item) => numeric(item, 'maxMarks', 100) ? numeric(item, 'score') / numeric(item, 'maxMarks', 100) * 100 : 0); const average = percentages.length ? Math.round(percentages.reduce((a, b) => a + b, 0) / percentages.length) : 0
  return <><PageHeader title="Marks & Grades" description="Enter marks, view class performance, generate report cards, and analyse results." secondary={<button className="button-secondary" type="button" onClick={exportData}><Download /> Export</button>} action={<button className="button-primary" type="button" onClick={() => open('MARK')}><Plus /> Enter Marks</button>} /><Tabs tabs={tabs} active={tab} onChange={setTab} label="Marks and grades views" /><MetricGrid items={[{ label: 'Entries', value: marks.length, hint: 'Persisted marks', icon: <Users /> }, { label: 'Class Average', value: `${average}%`, hint: 'All loaded marks', icon: <BarChart3 />, tone: 'green' }, { label: 'Published', value: marks.filter((item) => item.status === 'PUBLISHED').length, hint: 'Visible results', icon: <CheckCircle2 />, tone: 'amber' }, { label: 'Needs Review', value: marks.filter((item) => item.status !== 'PUBLISHED').length, hint: 'Draft results', icon: <Clock3 />, tone: 'red' }]} />{tab === 'Grade Analysis' || tab === 'Class Dashboard' ? <Analytics records={marks} /> : <section className="aop-card aop-table-card">{loading ? <LoadingState /> : marks.length === 0 ? <EmptyState noun="mark entries" onCreate={() => open('MARK')} /> : <div className="aop-table-scroll"><table><thead><tr><th>Student</th><th>Class</th><th>Subject</th><th>Marks</th><th>Percentage</th><th>Status</th><th>Actions</th></tr></thead><tbody>{marks.map((mark) => { const max = numeric(mark, 'maxMarks', 100); const percent = max ? Math.round(numeric(mark, 'score') / max * 100) : 0; return <tr key={mark.id}><td><strong>{mark.title}</strong></td><td>{value(mark, 'className')}</td><td>{value(mark, 'subject')}</td><td>{numeric(mark, 'score')} / {max}</td><td>{percent}%</td><td><Status>{labelStatus(mark.status)}</Status></td><td><div className="aop-row-buttons"><button className="aop-icon-button" aria-label={`Edit ${mark.title}`} type="button" onClick={() => edit(mark)}><Edit3 /></button>{mark.status !== 'PUBLISHED' && <button className="aop-icon-button" aria-label={`Publish ${mark.title}`} type="button" onClick={() => patch(mark, 'PUBLISHED')}><Check /></button>}<button className="aop-icon-button" aria-label={`Delete ${mark.title}`} type="button" onClick={() => remove(mark)}><Trash2 /></button></div></td></tr> })}</tbody></table></div>}</section>}</>
}

function Curriculum({ accessToken, exportNotice }: { accessToken: string; exportNotice: (message: string) => void }) {
  const [classes, setClasses] = useState<AcademicClass[]>([]); const [selected, setSelected] = useState(''); const [subjects, setSubjects] = useState<ClassSubject[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('')
  useEffect(() => { const controller = new AbortController(); void listClasses(accessToken, { page: 1, pageSize: 100 }, controller.signal).then((page) => { setClasses(page.items); setSelected((current) => current || page.items[0]?.id || '') }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Classes could not be loaded.') }); return () => controller.abort() }, [accessToken])
  useEffect(() => { if (!selected) return; const controller = new AbortController(); void listClassSubjects(accessToken, { page: 1, pageSize: 100, gradeId: selected }, controller.signal).then((page) => { setSubjects(page.items); setError('') }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Curriculum could not be loaded.') }).finally(() => { if (!controller.signal.aborted) setLoading(false) }); return () => controller.abort() }, [accessToken, selected])
  const selectedClass = classes.find((item) => item.id === selected)
  return <><PageHeader title="Curriculum" description="Live class-subject mappings from the academic structure." secondary={<button className="button-secondary" type="button" onClick={() => { downloadRecords('curriculum.json', subjects); exportNotice('Curriculum exported.') }}><Download /> Export</button>} action={<button className="button-primary" type="button" onClick={() => { window.location.href = '/setup/subjects-curriculum' }}><Edit3 /> Edit Curriculum</button>} /><MetricGrid items={[{ label: 'Grade Levels', value: classes.length, hint: 'Configured classes', icon: <GraduationCap /> }, { label: 'Mapped Subjects', value: subjects.length, hint: selectedClass?.name ?? 'Select a class', icon: <BookOpen />, tone: 'green' }, { label: 'Lab / Practical', value: subjects.filter((item) => item.periodsPerWeek && item.periodsPerWeek >= 3).length, hint: '3+ periods weekly', icon: <FlaskConical />, tone: 'amber' }, { label: 'Weekly Periods', value: subjects.reduce((sum, item) => sum + (item.periodsPerWeek ?? 0), 0), hint: 'Configured total', icon: <Award />, tone: 'violet' }]} /><div className="aop-toolbar"><label>Class<select aria-label="Curriculum class" value={selected} onChange={(event) => setSelected(event.target.value)}>{classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div>{error && <div className="aop-error" role="alert">{error}</div>}<section className="aop-card aop-curriculum"><header><div><h2>{selectedClass?.name ?? 'Curriculum'}</h2><p>{subjects.length} mapped subjects · {subjects.reduce((sum, item) => sum + (item.periodsPerWeek ?? 0), 0)} periods/week</p></div></header>{loading ? <LoadingState /> : subjects.length === 0 ? <EmptyState noun="curriculum mappings" /> : <div className="aop-curriculum-list">{subjects.map((mapping) => <article key={mapping.id}><div className="aop-curriculum-subject"><h3>{mapping.subject.name}</h3><p>{mapping.subjectCode || 'No code'}</p>{mapping.isElective && <Status>Elective</Status>}</div><div className="aop-term"><strong>PERIODS</strong><span>{mapping.periodsPerWeek ?? 'Not set'} per week</span></div><div className="aop-term term-two"><strong>MAX MARKS</strong><span>{mapping.defaultMaxMarks ?? 'Not set'}</span></div><button className="button-secondary" type="button" onClick={() => { window.location.href = '/setup/subjects-curriculum' }}><Edit3 /> Edit</button></article>)}</div>}</section></>
}

function TeachingLearning({ props }: { props: OperationViewProps }) {
  const [tab, setTab] = useState<'Lesson plans' | 'Homework'>('Lesson plans')
  return <><PageHeader title="Teaching & Learning" description="Plan instruction, assign learning work, and keep delivery visible to your academic team." action={<button className="button-primary" type="button" onClick={() => props.open(tab === 'Lesson plans' ? 'LESSON_PLAN' : 'HOMEWORK')}><Plus /> {tab === 'Lesson plans' ? 'New lesson plan' : 'Assign homework'}</button>} /><Tabs tabs={['Lesson plans', 'Homework'] as const} active={tab} onChange={setTab} label="Teaching and learning views" />{tab === 'Lesson plans' ? <LessonPlans {...props} /> : <Homework {...props} />}</>
}

function AssessmentResults({ props }: { props: OperationViewProps }) {
  const [tab, setTab] = useState<'Exams' | 'Marks & report cards'>('Exams')
  return <><PageHeader title="Assessment & Results" description="Run assessments, record outcomes, and publish a clear results trail for every class." action={<button className="button-primary" type="button" onClick={() => props.open(tab === 'Exams' ? 'EXAM' : 'MARK')}><Plus /> {tab === 'Exams' ? 'New exam' : 'Enter marks'}</button>} /><Tabs tabs={['Exams', 'Marks & report cards'] as const} active={tab} onChange={setTab} label="Assessment and results views" />{tab === 'Exams' ? <Exams {...props} /> : <MarksGrades {...props} />}</>
}

type OperationViewProps = { records: AcademicOperation[]; loading: boolean; open: (kind: AcademicOperationKind) => void; edit: (record: AcademicOperation) => void; patch: (record: AcademicOperation, status: string) => void; remove: (record: AcademicOperation) => void; exportData: () => void }

export function AcademicOperationsPage({ page, accessToken, selectedBranch }: { page: AcademicOperationsPageId; accessToken: string; selectedBranch: string }) {
  const kindsByPage: Record<AcademicOperationsPageId, AcademicOperationKind[]> = { ACL1: ['LESSON_PLAN'], ACH1: ['HOMEWORK'], ACE1: ['EXAM', 'QUESTION'], ACM1: ['MARK'], ACC1: [], AHT1: ['LESSON_PLAN', 'HOMEWORK'], AAR1: ['EXAM', 'QUESTION', 'MARK'] }
  const store = useOperations(accessToken, kindsByPage[page], selectedBranch); const [editorKind, setEditorKind] = useState<EditorKind>(null); const [editing, setEditing] = useState<AcademicOperation>(); const [saving, setSaving] = useState(false); const [notice, setNotice] = useState('')
  const notify = (message: string) => { setNotice(message); window.setTimeout(() => setNotice(''), 2600) }
  const open = (kind: AcademicOperationKind) => { setEditing(undefined); setEditorKind(kind) }; const edit = (record: AcademicOperation) => { setEditing(record); setEditorKind(record.kind) }
  const save = async (input: AcademicOperationInput) => { setSaving(true); try { if (editing) await updateAcademicOperation(accessToken, editing.id, { title: input.title, status: input.status, branchId: input.branchId, payload: input.payload }); else await createAcademicOperation(accessToken, input); setEditorKind(null); setEditing(undefined); store.reload(); notify('Academic record saved.') } catch (cause) { notify(cause instanceof Error ? cause.message : 'Record could not be saved.') } finally { setSaving(false) } }
  const patchStatus = (record: AcademicOperation, status: string) => { void updateAcademicOperation(accessToken, record.id, { status }).then(() => { store.reload(); notify(`${record.title} updated.`) }).catch((cause: unknown) => notify(cause instanceof Error ? cause.message : 'Record could not be updated.')) }
  const remove = (record: AcademicOperation) => { if (!window.confirm(`Delete ${record.title}?`)) return; void deleteAcademicOperation(accessToken, record.id).then(() => { store.reload(); notify(`${record.title} deleted.`) }).catch((cause: unknown) => notify(cause instanceof Error ? cause.message : 'Record could not be deleted.')) }
  const props: OperationViewProps = { records: store.records, loading: store.loading, open, edit, patch: patchStatus, remove, exportData: () => { downloadRecords(`academic-${page.toLowerCase()}.json`, store.records); notify('Academic data exported.') } }
  return <main className="aop-page">{notice && <div className="aop-notice" role="status"><CheckCircle2 /> {notice}</div>}{store.error && <div className="aop-error" role="alert">{store.error}<button type="button" onClick={store.reload}>Retry</button></div>}{page === 'ACL1' && <LessonPlans {...props} />}{page === 'ACH1' && <Homework {...props} />}{page === 'ACE1' && <Exams {...props} />}{page === 'ACM1' && <MarksGrades {...props} />}{page === 'ACC1' && <Curriculum accessToken={accessToken} exportNotice={notify} />}{page === 'AHT1' && <TeachingLearning props={props} />}{page === 'AAR1' && <AssessmentResults props={props} />}<RecordEditor kind={editorKind} record={editing} branchId={store.branchId} busy={saving} onClose={() => { setEditorKind(null); setEditing(undefined) }} onSave={save} /></main>
}
