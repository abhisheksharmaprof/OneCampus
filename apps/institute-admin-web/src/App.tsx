import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { getAdminRouteByLabel, getAdminRouteByPath } from './adminNavigation'
import { AppShell, type BranchContext } from './components/layout/AppShell'

import { AdmissionsFunnelPage } from './features/admissions/AdmissionsFunnelPage'
import { EnquiriesPage } from './features/admissions/EnquiriesPage'
import { UnavailableModulePage } from './features/admin/UnavailableModulePage'
import { OperationalListPage } from './features/admin/OperationalListPage'
import { AdminErrorBoundary } from './features/admin/AdminErrorBoundary'
import { AcademicStructurePage } from './features/academics'
import { AcademicOperationsPage } from './features/academics/AcademicOperationsPage'
import { AcademicOverviewPage } from './features/academics/AcademicOverviewPage'
import { RoleAssignmentsPage, RoleBuilderPage, RolesListPage, type AssignableUser } from './features/access-control'
import { ADMIN_SESSION_EXPIRED_EVENT, adminRequest } from './features/admin/admin.api'
import { AttendancePage, type AttendanceTab } from './features/attendance/AttendancePage'
import { AuthPage } from './features/auth/AuthPage'
import { PendingReviewPage } from './features/auth/PendingReviewPage'
import { signOut, type SessionData } from './features/auth/auth.api'
import { CalendarPage } from './features/calendar/CalendarPage'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { getDashboard, type DashboardData } from './features/dashboard/dashboard.api'
import FinanceSuitePage, { type FinanceSection } from './features/finance/FinanceSuitePage'
import { FinanceModulePage } from './features/finance/FinanceModulePage'
import { InstituteProfilePage } from './features/institute/InstituteProfilePage'
import { BrandingPage } from './features/institute/BrandingPage'
import { SubscriptionPage } from './features/institute/SubscriptionPage'
import { InstituteSetupPage } from './features/institute/InstituteSetupPage'
import { RoomsFacilitiesPage } from './features/institute/RoomsFacilitiesPage'
import { StaffPage } from './features/people/StaffPage'
import { ParentsPage } from './features/people/ParentsPage'
import { StudentsPage } from './features/people/StudentsPage'
import { ProfilePage } from './features/people/ProfilePages'
import { AuditLogPage } from './features/audit/AuditLogPage'

import './styles/tokens.css'
import './styles/global.css'
import './styles/operational.css'

import { PageSkeleton, ToastProvider } from './components/admin-ui'
import { BoneyardCapturePage } from './features/admin/BoneyardCapturePage'
import './styles/redesign.css'
import './styles/students-form.css'
import './styles/auth-responsive.css'

const TimetablePage = lazy(() => import('./features/timetable/TimetablePage').then((module) => ({ default: module.TimetablePage })))

const financeSectionByRoute: Record<string, FinanceSection> = {
  FH1: 'overview',
  FIN1: 'invoices',
  FPY1: 'payments',
  FDU1: 'dues',
  FFS1: 'plans',
  FIT1: 'templates',
  FST1: 'settings',
}

export function App() {
  return <BrowserRouter><ToastProvider><RoutedApp /></ToastProvider></BrowserRouter>
}

