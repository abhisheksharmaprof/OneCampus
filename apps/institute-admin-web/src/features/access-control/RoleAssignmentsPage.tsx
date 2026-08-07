import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Clock, Plus, ShieldCheck } from 'lucide-react'
import { ConfirmationDialog, DataTable, ErrorSummary, FormField, Modal, PageHeader, type DataTableColumn, type FormError } from '../../components/admin-ui'
import { AdminApiError, createAssignment, listAllAssignments, listAllRoles, revokeAssignment } from './access-control.api'
import { AccessControlError } from './AccessControlError'
import { apiErrorMessage, firstFieldError, fromDateTimeLocal, roleScope, shortId, useDebouncedValue } from './access-control.utils'
import type { AssignableUser, BranchOption, Role, RoleAssignment } from './types'
import './access-control.css'

export interface RoleAssignmentsPageProps {
  accessToken: string
  branches: readonly BranchOption[]
  users?: readonly AssignableUser[]
  initialRoleId?: string
  embedded?: boolean
}

function assignmentStatus(item: RoleAssignment) {
  if (!item.isActive || item.revokedAt) return 'Revoked'
  if (item.validUntil && new Date(item.validUntil) <= new Date()) return 'Expired'
  if (item.validFrom && new Date(item.validFrom) > new Date()) return 'Scheduled'
  return 'Active'
}

function expiringSoon(value: string | null) {
  if (!value) return false
  const difference = new Date(value).getTime() - Date.now()
  return difference > 0 && difference <= 7 * 24 * 60 * 60 * 1000
}

