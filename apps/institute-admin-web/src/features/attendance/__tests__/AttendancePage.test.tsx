import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AttendancePage } from '../AttendancePage'

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
    if (url.includes('/daily-roster')) return response([])
    if (url.includes('/overview')) return response({ records: [], calendarDates: [] })
    if (url.includes('/leaves')) return response([])
    if (url.includes('/reports')) return response({ summary: { present: 0, absent: 0, late: 0, excused: 0, total: 0, attendancePercentage: 0 }, trend: [], staffSummary: [], atRisk: [], academicPerformanceAvailable: false })
    if (url.includes('/alerts')) return response([])
    if (url.includes('/settings')) return response({ id: 's1', lowAttendanceThreshold: 75, enableParentNotifications: true, consecutiveAbsentThreshold: 3, enabledCaptureModes: ['manual'] })
    if (url.includes('/leave-types')) return response([])
    if (url.includes('/academics')) return response({ items: [] })
    return response([])
  })
}

describe('AttendancePage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders dedicated attendance and leave workspaces and preserves date and branch context', async () => {
    installFetchMock()
    const onDateChange = vi.fn()

    render(
      <AttendancePage
        accessToken="test-token"
        selectedBranch="branch-main"
        selectedDate="2026-07-21"
        onDateChange={onDateChange}
        initialTab="overview"
      />,
    )

    expect(screen.getByTestId('attendance-page')).toBeInTheDocument()

    // Header preserved
    const dateInput = screen.getByLabelText('Attendance date')
    expect(dateInput).toHaveValue('2026-07-21')

    // Student and staff leave have dedicated workspaces.
    const tabList = screen.getByRole('tablist', { name: 'Attendance Navigation' })
    expect(within(tabList).getAllByRole('tab')).toHaveLength(6)
    const tabs = within(tabList).getAllByRole('tab')
    expect(tabs[0]).toHaveAccessibleName('Overview')
    expect(tabs[1]).toHaveAccessibleName('Mark Attendance')
    expect(within(tabList).getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    expect(within(tabList).getByRole('tab', { name: 'Student Leave' })).toBeInTheDocument()
    expect(within(tabList).getByRole('tab', { name: 'Staff Leave' })).toBeInTheDocument()
    expect(within(tabList).getByRole('tab', { name: 'Reports & Analytics' })).toBeInTheDocument()
    expect(within(tabList).getByRole('tab', { name: 'Settings' })).toBeInTheDocument()

    // Default active panel is Overview
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument()
  })

  it('switches tabs smoothly when clicking tabs', async () => {
    installFetchMock()
    const user = userEvent.setup()

    render(
      <AttendancePage
        accessToken="test-token"
        selectedBranch="branch-main"
        selectedDate="2026-07-21"
        onDateChange={() => undefined}
      />,
    )

    // Switch to Overview
    await user.click(screen.getByRole('tab', { name: 'Overview' }))
    expect(await screen.findByTestId('overview-tab')).toBeInTheDocument()

    // Switch to Student Leave
    await user.click(screen.getByRole('tab', { name: 'Student Leave' }))
    expect(await screen.findByTestId('leave-approvals-tab')).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Staff Leave' }))
    expect(await screen.findByText('Staff leave decisions')).toBeInTheDocument()

    // Switch to Reports & Analytics
    await user.click(screen.getByRole('tab', { name: 'Reports & Analytics' }))
    expect(await screen.findByTestId('reports-analytics-tab')).toBeInTheDocument()

    // Switch to Settings
    await user.click(screen.getByRole('tab', { name: 'Settings' }))
    expect(await screen.findByTestId('settings-tab')).toBeInTheDocument()
  })
})
