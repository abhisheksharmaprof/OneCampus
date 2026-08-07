import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Edit2, Eye, Filter, Plus, Search, Trash2 } from 'lucide-react'
import { Card, SectionHeader } from '../../components/ui/primitives'
import { DataTable, Modal, type DataTableColumn, type TableSort } from '../../components/admin-ui'
import { adminRequest, type PageData } from '../admin/admin.api'
import { listAllRoles } from '../access-control/access-control.api'
import type { Role } from '../access-control/types'

type Branch = { id: string; name: string }
type StaffSummary = { totalStaff: number; teachers: number; onLeaveToday: number; avgAttendance: number | null; activeStaff: number }
type Staff = {
  id: string
  fullName: string
  email: string
  phone: string
  employee_code: string
  branch: Branch | null
  role: string
  status: string
  department: string
  subjects: string[]
  weeklyLoad: number
  attendancePct: number | null
  profilePhotoUrl?: string | null
  timetableSynced?: boolean | null
}
type StaffPageData = PageData<Staff> & { summary?: StaffSummary }

const emptyPage = <T,>(): PageData<T> => ({ count: 0, page: 1, pageSize: 0, totalPages: 1, next: null, previous: null, items: [] })
const days = [['MON', 'Monday'], ['TUE', 'Tuesday'], ['WED', 'Wednesday'], ['THU', 'Thursday'], ['FRI', 'Friday'], ['SAT', 'Saturday'], ['SUN', 'Sunday']] as const
const teachingPeriods = [1, 2, 3, 4, 5, 6, 7, 8]

