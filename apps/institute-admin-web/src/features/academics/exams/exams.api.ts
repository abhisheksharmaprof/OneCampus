import { adminRequest } from '../../admin/admin.api'
import type { ExamChoice, ExamCoverage, ExamDetail, ExamDraftInput, ExamElectiveCandidates, ExamOptions, ExamPageData, ExamPaperSchedule, ExamSaveResult, ExamSubjects, ExamTimetable } from './exams.types'

export interface ExamAdmitCardStudent { id: string; name: string; admissionNumber: string; rollNumber: string; className: string; fatherName: string; dateOfBirth: string; photoUrl?: string | null; subjects: Array<{ subject: string; date: string; start: string; end: string; room?: string }> }
export interface ExamAdmitCardRoster { examId: string; revision: number; examName: string; academicYear: string; students: ExamAdmitCardStudent[] }
export function getExamAdmitCardCandidates(accessToken: string, examId: string, signal?: AbortSignal) {
  return adminRequest<ExamAdmitCardRoster>(accessToken, `academics/exams/${encodeURIComponent(examId)}/admit-cards/candidates`, { signal })
}

export function getExamOptions(accessToken: string, query: { kind: 'bootstrap' | 'sections' | 'terms' | 'coordinators'; action?: 'create' | 'view' | 'edit'; campusId?: string; academicYearId?: string; search?: string; page?: number; pageSize?: number; signal?: AbortSignal }) {
  const params = new URLSearchParams({ kind: query.kind })
  for (const key of ['action', 'campusId', 'academicYearId', 'search'] as const) {
    const value = query[key]?.trim()
    if (value) params.set(key, value)
  }
  if (query.page) params.set('page', String(query.page))
  if (query.pageSize) params.set('pageSize', String(query.pageSize))
  return adminRequest<Record<string, unknown>>(accessToken, `academics/exams/options?${params}`, { signal: query.signal }).then((data) => {
    const items = Array.isArray(data.items) ? data.items as Array<Record<string, unknown>> : []
    const choices = (key: 'campuses' | 'academicYears' | 'sections' | 'terms' | 'coordinators') => Array.isArray(data[key]) ? data[key] as ExamChoice[] : []
    const sections = query.kind === 'sections' ? items.map((item) => ({
      id: String(item.id), name: String(item.name ?? `${item.className ?? ''} ${item.sectionName ?? ''}`.trim()),
      academicYearId: typeof item.academicYearId === 'string' ? item.academicYearId : undefined,
      campusId: typeof item.campusId === 'string' ? item.campusId : undefined,
      gradeId: typeof item.classId === 'string' ? item.classId : undefined,
      gradeName: typeof item.className === 'string' ? item.className : undefined,
      sectionName: typeof item.sectionName === 'string' ? item.sectionName : undefined,
    })) : choices('sections')
    const termItems = query.kind === 'terms' ? items.map((item) => ({ id: String(item.id), name: String(item.name ?? '') })) : choices('terms')
    const coordinatorItems = query.kind === 'coordinators' ? items.map((item) => ({ id: String(item.id), name: String(item.name ?? item.fullName ?? '') })) : choices('coordinators')
    return {
      campuses: choices('campuses'), academicYears: choices('academicYears'), sections,
      terms: termItems, coordinators: coordinatorItems,
      categories: Array.isArray(data.categories) ? data.categories as ExamOptions['categories'] : [],
      actions: typeof data.actions === 'object' && data.actions !== null ? {
        create: Boolean((data.actions as Record<string, unknown>).create && typeof (data.actions as Record<string, unknown>).create === 'object' ? ((data.actions as Record<string, { allowed?: unknown }>).create?.allowed) : (data.actions as Record<string, unknown>).create),
        view: Boolean((data.actions as Record<string, unknown>).view && typeof (data.actions as Record<string, unknown>).view === 'object' ? ((data.actions as Record<string, { allowed?: unknown }>).view?.allowed) : (data.actions as Record<string, unknown>).view),
        edit: Boolean((data.actions as Record<string, unknown>).edit && typeof (data.actions as Record<string, unknown>).edit === 'object' ? ((data.actions as Record<string, { allowed?: unknown }>).edit?.allowed) : (data.actions as Record<string, unknown>).edit),
        publish: Boolean((data.actions as Record<string, unknown>).publish && typeof (data.actions as Record<string, unknown>).publish === 'object' ? ((data.actions as Record<string, { allowed?: unknown }>).publish?.allowed) : (data.actions as Record<string, unknown>).publish),
      } : { create: false, view: false, edit: false, publish: false },
      currentAcademicYearId: typeof data.currentAcademicYearId === 'string' ? data.currentAcademicYearId : null,
      page: Number(data.page ?? 1), totalPages: Number(data.totalPages ?? 1),
    } satisfies ExamOptions
  })
}

export async function listAllExamSections(accessToken: string, query: { action: 'create' | 'edit'; campusId?: string; academicYearId: string; signal?: AbortSignal }) {
  const first = await getExamOptions(accessToken, { ...query, kind: 'sections', page: 1, pageSize: 100 })
  if (first.totalPages <= 1) return first.sections
  const rest = await Promise.all(Array.from({ length: first.totalPages - 1 }, (_, index) =>
    getExamOptions(accessToken, { ...query, kind: 'sections', page: index + 2, pageSize: 100 }),
  ))
  return [...first.sections, ...rest.flatMap((page) => page.sections)]
}

