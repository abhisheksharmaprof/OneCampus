import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReportsAnalyticsTab } from '../components/ReportsAnalyticsTab'

const mockReportData = {
  summary: { present: 45, absent: 5, late: 2, excused: 1, total: 53, attendancePercentage: 88.6 },
  trend: [
    { date: '2026-07-20', total: 50, present: 45, percentage: 90 },
    { date: '2026-07-21', total: 50, present: 42, percentage: 84 },
  ],
  staffSummary: [
    { userId: 'staff-1', name: 'Dr. Ramesh Sharma', totalDays: 20, lateDays: 1, latePercentage: 5 },
  ],
  atRisk: [{ studentId: 'st-103', reason: 'Low attendance and math grade' }],
  academicPerformanceAvailable: true,
}

const mockAlerts = [
  {
    studentId: 'st-103',
    studentName: 'Chetan Kumar',
    admissionNumber: 'ADM-003',
    className: 'Class 10',
    sectionName: 'A',
    branchId: 'branch-1',
    totalClasses: 30,
    attendedClasses: 18,
    attendancePercentage: 60,
    consecutiveAbsences: 4,
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
    if (url.includes('/reports')) {
      return response(mockReportData)
    }
    if (url.includes('/alerts/st-103/notify')) {
      return response({ success: true, message: 'Notification queued' })
    }
    if (url.includes('/alerts')) {
      return response(mockAlerts)
    }
    return response([])
  })
}

describe('ReportsAnalyticsTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.print = vi.fn()
  })

  it('renders low-attendance alert list, trend bars, staff punctuality, and export buttons', async () => {
    installFetchMock()
    render(
      <ReportsAnalyticsTab
        accessToken="test-token"
        selectedBranch="branch-1"
      />,
    )

    expect(screen.getByTestId('reports-analytics-tab')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Print / PDF' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeInTheDocument()

    // Low-attendance alert table
    expect(await screen.findByRole('table', { name: 'Low Attendance Alerts' })).toBeInTheDocument()
    expect(screen.getByText('Chetan Kumar')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()

    // Staff punctuality table
    expect(screen.getByRole('table', { name: 'Staff Punctuality Summary' })).toBeInTheDocument()
    expect(screen.getByText('Dr. Ramesh Sharma')).toBeInTheDocument()
  })

  it('triggers 1-click parent notification on low-attendance alert', async () => {
    const fetchMock = installFetchMock()
    const user = userEvent.setup()

    render(
      <ReportsAnalyticsTab
        accessToken="test-token"
        selectedBranch="branch-1"
      />,
    )

    await screen.findByText('Chetan Kumar')
    const row = screen.getByTestId('alert-row-st-103')
    const notifyBtn = within(row).getByRole('button', { name: 'Notify Parent' })

    await user.click(notifyBtn)

    await waitFor(() => {
      const notifyCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/alerts/st-103/notify'))
      expect(notifyCall).toBeDefined()
      expect(within(row).getByRole('button')).toHaveTextContent('Queued / Notified')
    })
  })
})
