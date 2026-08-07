import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Copy, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { ConfirmationDialog, DataTable, ErrorSummary, FormField, Modal, PageHeader, Tabs, type DataTableColumn, type FormError } from '../../components/admin-ui'
import { AccessControlError } from './AccessControlError'
import { AdminApiError, cloneRole, deleteRole, listAllRoles } from './access-control.api'
import { apiErrorMessage, firstFieldError, roleScope, useDebouncedValue } from './access-control.utils'
import { RoleAssignmentsPage } from './RoleAssignmentsPage'
import { RoleBuilderPage } from './RoleBuilderPage'
import type { AssignableUser, BranchOption, Role } from './types'
import './access-control.css'

type ScopeTab = 'all' | 'system' | 'institute' | 'branch'

export interface RolesListPageProps {
  accessToken: string
  branches: readonly BranchOption[]
  users?: readonly AssignableUser[]
  delegablePermissionKeys?: readonly string[]
  pointCategories?: readonly { id: string; name: string }[]
  onCreateRole?: () => void
  onEditRole?: (roleId: string) => void
}

export function RolesListPage({ accessToken, branches, users, delegablePermissionKeys, pointCategories, onCreateRole, onEditRole }: RolesListPageProps) {
  const [roles, setRoles] = useState<Role[]>([])
  const [error, setError] = useState<AdminApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search)
  const [scopeTab, setScopeTab] = useState<ScopeTab>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<25 | 50 | 100>(25)
  const [detailRole, setDetailRole] = useState<Role | null>(null)
  const [assignmentRole, setAssignmentRole] = useState<Role | null>(null)
  const [cloneSource, setCloneSource] = useState<Role | null>(null)
  const [cloneName, setCloneName] = useState('')
  const [cloneBranchId, setCloneBranchId] = useState('')
  const [cloneError, setCloneError] = useState<AdminApiError | null>(null)
  const [cloning, setCloning] = useState(false)
  const [builderRoleId, setBuilderRoleId] = useState<string | 'create' | null>(null)
  const [notice, setNotice] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    listAllRoles(accessToken, { search: debouncedSearch, signal: controller.signal }).then((items) => {
      setRoles(items); setError(null)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof AdminApiError ? cause : new AdminApiError('Roles could not be loaded.'))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, debouncedSearch, revision])

  const visibleRoles = useMemo(() => roles.filter((role) => {
    if (scopeTab === 'system') return role.isSystemRole
    if (scopeTab === 'institute') return !role.isSystemRole && !role.branchId
    if (scopeTab === 'branch') return !role.isSystemRole && Boolean(role.branchId)
    return true
  }), [roles, scopeTab])
  const rows = visibleRoles.slice((page - 1) * pageSize, page * pageSize)

  const edit = (role: Role) => {
    if (onEditRole) onEditRole(role.id)
    else setBuilderRoleId(role.id)
  }
  const create = () => {
    if (onCreateRole) onCreateRole()
    else setBuilderRoleId('create')
  }
  const beginClone = (role: Role) => {
    setCloneSource(role); setCloneName(`${role.name} copy`); setCloneBranchId(role.branchId ?? ''); setCloneError(null)
  }

  const columns: DataTableColumn<Role>[] = [
    { id: 'name', header: 'Role name', cell: (role) => <button type="button" className="ac-link-button" onClick={() => setDetailRole(role)}><strong>{role.name}</strong><small>{role.description || 'No description'}</small></button> },
    { id: 'scope', header: 'Scope', cell: (role) => <span className={`ac-badge ac-badge--${role.isSystemRole ? 'system' : role.branchId ? 'branch' : 'institute'}`}>{roleScope(role, branches)}</span> },
    { id: 'users', header: 'Users assigned', align: 'center', cell: (role) => <button className="ac-count-link" type="button" onClick={() => setAssignmentRole(role)} aria-label={`View ${role.userCount} assignments for ${role.name}`}><Users aria-hidden="true" />{role.userCount}</button> },
    { id: 'permissions', header: 'Permissions', align: 'center', hideOnSmall: true, cell: (role) => role.permissionCount },
    { id: 'createdBy', header: 'Created by', hideOnSmall: true, cell: (role) => role.isSystemRole ? 'Platform' : 'Institute administrator' },
    { id: 'actions', header: <span className="admin-sr-only">Actions</span>, align: 'end', cell: (role) => <div className="ac-row-actions"><button className="admin-icon-button" type="button" aria-label={`Clone ${role.name}`} title="Clone role" onClick={() => beginClone(role)}><Copy aria-hidden="true" /></button>{role.isSystemRole ? <button className="admin-icon-button" type="button" aria-label={`Edit ${role.name}`} title="System roles cannot be edited" disabled><Pencil aria-hidden="true" /></button> : <><button className="admin-icon-button" type="button" aria-label={`Edit ${role.name}`} title="Edit role" onClick={() => edit(role)}><Pencil aria-hidden="true" /></button><button className="admin-icon-button is-danger" type="button" aria-label={`Delete ${role.name}`} title="Delete role" onClick={() => setDeleteTarget(role)}><Trash2 aria-hidden="true" /></button></>}</div> },
  ]

  const table = <DataTable caption="Roles" columns={columns} rows={rows} getRowId={(role) => role.id} totalRows={visibleRoles.length} page={page} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1) }} loading={loading} error={error ? apiErrorMessage(error) : undefined} onRetry={() => setRevision((value) => value + 1)} filters={<><label className="admin-sr-only" htmlFor="role-search">Search roles</label><input id="role-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search roles…" /></>} emptyTitle={scopeTab === 'institute' || scopeTab === 'branch' ? 'No custom roles yet' : 'No matching roles'} emptyDescription={scopeTab === 'institute' || scopeTab === 'branch' ? 'Clone a system role or start from scratch.' : 'Try a different search.'} emptyAction={<button className="admin-button admin-button--primary" type="button" onClick={create}><Plus aria-hidden="true" />Create role</button>} />

  const submitClone = async (event: FormEvent) => {
    event.preventDefault()
    if (!cloneSource) return
    if (cloneName.trim().length < 2) { setCloneError(new AdminApiError('Enter a role name.', { fieldErrors: { name: ['Role name must contain at least 2 characters.'] } })); return }
    setCloning(true); setCloneError(null)
    try {
      const cloned = await cloneRole(accessToken, cloneSource.id, { name: cloneName.trim(), description: cloneSource.description, branchId: cloneBranchId || null })
      setCloneSource(null); setNotice(`Role “${cloned.name}” created.`); setRevision((value) => value + 1)
    } catch (cause) {
      setCloneError(cause instanceof AdminApiError ? cause : new AdminApiError('The role could not be cloned.'))
    } finally { setCloning(false) }
  }
  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try { await deleteRole(accessToken, deleteTarget.id); setNotice(`Role “${deleteTarget.name}” deleted.`); setDeleteTarget(null); setRevision((value) => value + 1) }
    catch (cause) { setError(cause instanceof AdminApiError ? cause : new AdminApiError('The role could not be deleted.')) }
    finally { setDeleting(false) }
  }

  if (builderRoleId) return <RoleBuilderPage accessToken={accessToken} branches={branches} roleId={builderRoleId === 'create' ? undefined : builderRoleId} delegablePermissionKeys={delegablePermissionKeys} pointCategories={pointCategories} onCancel={() => setBuilderRoleId(null)} onSaved={(saved) => { setBuilderRoleId(null); setNotice(`Role “${saved.name}” saved.`); setRevision((value) => value + 1) }} />

  return <div className="entity-page ac-page">
    <PageHeader title="All Roles" breadcrumbs={[{ label: 'Roles & Permissions' }, { label: 'All Roles' }]} description="Create scoped roles, review permission grants, and manage who holds each role." actions={<button className="admin-button admin-button--primary" type="button" onClick={create}><Plus aria-hidden="true" />Create role</button>} />
    <div className="admin-sr-only" role="status" aria-live="polite">{notice}</div>
    {error && !roles.length && !loading ? <AccessControlError error={error} onRetry={() => setRevision((value) => value + 1)} /> : null}
    <Tabs label="Role scope" activeId={scopeTab} onChange={(id) => { setScopeTab(id as ScopeTab); setPage(1) }} tabs={[
      { id: 'all', label: 'All', panel: table },
      { id: 'system', label: 'System roles', panel: table },
      { id: 'institute', label: 'Institute-wide', panel: table },
      { id: 'branch', label: 'Branch-scoped', panel: table },
    ]} />

    <Modal open={Boolean(detailRole)} title={detailRole?.name ?? 'Role details'} description={detailRole ? roleScope(detailRole, branches) : undefined} size="large" onClose={() => setDetailRole(null)} footer={<button className="admin-button admin-button--secondary" type="button" onClick={() => setDetailRole(null)}>Close</button>}>
      {detailRole ? <div className="ac-role-detail"><p>{detailRole.description || 'No description provided.'}</p><h3>Permissions ({detailRole.permissionCount})</h3>{detailRole.permissionGrants.length ? <ul>{detailRole.permissionGrants.map((permission) => <li key={permission.permissionKey}><strong>{permission.description}</strong><code>{permission.permissionKey}</code></li>)}</ul> : <p>This role grants no permissions.</p>}</div> : null}
    </Modal>

    <Modal open={Boolean(assignmentRole)} title={`${assignmentRole?.name ?? 'Role'} assignments`} size="large" onClose={() => setAssignmentRole(null)}><RoleAssignmentsPage accessToken={accessToken} branches={branches} users={users} initialRoleId={assignmentRole?.id} embedded /></Modal>

    <Modal open={Boolean(cloneSource)} title="Clone role" description={`Create an editable copy of ${cloneSource?.name ?? 'this role'}.`} onClose={() => { if (!cloning) setCloneSource(null) }} footer={<><button className="admin-button admin-button--secondary" type="button" disabled={cloning} onClick={() => setCloneSource(null)}>Cancel</button><button className="admin-button admin-button--primary" type="submit" form="clone-role-form" disabled={cloning}>{cloning ? 'Cloning…' : 'Clone role'}</button></>}>
      <form id="clone-role-form" className="admin-form-grid" onSubmit={submitClone} noValidate>
        {cloneError ? <><ErrorSummary errors={(Object.entries(cloneError.fieldErrors).flatMap(([field, messages]) => messages.map((message) => ({ fieldId: `clone-${field}`, label: field, message }))) as FormError[]).concat(Object.keys(cloneError.fieldErrors).length ? [] : [{ fieldId: 'clone-name', message: apiErrorMessage(cloneError) }])} />{cloneError.traceId ? <p className="ac-trace">Reference: {cloneError.traceId}</p> : null}</> : null}
        <FormField id="clone-name" label="Role name" required error={firstFieldError(cloneError, 'name')}><input value={cloneName} maxLength={100} onChange={(event) => setCloneName(event.target.value)} /></FormField>
        <FormField id="clone-branchId" label="Scope" error={firstFieldError(cloneError, 'branchId')}><select value={cloneBranchId} onChange={(event) => setCloneBranchId(event.target.value)}><option value="">All branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></FormField>
      </form>
    </Modal>
    <ConfirmationDialog open={Boolean(deleteTarget)} title={`Delete ${deleteTarget?.name ?? 'custom role'}?`} consequence="This permanently removes the custom role and its permission configuration. Roles with active assignments must be revoked first." confirmLabel="Delete role" busy={deleting} onCancel={() => setDeleteTarget(null)} onConfirm={() => void confirmDelete()} />
  </div>
}
