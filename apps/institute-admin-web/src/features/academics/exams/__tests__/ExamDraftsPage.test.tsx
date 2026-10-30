import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ExamDraftsPage } from '../ExamDraftsPage'

const bootstrap = {
  campuses: [{ id: 'campus-1', name: 'North Campus' }],
  academicYears: [{ id: 'year-current', name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true }],
  categories: [{ value: 'CLASS_TEST', label: 'Class test' }, { value: 'ANNUAL', label: 'Annual' }],
  actions: { create: true, view: true, edit: true, publish: true },
}
const exam = {
  id: 'exam-1', campusId: 'campus-1', academicYearId: 'year-current', termId: null, category: 'CLASS_TEST', name: 'Unit Test 1',
  classSectionIds: ['section-1'], startsOn: null, endsOn: null, coordinatorId: null, instructions: null,
  status: 'DRAFT', revision: 1, actions: { view: true, edit: true, duplicate: true, publish: true, schedule: true },
}
const subjectSetup = {
  examId: 'exam-1', revision: 3, targets: [
    { classSectionId: 'section-1', gradeName: 'Class 8', sectionName: 'A', selectedSubjectIds: ['math-1', 'stale-1'], subjects: [
      { id: 'math-1', name: 'Mathematics', code: 'MATH', isElective: false, isLab: false },
      { id: 'english-1', name: 'English', code: 'ENG', isElective: true, isLab: false },
    ], staleSelections: [{ id: 'stale-1', name: 'Old science', code: 'SCI', isElective: false, isLab: false, staleMapping: true }] },
    { classSectionId: 'section-2', gradeName: 'Class 8', sectionName: 'B', selectedSubjectIds: [], subjects: [
      { id: 'math-2', name: 'Mathematics', code: 'MATH', isElective: false, isLab: false },
    ], staleSelections: [] },
  ],
}
const paperSchedule = {
  examId: 'exam-1', revision: 4, papers: [
    { classSectionId: 'section-1', sectionName: 'A', gradeName: 'Class 8', subjectId: 'math-1', subjectName: 'Mathematics', subjectCode: 'MATH', scheduledOn: null, startTime: null, endTime: null },
  ],
}
const examCoverage = {
  examId: 'exam-1', revision: 4, complete: false, activeStudentCount: 2, coveredStudentCount: 1, uncoveredStudentCount: 1,
  nonElectivePaperCount: 1, electivePaperCount: 1,
  sections: [{ classSectionId: 'section-1', sectionName: 'A', gradeName: 'Class 8', activeStudentCount: 2, coveredStudentCount: 1, uncoveredStudentCount: 1, electivePaperCount: 1 }],
  uncoveredStudents: [{ studentId: 'student-2', fullName: 'Bea Learner', admissionNumber: 'ADM-2', rollNumber: '2', classSectionId: 'section-1', sectionName: 'A', missingElectiveAssignment: true }],
  uncoveredStudentsTruncated: false,
}
const electiveCandidates = {
  examId: 'exam-1', revision: 4, classSectionId: 'section-1', subjectId: 'english-1', subjectName: 'English',
  assignedStudentIds: ['student-1'], count: 2, page: 1, pageSize: 25, totalPages: 1,
  items: [
    { studentId: 'student-1', fullName: 'Ava Learner', admissionNumber: 'ADM-1', rollNumber: '1', isAssigned: true },
    { studentId: 'student-2', fullName: 'Bea Learner', admissionNumber: 'ADM-2', rollNumber: '2', isAssigned: false },
  ],
}

function success(data: unknown, status = 200) { return Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status, headers: { 'Content-Type': 'application/json' } })) }
function failure(code: string, message: string, status = 409) { return Promise.resolve(new Response(JSON.stringify({ success: false, error: { code, message } }), { status, headers: { 'Content-Type': 'application/json' } })) }

