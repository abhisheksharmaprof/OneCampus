import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'
import { adminNavigation, adminRoutes, allAdminRoutes, getAdminRouteByLabel, getAdminRouteByPath } from './adminNavigation'

const dashboardResponse = {
  success: true,
  data: {
    context: {
      instituteId: 'institute-1',
      branchId: null,
      branches: [{ id: 'branch-1', name: 'Main Campus', isHeadOffice: true }],
    },
    kpis: {
      activeStudents: 27,
      totalStaff: 4,
      todayAttendance: { percentage: 92.5, present: 25, total: 27 },
      feeCollection: { collected: '150000.00', expected: '200000.00', percentage: 75 },
      openEnquiries: 8,
      newEnquiriesToday: 2,
    },
    attentionItems: [{
      id: 'attendance',
      label: 'Students below 75% attendance this month',
      count: 3,
      tone: 'danger',
      destination: 'attendance/low-attendance',
    }],
    branchComparison: [{
      branchId: 'branch-1',
      name: 'Main Campus',
      attendancePercentage: 92.5,
      feeCollectionPercentage: 75,
      averageLeaderboardPoints: null,
    }],
    recentActivity: [{
      id: 'event-1',
      message: 'Aarav created a branch',
      actorName: 'Aarav Sharma',
      createdAt: '2026-07-18T12:00:00Z',
    }],
    upcoming: [{ id: 'calendar-1', title: 'Parent-Teacher Meeting', type: 'PTM', startsOn: '2026-07-21' }],
    admissionsFunnel: { enquiry: 10, visitScheduled: 6, applied: 4, enrolled: 2 },
  },
}

