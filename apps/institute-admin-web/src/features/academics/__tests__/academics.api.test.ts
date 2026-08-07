import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listSections, updateAcademicRecord } from '../academics.api'

describe('academics API client', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('uses the exact academics URL and section filter contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: { count: 0, page: 2, pageSize: 0, totalPages: 1, next: null, previous: null, items: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    await listSections('token', { page: 2, pageSize: 50, search: ' blue ', branchId: 'branch-1', academicYearId: 'year-1', gradeId: 'grade-1' })

    const [url, options] = fetchMock.mock.calls[0]
    const parsed = new URL(String(url))
    expect(parsed.pathname).toBe('/api/v1/admin/academics/sections')
    expect(Object.fromEntries(parsed.searchParams)).toEqual({ page: '2', pageSize: '50', search: 'blue', branchId: 'branch-1', academicYearId: 'year-1', gradeId: 'grade-1' })
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer token' })
  })

  it('sends camelCase patch fields and surfaces API trace references', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { id: 'subject-1', name: 'Physics', subjectCode: 'PHY' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fieldErrors: { name: ['Already exists.'] }, traceId: 'trace-123' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }))

    await updateAcademicRecord('token', 'subjects', 'subject-1', { subjectCode: 'PHY' })
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:8000/api/v1/admin/academics/subjects/subject-1')
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'PATCH', body: JSON.stringify({ subjectCode: 'PHY' }) })

    await expect(updateAcademicRecord('token', 'subjects', 'subject-1', { name: 'Physics' })).rejects.toMatchObject({
      traceId: 'trace-123',
      fieldErrors: { name: ['Already exists.'] },
      status: 400,
    })
  })
})