describe('ExamDraftsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams/options')) {
        const kind = url.searchParams.get('kind')
        if (kind === 'bootstrap') return success(bootstrap)
        if (kind === 'sections') return success({ items: [
          { id: 'section-1', campusId: 'campus-1', academicYearId: 'year-current', classId: 'grade-8', className: 'Class 8', sectionName: 'A', name: 'A' },
          { id: 'section-2', campusId: 'campus-1', academicYearId: 'year-current', classId: 'grade-8', className: 'Class 8', sectionName: 'B', name: 'B' },
          { id: 'section-3', campusId: 'campus-1', academicYearId: 'year-current', classId: 'grade-9', className: 'Class 9', sectionName: 'A', name: 'A' },
          { id: 'section-other-campus', campusId: 'campus-2', academicYearId: 'year-current', classId: 'grade-8', className: 'Class 8', sectionName: 'C', name: 'C' },
          { id: 'section-other-year', campusId: 'campus-1', academicYearId: 'year-previous', classId: 'grade-8', className: 'Class 8', sectionName: 'D', name: 'D' },
        ] })
        if (kind === 'terms') return success({ items: [{ id: 'term-1', name: 'Term 1' }] })
        return success({ items: [] })
      }
      if (url.pathname.endsWith('/academics/exams') && options?.method === 'POST') return success({ requestId: 'request-1', examId: 'exam-2', savedRevision: 1 }, 201)
      if (url.pathname.endsWith('/academics/exams/exam-1/duplicate') && options?.method === 'POST') return success({ requestId: 'request-2', examId: 'exam-2', savedRevision: 1 }, 201)
      if (url.pathname.endsWith('/academics/exams/exam-1/publish') && options?.method === 'POST') return success({ ...exam, status: 'PUBLISHED', revision: 2, publicationSnapshot: { id: 'snapshot-1', revision: 2 } })
      if (url.pathname.endsWith('/academics/exams/exam-1/subjects') && options?.method === 'PUT') return success({ ...subjectSetup, revision: 4 })
      if (url.pathname.endsWith('/academics/exams/exam-1/subjects')) return success(subjectSetup)
      if (url.pathname.endsWith('/academics/exams/exam-1/schedule') && options?.method === 'PUT') return success({ ...paperSchedule, revision: 5 })
      if (url.pathname.endsWith('/academics/exams/exam-1/schedule')) return success(paperSchedule)
      if (url.pathname.endsWith('/academics/exams/exam-1/coverage/section-1/english-1/candidates') && options?.method === 'PUT') return success({ ...electiveCandidates, revision: 5, assignedStudentIds: ['student-1', 'student-2'], items: electiveCandidates.items.map((item) => ({ ...item, isAssigned: true })) })
      if (url.pathname.endsWith('/academics/exams/exam-1/coverage/section-1/english-1/candidates')) return success(electiveCandidates)
      if (url.pathname.endsWith('/academics/exams/exam-1/coverage')) return success(examCoverage)
      if (url.pathname.endsWith('/academics/exams/exam-1') && (!options?.method || options.method === 'GET')) return success(exam)
      if (url.pathname.endsWith('/academics/exams/exam-1') && options?.method === 'PATCH') return failure('revision_conflict', 'Draft revision changed.')
      if (url.pathname.endsWith('/academics/exams')) return success({ count: 1, page: 1, pageSize: 50, totalPages: 1, next: null, previous: null, results: [{ ...exam, targetSummary: ['Class 8 A'] }] })
      return success({ items: [] })
    })
  })

  it('keeps the list minimal and opens the exam workspace', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByRole('heading', { name: 'Unit Test 1' })
    expect(screen.queryByRole('button', { name: 'Schedule papers' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    expect(screen.getByRole('navigation', { name: 'Exam lifecycle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Schedule papers' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'All exams' }))
    expect(screen.getByRole('button', { name: 'Manage exam' })).toBeInTheDocument()
  })

  it('creates a scoped draft and presents a create-only receipt without reopening detail', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByRole('heading', { name: 'Exams' })
    await user.click(screen.getAllByRole('button', { name: /New exam/i })[0])
    const dialog = screen.getByRole('dialog', { name: 'Create exam draft' })
    await user.type(within(dialog).getByLabelText('Exam name'), 'Class 8 Science Test')
    await user.click(await within(dialog).findByLabelText('Class 8 A'))
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Draft saved (revision 1). This account can create drafts but needs view permission to reopen them.')
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/academics/exams') && options?.method === 'POST')
      expect(call).toBeDefined()
      const body = JSON.parse(String(call?.[1]?.body))
      expect(body).toMatchObject({ campusId: 'campus-1', academicYearId: 'year-current', name: 'Class 8 Science Test', classSectionIds: ['section-1'] })
      expect(body.requestId).toBeTruthy()
    })
  })

  it('allows multiple sections in one class-test grade and rejects a different grade', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: /New exam/i }))
    const dialog = screen.getByRole('dialog', { name: 'Create exam draft' })
    await user.type(within(dialog).getByLabelText('Exam name'), 'Class 8 Test')
    await user.click(await within(dialog).findByLabelText('Class 8 A'))
    await user.click(within(dialog).getByLabelText('Class 8 B'))
    await user.click(within(dialog).getByLabelText('Class 9 A'))

    expect(within(dialog).getByRole('alert')).toHaveTextContent('A class test can include sections from only one grade.')
    expect(within(dialog).getByLabelText('Class 9 A')).not.toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Draft saved (revision 1).')
    const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/academics/exams') && options?.method === 'POST')
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ category: 'CLASS_TEST', classSectionIds: ['section-1', 'section-2'] })
  })

  it('does not show section choices outside the selected campus and academic year', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: /New exam/i }))
    const dialog = screen.getByRole('dialog', { name: 'Create exam draft' })

    expect(await within(dialog).findByLabelText('Class 8 A')).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Class 8 C')).not.toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Class 8 D')).not.toBeInTheDocument()
    const sectionsRequest = vi.mocked(fetch).mock.calls.find(([url]) => {
      const requestUrl = new URL(String(url))
      return requestUrl.pathname.endsWith('/academics/exams/options') && requestUrl.searchParams.get('kind') === 'sections'
    })
    const query = new URL(String(sectionsRequest?.[0])).searchParams
    expect(query.get('kind')).toBe('sections')
    expect(query.get('action')).toBe('create')
    expect(query.get('campusId')).toBe('campus-1')
    expect(query.get('academicYearId')).toBe('year-current')
  })

  it('automatically dismisses the saved notice after five seconds', async () => {
    const user = userEvent.setup()
    const originalFetch = vi.mocked(fetch).getMockImplementation()
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams') && options?.method === 'POST') return success({ ...exam, targetSummary: ['Class 8 A'] }, 201)
      return originalFetch?.(input, options) ?? success({ items: [] })
    })
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: /New exam/i }))
    const dialog = screen.getByRole('dialog', { name: 'Create exam draft' })
    await user.type(within(dialog).getByLabelText('Exam name'), 'Class 8 Science Test')
    await user.click(await within(dialog).findByLabelText('Class 8 A'))
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }))

    const savedNotice = 'Draft saved at revision 1.'
    expect(await screen.findByRole('status')).toHaveTextContent(savedNotice)
    const dismiss = setTimeoutSpy.mock.calls.find(([, delay]) => delay === 5000)?.[0]
    expect(dismiss).toBeTypeOf('function')
    act(() => (dismiss as () => void)())
    expect(screen.queryByText(savedNotice)).not.toBeInTheDocument()
  })

  it('keeps the discard confirmation above the dirty editor and preserves the form when canceled', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: /New exam/i }))
    const editor = screen.getByRole('dialog', { name: 'Create exam draft' })
    const name = within(editor).getByLabelText('Exam name')
    await user.type(name, 'Temporary exam')
    await user.click(within(editor).getByRole('button', { name: 'Close exam editor' }))

    const confirmation = screen.getByRole('dialog', { name: 'Discard unsaved changes?' })
    expect(screen.getAllByRole('dialog')).toHaveLength(2)
    expect(confirmation).toHaveTextContent('Your changes to this exam draft will be lost.')
    expect(editor).toBeInTheDocument()
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('dialog', { name: 'Discard unsaved changes?' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Create exam draft' })).toBeInTheDocument()
    expect(name).toHaveValue('Temporary exam')
    expect(vi.mocked(fetch).mock.calls.some(([url, options]) => String(url).endsWith('/academics/exams') && options?.method === 'POST')).toBe(false)
  })

  it('duplicates an existing exam into a new draft after selecting its single target section', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Duplicate' }))
    const dialog = await screen.findByRole('dialog', { name: 'Duplicate exam' })

    expect(within(dialog).getByLabelText('Exam name')).toHaveValue('Unit Test 1 copy')
    await user.click(await within(dialog).findByLabelText('Class 8 A'))
    await user.click(within(dialog).getByRole('button', { name: 'Create duplicate draft' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Draft saved (revision 1). This account can create drafts but needs view permission to reopen them.')
    const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/academics/exams/exam-1/duplicate') && options?.method === 'POST')
    expect(call).toBeDefined()
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ campusId: 'campus-1', academicYearId: 'year-current', name: 'Unit Test 1 copy', classSectionIds: ['section-1'] })
  })

  it('shows future exam stages as placeholders', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    expect(screen.getByText('5. Admit cards')).toBeInTheDocument()
    expect(screen.getByText('6. Marks & marksheets')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Publish setup notice' })).not.toBeInTheDocument()
  })

  it('refreshes timetable blockers and publishes a complete immutable exam', async () => {
    const user = userEvent.setup()
    const baseFetch = vi.mocked(fetch).getMockImplementation()
    let validationLoads = 0
    let publishAttempts = 0
    let publishedTimetableLoads = 0
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams') && options?.method !== 'POST' && !url.searchParams.has('kind')) {
        const isPublished = publishAttempts > 1
        return success({ count: 1, page: 1, pageSize: 50, totalPages: 1, results: [{ ...exam, status: isPublished ? 'PUBLISHED' : exam.status, timetablePublished: isPublished, targetSummary: ['Class 8 A'], actions: { ...exam.actions, timetablePublish: !isPublished } }] })
      }
      if (url.pathname.endsWith('/exam-1/timetable') && options?.method !== 'POST') {
        if (publishAttempts > 1) {
          publishedTimetableLoads += 1
          return success({ examId: 'exam-1', revision: 5, ready: true, checks: [{ code: 'papers_scheduled', label: 'Every paper has a date and time', passed: true }], blockers: [], conflicts: [], publication: { revision: 5, publishedAt: '2026-10-29T10:00:00Z', publishedBy: 'Exam controller', snapshot: { papers: 3 } }, papers: [
            { classSectionId: 'section-1', subjectId: 'math-1', paperLabel: 'Class 8 A · Mathematics', scheduledOn: '2026-10-31', startTime: '09:00', endTime: '12:00' },
            { classSectionId: 'section-1', subjectId: 'english-1', paperLabel: 'Class 8 A · English', scheduledOn: '2026-10-30', startTime: '13:00', endTime: '16:00' },
            { classSectionId: 'section-3', subjectId: 'science-1', paperLabel: 'Class 9 A · Science', scheduledOn: '2026-10-30', startTime: '09:00', endTime: '12:00' },
          ], actions: { publish: false } })
        }
        validationLoads += 1
        return success({ examId: 'exam-1', revision: validationLoads > 1 ? 5 : 4, ready: validationLoads > 1, checks: [{ code: 'papers_scheduled', label: 'Every paper has a date and time', passed: validationLoads > 1 }], blockers: validationLoads > 1 ? [] : [{ code: 'missing_schedule', message: 'Mathematics has no complete date and time.' }], conflicts: [], publication: null, actions: { publish: true } })
      }
      if (url.pathname.endsWith('/exam-1/publish-complete') && options?.method === 'POST') {
        publishAttempts += 1
        if (publishAttempts === 1) return failure('revision_conflict', 'The exam changed after validation.')
        return success({ examId: 'exam-1', revision: 5, ready: true, checks: [], blockers: [], conflicts: [], publication: { revision: 5, publishedAt: '2026-10-29T10:00:00Z', publishedBy: 'Exam controller', snapshot: { papers: 3 } }, papers: [
          { classSectionId: 'section-1', subjectId: 'math-1', paperLabel: 'Class 8 A · Mathematics', scheduledOn: '2026-10-31', startTime: '09:00', endTime: '12:00' },
          { classSectionId: 'section-1', subjectId: 'english-1', paperLabel: 'Class 8 A · English', scheduledOn: '2026-10-30', startTime: '13:00', endTime: '16:00' },
          { classSectionId: 'section-3', subjectId: 'science-1', paperLabel: 'Class 9 A · Science', scheduledOn: '2026-10-30', startTime: '09:00', endTime: '12:00' },
        ], actions: { publish: true } })
      }
      return baseFetch?.(input, options) ?? success({ items: [] })
    })

    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Review and publish' }))
    const dialog = await screen.findByRole('region', { name: 'Validate timetable · Unit Test 1' })
    expect(await within(dialog).findByRole('region', { name: 'Publication blockers' })).toHaveTextContent('Mathematics has no complete date and time.')
    expect(within(dialog).getByRole('button', { name: 'Publish exam' })).toBeDisabled()
    await user.click(within(dialog).getAllByRole('button', { name: 'Refresh validation' })[0])
    await waitFor(() => expect(within(dialog).getByText(/Ready to publish/)).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button', { name: 'Publish exam' }))
    await user.click(within(dialog).getByRole('button', { name: 'Confirm publish' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('This exam changed after validation.')
    await user.click(within(dialog).getAllByRole('button', { name: 'Refresh validation' })[0])
    await waitFor(() => expect(within(dialog).getByText(/Exam revision 5/)).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button', { name: 'Publish exam' }))
    await user.click(within(dialog).getByRole('button', { name: 'Confirm publish' }))
    expect(await within(dialog).findByText(/Published at revision 5/)).toBeInTheDocument()
    expect(within(dialog).getByText(/immutable snapshot/)).toBeInTheDocument()
    const publishedPapers = within(dialog).getByRole('region', { name: 'Published timetable by class' })
    expect(within(publishedPapers).getByText('3 papers · 2 classes')).toBeInTheDocument()
    const classEight = within(publishedPapers).getByRole('region', { name: 'Timetable for Class 8 A' })
    const publishedRows = within(classEight).getAllByRole('row')
    expect(publishedRows[1]).toHaveTextContent('English')
    expect(publishedRows[1]).toHaveTextContent('2026-10-30')
    expect(publishedRows[2]).toHaveTextContent('Mathematics')
    await user.click(within(publishedPapers).getByRole('button', { name: 'Class 9 A' }))
    expect(within(publishedPapers).getByRole('region', { name: 'Timetable for Class 9 A' })).toHaveTextContent('Science')
    expect(within(publishedPapers).queryByRole('region', { name: 'Timetable for Class 8 A' })).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'View timetable' }))
    await waitFor(() => expect(publishedTimetableLoads).toBe(1))
    const publishCall = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/exam-1/publish-complete') && options?.method === 'POST')
    expect(JSON.parse(String(publishCall?.[1]?.body))).toEqual({ expectedRevision: 5 })
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/exam-1/publish'))).toBe(false)
  })

  it('preserves edited values when a revision conflict is returned', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit exam draft' })
    const name = within(dialog).getByLabelText('Exam name')
    await user.clear(name)
    await user.type(name, 'Revised Unit Test')
    await user.click(within(dialog).getByRole('button', { name: 'Show optional schedule and instructions' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('This draft changed after you opened it.')
    expect(name).toHaveValue('Revised Unit Test')
    const updateCall = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/academics/exams/exam-1') && options?.method === 'PATCH')
    const updateBody = JSON.parse(String(updateCall?.[1]?.body))
    expect(updateBody).toMatchObject({ expectedRevision: 1, name: 'Revised Unit Test' })
    expect(updateBody).not.toHaveProperty('campusId')
    expect(updateBody).not.toHaveProperty('academicYearId')
    expect(updateBody).not.toHaveProperty('requestId')
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('returns from a configuration screen using its close control', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Schedule papers' }))
    const region = await screen.findByRole('region', { name: 'Schedule papers · Unit Test 1' })
    await user.click(within(region).getByRole('button', { name: 'Close schedule' }))
    expect(screen.getByRole('navigation', { name: 'Exam lifecycle' })).toBeInTheDocument()
  })

  it('filters classes without losing selections in other classes', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Set subjects' }))
    const region = await screen.findByRole('region', { name: 'Subjects · Unit Test 1' })
    const search = await within(region).findByLabelText('Search classes')
    await user.type(search, 'Class 8 B')
    expect(within(region).queryByRole('group', { name: 'Class 8 A' })).not.toBeInTheDocument()
    await user.click(within(within(region).getByRole('group', { name: 'Class 8 B' })).getByLabelText(/^Mathematics/))
    await user.clear(search)
    expect(within(within(region).getByRole('group', { name: 'Class 8 A' })).getByLabelText(/^Mathematics/)).toBeChecked()
    expect(within(within(region).getByRole('group', { name: 'Class 8 B' })).getByLabelText(/^Mathematics/)).toBeChecked()
    await user.type(search, 'not a class')
    expect(within(region).getByText(/No classes match your search/)).toBeInTheDocument()
  })

  it('selects mapped subjects independently for each target section and saves all targets at the expected revision', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Set subjects' }))
    const dialog = await screen.findByRole('region', { name: 'Subjects · Unit Test 1' })
    const sectionA = within(dialog).getByRole('group', { name: 'Class 8 A' })
    const sectionB = within(dialog).getByRole('group', { name: 'Class 8 B' })

    await user.click(within(sectionA).getByLabelText(/^Mathematics/))
    await user.click(within(sectionA).getByLabelText(/^English/))
    const staleScience = within(sectionA).getByLabelText(/Old science.*mapping changed/i)
    expect(staleScience).toBeChecked()
    await user.click(staleScience)
    await user.click(within(sectionB).getByLabelText(/^Mathematics/))
    await user.click(within(dialog).getByRole('button', { name: 'Save subjects' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Subject setup saved at revision 4.')
    const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/academics/exams/exam-1/subjects') && options?.method === 'PUT')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      expectedRevision: 3,
      targets: [
        { classSectionId: 'section-1', subjectIds: ['english-1'], paperMarks: [{ subjectId: 'english-1', theoryMax: '100', practicalMax: null, passMarks: '33', durationMinutes: 180 }] },
        { classSectionId: 'section-2', subjectIds: ['math-2'], paperMarks: [{ subjectId: 'math-2', theoryMax: '100', practicalMax: null, passMarks: '33', durationMinutes: 180 }] },
      ],
    })
  })

  it('shows coverage by active section and saves complete explicit elective assignment sets', async () => {
    const user = userEvent.setup()
    const originalFetch = vi.mocked(fetch).getMockImplementation()
    let savedStudentIds = ['student-1']
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams/exam-1/subjects')) return success({ ...subjectSetup, targets: subjectSetup.targets.map((target) => target.classSectionId === 'section-1' ? { ...target, selectedSubjectIds: ['math-1', 'english-1'] } : target) })
      if (url.pathname.endsWith('/academics/exams/exam-1/coverage/section-1/english-1/candidates') && options?.method === 'PUT') {
        savedStudentIds = JSON.parse(String(options.body)).studentIds as string[]
        return success({ ...electiveCandidates, revision: 5, assignedStudentIds: savedStudentIds, items: electiveCandidates.items.map((item) => ({ ...item, isAssigned: savedStudentIds.includes(item.studentId) })) })
      }
      if (url.pathname.endsWith('/academics/exams/exam-1/coverage/section-1/english-1/candidates')) return success({ ...electiveCandidates, assignedStudentIds: savedStudentIds, items: electiveCandidates.items.map((item) => ({ ...item, isAssigned: savedStudentIds.includes(item.studentId) })) })
      if (url.pathname.endsWith('/academics/exams/exam-1/coverage')) return success(examCoverage)
      return originalFetch?.(input, options) ?? success({ items: [] })
    })
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Review coverage' }))
    const dialog = await screen.findByRole('region', { name: 'Candidate coverage · Unit Test 1' })
    expect(await within(dialog).findByText(/Coverage incomplete/)).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { name: /Student Coverage & Section Mapping — All target classes/ })).toBeInTheDocument()
    expect(within(dialog).getByText('Enrolled across target sections')).toBeInTheDocument()
    expect(within(dialog).getByText('1 class sections')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Middle (Class 6–8)' }))
    expect(within(dialog).getByRole('heading', { name: /Student Coverage & Section Mapping — Class 8 A/ })).toBeInTheDocument()
    expect(within(dialog).getAllByText('2 students').length).toBeGreaterThan(0)
    expect(within(dialog).getByLabelText('Candidate coverage totals')).toHaveTextContent('2')
    expect(within(dialog).getByText('Bea Learner', { selector: 'li span' })).toBeInTheDocument()
    const candidate = await within(dialog).findByLabelText(/Bea Learner/)
    await user.click(candidate)
    await user.click(within(dialog).getByRole('button', { name: 'Save elective assignments' }))

    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/coverage/section-1/english-1/candidates') && options?.method === 'PUT')
      expect(call).toBeDefined()
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ expectedRevision: 4, studentIds: ['student-1', 'student-2'] })
    })
    expect(await within(dialog).findByText((_, element) => element?.className === 'exam-coverage-help' && element.textContent?.includes('2 active students assigned to this elective paper'))).toBeInTheDocument()
  })

  it('preserves subject choices after a revision conflict and offers an explicit reload', async () => {
    const user = userEvent.setup()
    const baseFetch = vi.mocked(fetch).getMockImplementation()
    vi.mocked(fetch).mockImplementation((input, options) => {
      if (String(input).endsWith('/academics/exams/exam-1/subjects') && options?.method === 'PUT') return failure('revision_conflict', 'Revision changed.')
      return baseFetch?.(input, options) ?? success({ items: [] })
    })
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Set subjects' }))
    const dialog = await screen.findByRole('region', { name: 'Subjects · Unit Test 1' })
    const sectionA = within(dialog).getByRole('group', { name: 'Class 8 A' })
    const math = within(sectionA).getByLabelText(/^Mathematics/)
    await user.click(math)
    await user.click(within(dialog).getByRole('button', { name: 'Save subjects' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Your selections are preserved.')
    expect(math).not.toBeChecked()
    expect(within(sectionA).getByLabelText(/Old science.*mapping changed/i)).toBeChecked()
    expect(within(dialog).getByRole('button', { name: 'Reload latest setup' })).toBeEnabled()
  })

  it('schedules one paper per selected section and subject with a revision-checked save', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Schedule papers' }))
    const dialog = await screen.findByRole('region', { name: 'Schedule papers · Unit Test 1' })
    await user.type(within(dialog).getByLabelText('Date'), '2026-11-05')
    await user.type(within(dialog).getByLabelText('Start time'), '09:00')
    await user.type(within(dialog).getByLabelText('End time'), '10:00')
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Paper schedule saved at revision 5.')
    const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/academics/exams/exam-1/schedule') && options?.method === 'PUT')
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      expectedRevision: 4,
      papers: [{ classSectionId: 'section-1', subjectId: 'math-1', scheduledOn: '2026-11-05', startTime: '09:00', endTime: '10:00' }],
    })
  })

  it('sends paper marks settings with the selected subjects', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    const dialog = await screen.findByRole('region', { name: 'Subjects · Unit Test 1' })
    const section = await within(dialog).findByRole('group', { name: 'Class 8 A' })
    const math = within(section).getByLabelText('Theory max for Mathematics in Class 8 A')
    await user.clear(math)
    await user.type(math, '80')
    await user.click(within(section).getByLabelText('Include practical marks for Mathematics'))
    const practical = within(section).getByLabelText('Practical max for Mathematics in Class 8 A')
    await user.click(practical)
    await user.keyboard('{Control>}a{/Control}')
    await user.type(practical, '20')
    const passing = within(section).getByLabelText('Pass marks for Mathematics in Class 8 A')
    await user.clear(passing)
    await user.type(passing, '33')
    const duration = within(section).getByLabelText('Duration minutes for Mathematics in Class 8 A')
    await user.clear(duration)
    await user.type(duration, '120')
    await user.click(within(dialog).getByRole('button', { name: 'Save subjects' }))
    await waitFor(() => {
      const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/subjects') && options?.method === 'PUT')
      expect(JSON.parse(String(call?.[1]?.body)).targets[0].paperMarks).toContainEqual({ subjectId: 'math-1', theoryMax: '80', practicalMax: '20', passMarks: '33', durationMinutes: 120 })
    })
  })

  it('copies subject selection to matching subjects across the same wing', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    const dialog = await screen.findByRole('region', { name: 'Subjects · Unit Test 1' })
    const source = await within(dialog).findByRole('group', { name: 'Class 8 A' })
    const destination = within(dialog).getByRole('group', { name: 'Class 8 B' })
    await user.click(within(source).getByRole('button', { name: 'Copy subject selection to Middle wing' }))
    expect(within(destination).getAllByRole('checkbox')[0]).toBeChecked()
  })

  it('previews an automatic schedule before applying it', async () => {
    const user = userEvent.setup()
    const defaultFetch = vi.mocked(fetch).getMockImplementation()
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams/exam-1/schedule') && !options?.method) return success({ ...paperSchedule, papers: [...paperSchedule.papers, { classSectionId: 'section-3', sectionName: 'A', gradeName: 'Class 9', subjectId: 'science-1', subjectName: 'Science', subjectCode: 'SCI', scheduledOn: null, startTime: null, endTime: null }] })
      return defaultFetch?.(input, options) ?? success({})
    })
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Schedule papers' }))
    const dialog = await screen.findByRole('region', { name: 'Schedule papers · Unit Test 1' })
    await user.type(within(dialog).getByLabelText('First date'), '2026-11-05')
    await user.clear(within(dialog).getByLabelText('Start', { selector: 'input' }))
    await user.type(within(dialog).getByLabelText('Start', { selector: 'input' }), '10:00')
    await user.clear(within(dialog).getByLabelText('End', { selector: 'input' }))
    await user.type(within(dialog).getByLabelText('End', { selector: 'input' }), '12:00')
    await user.click(within(dialog).getByRole('button', { name: 'Auto-assign dates and times' }))
    expect(within(dialog).getByLabelText('Date')).toHaveValue('')
    const preview = within(dialog).getByRole('dialog', { name: /Auto-assign papers/ })
    expect(within(preview).getByText('Mathematics')).toBeInTheDocument()
    expect(within(preview).getByLabelText('Date for Mathematics in Class 8 A')).toHaveValue('2026-11-05')
    await user.click(within(preview).getByRole('button', { name: 'Class 9' }))
    expect(within(preview).getByText('Science')).toBeInTheDocument()
    expect(within(preview).getByLabelText('Date for Science in Class 9 A')).toHaveValue('2026-11-05')
    await user.clear(within(preview).getByLabelText('Date for Science in Class 9 A'))
    await user.type(within(preview).getByLabelText('Date for Science in Class 9 A'), '2026-11-06')
    await user.clear(within(preview).getByLabelText('Start time for Science in Class 9 A'))
    await user.type(within(preview).getByLabelText('Start time for Science in Class 9 A'), '10:00')
    await user.click(within(preview).getByRole('button', { name: 'Apply schedule to all classes' }))
    expect(within(dialog).getByLabelText('Date')).toHaveValue('2026-11-05')
    expect(within(dialog).getByLabelText('Start time for Mathematics in Class 8 A')).toHaveValue('10:00')
    expect(within(dialog).getByLabelText('End time for Mathematics in Class 8 A')).toHaveValue('12:00')
    await user.click(within(dialog).getByRole('button', { name: 'All-Classes Master Grid' }))
    expect(within(dialog).getByLabelText('Date for Science in Class 9 A')).toHaveValue('2026-11-06')
    expect(within(dialog).getByLabelText('Start time for Science in Class 9 A')).toHaveValue('10:00')
    expect(within(dialog).queryByText(/Proposed changes/)).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([url, options]) => String(url).endsWith('/schedule') && options?.method === 'PUT')).toBe(false)
  })

  it('allows an unscheduled null triple but rejects a partial schedule', async () => {
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Schedule papers' }))
    const dialog = await screen.findByRole('region', { name: 'Schedule papers · Unit Test 1' })
    const date = within(dialog).getByLabelText('Date')
    await user.type(date, '2026-11-05')
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('enter a date, start time, and end time')
    expect(vi.mocked(fetch).mock.calls.some(([url, options]) => String(url).endsWith('/schedule') && options?.method === 'PUT')).toBe(false)
    await user.clear(date)
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Paper schedule saved at revision 5.')
  })

  it('preserves paper choices when an optimistic schedule update conflicts', async () => {
    const user = userEvent.setup()
    const baseFetch = vi.mocked(fetch).getMockImplementation()
    vi.mocked(fetch).mockImplementation((input, options) => {
      if (String(input).endsWith('/academics/exams/exam-1/schedule') && options?.method === 'PUT') return failure('revision_conflict', 'Revision changed.')
      return baseFetch?.(input, options) ?? success({ items: [] })
    })
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Schedule papers' }))
    const dialog = await screen.findByRole('region', { name: 'Schedule papers · Unit Test 1' })
    const date = within(dialog).getByLabelText('Date')
    await user.type(date, '2026-11-05')
    await user.type(within(dialog).getByLabelText('Start time'), '09:00')
    await user.type(within(dialog).getByLabelText('End time'), '10:00')
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Your entries are preserved.')
    expect(date).toHaveValue('2026-11-05')
    expect(within(dialog).getByRole('button', { name: 'Reload latest schedule' })).toBeEnabled()
    expect(within(dialog).getByRole('button', { name: 'Save schedule' })).toBeDisabled()
  })

  it('allows scheduling after publishing the setup notice while keeping other draft edits unavailable', async () => {
    const user = userEvent.setup()
    const baseFetch = vi.mocked(fetch).getMockImplementation()
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams') && !options?.method) return success({ count: 1, results: [{ ...exam, status: 'PUBLISHED', actions: { ...exam.actions, edit: false, publish: false, schedule: true }, targetSummary: ['Class 8 A'] }] })
      if (url.pathname.endsWith('/academics/exams/exam-1') && (!options?.method || options.method === 'GET')) return success({ ...exam, status: 'PUBLISHED', actions: { ...exam.actions, edit: false, publish: false, schedule: true } })
      if (url.pathname.endsWith('/academics/exams/exam-1/schedule') && options?.method === 'PUT') return success({ ...paperSchedule, revision: 5 })
      if (url.pathname.endsWith('/academics/exams/exam-1/schedule')) return success(paperSchedule)
      return baseFetch?.(input, options) ?? success({ items: [] })
    })
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))

    expect(screen.getByRole('button', { name: 'Schedule papers' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set subjects' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Schedule papers' }))
    const dialog = await screen.findByRole('region', { name: 'Schedule papers · Unit Test 1' })
    await user.type(within(dialog).getByLabelText('Date'), '2026-11-05')
    await user.type(within(dialog).getByLabelText('Start time'), '09:00')
    await user.type(within(dialog).getByLabelText('End time'), '10:00')
    await user.click(within(dialog).getByRole('button', { name: 'Save schedule' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Paper schedule saved at revision 5.')
    const call = vi.mocked(fetch).mock.calls.find(([url, options]) => String(url).endsWith('/academics/exams/exam-1/schedule') && options?.method === 'PUT')
    expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ expectedRevision: 4 })
  })

  it('hides subject setup for published exams and when edit capability is absent', async () => {
    const user = userEvent.setup()
    const baseFetch = vi.mocked(fetch).getMockImplementation()
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams/options') && url.searchParams.get('kind') === 'bootstrap') return success({ ...bootstrap, actions: { ...bootstrap.actions, edit: false } })
      if (url.pathname.endsWith('/academics/exams') && !options?.method) return success({ count: 1, results: [{ ...exam, targetSummary: ['Class 8 A'] }] })
      return baseFetch?.(input, options) ?? success({ items: [] })
    })
    const { rerender } = render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    expect(screen.getByRole('button', { name: 'Set subjects' })).toBeDisabled()

    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams/options') && url.searchParams.get('kind') === 'bootstrap') return success(bootstrap)
      if (url.pathname.endsWith('/academics/exams') && !options?.method) return success({ count: 1, results: [{ ...exam, status: 'PUBLISHED', targetSummary: ['Class 8 A'] }] })
      return baseFetch?.(input, options) ?? success({ items: [] })
    })
    await user.click(screen.getByRole('button', { name: 'All exams' }))
    rerender(<ExamDraftsPage accessToken="token-2" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    expect(screen.getByRole('button', { name: 'Set subjects' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it('keeps entered values after a network failure and allows retrying the save', async () => {
    const user = userEvent.setup()
    const baseFetch = vi.mocked(fetch).getMockImplementation()
    let createAttempts = 0
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams') && options?.method === 'POST') {
        createAttempts += 1
        return createAttempts === 1
          ? failure('service_unavailable', 'Please try saving again.', 503)
          : success({ requestId: 'request-1', examId: 'exam-2', savedRevision: 1 }, 201)
      }
      return baseFetch?.(input, options) ?? success({ items: [] })
    })

    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: /New exam/i }))
    const dialog = screen.getByRole('dialog', { name: 'Create exam draft' })
    const name = within(dialog).getByLabelText('Exam name')
    await user.type(name, 'Retryable exam')
    await user.click(await within(dialog).findByLabelText('Class 8 A'))
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please try saving again.')
    expect(name).toHaveValue('Retryable exam')
    expect(within(dialog).getByLabelText('Class 8 A')).toBeChecked()
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Draft saved (revision 1).')
    expect(createAttempts).toBe(2)
  })

  it('switches to read-only when edit permission is absent from the fetched detail', async () => {
    const user = userEvent.setup()
    const baseFetch = vi.mocked(fetch).getMockImplementation()
    vi.mocked(fetch).mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams/exam-1') && (!options?.method || options.method === 'GET')) {
        return success({ ...exam, actions: { view: true, edit: false, duplicate: false, publish: false } })
      }
      return baseFetch?.(input, options) ?? success({ items: [] })
    })

    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Manage exam' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog', { name: 'Exam draft' })

    expect(within(dialog).getByLabelText('Exam name')).toBeDisabled()
    expect(within(dialog).queryByRole('button', { name: 'Save changes' })).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([url, options]) => String(url).endsWith('/exam-1') && options?.method === 'PATCH')).toBe(false)
  })

  it('supports create-only users without calling the list endpoint', async () => {
    vi.mocked(fetch).mockImplementation((input) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/academics/exams/options') && url.searchParams.get('kind') === 'bootstrap') return success({ ...bootstrap, actions: { create: true, view: false, edit: false } })
      if (url.pathname.endsWith('/academics/exams') && !url.searchParams.has('kind')) return success({ requestId: 'request-1', examId: 'exam-2', savedRevision: 1 }, 201)
      if (url.pathname.endsWith('/academics/exams/options') && url.searchParams.get('kind') === 'sections') return success({ items: [
        { id: 'section-1', campusId: 'campus-1', academicYearId: 'year-current', classId: 'grade-8', className: 'Class 8', sectionName: 'A', name: 'A' },
        { id: 'section-2', campusId: 'campus-1', academicYearId: 'year-current', classId: 'grade-8', className: 'Class 8', sectionName: 'B', name: 'B' },
        { id: 'section-3', campusId: 'campus-1', academicYearId: 'year-current', classId: 'grade-9', className: 'Class 9', sectionName: 'A', name: 'A' },
      ] })
      if (url.pathname.endsWith('/academics/exams/options') && url.searchParams.get('kind') === 'terms') return success({ items: [] })
      return success({ items: [] })
    })
    const user = userEvent.setup()
    render(<ExamDraftsPage accessToken="token" selectedBranch="all" />)
    await user.click(await screen.findByRole('button', { name: 'Create exam draft' }))
    const dialog = screen.getByRole('dialog', { name: 'Create exam draft' })
    await user.type(within(dialog).getByLabelText('Exam name'), 'My test')
    await user.click(await within(dialog).findByLabelText('Class 8 A'))
    await user.click(within(dialog).getByRole('button', { name: 'Save draft' }))
    expect(await screen.findByRole('status')).toHaveTextContent('create drafts but needs view permission')
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/academics/exams?') && !String(url).includes('/options'))).toBe(false)
  })
})
