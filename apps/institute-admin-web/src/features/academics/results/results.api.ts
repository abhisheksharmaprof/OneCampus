import { adminRequest } from '../../admin/admin.api'

export interface SubjectChoice {
  id: string
  name: string
  maximum: string
  elective: boolean
}
export interface Section {
  id: string
  name: string
  gradeId: string
  grade: string
  section: string
  yearId: string
  year: string
  current: boolean
  branchId: string
  branch: string
  subjects: SubjectChoice[]
  terms: { id: string; name: string }[]
}
export interface Rules {
  grades: {
    label: string
    minimum: number
    points?: number
    remark?: string
  }[]
  aggregateMode?: string
  bestN?: number
  fixedCount?: number
  fixedMaximum?: number
  percentageMode?: string
  formula?: string
  gpaMode?: string
  grace?: number
  overallPass?: number
  requireEverySubject?: boolean
  compartment?: number
  divisions?: number[]
  rankMethod?: string
  rankBasis?: string
  rankEligibility?: string
  rankFormat?: string
  subjects?: Record<string, { name?: string; code?: string; credits?: number; include?: boolean }>
  schedule?: Record<string, { examDate?: string; startTime?: string; endTime?: string; session?: string }>
  instructions?: string[]
  decimals: number
}
export interface Component {
  id: string
  name: string
  maximum: string
  passMarks: string
}
export interface Sheet {
  id: string
  subjectId: string
  name: string
  state: 'DRAFT' | 'SUBMITTED' | 'APPROVED'
  revision: number
  reviewNote: string
  components: Component[]
}
export interface Exam {
  termId?: string | null
  examDate?: string | null
  updatedAt?: string
  id: string
  name: string
  sectionId: string
  examType: string
  rules: Rules
  archived: boolean
  subjects: Sheet[]
  candidateCount: number
}
export interface Candidate {
  id: string
  enrollmentId: string
  name: string
  roll: string
  admission: string
  fatherName?: string
  motherName?: string
  dob?: string
  gender?: string
  photoUrl?: string | null
  remark: string
  excludedSubjectIds: string[]
  profile?: Record<string, string>
}
export interface Mark {
  candidateId: string
  componentId: string
  score: string | null
  status: string
  note: string
}
export interface ResultRow {
  subjectId: string
  subject: string
  score: string | null
  maximum: string
  percentage: string | null
  grade: string
  result: string
  code?: string
  credits?: string
  gradePoint?: string | null
  included?: boolean
  passMarks?: string
  grace?: string
  classAverage?: string | null
  classHighest?: string | null
  components: {
    name: string
    score: string | null
    maximum: string
    status: string
  }[]
}
export interface Result {
  candidateId: string
  gpa?: string | null
  division?: string
  grace?: string
  credits?: string
  creditPoints?: string
  formulaError?: string | null
  formulaVariables?: Record<string, string>
  rank?: {
    position: number
    cohort: number
    display: string
    policy: string
  } | null
  examId: string
  exam: string
  rows: ResultRow[]
  total: string
  maximum: string
  percentage: string | null
  grade: string
  result: string
  missing: number
  remark: string
}
export interface ExamDetail {
  exam: Exam
  subjects: Sheet[]
  candidates: Candidate[]
  marks: Mark[]
  results: Result[]
}
export interface Bootstrap {
  sections: Section[]
  templates: { id: string; name: string }[]
  canManage: boolean
  branding?: {
    name: string
    address: string
    color: string
    logoUrl?: string | null
  }
}
export interface ImportResult {
  id: string
  validCount: number
  errors: { row: number; message: string; identifier: string }[]
  state: string
}
export interface Batch {
  id: string
  title: string
  sectionId: string
  state: string
  issue: boolean
  total: number
  completed: number
  errors: string[]
  createdAt: string
  documents: { id: string; name: string; ready: boolean; error: string }[]
}
export interface ReportConfig {
  sectionId: string
  examIds: string[]
  enrollmentIds: string[]
  templateId: string
  title: string
  mode: string
  weights: Record<string, string>
  showRank?: boolean
  showGuardian?: boolean
  showAttendance?: boolean
  attendanceStart?: string
  attendanceEnd?: string
  subjectOrder?: string[]
  showGrades: boolean
  showComponents: boolean
  showSignatures: boolean
  teacherLabel: string
  principalLabel: string
  footer: string
  appearance?: Appearance
}
export interface Appearance {
  design?: string
  accent?: string
  typography?: string
  frame?: string
  schoolName?: string
  subtitle?: string
  address?: string
  session?: string
  logo?: string
  crest?: string
  columns?: string[]
  sections?: string[]
  hiddenSubjects?: string[]
}
export function resultsRequest<T>(
  token: string,
  path: string,
  data?: unknown,
  method = 'POST',
  signal?: AbortSignal,
) {
  return adminRequest<T>(
    token,
    `academics/results/${path}`,
    data === undefined ? { signal } : { method, body: JSON.stringify(data), signal },
  )
}
export function pdfUrl(content: string, mime = 'application/pdf') {
  const bytes = Uint8Array.from(atob(content), (c) => c.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: mime }))
}
export async function downloadBatch(
  token: string,
  batchId: string,
  format: string,
  documentId?: string,
) {
  const file = await resultsRequest<{
    content: string
    mime: string
    filename: string
  }>(
    token,
    `batches/${batchId}/download?fileType=${format === 'xlsx' ? 'csv' : format}${documentId ? `&documentId=${documentId}` : ''}`,
  )
  if (format === 'xlsx') {
    const XLSX = await import('xlsx')
    const bytes = Uint8Array.from(atob(file.content), (c) => c.charCodeAt(0))
    const book = XLSX.read(new TextDecoder().decode(bytes), { type: 'string', raw: true })
    XLSX.writeFile(book, file.filename.replace(/\.csv$/i, '.xlsx'))
    return
  }
  const url = pdfUrl(file.content, file.mime)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.filename
  anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}
export function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : 'The action could not be completed.'
}

export function safeSpreadsheetValue(value: unknown) {
  return typeof value === 'string' && /^(?:[=+@\-\t\r]|\s+[=+@-])/.test(value)
    ? "'" + value
    : value
}
