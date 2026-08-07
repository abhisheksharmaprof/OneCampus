export type BranchOption = { id: string; name: string }

export type PermissionConfiguration = Record<string, unknown>

export interface PermissionGrant {
  permissionKey: string
  module: string
  description: string
  configuration: PermissionConfiguration
}

export interface Role {
  id: string
  instituteId: string | null
  branchId: string | null
  name: string
  description: string
  isSystemRole: boolean
  isActive: boolean
  permissionCount: number
  userCount: number
  permissionGrants: PermissionGrant[]
  createdAt: string
}

export interface RoleAssignment {
  id: string
  userId: string
  userName: string
  roleId: string
  roleName: string
  instituteId: string
  branchId: string | null
  assignedById: string | null
  assignedAt: string
  validFrom: string | null
  validUntil: string | null
  isActive: boolean
  revokedAt: string | null
}

export interface AssignableUser {
  id: string
  name: string
  employeeCode?: string
  email?: string
}

export interface PageData<T> {
  count: number
  page: number
  pageSize: number
  totalPages: number
  next: string | null
  previous: string | null
  items: T[]
}

export interface RoleWriteInput {
  name: string
  description?: string
  branchId?: string | null
  permissionKeys: string[]
  permissionOptions?: Record<string, PermissionConfiguration>
}

export interface AssignmentWriteInput {
  userId: string
  roleId: string
  branchId?: string | null
  validFrom?: string | null
  validUntil?: string | null
}
