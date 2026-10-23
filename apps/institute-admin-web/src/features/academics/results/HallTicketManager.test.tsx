import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HallTicketManager } from './HallTicketManager'
import { resultsRequest, type Bootstrap, type ExamDetail, type Section } from './results.api'
import { openPrintWindow } from '../../documents/engine/docRender'

vi.mock('./results.api', async () => {
  const original = await vi.importActual<typeof import('./results.api')>('./results.api')
  return { ...original, resultsRequest: vi.fn() }
})

vi.mock('../../documents/engine/docRender', () => ({
  openPrintWindow: vi.fn(),
}))

const section: Section = {
  id: 'sec-1',
  name: 'Grade 10 A',
  gradeId: 'grade-10',
  grade: 'Grade 10',
  section: 'A',
  yearId: 'year-2026',
  year: '2026–27',
  current: true,
  branchId: 'branch-1',
  branch: 'Main Branch',
  subjects: [
    { id: 'sub-math', name: 'Mathematics', maximum: '100', elective: false },
    { id: 'sub-sci', name: 'Science', maximum: '100', elective: false },
  ],
  terms: [{ id: 'term-1', name: 'Term 1' }],
}

const bootstrap: Bootstrap = {
  sections: [section],
  templates: [],
  canManage: true,
  branding: {
    name: 'Greenwood High School',
    address: '123 Academic Way, Bangalore',
    color: '#1e3a8a',
  },
}

const detail: ExamDetail = {
  exam: {
    id: 'exam-1',
    name: 'Mid-Term Assessment',
    sectionId: 'sec-1',
    examType: 'HALF_YEARLY',
    rules: {
      decimals: 2,
      grades: [{ label: 'A', minimum: 80 }],
      schedule: {
        'sub-math': { examDate: '2026-11-10', startTime: '09:00', endTime: '12:00', session: 'Morning' },
        'sub-sci': { examDate: '2026-11-12', startTime: '09:00', endTime: '12:00', session: 'Morning' },
      },
      instructions: ['Report 15 minutes before the exam.'],
    },
    archived: false,
    subjects: [
      {
        id: 'sheet-math',
        subjectId: 'sub-math',
        name: 'Mathematics',
        state: 'DRAFT',
        revision: 1,
        reviewNote: '',
        components: [{ id: 'comp-1', name: 'Theory', maximum: '100', passMarks: '35' }],
      },
      {
        id: 'sheet-sci',
        subjectId: 'sub-sci',
        name: 'Science',
        state: 'DRAFT',
        revision: 1,
        reviewNote: '',
        components: [{ id: 'comp-2', name: 'Theory', maximum: '100', passMarks: '35' }],
      },
    ],
    candidateCount: 2,
  },
  subjects: [
    {
      id: 'sheet-math',
      subjectId: 'sub-math',
      name: 'Mathematics',
      state: 'DRAFT',
      revision: 1,
      reviewNote: '',
      components: [{ id: 'comp-1', name: 'Theory', maximum: '100', passMarks: '35' }],
    },
    {
      id: 'sheet-sci',
      subjectId: 'sub-sci',
      name: 'Science',
      state: 'DRAFT',
      revision: 1,
      reviewNote: '',
      components: [{ id: 'comp-2', name: 'Theory', maximum: '100', passMarks: '35' }],
    },
  ],
  candidates: [
    {
      id: 'cand-1',
      enrollmentId: 'enr-1',
      name: 'Aarav Sharma',
      roll: '101',
      admission: 'ADM-2024-001',
      fatherName: 'Rajesh Sharma',
      dob: '2010-05-15',
      gender: 'Male',
      remark: '',
      excludedSubjectIds: [],
    },
    {
      id: 'cand-2',
      enrollmentId: 'enr-2',
      name: 'Diya Patel',
      roll: '102',
      admission: 'ADM-2024-002',
      fatherName: 'Mukesh Patel',
      dob: '2010-08-20',
      gender: 'Female',
      remark: '',
      excludedSubjectIds: [],
    },
  ],
  marks: [],
  results: [],
}

describe('HallTicketManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders select exam prompt when exam detail is missing', () => {
    render(
      <HallTicketManager
        token="token"
        section={section}
        detail={null}
        bootstrap={bootstrap}
        onReload={vi.fn()}
        onError={vi.fn()}
      />,
    )
    expect(screen.getByText('Select an Exam')).toBeInTheDocument()
  })

  it('renders candidate admit card preview with timetable and candidate details', async () => {
    render(
      <HallTicketManager
        token="token"
        section={section}
        detail={detail}
        bootstrap={bootstrap}
        onReload={vi.fn()}
        onError={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Hall Tickets & Admit Cards' })).toBeInTheDocument()
    expect(screen.getAllByText(/Aarav Sharma/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/Greenwood High School/)).toBeInTheDocument()
    expect(screen.getByText('EXAMINATION ADMIT CARD / HALL TICKET')).toBeInTheDocument()
    expect(screen.getByText('Mathematics')).toBeInTheDocument()
    expect(screen.getByText('Science')).toBeInTheDocument()
    expect(screen.getByText('Report 15 minutes before the exam.')).toBeInTheDocument()
  })

  it('allows navigating to schedule tab and saving schedule', async () => {
    const user = userEvent.setup()
    const onReload = vi.fn()
    vi.mocked(resultsRequest).mockResolvedValueOnce({ id: 'exam-1' })

    render(
      <HallTicketManager
        token="token"
        section={section}
        detail={detail}
        bootstrap={bootstrap}
        onReload={onReload}
        onError={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Subject Timetable Schedule' }))
    expect(screen.getByText('Exam Timetable & Subject Schedule')).toBeInTheDocument()

    const saveButton = screen.getByRole('button', { name: /Save Schedule/i })
    await user.click(saveButton)

    await waitFor(() => {
      expect(resultsRequest).toHaveBeenCalledWith(
        'token',
        'exams/exam-1',
        expect.objectContaining({
          rules: expect.objectContaining({
            schedule: expect.any(Object),
          }),
        }),
        'PATCH',
      )
      expect(onReload).toHaveBeenCalled()
    })
  })

  it('triggers batch print when print selected button is clicked', async () => {
    const user = userEvent.setup()
    render(
      <HallTicketManager
        token="token"
        section={section}
        detail={detail}
        bootstrap={bootstrap}
        onReload={vi.fn()}
        onError={vi.fn()}
      />,
    )

    const printButton = screen.getByRole('button', { name: /Print Selected/i })
    await user.click(printButton)

    expect(openPrintWindow).toHaveBeenCalledTimes(1)
    const printedHtml = vi.mocked(openPrintWindow).mock.calls[0][0]
    expect(printedHtml).toContain('Aarav Sharma')
    expect(printedHtml).toContain('Diya Patel')
    expect(printedHtml).toContain('Greenwood High School')
  })
})
