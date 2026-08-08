import { render, screen } from '@testing-library/react';
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

    // Sections are selected from the sidebar, not duplicated as an in-page tab bar.
    expect(screen.queryByRole('tablist', { name: 'Attendance Navigation' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Attendance Overview' })).toBeInTheDocument()

    // Default active panel is Overview
    expect(screen.getByTestId('overview-tab')).toBeInTheDocument()
  })

  it('renders the section selected by the navigation route', async () => {
    installFetchMock()
    const { rerender } = render(
      <AttendancePage
        accessToken="test-token"
        selectedBranch="branch-main"
        selectedDate="2026-07-21"
        onDateChange={() => undefined}
      />,
    )

    rerender(<AttendancePage accessToken="test-token" selectedBranch="branch-main" selectedDate="2026-07-21" onDateChange={() => undefined} initialTab="student-leave" />)
    expect(await screen.findByTestId('leave-approvals-tab')).toBeInTheDocument()

    rerender(<AttendancePage accessToken="test-token" selectedBranch="branch-main" selectedDate="2026-07-21" onDateChange={() => undefined} initialTab="staff-leave" />)
    expect(await screen.findByText('Staff leave decisions')).toBeInTheDocument()

    rerender(<AttendancePage accessToken="test-token" selectedBranch="branch-main" selectedDate="2026-07-21" onDateChange={() => undefined} initialTab="reports" />)
    expect(await screen.findByTestId('reports-analytics-tab')).toBeInTheDocument()

    rerender(<AttendancePage accessToken="test-token" selectedBranch="branch-main" selectedDate="2026-07-21" onDateChange={() => undefined} initialTab="settings" />)
    expect(await screen.findByTestId('settings-tab')).toBeInTheDocument()
  })
})
