import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StaffPage } from './StaffPage'

describe('StaffPage timetable availability', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL, init?: RequestInit) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/staff') && init?.method === 'POST'
        ? { success: true, data: { id: 'staff-1', fullName: 'Meera Iyer' } }
        : { success: true, data: { count: 0, page: 1, pageSize: 25, totalPages: 1, next: null, previous: null, items: [] } },
    })))
  })

  it('collects teacher work pattern and sends it with the staff account', async () => {
    const user = userEvent.setup()
    render(<BrowserRouter><StaffPage accessToken="access-token" selectedBranch="branch-1" branches={[{ id: 'branch-1', name: 'Main Campus' }]} /></BrowserRouter>)

    await user.click(await screen.findByRole('button', { name: /add staff/i }))

    expect(screen.getByRole('combobox', { name: /employment type/i })).toHaveValue('FULL_TIME')
    expect(screen.getByRole('group', { name: /available working days/i })).toBeInTheDocument()
    await user.selectOptions(screen.getByRole('combobox', { name: /employment type/i }), 'PART_TIME')
    await user.click(screen.getByRole('button', { name: 'Before lunch only' }))
    expect(screen.getByRole('button', { name: 'Before lunch only' })).toHaveAttribute('aria-pressed', 'true')
    await user.clear(screen.getByRole('spinbutton', { name: /maximum periods per day/i }))
    await user.type(screen.getByRole('spinbutton', { name: /maximum periods per day/i }), '3')
    await user.clear(screen.getByRole('spinbutton', { name: /maximum periods per week/i }))
    await user.type(screen.getByRole('spinbutton', { name: /maximum periods per week/i }), '12')
    await user.click(screen.getByRole('checkbox', { name: 'Tuesday' }))
    await user.type(screen.getByRole('textbox', { name: /full name/i }), 'Meera Iyer')
    await user.type(screen.getByRole('textbox', { name: /work email/i }), 'meera@northstar.test')

    await user.click(screen.getByRole('button', { name: /add staff member/i }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/admin/staff'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          fullName: 'Meera Iyer', email: 'meera@northstar.test', branchId: 'branch-1', role: 'TEACHER', employeeCode: '',
          employmentType: 'PART_TIME', availableDays: ['MON', 'WED', 'THU', 'FRI', 'SAT', 'SUN'], availablePeriods: [1, 2, 3, 4], maxPeriodsPerDay: 3, maxPeriodsPerWeek: 18,
        }),
      }),
    ))
  })
})
