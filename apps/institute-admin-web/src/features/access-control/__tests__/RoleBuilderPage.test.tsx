import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RoleBuilderPage } from '../RoleBuilderPage'

const catalogRole = { id: 'system-1', instituteId: null, branchId: null, name: 'Institute Admin', description: 'All access', isSystemRole: true, isActive: true, permissionCount: 2, userCount: 1, permissionGrants: [{ permissionKey: 'attendance.mark', module: 'attendance', description: 'Mark daily attendance', configuration: {} }, { permissionKey: 'role.assign', module: 'roles', description: 'Assign roles to users', configuration: {} }], createdAt: '2026-01-01T00:00:00Z' }

describe('RoleBuilderPage', () => {
  it('validates basics and supports keyboard-accessible permission tabs', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true, data: { count: 1, page: 1, pageSize: 1, totalPages: 1, next: null, previous: null, items: [catalogRole] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    const user = userEvent.setup()
    render(<RoleBuilderPage accessToken="token" branches={[{ id: 'branch-1', name: 'Main' }]} />)
    await screen.findByRole('heading', { name: 'Create role' })
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(screen.getByText('Role name must contain at least 2 characters.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Role name/), 'Coordinator')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    const attendanceTab = screen.getByRole('tab', { name: /Attendance/ })
    attendanceTab.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: /Roles/ })).toHaveFocus()
  })
})
