import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RolesListPage } from '../RolesListPage'

const roles = [{ id: 'system-1', instituteId: null, branchId: null, name: 'Teacher', description: 'Teaching role', isSystemRole: true, isActive: true, permissionCount: 1, userCount: 2, permissionGrants: [{ permissionKey: 'attendance.mark', module: 'attendance', description: 'Mark daily attendance', configuration: {} }], createdAt: '2026-01-01T00:00:00Z' }]

describe('RolesListPage', () => {
  it('loads roles and opens accessible role details', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { count: 1, page: 1, pageSize: 1, totalPages: 1, next: null, previous: null, items: roles } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const user = userEvent.setup()
    render(<RolesListPage accessToken="token" branches={[]} />)
    expect(await screen.findByText('Teaching role')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'TeacherTeaching role' }))
    expect(screen.getByRole('dialog', { name: 'Teacher' })).toBeInTheDocument()
    expect(screen.getByText('attendance.mark')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('disables editing system roles while allowing cloning', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { count: 1, page: 1, pageSize: 1, totalPages: 1, next: null, previous: null, items: roles } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    render(<RolesListPage accessToken="token" branches={[]} />)
    expect(await screen.findByRole('button', { name: 'Edit Teacher' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clone Teacher' })).toBeEnabled()
  })
})
