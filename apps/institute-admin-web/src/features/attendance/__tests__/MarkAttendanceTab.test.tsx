import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MarkAttendanceTab } from '../components/MarkAttendanceTab'

const mockRoster = [
  {
    id: 'roster-1',
    studentId: 'st-101',
    firstName: 'Aarav',
    lastName: 'Sharma',
    admissionNumber: 'ADM-001',
    classId: 'cls-1',
    sectionId: 'sec-1',
    className: 'Class 10',
    sectionName: 'A',
    status: 'PRESENT' as const,
    remark: 'On time',
  },
  {
    id: 'roster-2',
    studentId: 'st-102',
    firstName: 'Bhavya',
    lastName: 'Patel',
    admissionNumber: 'ADM-002',
    classId: 'cls-1',
    sectionId: 'sec-1',
    className: 'Class 10',
    sectionName: 'A',
    status: 'ON_LEAVE' as const,
    remark: 'Approved leave',
  },
  {
    id: 'roster-3',
    studentId: 'st-103',
    firstName: 'Chetan',
    lastName: 'Kumar',
    admissionNumber: 'ADM-003',
    classId: 'cls-1',
    sectionId: 'sec-1',
    className: 'Class 10',
    sectionName: 'A',
    status: 'NOT_MARKED' as const,
  },
]

function response(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify({ success: true, data }), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function installFetchMock() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
    const url = String(input)
    if (url.includes('/daily-roster')) {
      return response(mockRoster)
    }
    if (url.includes('/bulk')) {
      return response({ success: true, updatedCount: 3 })
    }
    if (url.includes('/academics/classes')) {
      return response({ items: [{ id: 'cls-1', name: 'Class 10' }] })
    }
    if (url.includes('/academics/sections')) {
      return response({ items: [{ id: 'sec-1', gradeId: 'cls-1', sectionName: 'A' }] })
    }
    if (url.includes('/academics/subjects')) {
      return response({ items: [{ id: 'sub-1', name: 'Mathematics' }] })
    }
    return response([])
  })
}

describe('MarkAttendanceTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.confirm = vi.fn().mockReturnValue(true)
  })

  it('renders filter header, roster table, live counter, and bulk action bar', async () => {
    installFetchMock()
    render(
      <MarkAttendanceTab
        accessToken="test-token"
        selectedBranch="branch-1"
        selectedDate="2026-07-21"
      />,
    )

    expect(screen.getByTestId('mark-attendance-tab')).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Student Roster' })).toBeInTheDocument()

    // Live counter: 2 marked out of 3 total (Aarav=PRESENT, Bhavya=ON_LEAVE, Chetan=NOT_MARKED)
    const counter = screen.getByTestId('live-counter')
    expect(counter).toHaveTextContent('2 of 3 marked')

    // Roster items present
    expect(screen.getByText('Aarav Sharma')).toBeInTheDocument()
    expect(screen.getByText('Bhavya Patel')).toBeInTheDocument()
    expect(screen.getByText('Chetan Kumar')).toBeInTheDocument()

    // Bulk action bar buttons
    expect(screen.getByRole('button', { name: 'Mark all present' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mark all absent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy yesterday' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Submit Attendance' })).toBeInTheDocument()
  })

  it('auto-locks status buttons and remark input for students on approved leave', async () => {
    installFetchMock()
    render(
      <MarkAttendanceTab
        accessToken="test-token"
        selectedBranch="branch-1"
        selectedDate="2026-07-21"
      />,
    )

    await screen.findByText('Bhavya Patel')

    const row = screen.getByTestId('roster-row-st-102')
    expect(within(row).getByText('🔒 Approved Leave')).toBeInTheDocument()

    // Status buttons inside approved leave row should be disabled
    const buttons = within(row).getAllByRole('button')
    buttons.forEach((btn) => {
      if (btn.textContent !== 'Remark Modal') {
        expect(btn).toBeDisabled()
      }
    })

    const remarkInput = within(row).getByPlaceholderText('Approved leave')
    expect(remarkInput).toBeDisabled()
  })

  it('opens and updates remark using the Student Remark Modal', async () => {
    installFetchMock()
    const user = userEvent.setup()
    render(
      <MarkAttendanceTab
        accessToken="test-token"
        selectedBranch="branch-1"
        selectedDate="2026-07-21"
      />,
    )

    await screen.findByText('Aarav Sharma')
    const row = screen.getByTestId('roster-row-st-101')
    const remarkModalBtn = within(row).getByRole('button', { name: 'Remark Modal' })
    
    await user.click(remarkModalBtn)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Student Remark: Aarav Sharma')

    const modalTextarea = within(dialog).getByLabelText('Student Remark Text')
    expect(modalTextarea).toHaveValue('On time')

    await user.clear(modalTextarea)
    await user.type(modalTextarea, 'Participated actively in class')

    await user.click(within(dialog).getByRole('button', { name: 'Save Remark' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    const remarkInput = within(row).getByDisplayValue('Participated actively in class')
    expect(remarkInput).toBeInTheDocument()
  })

  it('submits attendance when clicking Submit Attendance button', async () => {
    const fetchMock = installFetchMock()
    const user = userEvent.setup()
    render(
      <MarkAttendanceTab
        accessToken="test-token"
        selectedBranch="branch-1"
        selectedDate="2026-07-21"
      />,
    )

    await screen.findByText('Aarav Sharma')
    const submitBtn = screen.getByRole('button', { name: 'Submit Attendance' })
    await user.click(submitBtn)

    await waitFor(() => {
      const bulkCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/attendance/bulk'))
      expect(bulkCall).toBeDefined()
    })
  })
})