export function listExams(accessToken: string, query: { campusId?: string; academicYearId?: string; category?: string; search?: string; page?: number; pageSize?: number; signal?: AbortSignal }) {
  const params = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 25) })
  for (const key of ['campusId', 'academicYearId', 'category', 'search'] as const) {
    const value = query[key]?.trim()
    if (value) params.set(key, value)
  }
  return adminRequest<Record<string, unknown>>(accessToken, `academics/exams?${params}`, { signal: query.signal }).then((data) => {
    const rawRows = Array.isArray(data.results) ? data.results : Array.isArray(data.items) ? data.items : []
    return {
      count: Number(data.count ?? rawRows.length), page: Number(data.page ?? query.page ?? 1), pageSize: Number(data.pageSize ?? query.pageSize ?? 25),
      totalPages: Number(data.totalPages ?? 1), next: typeof data.next === 'string' ? data.next : null, previous: typeof data.previous === 'string' ? data.previous : null,
      results: rawRows.map((raw) => {
        const row = raw as Record<string, unknown>
        const targetSummary = Array.isArray(row.targetSummary) ? row.targetSummary.map(String) : typeof row.targetSummary === 'string' ? [row.targetSummary] : typeof row.targetCount === 'number' ? [`${row.targetCount} section${row.targetCount === 1 ? '' : 's'}`] : []
        return { ...row, targetSummary } as unknown as ExamPageData['results'][number]
      }),
    } satisfies ExamPageData
  })
}

export function getExam(accessToken: string, id: string, signal?: AbortSignal) {
  return adminRequest<ExamDetail>(accessToken, `academics/exams/${encodeURIComponent(id)}`, { signal })
}

export function getExamSubjects(accessToken: string, id: string, signal?: AbortSignal) {
  return adminRequest<ExamSubjects>(accessToken, `academics/exams/${encodeURIComponent(id)}/subjects`, { signal })
}

export function updateExamSubjects(accessToken: string, id: string, input: { expectedRevision: number; targets: Array<{ classSectionId: string; subjectIds: string[]; paperMarks?: Array<{ subjectId: string; theoryMax: string | null; practicalMax: string | null; passMarks: string | null; durationMinutes: number }> }> }) {
  return adminRequest<ExamSubjects>(accessToken, `academics/exams/${encodeURIComponent(id)}/subjects`, { method: 'PUT', body: JSON.stringify(input) })
}

export function getExamSchedule(accessToken: string, id: string, signal?: AbortSignal) {
  return adminRequest<ExamPaperSchedule>(accessToken, `academics/exams/${encodeURIComponent(id)}/schedule`, { signal })
}

export function updateExamSchedule(accessToken: string, id: string, input: { expectedRevision: number; papers: Array<Pick<ExamPaperSchedule['papers'][number], 'classSectionId' | 'subjectId' | 'scheduledOn' | 'startTime' | 'endTime' | 'roomId' | 'invigilatorId'>> }) {
  return adminRequest<ExamPaperSchedule>(accessToken, `academics/exams/${encodeURIComponent(id)}/schedule`, { method: 'PUT', body: JSON.stringify(input) })
}

export function getExamTimetable(accessToken: string, id: string, signal?: AbortSignal) {
  return adminRequest<ExamTimetable>(accessToken, `academics/exams/${encodeURIComponent(id)}/timetable`, { signal })
}

export function publishExamTimetable(accessToken: string, id: string, expectedRevision: number) {
  return adminRequest<ExamTimetable>(accessToken, `academics/exams/${encodeURIComponent(id)}/publish-complete`, { method: 'POST', body: JSON.stringify({ expectedRevision }) })
}

export function getExamCoverage(accessToken: string, id: string, signal?: AbortSignal) {
  return adminRequest<ExamCoverage>(accessToken, `academics/exams/${encodeURIComponent(id)}/coverage`, { signal })
}

export function getExamElectiveCandidates(accessToken: string, id: string, classSectionId: string, subjectId: string, query: { page?: number; pageSize?: number; search?: string; signal?: AbortSignal } = {}) {
  const params = new URLSearchParams({ page: String(query.page ?? 1), pageSize: String(query.pageSize ?? 25) })
  const search = query.search?.trim()
  if (search) params.set('search', search)
  return adminRequest<ExamElectiveCandidates>(accessToken, `academics/exams/${encodeURIComponent(id)}/coverage/${encodeURIComponent(classSectionId)}/${encodeURIComponent(subjectId)}/candidates?${params}`, { signal: query.signal })
}

export function updateExamElectiveCandidates(accessToken: string, id: string, classSectionId: string, subjectId: string, input: { expectedRevision: number; studentIds: string[] }) {
  return adminRequest<ExamElectiveCandidates>(accessToken, `academics/exams/${encodeURIComponent(id)}/coverage/${encodeURIComponent(classSectionId)}/${encodeURIComponent(subjectId)}/candidates`, { method: 'PUT', body: JSON.stringify(input) })
}

export function createExam(accessToken: string, input: ExamDraftInput) {
  return adminRequest<ExamSaveResult>(accessToken, 'academics/exams', { method: 'POST', body: JSON.stringify(input) })
}

export function updateExam(accessToken: string, id: string, input: Partial<Omit<ExamDraftInput, 'requestId'>> & { expectedRevision: number }) {
  return adminRequest<ExamDetail>(accessToken, `academics/exams/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function publishExam(accessToken: string, id: string, expectedRevision: number) {
  return adminRequest<ExamDetail>(accessToken, `academics/exams/${encodeURIComponent(id)}/publish`, { method: 'POST', body: JSON.stringify({ expectedRevision }) })
}

export function duplicateExam(accessToken: string, id: string, input: Pick<ExamDraftInput, 'requestId' | 'campusId' | 'academicYearId' | 'classSectionIds' | 'name' | 'termId' | 'startsOn' | 'endsOn'>) {
  return adminRequest<ExamSaveResult>(accessToken, `academics/exams/${encodeURIComponent(id)}/duplicate`, { method: 'POST', body: JSON.stringify(input) })
}
