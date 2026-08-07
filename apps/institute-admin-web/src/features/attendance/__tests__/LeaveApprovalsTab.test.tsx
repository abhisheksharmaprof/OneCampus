import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LeaveApprovalsTab } from '../components/LeaveApprovalsTab'

const mockLeaveApps = [
  {
    id: 'la-1',
    applicantType: 'student' as const,
    studentId: 'st-101',
    studentName: 'Aarav Sharma',
    branchId: 'b-1',
    appliedBy: 'parent-1',
    appliedByName: 'Sunil Sharma',
    leaveTypeId: 'lt-medical',
    leaveTypeName: 'Medical Leave',
    startDate: '2026-07-21',
    endDate: '2026-07-23',
    totalDays: 3,
    reason: 'Fever and viral infection',
    status: 'pending' as const,
    documentUrl: 'https://example.com/medical-certificate.pdf',
    balanceAllocated: 12,
    balanceUsed: 4,
    balanceRemaining: 8,
    createdAt: '2026-07-20T10:00:00Z',
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
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input)
    if (url.includes('/leaves/la-1/approve')) {
      return response({ ...mockLeaveApps[0], status: 'approved' })
    }
    if (url.includes('/leaves/la-1/reject')) {
      return response({ ...mockLeaveApps[0], status: 'rejected', rejectionReason: 'Insufficient proof' })
    }
    if (url.includes('/leaves')) {
      return response(mockLeaveApps)
    }
    return response([])
  })
}

describe('LeaveApprovalsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders sub-views toggle, filters, roster with inline leave balance, and preview link', async () => {
    installFetchMock()
    render(
      <LeaveApprovalsTab
        accessToken="test-token"
        selectedBranch="branch-1"
      />,
    )

    expect(screen.getByTestId('leave-approvals-tab')).toBeInTheDocument()
    expect(screen.getByTestId('student-leave-toggle')).toHaveClass('active')
    expect(screen.getByTestId('staff-leave-toggle')).not.toHaveClass('active')

    expect(await screen.findByText('Aarav Sharma')).toBeInTheDocument()

    // Inline leave balance display
    const balance = screen.getByTestId('leave-balance')
    expect(balance).toHaveTextContent('4/12 days used · 8 remaining')

    // Document links
    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute('href', 'https://example.com/medical-certificate.pdf')
    expect(screen.getByRole('button', { name: 'Preview' })).toBeInTheDocument()
  })

  it('shows confirmation dialog prior to approval and triggers auto-applies callback', async () => {
    const fetchMock = installFetchMock()
    const user = userEvent.setup()
    const onLeaveApproved = vi.fn()

    render(
      <LeaveApprovalsTab
        accessToken="test-token"
        selectedBranch="branch-1"
        onLeaveApproved={onLeaveApproved}
      />,
    )

    await screen.findByText('Aarav Sharma')
    const approveBtn = screen.getByRole('button', { name: 'Approve' })
    await user.click(approveBtn)

    // Confirmation dialog pops up
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Confirm Leave Approval')
    expect(dialog).toHaveTextContent('Are you sure you want to approve the leave application for Aarav Sharma')

    // Confirm approval
    const confirmBtn = within(dialog).getByRole('button', { name: 'Approve Leave' })
    await user.click(confirmBtn)

    await waitFor(() => {
      expect(onLeaveApproved).toHaveBeenCalledWith('st-101', '2026-07-21', '2026-07-23')
      const approveCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/la-1/approve'))
      expect(approveCall).toBeDefined()
    })
  })

  it('enforces mandatory rejection reason in the rejection confirmation dialog', async () => {
    const fetchMock = installFetchMock()
    const user = userEvent.setup()

    render(
      <LeaveApprovalsTab
        accessToken="test-token"
        selectedBranch="branch-1"
      />,
    )

    await screen.findByText('Aarav Sharma')
    const rejectBtn = screen.getByRole('button', { name: 'Reject' })
    await user.click(rejectBtn)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Confirm Leave Rejection')

    const confirmRejectBtn = within(dialog).getByRole('button', { name: 'Reject Leave' })
    
    // Clicking without reason displays mandatory error
    await user.click(confirmRejectBtn)
    expect(within(dialog).getByText('Rejection reason is mandatory.')).toBeInTheDocument()

    // Enter reason and confirm
    const reasonInput = within(dialog).getByLabelText('Rejection Reason')
    await user.type(reasonInput, 'Doctor certificate invalid')
    await user.click(confirmRejectBtn)

    await waitFor(() => {
      const rejectCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/la-1/reject'))
      expect(rejectCall).toBeDefined()
      expect(JSON.parse(String(rejectCall?.[1]?.body))).toEqual({ rejectionReason: 'Doctor certificate invalid' })
    })
  })
})
