import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, BookOpen, CalendarDays, CheckCircle2, ClipboardCheck, GraduationCap, RefreshCw, Users } from 'lucide-react'
import { listAcademicOperations, listAcademicYears, listClasses, listSections, listSubjects, type AcademicOperation, type AcademicOperationKind } from './academics.api'
import type { AcademicClass, AcademicYear, ClassSection, PageData, Subject } from './academics.types'
import './academic-overview.css'

type Props = { accessToken: string; selectedBranch: string; onNavigate: (label: string) => void }
type Snapshot = { years: AcademicYear[]; classes: AcademicClass[]; subjects: Subject[]; sections: ClassSection[]; operations: AcademicOperation[] }
const kinds: AcademicOperationKind[] = ['LESSON_PLAN', 'HOMEWORK', 'EXAM', 'MARK']
const empty: Snapshot = { years: [], classes: [], subjects: [], sections: [], operations: [] }

const formatDate = (value: string) => {
  if (!value) return 'No date'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(date)
}

export function AcademicOverviewPage({ accessToken, selectedBranch, onNavigate }: Props) {
  const [data, setData] = useState<Snapshot>(empty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  const branchId = selectedBranch === 'all' ? undefined : selectedBranch

  useEffect(() => {
    const controller = new AbortController()
    const params = { page: 1 as const, pageSize: 100 as const, ...(branchId ? { branchId } : {}) }
    void Promise.all([
      listAcademicYears(accessToken, { page: 1, pageSize: 100 }, controller.signal),
      listClasses(accessToken, { page: 1, pageSize: 100 }, controller.signal),
      listSubjects(accessToken, { page: 1, pageSize: 100 }, controller.signal),
      listSections(accessToken, params, controller.signal),
      ...kinds.map((kind) => listAcademicOperations(accessToken, kind, branchId, controller.signal)),
    ]).then((results) => {
      const [years, classes, subjects, sections, ...operations] = results as [PageData<AcademicYear>, PageData<AcademicClass>, PageData<Subject>, PageData<ClassSection>, ...PageData<AcademicOperation>[]]
      setData({ years: years.items, classes: classes.items, subjects: subjects.items, sections: sections.items, operations: operations.flatMap((page) => page.items) })
      setError('')
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Academic overview could not be loaded.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, branchId, revision])

  const currentYear = data.years.find((year) => year.isCurrent)
  const recent = useMemo(() => [...data.operations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5), [data.operations])
  const metricCards = [
    { label: 'Active academic year', value: currentYear?.name ?? '—', detail: currentYear ? `${currentYear.classesCount} classes linked` : 'Configure a current year', icon: CalendarDays, action: 'Academic Structure' },
    { label: 'Classes & sections', value: data.sections.length || data.classes.length, detail: `${data.classes.length} grade levels`, icon: GraduationCap, action: 'Academic Structure' },
    { label: 'Subjects', value: data.subjects.length, detail: 'Live subject catalogue', icon: BookOpen, action: 'Academic Structure' },
    { label: 'Teaching records', value: data.operations.filter((item) => item.kind === 'LESSON_PLAN' || item.kind === 'HOMEWORK').length, detail: 'Plans and homework', icon: ClipboardCheck, action: 'Teaching & Learning' },
  ]

  return <main className="academic-overview">
    <header className="academic-overview__hero"><div><span className="academic-overview__eyebrow">Academics / Command centre</span><h1>Keep learning operations moving.</h1><p>One live view of your institute’s academic structure, teaching activity, and results workflow.</p></div><button className="academic-overview__refresh" type="button" onClick={() => { setLoading(true); setRevision((value) => value + 1) }} disabled={loading}><RefreshCw /> {loading ? 'Refreshing…' : 'Refresh data'}</button></header>
    {error && <div className="academic-overview__error" role="alert">{error}<button type="button" onClick={() => { setLoading(true); setRevision((value) => value + 1) }}>Retry</button></div>}
    <section className="academic-overview__metrics" aria-label="Academic summary">{metricCards.map(({ label, value, detail, icon: Icon, action }) => <button className="academic-overview__metric" type="button" key={label} onClick={() => onNavigate(action)}><span><Icon /></span><small>{label}</small><strong>{loading ? '…' : value}</strong><em>{detail}</em><ArrowRight /></button>)}</section>
    <section className="academic-overview__grid"><article className="academic-overview__card academic-overview__card--wide"><header><div><span className="academic-overview__eyebrow">Next best actions</span><h2>Set up the academic engine</h2></div><Users /></header><div className="academic-overview__actions"><Action title="Academic Structure" detail="Years, classes, sections, subjects" icon={GraduationCap} onClick={() => onNavigate('Academic Structure')} /><Action title="Teaching & Learning" detail="Lesson plans and homework" icon={BookOpen} onClick={() => onNavigate('Teaching & Learning')} /><Action title="Assessment & Results" detail="Exams, marks, and report cards" icon={CheckCircle2} onClick={() => onNavigate('Assessment & Results')} /></div></article><article className="academic-overview__card"><header><div><span className="academic-overview__eyebrow">Live activity</span><h2>Recently updated</h2></div><ClipboardCheck /></header>{loading ? <p className="academic-overview__empty">Loading records…</p> : recent.length === 0 ? <p className="academic-overview__empty">No academic activity has been recorded yet.</p> : <div className="academic-overview__activity">{recent.map((item) => <div key={item.id}><span className={`academic-overview__dot academic-overview__dot--${item.kind.toLowerCase()}`} /><div><strong>{item.title}</strong><small>{item.kind.replaceAll('_', ' ')} · {formatDate(item.updatedAt)}</small></div></div>)}</div>}</article></section>
  </main>
}

function Action({ title, detail, icon: Icon, onClick }: { title: string; detail: string; icon: typeof GraduationCap; onClick: () => void }) {
  return <button className="academic-overview__action" type="button" onClick={onClick}><span><Icon /></span><div><strong>{title}</strong><small>{detail}</small></div><ArrowRight /></button>
}
