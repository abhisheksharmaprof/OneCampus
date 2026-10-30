import { BoneScreen, Skeleton } from '../../../components/admin-ui'

export type ExamSkeletonKind = 'form' | 'options' | 'list' | 'detail' | 'sections' | 'subjects' | 'schedule' | 'coverage' | 'readiness' | 'candidates'

const kinds: ExamSkeletonKind[] = ['options', 'list', 'detail', 'sections', 'subjects', 'schedule', 'coverage', 'readiness', 'candidates']
const field = (key: string) => <div className="exam-fixture-field" key={key} />

/** Boneyard fixture trees mirror only the region replaced by each live loader. */
export function ExamSkeletonFixture({ kind }: { kind: ExamSkeletonKind }) {
  if (kind === 'options') return <div className="exam-form-grid">{['Campus', 'Academic year', 'Category', 'Permissions'].map((label) => <label key={label}>{label}{field(label)}</label>)}</div>

  if (kind === 'list') return <section className="exam-record-list"><article className="exam-record"><div className="exam-record-main"><div className="exam-record-title"><span className="exam-record-status is-draft">Draft</span><h3>Half-yearly</h3></div><p className="exam-record-context">Half-yearly · 15 classes · 30 Oct – 6 Nov 2026</p></div><div className="exam-record-actions"><button className="exam-secondary" type="button">Manage exam</button><button className="exam-secondary" type="button">More</button></div></article><article className="exam-record"><div className="exam-record-main"><div className="exam-record-title"><span className="exam-record-status is-notice">Setup notice published</span><h3>Unit test 2</h3></div><p className="exam-record-context">Unit test · 8 classes · Dates not set</p></div><div className="exam-record-actions"><button className="exam-secondary" type="button">Manage exam</button><button className="exam-secondary" type="button">More</button></div></article></section>

  if (kind === 'detail' || kind === 'form') return <div className="exam-form-grid">{['Exam name', 'Campus', 'Academic year', 'Category', 'Term', 'Starts on', 'Ends on', 'Coordinator', 'Instructions'].map((label) => <label key={label}>{label}{field(label)}</label>)}</div>

  if (kind === 'sections') return <div><div className="exam-section-bulk"><span>0 of 12 sections selected</span><button className="exam-secondary" type="button">Select all</button></div>{['Class 1 · Section A', 'Class 2 · Section A', 'Class 3 · Section B', 'Class 4 · Section A'].map((label) => <label className="exam-check" key={label}><input type="checkbox" readOnly /><span>{label}<small>30 students</small></span></label>)}</div>

  if (kind === 'subjects') return <div className="exam-subject-targets">{['Class 1 A', 'Class 10 A', 'Class 11 A'].map((grade) => <fieldset key={grade}><legend>{grade}</legend><div className="exam-subject-bulk"><span>0 of 9 subjects selected</span><button className="exam-secondary" type="button">Select all subjects</button></div><div className="exam-subject-list">{['English', 'Hindi', 'Mathematics', 'Science', 'Social Studies', 'Computer Science'].map((subject) => <label className="exam-check" key={subject}><input type="checkbox" readOnly /><span>{subject}<small>SUB-009</small></span></label>)}</div></fieldset>)}</div>

  if (kind === 'schedule') return <div className="exam-paper-list">{['Class 1 A · English', 'Class 1 A · Mathematics', 'Class 10 A · Science'].map((paper) => <fieldset className="exam-paper-row" key={paper}><legend>{paper}</legend><div className="exam-paper-fields">{['Date', 'Start time', 'End time'].map((label) => <label key={label}>{label}{field(label)}</label>)}</div></fieldset>)}</div>

  if (kind === 'coverage' || kind === 'readiness') return <div className="exam-dialog-body"><p className="exam-coverage-status is-incomplete">{kind === 'readiness' ? 'Timetable checks in progress' : 'Coverage review in progress'}</p><div className="exam-coverage-metrics">{['Active students', 'Covered', 'Uncovered', 'Required papers', 'Elective papers'].map((label) => <article key={label}><Skeleton height="1.6rem" width="42%" /><span>{label}</span></article>)}</div><section className="exam-coverage-sections"><h3>{kind === 'readiness' ? 'Validation checks' : 'Sections'}</h3>{['Class 1 A', 'Class 10 A', 'Class 11 A'].map((label) => <article key={label}><h4>{label}</h4><Skeleton height=".875rem" width="78%" /></article>)}</section></div>

  return <div className="exam-candidate-list">{Array.from({ length: 5 }, (_, index) => <label className="exam-check" key={index}><input type="checkbox" readOnly /><span><Skeleton height=".9rem" width="70%" /><small>Admission 2026-014 · Roll 14</small></span></label>)}</div>
}

export function ExamLoadingSkeleton({ label, kind = 'detail' }: { label: string; kind?: ExamSkeletonKind }) {
  const content = <div className={`exam-loading-skeleton exam-loading-skeleton--${kind}`} aria-hidden="true"><Skeleton height="1rem" width="38%" /><Skeleton height=".8rem" width="78%" /><Skeleton height="3rem" /></div>
  return <BoneScreen name={`exam-${kind}`} loading label={label} color="#e2e9f0" fixture={<ExamSkeletonFixture kind={kind} />} fallback={content}>{content}</BoneScreen>
}

export function ExamSkeletonCaptures() {
  return <div className="exam-workspace">{kinds.map((kind) => <BoneScreen key={kind} name={`exam-${kind}`} loading label={`Loading exam ${kind}`} fixture={<ExamSkeletonFixture kind={kind} />}><ExamSkeletonFixture kind={kind} /></BoneScreen>)}</div>
}
