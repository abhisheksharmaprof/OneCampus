import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createExam,
  duplicateExam,
  getExam,
  getExamCoverage,
  getExamElectiveCandidates,
  getExamOptions,
  getExamSchedule,
  getExamSubjects,
  getExamTimetable,
  listAllExamSections,
  listExams,
  publishExam,
  publishExamTimetable,
  updateExamSchedule,
  updateExam,
  updateExamElectiveCandidates,
  updateExamSubjects,
} from '../exams.api'
import type { ExamDraftInput } from '../exams.types'

function success(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function failure(error: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify({ success: false, error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const draftInput: ExamDraftInput = {
  requestId: 'request-1',
  campusId: 'campus-1',
  academicYearId: 'year-1',
  category: 'CLASS_TEST',
  name: 'Class 8 science test',
  classSectionIds: ['section-1'],
}

describe('exam API client', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('builds scoped options queries and maps section choices and action capabilities', async () => {
    const controller = new AbortController()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({
      items: [{ id: 'section-1', classId: 'grade-8', className: 'Class 8', sectionName: 'A', campusId: 'campus-1', academicYearId: 'year-1' }],
      actions: { create: { allowed: true }, view: false, edit: { allowed: false }, publish: true },
      page: 2,
      totalPages: 3,
    }))

    const options = await getExamOptions('token', {
      kind: 'sections', action: 'create', campusId: ' campus-1 ', academicYearId: 'year-1',
      search: ' Class 8 ', page: 2, pageSize: 100, signal: controller.signal,
    })

    const [url, request] = fetchMock.mock.calls[0]
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe('/api/v1/admin/academics/exams/options')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      kind: 'sections', action: 'create', campusId: 'campus-1', academicYearId: 'year-1',
      search: 'Class 8', page: '2', pageSize: '100',
    })
    expect(request?.signal).toBe(controller.signal)
    expect(options.sections).toEqual([{
      id: 'section-1', name: 'Class 8 A', gradeName: 'Class 8', sectionName: 'A',
      campusId: 'campus-1', academicYearId: 'year-1', gradeId: 'grade-8',
    }])
    expect(options.actions).toEqual({ create: true, view: false, edit: false, publish: true })
    expect(options.page).toBe(2)
    expect(options.totalPages).toBe(3)
  })

  it('loads every page of authorized sections', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const page = new URL(String(input)).searchParams.get('page')
      return success({
        items: [{ id: `section-${page}`, name: `Section ${page}`, className: 'Class 8', sectionName: page }],
        page: Number(page), totalPages: 2,
      })
    })

    const sections = await listAllExamSections('token', {
      action: 'edit', campusId: 'campus-1', academicYearId: 'year-1',
    })

    expect(sections.map((section) => section.id)).toEqual(['section-1', 'section-2'])
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('page'))).toEqual(['1', '2'])
    expect(fetchMock.mock.calls.map(([url]) => new URL(String(url)).searchParams.get('pageSize'))).toEqual(['100', '100'])
  })

  it('normalizes paginated exam rows and query filters', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(success({
      count: 1, page: 3, pageSize: 10, totalPages: 3, next: null, previous: '?page=2',
      results: [{ id: 'exam-1', targetSummary: 'Class 8 A' }],
    }))

    const page = await listExams('token', {
      campusId: ' campus-1 ', academicYearId: 'year-1', category: 'CLASS_TEST',
      search: ' science ', page: 3, pageSize: 10,
    })

    const parsed = new URL(String(fetchMock.mock.calls[0][0]))
    expect(parsed.pathname).toBe('/api/v1/admin/academics/exams')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      page: '3', pageSize: '10', campusId: 'campus-1', academicYearId: 'year-1',
      category: 'CLASS_TEST', search: 'science',
    })
    expect(page).toMatchObject({ page: 3, pageSize: 10, previous: '?page=2' })
    expect(page.results[0].targetSummary).toEqual(['Class 8 A'])
  })

  it('uses the exam routes and sends revision-checked mutation payloads', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(success({ id: 'exam-1' })))

    await getExam('token', 'exam /one')
    await createExam('token', draftInput)
    await updateExam('token', 'exam /one', { expectedRevision: 2, name: 'Revised test' })
    await publishExam('token', 'exam /one', 2)
    await duplicateExam('token', 'exam /one', {
      requestId: 'request-2', campusId: 'campus-1', academicYearId: 'year-1',
      classSectionIds: ['section-1'], name: 'Copy',
    })

    const calls = fetchMock.mock.calls.map(([url, request]) => ({
      path: new URL(String(url)).pathname.replace('/api/v1/admin/', ''),
      method: request?.method ?? 'GET',
      body: request?.body ? JSON.parse(String(request.body)) : undefined,
    }))
    expect(calls).toEqual([
      { path: 'academics/exams/exam%20%2Fone', method: 'GET', body: undefined },
      { path: 'academics/exams', method: 'POST', body: draftInput },
      { path: 'academics/exams/exam%20%2Fone', method: 'PATCH', body: { expectedRevision: 2, name: 'Revised test' } },
      { path: 'academics/exams/exam%20%2Fone/publish', method: 'POST', body: { expectedRevision: 2 } },
      { path: 'academics/exams/exam%20%2Fone/duplicate', method: 'POST', body: {
        requestId: 'request-2', campusId: 'campus-1', academicYearId: 'year-1',
        classSectionIds: ['section-1'], name: 'Copy',
      } },
    ])
  })

  it('loads and saves per-section subject choices with an expected revision', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(success({ examId: 'exam-1', revision: 4, targets: [] })))
    const setup = await getExamSubjects('token', 'exam /one')
    await updateExamSubjects('token', 'exam /one', {
      expectedRevision: setup.revision,
      targets: [{ classSectionId: 'section-1', subjectIds: ['subject-math'] }, { classSectionId: 'section-2', subjectIds: [] }],
    })

    const calls = fetchMock.mock.calls.map(([url, request]) => ({
      path: new URL(String(url)).pathname.replace('/api/v1/admin/', ''),
      method: request?.method ?? 'GET',
      body: request?.body ? JSON.parse(String(request.body)) : undefined,
    }))
    expect(calls).toEqual([
      { path: 'academics/exams/exam%20%2Fone/subjects', method: 'GET', body: undefined },
      { path: 'academics/exams/exam%20%2Fone/subjects', method: 'PUT', body: {
        expectedRevision: 4,
        targets: [{ classSectionId: 'section-1', subjectIds: ['subject-math'] }, { classSectionId: 'section-2', subjectIds: [] }],
      } },
    ])
  })

  it('loads and saves per-subject paper dates and times with the expected revision', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(success({ examId: 'exam-1', revision: 5, papers: [] })))
    const schedule = await getExamSchedule('token', 'exam /one')
    await updateExamSchedule('token', 'exam /one', {
      expectedRevision: schedule.revision,
      papers: [{ classSectionId: 'section-1', subjectId: 'subject-math', scheduledOn: '2026-11-05', startTime: '09:00', endTime: '10:00' }],
    })

    const calls = fetchMock.mock.calls.map(([url, request]) => ({
      path: new URL(String(url)).pathname.replace('/api/v1/admin/', ''),
      method: request?.method ?? 'GET',
      body: request?.body ? JSON.parse(String(request.body)) : undefined,
    }))
    expect(calls).toEqual([
      { path: 'academics/exams/exam%20%2Fone/schedule', method: 'GET', body: undefined },
      { path: 'academics/exams/exam%20%2Fone/schedule', method: 'PUT', body: {
        expectedRevision: 5,
        papers: [{ classSectionId: 'section-1', subjectId: 'subject-math', scheduledOn: '2026-11-05', startTime: '09:00', endTime: '10:00' }],
      } },
    ])
  })

  it('loads timetable validation and publishes with a separate revision-checked route', async () => {
    const data = { examId: 'exam-1', revision: 7, ready: true, checks: [], blockers: [], conflicts: [], publication: null, actions: { publish: true } }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(success(data)))
    expect(await getExamTimetable('token', 'exam /one')).toEqual(data)
    expect(await publishExamTimetable('token', 'exam /one', 7)).toEqual(data)
    expect(fetchMock.mock.calls.map(([url, request]) => ({
      path: new URL(String(url)).pathname.replace('/api/v1/admin/', ''),
      method: request?.method ?? 'GET',
      body: request?.body ? JSON.parse(String(request.body)) : undefined,
    }))).toEqual([
      { path: 'academics/exams/exam%20%2Fone/timetable', method: 'GET', body: undefined },
      { path: 'academics/exams/exam%20%2Fone/publish-complete', method: 'POST', body: { expectedRevision: 7 } },
    ])
  })

  it('loads coverage and paged elective candidates, then replaces the complete assignment set with the current revision', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(success({ examId: 'exam-1', revision: 8, assignedStudentIds: ['student-1'], count: 1, page: 1, pageSize: 25, totalPages: 1, items: [{ studentId: 'student-1', fullName: 'A Student', isAssigned: true }] })))
    await getExamCoverage('token', 'exam /one')
    await getExamElectiveCandidates('token', 'exam /one', 'section /a', 'subject-music', { page: 2, pageSize: 25, search: ' A Student ' })
    await updateExamElectiveCandidates('token', 'exam /one', 'section /a', 'subject-music', { expectedRevision: 8, studentIds: ['student-1', 'student-2'] })

    const calls = fetchMock.mock.calls.map(([url, request]) => ({
      path: new URL(String(url)).pathname.replace('/api/v1/admin/', ''),
      query: Object.fromEntries(new URL(String(url)).searchParams),
      method: request?.method ?? 'GET',
      body: request?.body ? JSON.parse(String(request.body)) : undefined,
    }))
    expect(calls).toEqual([
      { path: 'academics/exams/exam%20%2Fone/coverage', query: {}, method: 'GET', body: undefined },
      { path: 'academics/exams/exam%20%2Fone/coverage/section%20%2Fa/subject-music/candidates', query: { page: '2', pageSize: '25', search: 'A Student' }, method: 'GET', body: undefined },
      { path: 'academics/exams/exam%20%2Fone/coverage/section%20%2Fa/subject-music/candidates', query: {}, method: 'PUT', body: { expectedRevision: 8, studentIds: ['student-1', 'student-2'] } },
    ])
  })

  it('preserves API validation details and trace IDs on a rejected mutation', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(failure({
      code: 'revision_conflict',
      message: 'This exam changed after it was opened.',
      fieldErrors: { expectedRevision: ['Reload the latest revision.'] },
      traceId: 'trace-123',
    }, 409))

    await expect(updateExam('token', 'exam-1', { expectedRevision: 1, name: 'Changed' }))
      .rejects.toMatchObject({
        name: 'AdminApiError',
        code: 'revision_conflict',
        status: 409,
        fieldErrors: { expectedRevision: ['Reload the latest revision.'] },
        traceId: 'trace-123',
      })
  })
})
