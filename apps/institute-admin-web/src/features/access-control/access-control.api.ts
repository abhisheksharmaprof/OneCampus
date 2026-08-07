import { AdminApiError, adminRequest } from '../admin/admin.api'
import type { AssignmentWriteInput, PageData, Role, RoleAssignment, RoleWriteInput } from './types'

export { AdminApiError }

export interface RoleListQuery {
  page?: number
  pageSize?: 25 | 50 | 100
  search?: string
  branchId?: string | null
  signal?: AbortSignal
}

export function listRoles(accessToken: string, query: RoleListQuery = {}) {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 25),
  })
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.branchId) params.set('branchId', query.branchId)
  return adminRequest<PageData<Role>>(accessToken, `roles?${params}`, { signal: query.signal })
}

export async function listAllRoles(accessToken: string, query: Omit<RoleListQuery, 'page' | 'pageSize'> = {}) {
  const first = await listRoles(accessToken, { ...query, page: 1, pageSize: 100 })
  if (first.totalPages <= 1) return first.items
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) =>
      listRoles(accessToken, { ...query, page: index + 2, pageSize: 100 }),
    ),
  )
  return [first, ...rest].flatMap((page) => page.items)
}

export function getRole(accessToken: string, roleId: string, signal?: AbortSignal) {
  return adminRequest<Role>(accessToken, `roles/${encodeURIComponent(roleId)}`, { signal })
}

export function createRole(accessToken: string, input: RoleWriteInput) {
  return adminRequest<Role>(accessToken, 'roles', { method: 'POST', body: JSON.stringify(input) })
}

export function updateRole(accessToken: string, roleId: string, input: RoleWriteInput) {
  return adminRequest<Role>(accessToken, `roles/${encodeURIComponent(roleId)}`, { method: 'PATCH', body: JSON.stringify(input) })
}

export function cloneRole(accessToken: string, roleId: string, input: Pick<RoleWriteInput, 'name' | 'description' | 'branchId'>) {
  return adminRequest<Role>(accessToken, `roles/${encodeURIComponent(roleId)}/clone`, { method: 'POST', body: JSON.stringify(input) })
}
export function deleteRole(accessToken: string, roleId: string) {
  return adminRequest<void>(accessToken, `roles/${encodeURIComponent(roleId)}`, { method: 'DELETE' })
}

export interface AssignmentListQuery {
  page?: number
  pageSize?: 25 | 50 | 100
  roleId?: string
  userId?: string
  branchId?: string | null
  isActive?: boolean
  signal?: AbortSignal
}

export function listAssignments(accessToken: string, query: AssignmentListQuery = {}) {
  const params = new URLSearchParams({
    page: String(query.page ?? 1),
    pageSize: String(query.pageSize ?? 25),
  })
  if (query.roleId) params.set('roleId', query.roleId)
  if (query.userId) params.set('userId', query.userId)
  if (query.branchId) params.set('branchId', query.branchId)
  if (query.isActive !== undefined) params.set('isActive', String(query.isActive))
  return adminRequest<PageData<RoleAssignment>>(accessToken, `role-assignments?${params}`, { signal: query.signal })
}

export async function listAllAssignments(accessToken: string, query: Omit<AssignmentListQuery, 'page' | 'pageSize'> = {}) {
  const first = await listAssignments(accessToken, { ...query, page: 1, pageSize: 100 })
  if (first.totalPages <= 1) return first.items
  const rest = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) =>
      listAssignments(accessToken, { ...query, page: index + 2, pageSize: 100 }),
    ),
  )
  return [first, ...rest].flatMap((page) => page.items)
}

export function createAssignment(accessToken: string, input: AssignmentWriteInput) {
  return adminRequest<RoleAssignment>(accessToken, 'role-assignments', { method: 'POST', body: JSON.stringify(input) })
}

export function revokeAssignment(accessToken: string, assignmentId: string) {
  return adminRequest<RoleAssignment>(accessToken, `role-assignments/${encodeURIComponent(assignmentId)}/revoke`, { method: 'POST', body: '{}' })
}
