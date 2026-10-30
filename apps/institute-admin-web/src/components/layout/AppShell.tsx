import { useEffect, useMemo, useRef, useState, type PropsWithChildren } from 'react'
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  FileSearch,
  Gamepad2,
  GraduationCap,
  LayoutDashboard,
  LockKeyhole,
  Menu,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Package,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import { adminNavigation, type NavigationIcon } from '../../adminNavigation'
import { IconButton } from '../ui/primitives'

export type BranchContext = 'all' | string
export type BranchOption = { id: string; name: string }

const navigationIcons: Record<NavigationIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  institute: Building2,
  roles: ShieldCheck,
  people: Users,
  admissions: ClipboardList,
  attendance: CheckSquare,
  academics: BookOpen,
  communication: Bell,
  fees: CircleDollarSign,
  calendar: CalendarDays,
  gamification: Gamepad2,
  network: Network,
  reports: BarChart3,
  audit: FileSearch,
  compliance: ShieldCheck,
  subscription: Settings,
  addons: Package,
}

const globalSearchLinks = [
  { label: 'Students', destination: 'Students', description: 'Search the student directory' },
  { label: 'Staff', destination: 'Staff', description: 'Search the staff directory' },
  { label: 'Roles', destination: 'Role Builder', description: 'Manage institute access roles' },
  { label: 'Circulars', destination: 'Circulars', description: 'Review announcements' },
]

