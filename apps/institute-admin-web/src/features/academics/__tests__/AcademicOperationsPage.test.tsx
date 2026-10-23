import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AcademicOperationsPage, type AcademicOperationsPageId } from '../AcademicOperationsPage'

const records = {
  LESSON_PLAN: [{ id: 'lp-1', kind: 'LESSON_PLAN', title: 'Linear Equations', status: 'SUBMITTED', branchId: null, payload: { subject: 'Mathematics', className: 'Class 8', teacher: 'Anjali' }, createdBy: null, createdAt: '2026-07-30', updatedAt: '2026-07-30' }],
  HOMEWORK: [{ id: 'hw-1', kind: 'HOMEWORK', title: 'Chapter 5 Exercises', status: 'ACTIVE', branchId: null, payload: { subject: 'Mathematics', className: 'Class 8', date: '2026-07-30' }, createdBy: null, createdAt: '2026-07-30', updatedAt: '2026-07-30' }],
  EXAM: [{ id: 'exam-1', kind: 'EXAM', title: 'Unit Test 1', status: 'SCHEDULED', branchId: null, payload: { subject: 'Science', className: 'Class 8', date: '2026-08-01' }, createdBy: null, createdAt: '2026-07-30', updatedAt: '2026-07-30' }],
  QUESTION: [{ id: 'q-1', kind: 'QUESTION', title: 'What is photosynthesis?', status: 'APPROVED', branchId: null, payload: { subject: 'Science', type: 'Short Answer' }, createdBy: null, createdAt: '2026-07-30', updatedAt: '2026-07-30' }],
  MARK: [{ id: 'mark-1', kind: 'MARK', title: 'Aarav Sharma', status: 'PUBLISHED', branchId: null, payload: { subject: 'Mathematics', className: 'Class 8', score: 94, maxMarks: 100 }, createdBy: null, createdAt: '2026-07-30', updatedAt: '2026-07-30' }],
} as const

function apiResponse(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify({ success: true, data }), { status, headers: { 'Content-Type': 'application/json' } }))
}

describe('AcademicOperationsPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (options?.method === 'POST') return apiResponse({ ...records.LESSON_PLAN[0], id: 'created-1' }, 201)
      if (url.pathname.includes('/classes')) return apiResponse({ count: 1, page: 1, pageSize: 100, totalPages: 1, items: [{ id: 'class-1', name: 'Class 8', sortOrder: 8, subjectsCount: 1 }] })
      if (url.pathname.includes('/class-subjects')) return apiResponse({ count: 1, page: 1, pageSize: 100, totalPages: 1, items: [{ id: 'map-1', classId: 'class-1', subjectId: 'subject-1', subject: { id: 'subject-1', name: 'Mathematics', subjectCode: 'MATH' }, subjectCode: 'MATH', subjectCodeOverride: '', isElective: false, periodsPerWeek: 5, defaultMaxMarks: '100.00', sortOrder: 1 }] })
      const kind = url.searchParams.get('kind') as keyof typeof records
      const items = kind ? [...records[kind]] : []
      return apiResponse({ count: items.length, page: 1, pageSize: 100, totalPages: 1, items })
    })
  })

  it.each<[AcademicOperationsPageId, string, string]>([
    ['ACL1', 'Lesson Plans', 'Linear Equations'], ['ACH1', 'Homework', 'Chapter 5 Exercises'],
    ['ACE1', 'Exams', 'Unit Test 1'], ['ACM1', 'Marks & Grades', 'Aarav Sharma'],
    ['ACC1', 'Curriculum', 'Mathematics'],
  ])('loads real API content for %s', async (page, title, content) => {
    render(<AcademicOperationsPage page={page} accessToken="token" selectedBranch="all" />)
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(await screen.findByText(content)).toBeInTheDocument()
  })

  it('creates a lesson plan through the authenticated academic operations API', async () => {
    const user = userEvent.setup()
    render(<AcademicOperationsPage page="ACL1" accessToken="token" selectedBranch="all" />)
    await screen.findByText('Linear Equations')
    await user.click(screen.getByRole('button', { name: 'New Plan' }))
    const dialog = screen.getByRole('dialog', { name: 'Create Lesson topic' })
    await user.type(within(dialog).getByLabelText('Lesson topic'), 'Fractions')
    await user.type(within(dialog).getByLabelText('Subject'), 'Mathematics')
    await user.click(within(dialog).getByRole('button', { name: 'Save record' }))

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/academics/operations'),
      expect.objectContaining({ method: 'POST' }),
    ))
  })

  it('loads question bank records when its exam tab is selected', async () => {
    const user = userEvent.setup()
    render(<AcademicOperationsPage page="ACE1" accessToken="token" selectedBranch="all" />)
    await screen.findByText('Unit Test 1')
    await user.click(screen.getByRole('button', { name: 'Question Bank' }))
    expect(await screen.findByText('What is photosynthesis?')).toBeInTheDocument()
  })
})