function RoutedApp() {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  useEffect(() => {
    const openDatePicker = (event: MouseEvent) => {
      const input = event.target instanceof HTMLInputElement ? event.target : null
      if (!input || !['date', 'datetime-local'].includes(input.type)) return
      try {
        input.showPicker?.()
      } catch {
        // Browsers that do not support showPicker still use the native input behavior.
      }
    }
    document.addEventListener('click', openDatePicker, true)
    return () => document.removeEventListener('click', openDatePicker, true)
  }, [])
  useEffect(() => {
    const addButtonTooltips = () => {
      document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
        if (button.title) return
        const label = button.getAttribute('aria-label')?.trim() || button.textContent?.replace(/\s+/g, ' ').trim()
        if (!label || label.length > 80) return
        button.title = label
      })
    }

    addButtonTooltips()
    const observer = new MutationObserver(addButtonTooltips)
    observer.observe(document.body, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [])
  const [session, setSession] = useState<SessionData | null>(() => {
    const stored = localStorage.getItem('campusone.session')
    if (!stored) return null
    try { return JSON.parse(stored) as SessionData } catch { localStorage.removeItem('campusone.session'); return null }
  })
  const [announcement, setAnnouncement] = useState('')
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [availableBranches, setAvailableBranches] = useState<DashboardData['context']['branches']>([])
  const [dashboardError, setDashboardError] = useState('')
  const [dashboardRevision, setDashboardRevision] = useState(0)
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([])
  const requestedBranch = searchParams.get('branch')
  const branch = (requestedBranch && requestedBranch !== 'all'
    ? requestedBranch
    : session?.user.branchIds[0] ?? 'all') as BranchContext
  const academicYear = searchParams.get('year') ?? '2026-27'
  const requestedAttendanceDate = searchParams.get('date')
  const attendanceDate = requestedAttendanceDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedAttendanceDate) && !Number.isNaN(Date.parse(requestedAttendanceDate))
    ? requestedAttendanceDate
    : new Date().toISOString().slice(0, 10)
  const route = getAdminRouteByPath(location.pathname)
  const attendanceTabByRoute: Record<string, AttendanceTab> = {
    AT1: 'mark',
    AT2: 'overview',
    AT6: 'student-leave',
    AT7: 'staff-leave',
    ST3: 'student-leave',
    AT4: 'reports',
    AT5: 'settings',
    RA1: 'reports',
  }
  const attendanceInitialTab = (route?.id === 'ST3' || route?.id === 'AT6') && searchParams.get('leaveType') === 'staff'
    ? 'staff-leave'
    : route?.id
      ? attendanceTabByRoute[route.id]
      : undefined
  const isBranchAdmin = session?.user.activeRole === 'BRANCH_ADMIN'
  const selectedBranch = isBranchAdmin ? (session?.user.branchIds[0] ?? branch) : branch
  const canViewAllBranches = session?.user.activeRole === 'INSTITUTE_ADMIN'
  const canViewAudit = session?.user.activeRole === 'INSTITUTE_ADMIN'
    || session?.user.permissions?.includes('institute.view_all_branches') === true
  const visibleBranches = (availableBranches.length ? availableBranches : (dashboard?.context.branches ?? []))
    .filter((item) => canViewAllBranches || session?.user.branchIds.includes(item.id))
  const isOnboardingRoute = location.pathname.startsWith('/onboarding/')

  // Keep the global branch context in the URL as the user moves between screens.
  // Branch-detail routing uses `branchDetail` so it cannot overwrite this context.
  const navigateWithBranch = (path: string) => {
    const [pathname, query = ''] = path.split('?')
    const nextQuery = new URLSearchParams(query)
    if (selectedBranch !== 'all') nextQuery.set('branch', selectedBranch)
    const suffix = nextQuery.toString()
    navigate(`${pathname}${suffix ? `?${suffix}` : ''}`)
  }

  const handleAttendanceTabChange = (tab: AttendanceTab) => {
    const pathByTab: Record<AttendanceTab, string> = {
      overview: '/attendance',
      mark: '/attendance/mark',
      'student-leave': '/attendance/student-leave',
      'staff-leave': '/attendance/staff-leave',
      leave: '/attendance/student-leave',
      reports: '/attendance/reports',
      settings: '/attendance/settings',
    }
    navigateWithBranch(pathByTab[tab])
  }

  useEffect(() => {
    const handleSessionExpired = () => {
      localStorage.removeItem('campusone.session')
      setDashboard(null)
      setSession(null)
      const currentPath = `${location.pathname}${location.search}`
      const returnTo = currentPath.startsWith('/login') || currentPath.startsWith('/onboarding') ? undefined : currentPath
      navigate('/login', { replace: true, state: returnTo ? { from: returnTo } : undefined })
    }
    window.addEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired)
    return () => window.removeEventListener(ADMIN_SESSION_EXPIRED_EVENT, handleSessionExpired)
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    if (!session) return
    const controller = new AbortController()
    getDashboard(session.accessToken, selectedBranch === 'all' ? null : selectedBranch, controller.signal)
      .then((data) => { setDashboard(data); setDashboardError('') })
      .catch((error: unknown) => { if (!controller.signal.aborted) setDashboardError(error instanceof Error ? error.message : 'Dashboard data could not be loaded.') })
    return () => controller.abort()
  }, [dashboardRevision, selectedBranch, session])

  useEffect(() => {
    if (!session) {
      setAvailableBranches([])
      return
    }
    const controller = new AbortController()
    void adminRequest<{ items: DashboardData['context']['branches'] }>(session.accessToken, 'branches?page=1&pageSize=100', { signal: controller.signal })
      .then((result) => setAvailableBranches(result.items ?? []))
      .catch(() => { if (!controller.signal.aborted) setAvailableBranches([]) })
    return () => controller.abort()
  }, [dashboardRevision, session])

  useEffect(() => {
    if (!session || !['RP1', 'RP2', 'RP3'].includes(route?.id ?? '')) return
    const controller = new AbortController()
    const params = new URLSearchParams({ pageSize: '100' })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    void adminRequest<{ items: Array<{ userId: string; fullName: string; email: string; employee_code: string }> }>(session.accessToken, `staff?${params}`, { signal: controller.signal })
      .then((response) => setAssignableUsers(response.items.map((person) => ({ id: person.userId, name: person.fullName, email: person.email, employeeCode: person.employee_code }))))
      .catch(() => setAssignableUsers([]))
    return () => controller.abort()
  }, [route?.id, selectedBranch, session])

  const updateQuery = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams)
    if (!value || value === 'all' || (key === 'year' && value === '2026-27')) next.delete(key)
    else next.set(key, value)
    setSearchParams(next, { replace: true })
  }

  const handleAuthenticated = (nextSession: SessionData) => {
    localStorage.setItem('campusone.session', JSON.stringify(nextSession))
    setSession(nextSession)
    const requestedPath = (location.state as { from?: unknown } | null)?.from
    const destination = typeof requestedPath === 'string' && requestedPath.startsWith('/') && !requestedPath.startsWith('//') && !requestedPath.startsWith('/login') && !requestedPath.startsWith('/onboarding')
      ? requestedPath
      : '/dashboard'
    navigate(destination, { replace: true })
  }

  const handleSignOut = async () => {
    if (!session) return
    try {
      await signOut(session.accessToken, session.refreshToken)
    } catch {
      setAnnouncement('Signed out on this device. Server session revocation could not be confirmed.')
    } finally {
      localStorage.removeItem('campusone.session')
      setDashboard(null)
      setSession(null)
      navigate('/login', { replace: true })
    }
  }

  if (import.meta.env.DEV && location.pathname === '/__boneyard') return <BoneyardCapturePage />

  const handleNavigate = (nextPage: string) => {
    const destination = getAdminRouteByLabel(nextPage)
    if (destination) navigateWithBranch(destination.path)
  }

  const handleDashboardReview = (destination: string) => {
    const dashboardDestinations: Record<string, string> = {
      'attendance/low-attendance': '/attendance?view=low-attendance',
      'attendance/leave-approvals': '/attendance/leave-approvals',
      'gamification/points': '/recognition/award-approvals',
      'academics/common-tests': '/academics/common-tests',
      'network/partnerships': '/network/partnerships',
      'institute/profile': '/institute/profile',
    }
    navigateWithBranch(dashboardDestinations[destination] ?? `/${destination.replace(/^\/+/, '')}`)
  }

  if (!session) {
    if (location.pathname !== '/login' && !isOnboardingRoute) {
      return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    }
    return <AuthPage
      mode={isOnboardingRoute ? 'onboarding' : 'login'}
      onboardingStep={isOnboardingRoute ? location.pathname.slice('/onboarding/'.length) : undefined}
      onNavigate={navigateWithBranch}
      onAuthenticated={handleAuthenticated}
    />
  }
  if (session.onboarding?.status === 'pending_review') return <PendingReviewPage session={session} onSignOut={() => void handleSignOut()} />
  if (location.pathname === '/login' || isOnboardingRoute) return <Navigate to="/dashboard" replace />
  if (location.pathname === '/') return <Navigate to="/dashboard" replace />
  if (!canViewAllBranches && route?.id?.startsWith('BR')) return <Navigate to="/dashboard" replace />
  if (!canViewAudit && route?.id === 'AL1') return <Navigate to="/dashboard" replace />

  return (
    <AppShell
      branch={selectedBranch}
      branches={visibleBranches}
      activePage={route?.label ?? ''}
      academicYear={academicYear}
      onAcademicYearChange={(year) => updateQuery('year', year)}
      onBranchChange={(nextBranch) => updateQuery('branch', nextBranch)}
      onNavigate={handleNavigate}
      onSignOut={handleSignOut}
      isBranchAdmin={isBranchAdmin}
      canViewAllBranches={canViewAllBranches}
      canViewAudit={canViewAudit}
    >
      <AdminErrorBoundary resetKey={`${location.pathname}${location.search}`}>
      {route?.view === 'dashboard' && <DashboardPage branch={selectedBranch} data={dashboard} error={dashboardError} displayName={session.user.displayName} academicYear={academicYear} onBranchChange={(nextBranch) => updateQuery('branch', nextBranch)} onReview={handleDashboardReview} onNavigate={handleNavigate} />}
      {(route?.id === 'BR1' || route?.id === 'BR2') && <InstituteSetupPage accessToken={session.accessToken} branchId={route.id === 'BR2' ? searchParams.get('branchDetail') ?? undefined : undefined} onOpenBranch={(branchId) => navigateWithBranch(`/branches/detail?branchDetail=${branchId}`)} onBranchesChanged={() => setDashboardRevision((value) => value + 1)} />}
      {route?.view === 'institute-profile' && <InstituteProfilePage accessToken={session.accessToken} />}
      {route?.view === 'branding' && <BrandingPage accessToken={session.accessToken} />}
      {route?.id === 'SE3' && <SubscriptionPage />}
      {route?.view === 'staff' && <StaffPage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} />}
      {route?.view === 'parents' && <ParentsPage accessToken={session.accessToken} selectedBranch={selectedBranch} />}
      {route?.view === 'students' && <StudentsPage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} selectedStudentId={searchParams.get('student')} onSelectStudent={(studentId) => updateQuery('student', studentId)} />}
      {route?.id === 'STP1' && <ProfilePage accessToken={session.accessToken} kind="staff" id={searchParams.get('staff') ?? undefined} onBack={() => navigateWithBranch('/staff')} />}
      {route?.id === 'SDP1' && <ProfilePage accessToken={session.accessToken} kind="student" id={searchParams.get('student') ?? undefined} onBack={() => navigateWithBranch('/students')} />}
      {route?.id === 'PDP1' && <ProfilePage accessToken={session.accessToken} kind="parent" id={searchParams.get('parent') ?? undefined} onBack={() => navigateWithBranch('/parents')} />}
      {route?.view === 'enquiries' && <EnquiriesPage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} />}
      {route?.view === 'admissions-funnel' && <AdmissionsFunnelPage data={dashboard} error={dashboardError} />}
      {attendanceInitialTab && <AttendancePage initialTab={attendanceInitialTab} onTabChange={handleAttendanceTabChange} accessToken={session.accessToken} selectedBranch={selectedBranch} selectedDate={attendanceDate} onDateChange={(date) => updateQuery('date', date)} />}
      {route?.id && financeSectionByRoute[route.id] && <FinanceSuitePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} section={financeSectionByRoute[route.id]} onNavigate={navigateWithBranch} />}
      {route?.id === 'FEX1' && <FinanceModulePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} module="expenses" />}
      {route?.id === 'FPR1' && <FinanceModulePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} module="payroll" />}
      {route?.id === 'FBU1' && <FinanceModulePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} module="budget" />}
      {route?.id === 'FRP1' && <FinanceModulePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} module="reports" />}
      {route?.id === 'AL1' && <AuditLogPage accessToken={session.accessToken} selectedBranch={selectedBranch} />}
      {(route?.view === 'calendar' || route?.id === 'HC1') && <CalendarPage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} />}
      {route?.view === 'timetable' && <Suspense fallback={<PageSkeleton name="timetable-route" label="Loading timetable" variant="form" />}><TimetablePage mode={route.id === 'TTG1' ? 'generate' : 'view'} accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} onNavigate={navigateWithBranch} /></Suspense>}
      {route?.id === 'AY1' && <AcademicStructurePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} initialTab="years" pageTitle="Academic Years" pageDescription="Define academic years, current-year status, and the dates that govern your institute." showTabs={false} />}
      {route?.id === 'CL1' && <AcademicStructurePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} initialTab="classes" pageTitle="Classes & Sections" pageDescription="Organise grade levels, branch sections, teachers, and class capacity." showTabs={false} />}
      {route?.id === 'SU1' && <AcademicStructurePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} initialTab="subjects" pageTitle="Subjects & Curriculum" pageDescription="Manage your subject catalogue and map curriculum to each class." showTabs={false} />}
      {route?.id === 'AH1' && <AcademicOverviewPage accessToken={session.accessToken} selectedBranch={selectedBranch} onNavigate={handleNavigate} />}
      {route?.id === 'AHS1' && <AcademicStructurePage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} pageTitle="Academic Structure" pageDescription="Maintain the academic year, class, section, subject, and curriculum relationships that power the rest of CampusOne." showTabs />}
      {route?.view === 'academic-operations' && <AcademicOperationsPage key={route.id} page={route.id as 'ACL1' | 'ACH1' | 'ACE1' | 'ACM1' | 'ACC1' | 'AHT1' | 'AAR1'} accessToken={session.accessToken} selectedBranch={selectedBranch} />}
      {route?.id === 'RF1' && <RoomsFacilitiesPage accessToken={session.accessToken} branches={visibleBranches} selectedBranch={selectedBranch} />}
      {route?.id === 'RP1' && <RolesListPage accessToken={session.accessToken} branches={visibleBranches} users={assignableUsers} onCreateRole={() => navigateWithBranch('/roles/builder')} onEditRole={(roleId) => navigateWithBranch(`/roles/builder?role=${roleId}`)} />}
      {route?.id === 'RP2' && <RoleBuilderPage accessToken={session.accessToken} branches={visibleBranches} roleId={searchParams.get('role') ?? undefined} onSaved={() => navigateWithBranch('/roles')} onCancel={() => navigateWithBranch('/roles')} />}
      {route?.id === 'RP3' && <RoleAssignmentsPage accessToken={session.accessToken} branches={visibleBranches} users={assignableUsers} />}
      {route?.view === 'coming-soon' && <UnavailableModulePage title={route.label} breadcrumb={route.breadcrumb} comingSoon />}
      {route?.view === 'operational' && !['AY1', 'CL1', 'SU1', 'AHS1', 'RF1', 'HC1', 'FN1', 'FN5', 'FN6', 'FN7', 'FN8', 'SE3', 'RP1', 'RP2', 'RP3', 'BR2', 'STP1', 'SDP1', 'PDP1', 'ST3', 'RA1', 'AT1', 'AT2', 'AT4', 'AT5', 'AT6', 'AT7', 'AL1'].includes(route.id) && <OperationalListPage accessToken={session.accessToken} route={route} selectedBranch={selectedBranch} />}
      {!route && <UnavailableModulePage title="Page not found" breadcrumb="Admin" />}
      </AdminErrorBoundary>
      <div className="sr-only" role="status" aria-live="polite">{announcement}</div>
    </AppShell>
  )
}
