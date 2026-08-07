import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAssignment, createRole, listRoles, revokeAssignment } from '../access-control.api'

describe('access-control API', () => {
  afterEach(() => vi.restoreAllMocks())

  it('sends role pagination and search using the admin API contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { count: 0, page: 2, pageSize: 25, totalPages: 1, next: null, previous: null, items: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await listRoles('token', { page: 2, pageSize: 25, search: 'teacher' })
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/v1/admin/roles?page=2&pageSize=25&search=teacher'), expect.objectContaining({ signal: undefined }))
  })

  it('uses exact write and revoke endpoints', async () => {
    const role = { id: 'role-1' }
    const assignment = { id: 'assignment-1' }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => new Response(JSON.stringify({ success: true, data: String(input).includes('role-assignments') ? assignment : role }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    await createRole('token', { name: 'Coordinator', permissionKeys: ['role.assign'] })
    await createAssignment('token', { userId: 'user-1', roleId: 'role-1' })
    await revokeAssignment('token', 'assignment-1')
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual(expect.arrayContaining([
      expect.stringMatching(/\/api\/v1\/admin\/roles$/),
      expect.stringMatching(/\/api\/v1\/admin\/role-assignments$/),
      expect.stringMatching(/\/api\/v1\/admin\/role-assignments\/assignment-1\/revoke$/),
    ]))
  })
})
