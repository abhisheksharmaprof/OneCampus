import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SettingsTab } from '../components/SettingsTab'

const mockSettings = {
  id: 'att-set-1',
  instituteId: 'inst-1',
  lowAttendanceThreshold: 75,
  enableParentNotifications: true,
  enableAutoAlerts: true,
  consecutiveAbsentThreshold: 3,
  enabledCaptureModes: ['manual', 'qr'],
  studentLeaveRouting: 'class_teacher' as const,
  staffLeaveRouting: 'branch_admin' as const,
}

const mockLeaveTypes = [
  {
    id: 'lt-1',
    instituteId: 'inst-1',
    name: 'Casual Leave',
    code: 'CL',
    applicableTo: 'both' as const,
    maxDaysPerYear: 12,
    requiresDocument: false,
    isActive: true,
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
    if (url.includes('/attendance/settings')) {
      return response(mockSettings)
    }
    if (url.includes('/attendance/leave-types')) {
      return response(mockLeaveTypes)
    }
    return response([])
  })
}

describe('SettingsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders capture modes toggle, threshold & recipient rules, approval routing, and leave catalog', async () => {
    installFetchMock()
    render(<SettingsTab accessToken="test-token" />)

    expect(screen.getByTestId('settings-tab')).toBeInTheDocument()

    // Capture modes
    const captureBox = await screen.findByTestId('capture-modes-toggle')
    expect(within(captureBox).getByLabelText('Manual Tap')).toBeChecked()
    expect(within(captureBox).getByLabelText('QR Scan')).toBeChecked()
    expect(within(captureBox).getByLabelText('RFID Card')).not.toBeChecked()

    // Threshold input
    expect(screen.getByLabelText('Low-attendance threshold')).toHaveValue(75)

    // Recipient rules
    const recipientBox = screen.getByTestId('recipient-rules')
    expect(within(recipientBox).getByLabelText('Notify parents on low attendance / absence')).toBeChecked()

    // Approval routing dropdowns
    expect(screen.getByLabelText('Student leave routing')).toHaveValue('class_teacher')
    expect(screen.getByLabelText('Staff leave routing')).toHaveValue('branch_admin')

    // Leave catalog
    expect(screen.getByRole('table', { name: 'Leave Types Catalog' })).toBeInTheDocument()
    expect(screen.getByText('Casual Leave')).toBeInTheDocument()
  })

  it('allows adding a new leave type to the catalog', async () => {
    const fetchMock = installFetchMock()
    const user = userEvent.setup()

    render(<SettingsTab accessToken="test-token" />)

    await screen.findByText('Casual Leave')

    await user.type(screen.getByLabelText('Leave Type Name'), 'Medical Leave')
    await user.type(screen.getByLabelText('Leave Type Code'), 'MED')

    const addBtn = screen.getByRole('button', { name: 'Add Leave Type' })
    await user.click(addBtn)

    await waitFor(() => {
      const addCall = fetchMock.mock.calls.find(
        ([url, opts]) => String(url).includes('/attendance/leave-types') && opts?.method === 'POST',
      )
      expect(addCall).toBeDefined()
      expect(JSON.parse(String(addCall?.[1]?.body))).toMatchObject({
        name: 'Medical Leave',
        code: 'MED',
      })
    })
  })
})
