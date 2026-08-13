import { AdminApiError, adminRequest } from '../admin/admin.api'
import type {
  AcademicClass,
  AcademicClassInput,
  ClassSubject,
  AcademicResource,
  AcademicYear,
  AcademicYearInput,
  AcademicTerm,
  AcademicTermInput,
  ClassSection,
  ClassSectionInput,
  ListParams,
  PageData,
  Subject,
  SubjectInput,
  Room,
  SubjectTeacherAssignment,
} from './academics.types'

export { AdminApiError as AcademicsApiError }

function queryString(params: ListParams) {
  const query = new URLSearchParams({ page: String(params.page), pageSize: String(params.pageSize) })
  if (params.search?.trim()) query.set('search', params.search.trim())
  if (params.branchId) query.set('branchId', params.branchId)
  if (params.academicYearId) query.set('academicYearId', params.academicYearId)
  if (params.gradeId) query.set('gradeId', params.gradeId)
  return query.toString()
}

export function listAcademicYears(accessToken: string, params: ListParams, signal?: AbortSignal) {
  return adminRequest<PageData<AcademicYear>>(accessToken, `academics/academic-years?${queryString(params)}`, { signal })
}

export function listAcademicTerms(accessToken: string, academicYearId: string, signal?: AbortSignal) {
  return adminRequest<PageData<AcademicTerm>>(accessToken, `academics/academic-terms?academicYearId=${encodeURIComponent(academicYearId)}&page=1&pageSize=100`, { signal })
}

export function createAcademicTerm(accessToken: string, input: AcademicTermInput) {
  return adminRequest<AcademicTerm>(accessToken, 'academics/academic-terms', { method: 'POST', body: JSON.stringify(input) })
}

export function updateAcademicTerm(accessToken: string, id: string, input: Partial<AcademicTermInput>) {
  return adminRequest<AcademicTerm>(accessToken, `academics/academic-terms/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteAcademicTerm(accessToken: string, id: string) {
  return adminRequest<void>(accessToken, `academics/academic-terms/${id}`, { method: 'DELETE' })
}

export function listClasses(accessToken: string, params: ListParams, signal?: AbortSignal) {
  return adminRequest<PageData<AcademicClass>>(accessToken, `academics/classes?${queryString(params)}`, { signal })
}

export function listSubjects(accessToken: string, params: ListParams, signal?: AbortSignal) {
  return adminRequest<PageData<Subject>>(accessToken, `academics/subjects?${queryString(params)}`, { signal })
}
export function listClassSubjects(accessToken: string, params: ListParams, signal?: AbortSignal) {
  return adminRequest<PageData<ClassSubject>>(accessToken, `academics/class-subjects?${queryString(params)}`, { signal })
}
export function createClassSubject(accessToken: string, input: Record<string, unknown>) {
  return adminRequest<ClassSubject>(accessToken, 'academics/class-subjects', { method: 'POST', body: JSON.stringify(input) })
}
export function updateClassSubject(accessToken: string, id: string, input: Record<string, unknown>) {
  return adminRequest<ClassSubject>(accessToken, `academics/class-subjects/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}
export function deleteClassSubject(accessToken: string, id: string) {
  return adminRequest<void>(accessToken, `academics/class-subjects/${id}`, { method: 'DELETE' })
}

export function listSections(accessToken: string, params: ListParams, signal?: AbortSignal) {
  return adminRequest<PageData<ClassSection>>(accessToken, `academics/sections?${queryString(params)}`, { signal })
}

export function listRooms(accessToken: string, params: ListParams, signal?: AbortSignal) {
  return adminRequest<PageData<Room>>(accessToken, `academics/rooms?${queryString(params)}`, { signal })
}

export function listSubjectTeacherAssignments(accessToken: string, params: ListParams, signal?: AbortSignal) {
  return adminRequest<PageData<SubjectTeacherAssignment>>(accessToken, `academics/section-subject-teachers?${queryString(params)}`, { signal })
}

export type SubjectTeacherAssignmentInput = { classSectionIds?: string[]; classSectionId?: string; classId?: string; subjectId: string; teacherId: string; combinedSlotLabel?: string }

export function createSubjectTeacherAssignment(accessToken: string, input: SubjectTeacherAssignmentInput) {
  return adminRequest<SubjectTeacherAssignment>(accessToken, 'academics/section-subject-teachers', { method: 'POST', body: JSON.stringify(input) })
}

export function updateSubjectTeacherAssignment(accessToken: string, id: string, input: SubjectTeacherAssignmentInput) {
  return adminRequest<SubjectTeacherAssignment>(accessToken, `academics/section-subject-teachers/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteSubjectTeacherAssignment(accessToken: string, id: string) {
  return adminRequest<void>(accessToken, `academics/section-subject-teachers/${id}`, { method: 'DELETE' })
}

type ResourceRecord = AcademicYear | AcademicClass | Subject | ClassSection
type ResourceInput = AcademicYearInput | AcademicClassInput | SubjectInput | ClassSectionInput

export function createAcademicRecord<T extends ResourceRecord>(accessToken: string, resource: AcademicResource, input: ResourceInput) {
  return adminRequest<T>(accessToken, `academics/${resource}`, { method: 'POST', body: JSON.stringify(input) })
}

export function updateAcademicRecord<T extends ResourceRecord>(accessToken: string, resource: AcademicResource, id: string, input: Partial<ResourceInput>) {
  return adminRequest<T>(accessToken, `academics/${resource}/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function setCurrentAcademicYear(accessToken: string, id: string) {
  return adminRequest<AcademicYear>(accessToken, `academics/academic-years/${id}/set-current`, { method: 'POST' })
}

export type AcademicOperationKind = 'LESSON_PLAN' | 'HOMEWORK' | 'EXAM' | 'QUESTION' | 'MARK'

export type AcademicOperation = {
  id: string
  kind: AcademicOperationKind
  title: string
  status: string
  branchId: string | null
  payload: Record<string, string | number | boolean | null>
  createdBy: { id: string; name: string } | null
  createdAt: string
  updatedAt: string
}

export type AcademicOperationInput = Pick<AcademicOperation, 'kind' | 'title'> & {
  status?: string
  branchId?: string | null
  payload?: AcademicOperation['payload']
}

export function listAcademicOperations(accessToken: string, kind: AcademicOperationKind, branchId?: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ kind, page: '1', pageSize: '100' })
  if (branchId) query.set('branchId', branchId)
  return adminRequest<PageData<AcademicOperation>>(accessToken, `academics/operations?${query}`, { signal })
}

export function createAcademicOperation(accessToken: string, input: AcademicOperationInput) {
  return adminRequest<AcademicOperation>(accessToken, 'academics/operations', { method: 'POST', body: JSON.stringify(input) })
}

export function updateAcademicOperation(accessToken: string, id: string, input: Partial<Omit<AcademicOperationInput, 'kind'>>) {
  return adminRequest<AcademicOperation>(accessToken, `academics/operations/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function deleteAcademicOperation(accessToken: string, id: string) {
  return adminRequest<void>(accessToken, `academics/operations/${id}`, { method: 'DELETE' })
}
