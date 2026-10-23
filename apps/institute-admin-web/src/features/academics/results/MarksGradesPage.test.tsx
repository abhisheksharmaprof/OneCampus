import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarksGradesPage } from './MarksGradesPage'
import { resultsRequest, type ExamDetail } from './results.api'

vi.mock('./results.api', async () => {
  const original = await vi.importActual<typeof import('./results.api')>('./results.api')
  return { ...original, resultsRequest: vi.fn() }
})
const section = {
  id: 'section',
  name: 'Class 8 A',
  gradeId: 'grade',
  grade: 'Class 8',
  section: 'A',
  yearId: 'year',
  year: '2026–27',
  current: true,
  branchId: 'branch',
  branch: 'Main',
  subjects: [{ id: 'math', name: 'Mathematics', maximum: '100', elective: false }],
  terms: [],
}
const sheet = {
  id: 'sheet',
  subjectId: 'math',
  name: 'Mathematics',
  state: 'DRAFT' as const,
  revision: 3,
  reviewNote: '',
  components: [{ id: 'component', name: 'Total', maximum: '100', passMarks: '40' }],
}
const exam = {
  id: 'exam',
  name: 'Half-yearly',
  sectionId: 'section',
  examType: 'HALF_YEARLY',
  rules: {
    grades: [
      { label: 'A', minimum: 80 },
      { label: 'B', minimum: 0 },
    ],
    decimals: 2,
  },
  archived: false,
  subjects: [sheet],
  candidateCount: 1,
}
const detail: ExamDetail = {
  exam,
  subjects: [sheet],
  candidates: [
    {
      id: 'candidate',
      enrollmentId: 'enrollment',
      name: 'Ada Student',
      roll: '01',
      admission: 'A01',
      remark: '',
      excludedSubjectIds: [],
    },
  ],
  marks: [
    {
      candidateId: 'candidate',
      componentId: 'component',
      score: '80',
      status: 'PRESENT',
      note: '',
    },
  ],
  results: [
    {
      candidateId: 'candidate',
      examId: 'exam',
      exam: 'Half-yearly',
      rows: [
        {
          subjectId: 'math',
          subject: 'Mathematics',
          score: '80',
          maximum: '100',
          percentage: '80',
          grade: 'A',
          result: 'Pass',
          components: [],
        },
      ],
      total: '80',
      maximum: '100',
      percentage: '80',
      grade: 'A',
      result: 'Pass',
      missing: 0,
      remark: '',
    },
  ],
}
const request = vi.mocked(resultsRequest)
beforeEach(() => {
  vi.restoreAllMocks()
  request.mockReset()
  request.mockImplementation(async (_token, path, data) => {
    if (path.startsWith('bootstrap'))
      return {
        sections: [section],
        canManage: true,
        templates: [
          { id: 'classic', name: 'Term report' },
          { id: 'compact', name: 'Compact result slip' },
          { id: 'full', name: 'Detailed with rank' },
        ],
      }
    if (path.startsWith('exams?')) return [exam]
    if (path === 'exams/exam' && data === undefined) return structuredClone(detail)
    if (path === 'reports' || path.startsWith('batches?')) return []
    return { saved: 1 }
  })
})
describe('Marks & Grades workspace', () => {
  it('uses enrolled students and preserves revisions when saving marks', async () => {
    const user = userEvent.setup()
    render(<MarksGradesPage accessToken="token" selectedBranch="all" />)
    await screen.findByRole('heading', { name: 'Half-yearly' })
    await user.click(screen.getByRole('button', { name: 'Enter Marks' }))
    const input = screen.getByRole('spinbutton', {
      name: 'Marks for Ada Student, Mathematics, Total',
    })
    await user.clear(input)
    await user.type(input, '94')
    await user.click(screen.getByRole('button', { name: 'Save draft' }))
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith(
        'token',
        'exams/exam/marks',
        expect.objectContaining({
          revisions: { sheet: 3 },
          entries: [
            {
              candidateId: 'candidate',
              componentId: 'component',
              score: '94',
              status: 'PRESENT',
              note: '',
            },
          ],
        }),
      ),
    )
    expect(await screen.findByText('Marks saved as drafts.')).toBeInTheDocument()
  })
  it('requires a complete selected report cohort and offers all three templates', async () => {
    const user = userEvent.setup()
    render(<MarksGradesPage accessToken="token" selectedBranch="all" />)
    await screen.findByRole('heading', { name: 'Half-yearly' })
    await user.click(screen.getByRole('button', { name: 'Marksheets' }))
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: 'Select all 1 matching students' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(
      screen.getByRole('heading', { name: 'Which results should appear?' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    for (const name of [
      'Classic School Report',
      'Compact Exam Result',
      'Comprehensive Progress Report',
    ])
      expect(screen.getByRole('button', { name: new RegExp(name) })).toBeInTheDocument()
  })
  it('keeps the manual entry dialog keyboard accessible', async () => {
    const user = userEvent.setup()
    render(<MarksGradesPage accessToken="token" selectedBranch="all" />)
    await screen.findByRole('heading', { name: 'Half-yearly' })
    await user.click(screen.getByRole('button', { name: 'Set up exam' }))
    const dialog = screen.getByRole('dialog', { name: 'Set up an exam' })
    expect(within(dialog).getByRole('textbox', { name: 'Exam name' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

it('opens the marksheet builder safely when the class has no exams', async () => {
  const previous = request.getMockImplementation()!
  request.mockImplementation(async (token, path, ...args) =>
    path.startsWith('exams?') ? [] : previous(token, path, ...args),
  )
  const user = userEvent.setup()
  render(<MarksGradesPage accessToken="token" selectedBranch="all" />)
  await screen.findByRole('heading', { name: 'Your next exam starts here' })
  await user.click(screen.getByRole('button', { name: 'Marksheets' }))
  expect(screen.getByRole('heading', { name: 'Build your marksheets' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
})