function humanize(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

function staffTone(status: string) {
  if (status === 'PENDING_INVITE') return 'tone-warning'
  if (status === 'ACTIVE') return 'tone-success'
  return 'tone-danger'
}

function attendanceTone(value: number | null | undefined) {
  if (value === null || value === undefined) return 'tone-info'
  if (value >= 90) return 'tone-success'
  if (value >= 75) return 'tone-warning'
  return 'tone-danger'
}

export function StaffPage({ accessToken, branches, selectedBranch }: { accessToken: string; branches: Branch[]; selectedBranch: string }) {
  const navigate = useNavigate()
  const nameInputRef = useRef<HTMLInputElement>(null)
  const [data, setData] = useState<StaffPageData>(emptyPage())
  const [loadedQuery, setLoadedQuery] = useState('')
  const [listError, setListError] = useState('')
  const [actionError, setActionError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const [sort, setSort] = useState<TableSort>({ columnId: 'name', direction: 'asc' })
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [staffRoles, setStaffRoles] = useState<Role[]>([])
  const [newStaffRole, setNewStaffRole] = useState('TEACHER')
  const [employmentType, setEmploymentType] = useState<'FULL_TIME' | 'PART_TIME'>('FULL_TIME')
  const [workingDays, setWorkingDays] = useState<string[]>(days.slice(0, 6).map(([value]) => value))
  const [maxPeriodsPerDay, setMaxPeriodsPerDay] = useState(6)
  const [maxPeriodsPerWeek, setMaxPeriodsPerWeek] = useState(42)
  const [availablePeriods, setAvailablePeriods] = useState(teachingPeriods)
  const [availabilityPreset, setAvailabilityPreset] = useState<'full' | 'before' | 'after' | null>(null)
  const [branchId, setBranchId] = useState(selectedBranch === 'all' ? '' : selectedBranch)
  const [departmentValue, setDepartmentValue] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    void listAllRoles(accessToken, { signal: controller.signal })
      .then((roles) => setStaffRoles(roles.filter((role) => role.isActive && (!role.isSystemRole || ['TEACHER', 'STAFF'].includes(role.name.toUpperCase())))))
      .catch(() => { if (!controller.signal.aborted) setStaffRoles([]) })
    return () => controller.abort()
  }, [accessToken])

  const queryKey = [accessToken, selectedBranch, page, pageSize, search.trim(), sort.columnId, sort.direction, roleFilter, statusFilter, departmentFilter, revision].join('|')

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sortBy: sort.columnId, sortDirection: sort.direction })
    if (selectedBranch !== 'all') params.set('branchId', selectedBranch)
    if (search.trim()) params.set('search', search.trim())
    if (roleFilter) params.set('role', roleFilter)
    if (statusFilter) params.set('status', statusFilter)
    if (departmentFilter) params.set('department', departmentFilter)
    void adminRequest<StaffPageData>(accessToken, `staff?${params}`, { signal: controller.signal })
      .then((response) => {
        // Keep empty/legacy API payloads renderable while the directory loads.
        setData({
          ...emptyPage<Staff>(),
          ...response,
          items: Array.isArray(response.items)
            ? response.items.map((person) => ({ ...person, subjects: Array.isArray(person.subjects) ? person.subjects : [] }))
            : [],
        })
        setListError('')
        setLoadedQuery(queryKey)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setListError(cause instanceof Error ? cause.message : 'Staff could not be loaded.')
          setLoadedQuery(queryKey)
        }
      })
    return () => controller.abort()
  }, [accessToken, page, pageSize, queryKey, roleFilter, search, selectedBranch, statusFilter, departmentFilter, sort.columnId, sort.direction])

  const openAddStaff = () => {
    setActionError('')
    setNewStaffRole('TEACHER')
    setEmploymentType('FULL_TIME')
    setWorkingDays(days.slice(0, 6).map(([value]) => value))
    setMaxPeriodsPerDay(6)
    setMaxPeriodsPerWeek(42)
    setAvailablePeriods(teachingPeriods)
    setAvailabilityPreset(null)
    setBranchId(selectedBranch === 'all' ? branches[0]?.id ?? '' : selectedBranch)
    setDepartmentValue('')
    setShowForm(true)
    queueMicrotask(() => nameInputRef.current?.focus())
  }

  const closeAddStaff = () => {
    if (saving) return
    setShowForm(false)
  }

  const updateDay = (value: string, checked: boolean) => {
    const next = checked ? [...workingDays, value] : workingDays.filter((day) => day !== value)
    setWorkingDays(next)
    setMaxPeriodsPerWeek(Math.max(1, next.length * maxPeriodsPerDay))
  }

  const updatePeriodsPerDay = (value: number) => {
    setMaxPeriodsPerDay(value)
    setMaxPeriodsPerWeek(value > 0 ? workingDays.length * value : 0)
  }

  const applyAvailabilityPreset = (preset: 'full' | 'before' | 'after') => {
    setAvailabilityPreset(preset)
    setAvailablePeriods(preset === 'before' ? [1, 2, 3, 4] : preset === 'after' ? [5, 6, 7, 8] : teachingPeriods)
  }

  const addStaff = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSaving(true)
    setActionError('')
    try {
      const selectedRole = staffRoles.find((item) => (item.isSystemRole ? item.name.toUpperCase() : `CUSTOM:${item.id}`) === newStaffRole)
      const role = selectedRole?.isSystemRole ? selectedRole.name.toUpperCase() : newStaffRole.startsWith('CUSTOM:') ? 'STAFF' : newStaffRole
      await adminRequest<Staff>(accessToken, 'staff', {
        method: 'POST',
        body: JSON.stringify({
          fullName: form.get('fullName'),
          email: form.get('email'),
          phone: form.get('phone'),
          branchId: form.get('branchId') || branchId,
          role,
          ...(selectedRole && !selectedRole.isSystemRole ? { roleId: selectedRole.id } : {}),
          department: form.get('department'),
          ...(role === 'TEACHER'
            ? {
                employmentType: form.get('employmentType'),
                availableDays: form.getAll('availableDays'),
                availablePeriods,
                maxPeriodsPerDay: Number(form.get('maxPeriodsPerDay')),
                maxPeriodsPerWeek: Number(form.get('maxPeriodsPerWeek')),
              }
            : {}),
        }),
      })
      setShowForm(false)
      setPage(1)
      setRevision((value) => value + 1)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Staff account could not be created.')
    } finally {
      setSaving(false)
    }
  }

  const queryLoaded = loadedQuery === queryKey
  const departments = useMemo(
    () => [...new Set(data.items.map((item) => item.department).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [data.items],
  )
  const summary = data.summary ?? {
    totalStaff: queryLoaded ? data.count : 0,
    teachers: data.items.filter((item) => item.role === 'TEACHER').length,
    onLeaveToday: 0,
    avgAttendance: null,
    activeStaff: data.items.filter((item) => item.status === 'ACTIVE').length,
  }
  const selectedStaffRole = staffRoles.find((item) => (item.isSystemRole ? item.name.toUpperCase() : `CUSTOM:${item.id}`) === newStaffRole)
  const newStaffMembershipRole = selectedStaffRole?.isSystemRole ? selectedStaffRole.name.toUpperCase() : newStaffRole.startsWith('CUSTOM:') ? 'STAFF' : newStaffRole

  const deleteStaff = async (staffId: string, staffName: string) => {
    if (!window.confirm(`Delete ${staffName || 'this staff member'}? Their access to this institute will be deactivated.`)) return
    try {
      await adminRequest(accessToken, `staff/${staffId}`, { method: 'DELETE' })
      setRevision((value) => value + 1)
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'The staff member could not be deleted.')
    }
  }

  const columns: DataTableColumn<Staff>[] = [
    {
      id: 'name',
      header: 'Staff member',
      sortable: true,
      cell: (person) => (
        <span className="staff-person-cell">
          <span className="avatar avatar-sm staff-avatar">
            {person.profilePhotoUrl
              ? <img src={person.profilePhotoUrl} alt="" />
              : initials(person.fullName)}
          </span>
          <span className="staff-person-copy">
            <strong>{person.fullName}</strong>
            <small>{person.email}</small>
          </span>
        </span>
      ),
    },
    {
      id: 'employee_code',
      header: 'Emp ID',
      sortable: true,
      cell: (person) => person.employee_code || '—',
    },
    {
      id: 'role',
      header: 'Role',
      sortable: true,
      cell: (person) => <span><span className="status-badge tone-info">{humanize(person.role)}</span><small>{person.branch?.name ?? 'Institute-wide'}</small></span>,
    },
    {
      id: 'department',
      header: 'Department',
      sortable: true,
      cell: (person) => person.department || '—',
    },
    {
      id: 'subjects',
      header: 'Subjects',
      cell: (person) => (
        <span className="staff-chip-list">
          {person.subjects.length ? person.subjects.slice(0, 3).map((subject) => <span className="staff-chip" key={subject}>{subject}</span>) : '—'}
        </span>
      ),
    },
    {
      id: 'weeklyLoad',
      header: 'Weekly load',
      sortable: true,
      cell: (person) => <span className="status-badge tone-success">{person.weeklyLoad ? `${person.weeklyLoad}p/wk` : '0p/wk'}</span>,
    },
    {
      id: 'attendancePct',
      header: 'Attendance',
      sortable: true,
      cell: (person) => (
        <span className="staff-attendance-cell">
          <span className={`status-badge ${attendanceTone(person.attendancePct)}`}>{person.attendancePct === null || person.attendancePct === undefined ? '—' : `${person.attendancePct}%`}</span>
          <span className="progress"><span className="progress-bar" style={{ width: `${person.attendancePct ?? 0}%` }} /></span>
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      sortable: true,
      cell: (person) => <span className={`status-badge ${staffTone(person.status)}`}>{humanize(person.status)}</span>,
    },
    {
      id: 'timetableSynced',
      header: 'Timetable',
      cell: (person) => {
        if (person.role !== 'TEACHER') return '—'
        if (person.timetableSynced === undefined || person.timetableSynced === null) return <span className="status-badge tone-info">No published</span>
        return person.timetableSynced
          ? <span className="status-badge tone-success">Synced</span>
          : <span className="status-badge tone-warning">Not synced</span>
      },
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'end',
      cell: (person) => (
        <span className="table-actions" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="button-secondary btn-sm" title="View staff profile" onClick={() => navigate(`/staff/profile?staff=${person.id}`)}>
            <Eye size={14} /> View
          </button>
          <button type="button" className="button-secondary btn-sm" title="Edit staff profile" onClick={() => navigate(`/staff/profile?staff=${person.id}&edit=1`)}>
            <Edit2 size={14} /> Edit
          </button>
          <button type="button" className="button-secondary btn-sm danger-text" title="Delete staff member" onClick={() => void deleteStaff(person.id, person.fullName)}>
            <Trash2 size={14} /> Delete
          </button>
        </span>
      ),
    },
  ]

  const activeFilters = [
    search.trim() ? { id: 'search', label: 'Search', value: search.trim(), onRemove: () => setSearch('') } : null,
    roleFilter ? { id: 'role', label: 'Role', value: humanize(roleFilter), onRemove: () => setRoleFilter('') } : null,
    statusFilter ? { id: 'status', label: 'Status', value: humanize(statusFilter), onRemove: () => setStatusFilter('') } : null,
    departmentFilter ? { id: 'department', label: 'Department', value: departmentFilter, onRemove: () => setDepartmentFilter('') } : null,
  ].filter(Boolean) as Array<{ id: string; label: string; value: string; onRemove: () => void }>

  return (
    <div className="entity-page staff-page">
      <div className="page-heading staff-page-heading">
        <div>
          <p className="breadcrumb">People / Staff</p>
          <h1>Staff</h1>
          <p className="section-caption">Directory, analytics, filters, and assignments for the teaching team. Click a row for Profile &amp; Uploads.</p>
        </div>
        <button className="button-primary" type="button" onClick={openAddStaff}><Plus size={16} />Add Staff</button>
      </div>

      {actionError && <div className="inline-error" role="alert">{actionError}</div>}

      <div className="staff-kpi-grid">
        <Card className="staff-kpi-card">
          <span className="micro-label">Total staff</span>
          <strong>{summary.totalStaff}</strong>
          <small>{summary.activeStaff} active</small>
        </Card>
        <Card className="staff-kpi-card">
          <span className="micro-label">Teachers</span>
          <strong>{summary.teachers}</strong>
          <small>Teaching faculty</small>
        </Card>
        <Card className="staff-kpi-card">
          <span className="micro-label">On leave today</span>
          <strong>{summary.onLeaveToday}</strong>
          <small>Approved staff leave</small>
        </Card>
        <Card className="staff-kpi-card">
          <span className="micro-label">Avg attendance</span>
          <strong>{summary.avgAttendance === null || summary.avgAttendance === undefined ? '—' : `${summary.avgAttendance}%`}</strong>
          <small>Current month</small>
        </Card>
      </div>

      <Card className="entity-table-card staff-directory-card">
        <SectionHeader
          title={`Staff members (${queryLoaded ? data.count : 0})`}
          action={<span className="section-caption"><Filter size={14} /> Use filters and sortable columns to narrow the directory.</span>}
        />
        <DataTable
          caption="Staff members"
          columns={columns}
          rows={queryLoaded ? data.items : []}
          getRowId={(person) => person.id}
          onRowClick={(person) => navigate(`/staff/profile?staff=${person.id}`)}
          sort={sort}
          onSortChange={(next) => { setSort(next); setPage(1) }}
          filters={(
            <div className="staff-filters">
              <label className="search-control">
                <Search aria-hidden="true" />
                <span className="sr-only">Search staff</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1) }}
                  placeholder="Search by name or Emp ID..."
                />
              </label>
              <select aria-label="Filter by role" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}>
                <option value="">All roles</option>
                {(staffRoles.length ? staffRoles : [{ id: 'fallback-teacher', name: 'Teacher', isSystemRole: true }, { id: 'fallback-staff', name: 'Staff', isSystemRole: true }] as Role[]).map((role) => (
                  <option key={role.id} value={role.isSystemRole ? role.name.toUpperCase() : role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              <select aria-label="Filter by department" value={departmentFilter} onChange={(event) => { setDepartmentFilter(event.target.value); setPage(1) }}>
                <option value="">All departments</option>
                {departments.map((department) => <option value={department} key={department}>{department}</option>)}
              </select>
              <select aria-label="Filter by status" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}>
                <option value="">All statuses</option>
                <option value="PENDING_INVITE">Pending invite</option>
                <option value="ACTIVE">Active</option>
                <option value="DEACTIVATED">Deactivated</option>
              </select>
            </div>
          )}
          activeFilters={activeFilters}
          toolbarActions={(
            <div className="staff-toolbar-actions">
              <button className="button-secondary btn-sm" type="button" onClick={() => window.print()}>Export</button>
            </div>
          )}
          totalRows={queryLoaded ? data.count : 0}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(value) => { setPageSize(value); setPage(1) }}
          loading={!queryLoaded}
          error={queryLoaded && listError ? listError : undefined}
          onRetry={() => setRevision((value) => value + 1)}
          emptyTitle={search ? 'No staff found' : 'No staff members yet'}
          emptyDescription={search ? 'Try a different search or clear the filters.' : 'Use Add Staff to create the first staff account.'}
        />
      </Card>

      <Modal
        open={showForm}
        title="Add Staff"
        description="Create a new staff account and capture the key profile details at once."
        onClose={() => closeAddStaff()}
        size="large"
        closeLabel="Close add staff dialog"
        initialFocusRef={nameInputRef}
        footer={(
          <>
            <button className="button-secondary" type="button" onClick={closeAddStaff} disabled={saving}>Cancel</button>
            <button className="button-primary" form="add-staff-form" type="submit" disabled={saving}>{saving ? 'Adding…' : 'Add Staff Member'}</button>
          </>
        )}
      >
        <form id="add-staff-form" className="staff-modal-form" onSubmit={addStaff}>
          {actionError && <div className="inline-error" role="alert">{actionError}</div>}
          <div className="quick-add-grid">
            <label>Full name *<input ref={nameInputRef} name="fullName" required maxLength={200} autoComplete="name" /></label>
            <label>Work email *<input name="email" type="email" required autoComplete="email" /></label>
            <label>Mobile number<input name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="e.g. +91 98765 43210" /></label>
            <input type="hidden" name="branchId" value={branchId} />
            <label>Role *<select name="role" value={newStaffRole} onChange={(event) => setNewStaffRole(event.target.value)}>{(staffRoles.length ? staffRoles : [{ id: 'fallback-teacher', name: 'Teacher', isSystemRole: true }, { id: 'fallback-staff', name: 'Staff', isSystemRole: true }] as Role[]).map((roleOption) => <option key={roleOption.id} value={roleOption.isSystemRole ? roleOption.name.toUpperCase() : `CUSTOM:${roleOption.id}`}>{roleOption.name}</option>)}</select></label>
            <label>Department<input name="department" value={departmentValue} onChange={(event) => setDepartmentValue(event.target.value)} placeholder="Administration, Science..." /></label>
          </div>

          {newStaffMembershipRole === 'TEACHER' && (
            <fieldset className="staff-edit-days">
              <legend>Scheduling</legend>
              <div className="quick-add-grid">
                <label>Employment type<select name="employmentType" value={employmentType} onChange={(event) => { const value = event.target.value as 'FULL_TIME' | 'PART_TIME'; setEmploymentType(value); if (value === 'PART_TIME') setAvailabilityPreset(null) }}><option value="FULL_TIME">Full-time</option><option value="PART_TIME">Part-time</option></select></label>
                <label>Max periods / day<input aria-label="Maximum periods per day" name="maxPeriodsPerDay" type="number" min={1} step={1} value={maxPeriodsPerDay} onChange={(event) => updatePeriodsPerDay(Number(event.target.value) || 0)} required /></label>
                <label>Max periods / week<input aria-label="Maximum periods per week" name="maxPeriodsPerWeek" type="number" min={1} step={1} value={maxPeriodsPerWeek} onChange={(event) => setMaxPeriodsPerWeek(Number(event.target.value) || 0)} required /></label>
              </div>
              <div className="staff-modal-block" role="group" aria-label="Available working days">
                <div className="section-caption">Available working days</div>
                <div className="staff-day-chips">
                  {days.map(([value, label]) => (
                    <label className="staff-day-chip" key={value}>
                      <input name="availableDays" type="checkbox" value={value} checked={workingDays.includes(value)} onChange={(event) => updateDay(value, event.target.checked)} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="staff-modal-block">
                <div className="section-caption">Available periods</div>
                <div className="staff-day-chips">
                  {[1, 2, 3, 4, 5, 6, 7, 8].map((period) => (
                    <label className={`staff-preset${availablePeriods.includes(period) ? ' is-selected' : ''}`} key={period}>
                      <input
                        type="checkbox"
                        checked={availablePeriods.includes(period)}
                        onChange={(event) => {
                          setAvailablePeriods((curr) => (event.target.checked ? [...curr, period] : curr.filter((value) => value !== period)))
                        }}
                      />
                      P{period}
                    </label>
                  ))}
                </div>
                {employmentType === 'PART_TIME' && (
                  <div className="staff-preset-row">
                    <button type="button" aria-pressed={availabilityPreset === 'full'} className={`staff-preset${availabilityPreset === 'full' ? ' is-selected' : ''}`} onClick={() => applyAvailabilityPreset('full')}>Full-time</button>
                    <button type="button" aria-pressed={availabilityPreset === 'before'} className={`staff-preset${availabilityPreset === 'before' ? ' is-selected' : ''}`} onClick={() => applyAvailabilityPreset('before')}>Before lunch only</button>
                    <button type="button" aria-pressed={availabilityPreset === 'after'} className={`staff-preset${availabilityPreset === 'after' ? ' is-selected' : ''}`} onClick={() => applyAvailabilityPreset('after')}>After lunch only</button>
                  </div>
                )}
              </div>
            </fieldset>
          )}
        </form>
      </Modal>
    </div>
  )
}
