import { useEffect, useState } from 'react'
import type { AdminApiError } from './access-control.api'
import type { BranchOption, PermissionGrant, Role } from './types'

export function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [delay, value])
  return debounced
}

export function apiErrorMessage(error: AdminApiError) {
  return `${error.message}${error.traceId ? ` Reference: ${error.traceId}` : ''}`
}

export function firstFieldError(error: AdminApiError | null, field: string) {
  if (!error) return undefined
  return error.fieldErrors[field]?.[0]
}

export function roleScope(role: Role, branches: readonly BranchOption[]) {
  if (role.isSystemRole) return 'System'
  if (!role.branchId) return 'All branches'
  return branches.find((branch) => branch.id === role.branchId)?.name ?? `Branch ${shortId(role.branchId)}`
}

export function shortId(id: string | null | undefined) {
  return id ? `${id.slice(0, 8)}…` : '—'
}

export function permissionCatalog(roles: readonly Role[]) {
  const grants = new Map<string, PermissionGrant>()
  roles.forEach((role) => role.permissionGrants.forEach((grant) => grants.set(grant.permissionKey, grant)))
  return [...grants.values()].sort((a, b) => a.module.localeCompare(b.module) || a.permissionKey.localeCompare(b.permissionKey))
}

export function moduleLabel(module: string) {
  const labels: Record<string, string> = {
    academics: 'Academics', attendance: 'Attendance', communication: 'Communication',
    institute: 'Institute', leaderboard: 'Leaderboard & Points', reports: 'Reports',
    roles: 'Roles', staff: 'Staff', students: 'Students',
  }
  return labels[module] ?? module.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function toDateTimeLocal(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function fromDateTimeLocal(value: string) {
  return value ? new Date(value).toISOString() : null
}