export function RoleAssignmentsPage({ accessToken, branches, users = [], initialRoleId = '', embedded = false }: RoleAssignmentsPageProps) {
  const [searchParams] = useSearchParams()
  const initialUserId = searchParams.get('user') ?? ''
  const [assignments, setAssignments] = useState<RoleAssignment[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [error, setError] = useState<AdminApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const [roleFilter, setRoleFilter] = useState(initialRoleId)
  const [branchFilter, setBranchFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [assignOpen, setAssignOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<AdminApiError | null>(null)
  const [userId, setUserId] = useState('')
  const [roleId, setRoleId] = useState(initialRoleId)
  const [assignmentBranchId, setAssignmentBranchId] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [revokeTarget, setRevokeTarget] = useState<RoleAssignment | null>(null)
  const [revoking, setRevoking] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    Promise.all([
      listAllAssignments(accessToken, { signal: controller.signal }),
      listAllRoles(accessToken, { signal: controller.signal }),
    ]).then(([assignmentItems, roleItems]) => {
      setAssignments(assignmentItems)
      if (initialUserId) {
        const selected = assignmentItems.find((item) => item.userId === initialUserId)
        if (selected) setSearch(selected.userName)
      }
      setRoles(roleItems.filter((role) => role.isActive))
      setError(null)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof AdminApiError ? cause : new AdminApiError('Role assignments could not be loaded.'))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, initialUserId, revision])

  const filtered = useMemo(() => assignments.filter((assignment) => {
    if (initialUserId && assignment.userId !== initialUserId) return false
    if (roleFilter && assignment.roleId !== roleFilter) return false
    if (branchFilter && assignment.branchId !== branchFilter) return false
    const status = assignmentStatus(assignment).toLowerCase()
    if (statusFilter && status !== statusFilter) return false
    return !debouncedSearch.trim() || assignment.userName.toLowerCase().includes(debouncedSearch.trim().toLowerCase())
  }), [assignments, branchFilter, debouncedSearch, initialUserId, roleFilter, statusFilter])
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize)

  const branchName = (id: string | null) => id ? branches.find((branch) => branch.id === id)?.name ?? `Branch ${shortId(id)}` : 'All branches'
  const columns: DataTableColumn<RoleAssignment>[] = [
    { id: 'user', header: 'User', cell: (item) => <div className="ac-primary-cell"><strong>{item.userName}</strong><small>{shortId(item.userId)}</small></div> },
    { id: 'role', header: 'Role', cell: (item) => <span className="ac-badge ac-badge--role">{item.roleName}</span> },
    { id: 'scope', header: 'Scope', cell: (item) => branchName(item.branchId) },
    { id: 'assignedBy', header: 'Assigned by', hideOnSmall: true, cell: (item) => item.assignedById ? shortId(item.assignedById) : 'Platform' },
    { id: 'validUntil', header: 'Valid until', cell: (item) => item.validUntil ? <span className={expiringSoon(item.validUntil) ? 'ac-expiring' : ''}>{expiringSoon(item.validUntil) ? <Clock aria-hidden="true" /> : null}{new Date(item.validUntil).toLocaleDateString()}</span> : 'Permanent' },
    { id: 'status', header: 'Status', cell: (item) => <span className={`ac-status ac-status--${assignmentStatus(item).toLowerCase()}`}>{assignmentStatus(item)}</span> },
    { id: 'actions', header: <span className="admin-sr-only">Actions</span>, align: 'end', cell: (item) => <button className="admin-button admin-button--secondary ac-compact-button" type="button" disabled={assignmentStatus(item) !== 'Active'} onClick={() => setRevokeTarget(item)}>Revoke</button> },
  ]

  const selectedRole = roles.find((role) => role.id === roleId)
  const fieldErrors: FormError[] = formError ? Object.entries(formError.fieldErrors).flatMap(([field, messages]) => messages.map((message) => ({ fieldId: `assignment-${field}`, label: field, message }))) : []

  const closeAssign = () => {
    if (saving) return
    setAssignOpen(false); setFormError(null); setUserId(''); setRoleId(initialRoleId); setAssignmentBranchId(''); setValidUntil('')
  }

  const submitAssignment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const localErrors: Record<string, string[]> = {}
    if (!userId) localErrors.userId = ['Select a user or enter a user ID.']
    if (!roleId) localErrors.roleId = ['Select a role.']
    if (Object.keys(localErrors).length) {
      setFormError(new AdminApiError('Complete the required fields.', { fieldErrors: localErrors }))
      return
    }
    setSaving(true); setFormError(null)
    try {
      await createAssignment(accessToken, {
        userId, roleId,
        branchId: selectedRole?.branchId ?? (assignmentBranchId || null),
        validUntil: fromDateTimeLocal(validUntil),
      })
      setAssignOpen(false); setUserId(''); setRoleId(initialRoleId); setAssignmentBranchId(''); setValidUntil(''); setRevision((value) => value + 1)
    } catch (cause) {
      setFormError(cause instanceof AdminApiError ? cause : new AdminApiError('The role could not be assigned.'))
    } finally { setSaving(false) }
  }

  const confirmRevoke = async () => {
    if (!revokeTarget) return
    setRevoking(true)
    try {
      await revokeAssignment(accessToken, revokeTarget.id)
      setRevokeTarget(null); setRevision((value) => value + 1)
    } catch (cause) {
      setError(cause instanceof AdminApiError ? cause : new AdminApiError('The assignment could not be revoked.'))
    } finally { setRevoking(false) }
  }

  return <div className={embedded ? 'ac-embedded' : 'entity-page ac-page'}>
    {!embedded ? <PageHeader title="Role Assignments" breadcrumbs={[{ label: 'Roles & Permissions' }, { label: 'Assignments' }]} description="Grant, review, and immediately revoke scoped access." actions={<button className="admin-button admin-button--primary" type="button" onClick={() => setAssignOpen(true)}><Plus aria-hidden="true" />Assign role</button>} /> : <div className="ac-section-heading"><div><h2>Role assignments</h2><p>Assignments for the selected role and scope.</p></div><button className="admin-button admin-button--primary" type="button" onClick={() => setAssignOpen(true)}><Plus aria-hidden="true" />Assign role</button></div>}
    <div className="ac-info-banner"><ShieldCheck aria-hidden="true" /><span>A user can hold more than one role at once; every assignment keeps its own scope and validity.</span></div>
    {error && !loading ? <AccessControlError error={error} onRetry={() => setRevision((value) => value + 1)} /> : null}
    <DataTable caption="Role assignments" columns={columns} rows={rows} getRowId={(item) => item.id} totalRows={filtered.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} loading={loading} filters={<>
      <label className="admin-sr-only" htmlFor="assignment-role-filter">Filter by role</label><select id="assignment-role-filter" value={roleFilter} onChange={(event) => { setRoleFilter(event.target.value); setPage(1) }}><option value="">All roles</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select>
      <label className="admin-sr-only" htmlFor="assignment-branch-filter">Filter by branch</label><select id="assignment-branch-filter" value={branchFilter} onChange={(event) => { setBranchFilter(event.target.value); setPage(1) }}><option value="">All scopes</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
      <label className="admin-sr-only" htmlFor="assignment-status-filter">Filter by status</label><select id="assignment-status-filter" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1) }}><option value="">All statuses</option><option value="active">Active</option><option value="scheduled">Scheduled</option><option value="expired">Expired</option><option value="revoked">Revoked</option></select>
      <label className="admin-sr-only" htmlFor="assignment-search">Search by user name</label><input id="assignment-search" type="search" placeholder="Search users…" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} />
    </>} emptyTitle="No matching assignments" emptyDescription="Change the filters or assign a role to an institute member." />

    <Modal open={assignOpen} title="Assign role" description="Access takes effect according to the selected validity window." onClose={closeAssign} footer={<><button className="admin-button admin-button--secondary" type="button" disabled={saving} onClick={closeAssign}>Cancel</button><button className="admin-button admin-button--primary" type="submit" form="role-assignment-form" disabled={saving}>{saving ? 'Assigning…' : 'Assign role'}</button></>}>
      <form id="role-assignment-form" className="admin-form-grid" onSubmit={submitAssignment} noValidate>
        {formError ? <><ErrorSummary errors={fieldErrors.length ? fieldErrors : [{ fieldId: 'assignment-userId', message: apiErrorMessage(formError) }]} />{formError.traceId ? <p className="ac-trace">Reference: {formError.traceId}</p> : null}</> : null}
        {users.length ? <FormField id="assignment-userId" label="User" required error={firstFieldError(formError, 'userId')} hint="Searchable by typing a name, email, or employee code in your browser's select."><select value={userId} onChange={(event) => setUserId(event.target.value)}><option value="">Select a user</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}{user.employeeCode ? ` · ${user.employeeCode}` : user.email ? ` · ${user.email}` : ''}</option>)}</select></FormField> : <FormField id="assignment-userId" label="User ID" required error={firstFieldError(formError, 'userId')} hint="Enter the identity user UUID. The current staff endpoint exposes profile IDs, not assignment-compatible user IDs."><input value={userId} onChange={(event) => setUserId(event.target.value.trim())} placeholder="00000000-0000-0000-0000-000000000000" /></FormField>}
        <FormField id="assignment-roleId" label="Role" required error={firstFieldError(formError, 'roleId')}><select value={roleId} onChange={(event) => setRoleId(event.target.value)}><option value="">Select a role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name} · {roleScope(role, branches)}</option>)}</select></FormField>
        {selectedRole?.branchId ? <FormField id="assignment-branchId" label="Branch"><input value={branchName(selectedRole.branchId)} readOnly /></FormField> : <FormField id="assignment-branchId" label="Branch scope" hint="Leave as all branches for institute-wide access."><select value={assignmentBranchId} onChange={(event) => setAssignmentBranchId(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></FormField>}
        <FormField id="assignment-validUntil" label="Valid until" error={firstFieldError(formError, 'validUntil')} hint="Leave blank for a permanent assignment."><input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} /></FormField>
      </form>
    </Modal>
    <ConfirmationDialog open={Boolean(revokeTarget)} title="Revoke role assignment?" consequence={<>Revoking <strong>{revokeTarget?.roleName}</strong> from <strong>{revokeTarget?.userName}</strong> takes effect immediately, even for an active session.</>} confirmLabel="Revoke role" busy={revoking} onCancel={() => setRevokeTarget(null)} onConfirm={confirmRevoke} />
  </div>
}
