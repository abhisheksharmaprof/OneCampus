import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OverviewTab } from '../components/OverviewTab'

const mockOverviewData = {
  records: [
    { id: '1', studentId: 'st-101', date: '2026-07-01', status: 'PRESENT' as const },
    { id: '2', studentId: 'st-102', date: '2026-07-01', status: 'PRESENT' as const },
    { id: '3', studentId: 'st-101', date: '2026-07-02', status: 'ABSENT' as const },
  ],
  calendarDates: ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'],
  calendar: [
    { date: '2026-07-01', state: 'marked', percentage: 100 },
    { date: '2026-07-02', state: 'marked', percentage: 0 },
    { date: '2026-07-03', state: 'missing', percentage: null },
    { date: '2026-07-04', state: 'non_applicable', percentage: null },
    { date: '2026-07-05', state: 'future', percentage: null },
  ],
}

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
    if (url.includes('/overview')) {
      return response(mockOverviewData)
    }
    if (url.includes('/academics/classes')) {
      return response({ items: [{ id: 'cls-1', name: 'Class 10' }] })
    }
    if (url.includes('/academics/sections')) {
      return response({ items: [{ id: 'sec-1', gradeId: 'cls-1', sectionName: 'A' }] })
    }
    return response([])
  })
}

describe('OverviewTab', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders wrapped AttendanceCharts, register filter dropdowns, and calendar cell status distinctions', async () => {
    installFetchMock()
    const onDateChange = vi.fn()
    const onSwitchToMarkTab = vi.fn()

    render(
      <OverviewTab
        accessToken="test-token"
        selectedBranch="branch-1"
        selectedDate="2026-07-01"
        onDateChange={onDateChange}
        onSwitchToMarkTab={onSwitchToMarkTab}
      />,
    )

    expect(screen.getByTestId('overview-tab')).toBeInTheDocument()

    // AttendanceCharts titles
    expect(await screen.findByText('30-day movement')).toBeInTheDocument()
    expect(screen.getByText('Monthly distribution')).toBeInTheDocument()

    // Register filter dropdowns
    expect(screen.getByText('Register Review & Filter')).toBeInTheDocument()
    expect(await screen.findByRole('combobox', { name: 'Class' })).toBeInTheDocument()

    // Calendar cell status distinctions
    const cell100 = await screen.findByTestId('calendar-cell-2026-07-01')
    expect(cell100).toHaveTextContent('100%')

    const cellMissing = screen.getByTestId('calendar-cell-2026-07-03')
    expect(cellMissing).toHaveTextContent('Missing · mark now')

    const cellWeekend = screen.getByTestId('calendar-cell-2026-07-04')
    expect(cellWeekend).toHaveTextContent('Weekend / Holiday')

    const cellFuture = screen.getByTestId('calendar-cell-2026-07-05')
    expect(cellFuture).toHaveTextContent('Future')
  })

  it('jumps to Mark Attendance tab when clicking a missing past date cell', async () => {
    installFetchMock()
    const user = userEvent.setup()
    const onDateChange = vi.fn()
    const onSwitchToMarkTab = vi.fn()

    render(
      <OverviewTab
        accessToken="test-token"
        selectedBranch="branch-1"
        selectedDate="2026-07-01"
        onDateChange={onDateChange}
        onSwitchToMarkTab={onSwitchToMarkTab}
      />,
    )

    const cellMissing = await screen.findByTestId('calendar-cell-2026-07-03')
    await user.click(cellMissing)

    expect(onDateChange).toHaveBeenCalledWith('2026-07-03')
    expect(onSwitchToMarkTab).toHaveBeenCalled()
  })
})