describe('Institute Admin dashboard', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/dashboard')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => dashboardResponse,
    }))
    localStorage.setItem('campusone.session', JSON.stringify({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user: {
        id: 'user-1',
        displayName: 'Ananya',
        roles: ['INSTITUTE_ADMIN'],
        activeRole: 'INSTITUTE_ADMIN',
        instituteId: 'institute-1',
        branchIds: ['branch-1'],
      },
    }))
  })

  it('renders live dashboard data from the API', async () => {
    render(<App />)

    expect(await screen.findByText('27')).toBeInTheDocument()

    expect(screen.getByRole('banner')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: /primary navigation/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dashboard Overview', level: 1 })).toBeInTheDocument()
    expect(screen.getByText(/welcome back, ananya/i)).toBeInTheDocument()

    for (const label of [
      'Total Students',
      'Total Teachers',
      'Total Staff',
      'Total Subjects',
      'Attendance Today',
      'Fees Collected (MTD)',
      'Pending Leaves',
      'At-Risk Students',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }

    expect(screen.getByRole('region', { name: /needs your attention/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /enrollment by branch/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /recent activity/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /upcoming events/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /admissions this month/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Student' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send Announcement' })).toBeInTheDocument()
  })

  it('collapses and expands the sidebar accessibly', async () => {
    const user = userEvent.setup()
    render(<App />)

    const navigation = screen.getByRole('navigation', { name: /primary navigation/i })
    const toggle = screen.getByRole('button', { name: /collapse sidebar/i })

    expect(navigation).toHaveAttribute('data-collapsed', 'false')
    await user.click(toggle)
    expect(navigation).toHaveAttribute('data-collapsed', 'true')
    expect(toggle).toHaveAccessibleName(/expand sidebar/i)
  })

  it('updates global branch context and refetches scoped data', async () => {
    const user = userEvent.setup()
    render(<App />)

    await screen.findByRole('option', { name: 'Main Campus' })

    const branchSelector = screen.getByRole('combobox', { name: /branch context/i })
    await user.selectOptions(branchSelector, 'branch-1')

    expect(screen.getByText(/viewing: main campus/i)).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /branch comparison/i })).not.toBeInTheDocument()
    expect(fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('branchId=branch-1'),
      expect.any(Object),
    )
    expect(window.location.search).toBe('?branch=branch-1')
  })

  it('provides functional attention review actions', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('attendance/overview') || String(input).includes('/students')
        ? { success: true, data: { items: [] } }
        : dashboardResponse,
    })))
    render(<App />)

    await screen.findByRole('region', { name: /needs your attention/i })

    const panel = screen.getByRole('region', { name: /needs your attention/i })
    const reviewButtons = within(panel).getAllByRole('button', { name: /review/i })
    await user.click(reviewButtons[0])

    expect(window.location.pathname).toBe('/attendance')
    expect(window.location.search).toBe('?view=low-attendance')
  })

  it('navigates to the API-backed student page instead of a fixture screen', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/students')
        ? { success: true, data: { items: [{
          id: 'student-1',
          admissionNumber: 'NSA-0001',
          firstName: 'Diya',
          lastName: 'Patel',
          isActive: true,
          branch: { id: 'branch-1', name: 'Main Campus', code: 'MAIN' },
        }] } }
        : dashboardResponse,
    })))

    render(<App />)
    await screen.findByText('27')
    await user.click(screen.getByRole('button', { name: 'People' }))
    await user.click(screen.getByRole('button', { name: 'Students' }))

    expect(await screen.findByRole('heading', { name: 'Students' })).toBeInTheDocument()
    expect(screen.getByText('Diya Patel')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/students')
    await user.click(screen.getByRole('button', { name: 'View' }))
    expect(window.location.search).toBe('?student=student-1')
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/admin/students'), expect.any(Object))
  })

  it('restores a deep-linked student screen after a browser reload', async () => {
    window.history.pushState({}, '', '/people/students?student=student-1')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/students')
        ? { success: true, data: { items: [{
          id: 'student-1', admissionNumber: 'NSA-0001', firstName: 'Diya', lastName: 'Patel', isActive: true,
          branch: { id: 'branch-1', name: 'Main Campus', code: 'MAIN' },
        }] } }
        : dashboardResponse,
    })))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Students' })).toBeInTheDocument()
    expect(await screen.findByText('Diya Patel')).toBeInTheDocument()
  })

  it('keeps Academic Structure inside Institute Setup instead of redirecting to the dashboard', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/admin/academics/')
        ? { success: true, data: { count: 0, page: 1, pageSize: 25, totalPages: 1, next: null, previous: null, items: [] } }
        : String(input).includes('/institute')
        ? { success: true, data: { id: 'institute-1', name: 'Northstar Academy', code: 'NSA', isActive: true } }
        : String(input).includes('/branches')
          ? { success: true, data: { items: [] } }
          : dashboardResponse,
    })))
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Institute Setup' }))
    await user.click(screen.getByRole('button', { name: 'Academic Structure' }))

    expect(window.location.pathname).toBe('/academics/structure')
    expect(await screen.findByRole('heading', { name: 'Academic Structure' })).toBeInTheDocument()
  })

  it('registers a unique route for every sidebar destination', () => {
    const sidebarDestinations = adminNavigation.flatMap((item) => item.route ? [item.route] : item.children ?? [])
    expect(adminRoutes).toHaveLength(sidebarDestinations.length)
    expect(new Set(adminRoutes.map((route) => route.path)).size).toBe(adminRoutes.length)
    expect(new Set(adminRoutes.map((route) => route.label)).size).toBe(adminRoutes.length)
    for (const route of sidebarDestinations) {
      expect(getAdminRouteByLabel(route.label)).toEqual(route)
      expect(getAdminRouteByPath(route.path)).toEqual(route)
      if (route.label !== 'Dashboard') expect(route.path).not.toBe('/dashboard')
    }
    expect(allAdminRoutes).toContainEqual(expect.objectContaining({ label: 'Award Approvals', path: '/recognition/award-approvals' }))
    expect(allAdminRoutes).toContainEqual(expect.objectContaining({ label: 'Transport', path: '/addons/transport' }))
  })

  it('renders truthful coming-soon pages for planned add-on modules', async () => {
    window.history.pushState({}, '', '/addons/transport')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Transport' })).toBeInTheDocument()
    expect(screen.getByText('Transport — Coming Soon')).toBeInTheDocument()
    expect(screen.getByText(/GPS bus tracking/i)).toBeInTheDocument()
  })

  it('shows live admissions funnel data on its dedicated route', async () => {
    window.history.pushState({}, '', '/admissions/funnel')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Funnel Report' })).toBeInTheDocument()
    expect(screen.getByText('Visit scheduled')).toBeInTheDocument()
    expect(screen.getByText('60% conversion')).toBeInTheDocument()
  })

  it('loads Branding & Profile from the institute API', async () => {
    window.history.pushState({}, '', '/institute/profile')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).endsWith('/institute')
        ? { success: true, data: { id: 'institute-1', name: 'Northstar Academy', code: 'NSA', isActive: true } }
        : dashboardResponse,
    })))
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Branding & Profile' })).toBeInTheDocument()
    expect(await screen.findByDisplayValue('Northstar Academy')).toBeInTheDocument()
    expect(screen.getByDisplayValue('NSA')).toBeDisabled()
  })

  it('restores the API-backed academic calendar route', async () => {
    window.history.pushState({}, '', '/academics/calendar')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/calendar/events')
        ? { success: true, data: { items: [{ id: 'event-1', title: 'Parent-Teacher Meeting', eventType: 'PTM', branchId: 'branch-1', startsOn: '2026-07-21', endsOn: '2026-07-21' }] } }
        : dashboardResponse,
    })))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Academic Calendar' })).toBeInTheDocument()
    expect(await screen.findByText('Parent-Teacher Meeting')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add event/i })).toBeInTheDocument()
  })

  it('loads a date-scoped attendance register from live APIs', async () => {
    window.history.pushState({}, '', '/attendance?date=2026-07-21')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('attendance/overview')
        ? { success: true, data: { items: [{ id: 'attendance-1', studentId: 'student-1', studentName: 'Diya Patel', date: '2026-07-21', status: 'PRESENT' }] } }
        : String(input).includes('/students')
          ? { success: true, data: { items: [{ id: 'student-1', firstName: 'Diya', lastName: 'Patel', admissionNumber: 'NSA-0001' }] } }
          : dashboardResponse,
    })))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Attendance Overview' })).toBeInTheDocument()
    expect(await screen.findByText('Diya Patel')).toBeInTheDocument()
    expect(screen.getByLabelText('Attendance date')).toHaveValue('2026-07-21')
  })

  it('renders the finance suite shell with its sub-sidebar', async () => {
    window.history.pushState({}, '', '/finance/invoices')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => dashboardResponse,
    }))

    render(<App />)

    const financeNav = await screen.findByRole('navigation', { name: 'Finance sections' })
    expect(within(financeNav).getByRole('button', { name: /payments & receipts/i })).toBeInTheDocument()
    expect(within(financeNav).getByRole('button', { name: /^invoices$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /new invoice/i })).toBeInTheDocument()

    await userEvent.click(within(financeNav).getByRole('button', { name: /payments & receipts/i }))
    expect(await screen.findByRole('button', { name: /record payment/i })).toBeInTheDocument()
  })

  it('renders the template studio category home', async () => {
    window.history.pushState({}, '', '/template-studio')
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Template Studio' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /fee invoice/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /id card/i })).toBeInTheDocument()
  })

  it('restores the staff screen with API-backed staff accounts', async () => {
    window.history.pushState({}, '', '/people/staff')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/staff')
        ? { success: true, data: { items: [{ id: 'staff-1', fullName: 'Meera Iyer', email: 'meera@northstar.test', employee_code: 'NSA-T-001', branch: { id: 'branch-1', name: 'Main Campus' }, role: 'TEACHER', status: 'PENDING_INVITE' }] } }
        : dashboardResponse,
    })))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Staff' })).toBeInTheDocument()
    expect(await screen.findByText('Meera Iyer')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add staff/i })).toBeInTheDocument()
  })

  it('deep-links to the API-backed timetable generator', async () => {
    window.history.pushState({}, '', '/timetable/generate?branch=branch-1')
    const emptyPage = { success: true, data: { count: 0, page: 1, pageSize: 100, totalPages: 1, next: null, previous: null, items: [] } }
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/api/v1/admin/academics/') || String(input).includes('/api/v1/admin/staff?') ? emptyPage : dashboardResponse,
    })))

    render(<App />)

    expect(await screen.findByText('Timetable Builder')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/admin/academics/subjects?page=1&pageSize=100'), expect.any(Object))
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/api/v1/admin/academics/sections?page=1&pageSize=100&branchId=branch-1'), expect.any(Object))
    expect(screen.getByRole('button', { name: 'View Timetable' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate Timetable' })).toBeInTheDocument()
  })

  it('restores the parent-linking screen with live parent records', async () => {
    window.history.pushState({}, '', '/people/parents')
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).includes('/parents')
        ? { success: true, data: { items: [{ id: 'parent-1', fullName: 'Anita Patel', email: 'anita@example.test', phone: '9876543210', children: [{ id: 'student-1', name: 'Diya Patel' }] }] } }
        : String(input).includes('/students')
          ? { success: true, data: { items: [] } }
          : dashboardResponse,
    })))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Parents' })).toBeInTheDocument()
    expect(await screen.findByText('Anita Patel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /link parent/i })).toBeInTheDocument()
  })

  it('revokes the refresh token and clears the local session on sign out', async () => {
    const user = userEvent.setup()
    render(<App />)
    await screen.findByText('27')

    await user.click(screen.getByRole('button', { name: /open profile menu/i }))
    await user.click(screen.getByRole('menuitem', { name: /sign out/i }))

    expect(await screen.findByRole('heading', { name: 'Welcome back' })).toBeInTheDocument()
    expect(localStorage.getItem('campusone.session')).toBeNull()
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/identity/sessions/current'),
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('clears an unrefreshable session and redirects to login without showing the API error', async () => {
    window.history.pushState({}, '', '/dashboard')
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: 'TOKEN_EXPIRED', message: 'Access token expired.' } }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: 'TOKEN_INVALID', message: 'Refresh token expired.' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })))

    render(<App />)

    expect(await screen.findByRole('heading', { name: /welcome back/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(localStorage.getItem('campusone.session')).toBeNull()
    expect(screen.queryByText(/access token expired|refresh token expired/i)).not.toBeInTheDocument()
  })
})