export function AppShell({ children, branch, branches, activePage, academicYear, academicYears = [], currentAcademicYear, onAcademicYearChange, onBranchChange, onNavigate, onSignOut, isBranchAdmin = false, canViewAllBranches = false, canViewAudit = false, examOnly = false }: PropsWithChildren<{
  branch: BranchContext
  branches: BranchOption[]
  activePage: string
  academicYear: string
  academicYears?: readonly { id: string; name: string; isCurrent: boolean }[]
  currentAcademicYear?: string
  onAcademicYearChange: (year: string) => void
  onBranchChange: (branch: BranchContext) => void
  onNavigate: (page: string) => void
  onSignOut: () => Promise<void>
  isBranchAdmin?: boolean
  canViewAllBranches?: boolean
  canViewAudit?: boolean
  examOnly?: boolean
}>) {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('campusone.sidebar.collapsed') === 'true')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [expandedGroup, setExpandedGroup] = useState<string | null>(() => adminNavigation.find((item) => item.children?.some((child) => child.label === activePage))?.label ?? null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const globalSearchRef = useRef<HTMLLabelElement>(null)
  const navigationItems = useMemo(
    () => examOnly
      ? adminNavigation.filter((item) => item.children?.some((child) => ['AAR1', 'AAR2'].includes(child.id))).map((item) => ({ ...item, children: item.children?.filter((child) => ['AAR1', 'AAR2'].includes(child.id)) }))
      : canViewAllBranches && canViewAudit
      ? adminNavigation
      : adminNavigation.map((item) => item.children
        ? { ...item, children: item.children.filter((child) => (canViewAllBranches || child.id !== 'BR1') && (canViewAudit || child.id !== 'AL1')) }
        : item).filter((item) => !item.children || item.children.length > 0),
    [canViewAllBranches, canViewAudit, examOnly],
  )


  useEffect(() => {
    localStorage.setItem('campusone.sidebar.collapsed', String(collapsed))
  }, [collapsed])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key === '/' && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) {
        event.preventDefault()
        document.querySelector<HTMLInputElement>('#app-global-search')?.focus()
      }
      if (event.key === 'Escape') { setSearchOpen(false); setProfileOpen(false) }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  useEffect(() => {
    const closePopovers = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (!profileMenuRef.current?.contains(target)) setProfileOpen(false)
      if (!globalSearchRef.current?.contains(target)) setSearchOpen(false)
    }
    document.addEventListener('pointerdown', closePopovers)
    return () => document.removeEventListener('pointerdown', closePopovers)
  }, [])

  const navigateTo = (label: string) => {
    const destinationGroup = navigationItems.find((item) => item.children?.some((child) => child.label === label))
    if (destinationGroup) setExpandedGroup(destinationGroup.label)
    onNavigate(label)
    setMobileOpen(false)
  }

  const instituteContext = useMemo(
    () => branches.find((item) => item.id === branch)?.name ?? 'Selected Branch',
    [branch, branches],
  )
  const currentYearName = currentAcademicYear ?? academicYears.find((year) => year.isCurrent)?.name ?? '2026-27'
  const historical = academicYear !== currentYearName

  return (
    <div className="app-shell" data-sidebar-collapsed={collapsed}>
      <header className="topbar" role="banner">
        <IconButton label={mobileOpen ? 'Close navigation' : 'Open navigation'} onClick={() => setMobileOpen((value) => !value)}>
          {mobileOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </IconButton>
        <div className="desktop-sidebar-toggle">
          <IconButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((value) => !value)}
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          </IconButton>
        </div>

        <div className="topbar-context">
          {!examOnly && <>
          <label className="select-control branch-control">
            <span className="sr-only">Branch context</span>
            <Building2 aria-hidden="true" />
              <select
                aria-label="Branch context"
                value={branch}
                disabled={isBranchAdmin}
                onChange={(event) => onBranchChange(event.target.value as BranchContext)}
              >
              {branches.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>

          <label className="select-control year-control">
            <span className="sr-only">Academic year</span>
            <select aria-label="Academic year" value={academicYear} onChange={(event) => onAcademicYearChange(event.target.value)}>
              {(academicYears.length ? academicYears : [{ id: '2026-27', name: '2026-27', isCurrent: true }, { id: '2025-26', name: '2025-26', isCurrent: false }, { id: '2024-25', name: '2024-25', isCurrent: false }]).map((year) => <option value={year.name} key={year.id}>AY {year.name}</option>)}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          </>}
        </div>

        {!examOnly && <label className="global-search" ref={globalSearchRef}>
          <Search aria-hidden="true" />
          <span className="sr-only">Global search</span>
          <input id="app-global-search" type="search" value={searchQuery} placeholder="Search students, staff, roles…" aria-label="Global search" aria-expanded={searchOpen} aria-controls="global-search-results" aria-haspopup="dialog" onFocus={() => setSearchOpen(true)} onChange={(event) => { setSearchQuery(event.target.value); setSearchOpen(true) }} />
          <kbd>/</kbd>
          {searchOpen && <div id="global-search-results" className="global-search-results" role="dialog" aria-label="Global search results">
            <p className="search-results-title">{searchQuery ? 'Quick links' : 'Recent destinations'}</p>
            {globalSearchLinks.filter((item) => !searchQuery || `${item.label} ${item.destination} ${item.description}`.toLowerCase().includes(searchQuery.trim().toLowerCase())).map((item) => <button type="button" key={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => { navigateTo(item.destination); setSearchOpen(false); setSearchQuery('') }}><span className="search-result-icon" aria-hidden="true">{item.label.slice(0, 1)}</span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}
            {searchQuery && !globalSearchLinks.some((item) => `${item.label} ${item.destination} ${item.description}`.toLowerCase().includes(searchQuery.trim().toLowerCase())) && <p className="search-results-empty">No quick links match. Try another search.</p>}
          </div>}
        </label>}

        <div className="topbar-actions">
          {!examOnly && <>
          <IconButton label="Pending approvals" onClick={() => navigateTo('Award Approvals')}>
            <CheckSquare aria-hidden="true" />
            <span className="notification-count">11</span>
          </IconButton>
          <IconButton label="Notifications" onClick={() => navigateTo('Notifications')}>
            <Bell aria-hidden="true" />
            <span className="notification-dot" />
          </IconButton>
          </>}
          <div className="profile-menu" ref={profileMenuRef}>
            <button type="button" className="profile-trigger" aria-label="Open profile menu" aria-expanded={profileOpen} onClick={() => setProfileOpen((value) => !value)}>
              <span>AM</span>
              <ChevronDown aria-hidden="true" />
            </button>
            {profileOpen && <div className="profile-menu-popover" role="menu">
              <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); navigateTo('My Account') }}>My Profile</button>
              {!examOnly && <>
              <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); navigateTo('Branding & Profile') }}>Institute Settings</button>
              <button type="button" role="menuitem" onClick={() => { setProfileOpen(false); navigateTo('Help & Support') }}>Help & support</button>
              </>}
              <button type="button" role="menuitem" disabled={signingOut} onClick={() => {
                setSigningOut(true)
                void onSignOut().finally(() => setSigningOut(false))
              }}>{signingOut ? 'Signing out…' : 'Sign out'}</button>
            </div>}
          </div>
        </div>
      </header>

      <div className={`mobile-scrim ${mobileOpen ? 'is-visible' : ''}`} onClick={() => setMobileOpen(false)} aria-hidden="true" />
      <nav
        className={`sidebar ${mobileOpen ? 'is-mobile-open' : ''}`}
        aria-label="Primary navigation"
        data-collapsed={collapsed}
      >
        <div className="sidebar-header">
          <button type="button" className="brand" aria-label="Go to Dashboard" onClick={() => navigateTo('Dashboard')}>
            <span className="brand-mark" aria-hidden="true"><GraduationCap /></span>
            <span className="brand-name">CampusOne</span>
          </button>
        </div>
        <div className="sidebar-scroll">
          {navigationItems.map((item) => {
            const Icon = navigationIcons[item.icon]
            const active = activePage === item.label || item.children?.some((child) => child.label === activePage)
            const expanded = expandedGroup === item.label
            return (
              <div className="nav-group" key={item.label}>
                <button
                  type="button"
                  className={`nav-item ${active ? 'is-active' : ''}`}
                  title={item.comingSoon ? `${item.label} — Coming soon` : collapsed ? item.label : undefined}
                  aria-current={active ? 'page' : undefined}
                  aria-expanded={item.children && !item.comingSoon ? expanded : undefined}
                  aria-disabled={item.comingSoon || undefined}
                  data-coming-soon={item.comingSoon || undefined}
                  onClick={() => {
                    if (item.comingSoon) return
                    if (item.children) setExpandedGroup(expanded ? null : item.label)
                    else if (item.route) navigateTo(item.route.label)
                  }}
                >
                  <Icon aria-hidden="true" />
                  <span className="nav-label">{item.label}</span>
                  {item.comingSoon
                    ? <LockKeyhole className="nav-lock" aria-hidden="true" />
                    : item.children && <ChevronRight className={`nav-chevron ${expanded ? 'is-expanded' : ''}`} aria-hidden="true" />}
                </button>
                {item.children && expanded && !collapsed && (
                  <div className="nav-children">
                    {item.children.map((child) => <button type="button" className={activePage === child.label ? 'is-active' : undefined} aria-current={activePage === child.label ? 'page' : undefined} key={child.path} onClick={() => navigateTo(child.label)}>{child.label}</button>)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="sidebar-footer">
          <span>CampusOne Admin</span>
          <span>v0.1.0</span>
        </div>
      </nav>

      <main className="main-content">
        {historical && !examOnly && <div className="historical-banner" role="status">Viewing {academicYear} historical data. Some records may remain editable when your role allows it.<button type="button" onClick={() => onAcademicYearChange(currentYearName)}>Return to current year ({currentYearName})</button></div>}
        <div className="content-container" data-branch={instituteContext}>{children}</div>
      </main>
    </div>
  )
}
