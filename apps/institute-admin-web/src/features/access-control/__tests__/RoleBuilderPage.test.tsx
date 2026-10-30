import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RoleBuilderPage } from '../RoleBuilderPage'

const catalogRole = { id: 'system-1', instituteId: null, branchId: null, name: 'Institute Admin', description: 'All access', isSystemRole: true, isActive: true, permissionCount: 2, userCount: 1, permissionGrants: [{ permissionKey: 'attendance.mark', module: 'attendance', description: 'Mark daily attendance', configuration: {} }, { permissionKey: 'role.assign', module: 'roles', description: 'Assign roles to users', configuration: {} }], createdAt: '2026-01-01T00:00:00Z' }

describe('RoleBuilderPage', () => {
  it('validates basics and supports keyboard-accessible permission tabs', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ success: true, data: { count: 1, page: 1, pageSize: 1, totalPages: 1, next: null, previous: null, items: [catalogRole] } }), { status: 200, headers: { 'Content-Type': 'application/json' } })))
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

  it('loads the full permission catalog and saves explicit selected exam scopes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/roles') && options?.method === 'POST') return Promise.resolve(new Response(JSON.stringify({ success: true, data: catalogRole }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      if (url.pathname.endsWith('/permission-catalog')) return Promise.resolve(new Response(JSON.stringify({ success: true, data: {
        permissions: [
          { permissionKey: 'assessment.create', module: 'assessment', description: 'Create exam drafts' },
          { permissionKey: 'assessment.view', module: 'assessment', description: 'View exam drafts' },
          { permissionKey: 'assessment.edit', module: 'assessment', description: 'Edit exam drafts' },
          { permissionKey: 'assessment.publish', module: 'assessment', description: 'Publish exam schedules' },
        ], delegablePermissionKeys: ['assessment.create', 'assessment.view', 'assessment.edit', 'assessment.publish'],
      } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (url.pathname.endsWith('/roles')) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { count: 0, page: 1, pageSize: 100, totalPages: 1, items: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (url.pathname.endsWith('/academic-years')) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { items: [{ id: 'year-1', name: '2026-27', isCurrent: true }] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (url.pathname.endsWith('/sections')) return Promise.resolve(new Response(JSON.stringify({ success: true, data: { items: [{ id: 'section-1', grade: { name: 'Class 8' }, sectionName: 'A' }] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response(JSON.stringify({ success: true, data: catalogRole }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    const user = userEvent.setup()
    render(<RoleBuilderPage accessToken="token" branches={[{ id: 'branch-1', name: 'Main' }]} />)
    await screen.findByRole('heading', { name: 'Create role' })
    await user.type(screen.getByLabelText(/Role name/), 'Exam Coordinator')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('tab', { name: /Assessment/ })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Assessment/ }))
    expect(screen.getByRole('checkbox', { name: /View exam drafts/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add preset' }))
    await user.click(screen.getAllByRole('radio', { name: /Selected sections/ })[0])
    await user.click((await screen.findAllByLabelText('Class 8 A'))[0])
    await user.click(screen.getByRole('checkbox', { name: /Publish exam schedules/ }))
    const publishScope = within(screen.getByRole('group', { name: 'Exam target scope for publish' }))
    await user.click(publishScope.getByRole('radio', { name: /Selected sections/ }))
    await user.click(publishScope.getByLabelText('Class 8 A'))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(screen.getByRole('button', { name: 'Create role' }))

    await waitFor(() => {
      const saveCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/roles') && options?.method === 'POST')
      expect(saveCall).toBeDefined()
      const body = JSON.parse(String(saveCall?.[1]?.body))
      expect(body.permissionKeys).toEqual(['assessment.create', 'assessment.edit', 'assessment.publish', 'assessment.view'])
      expect(body.permissionOptions['assessment.create']).toEqual({ schemaVersion: 1, examScope: 'selected', classSectionIds: ['section-1'], classSubjectPairs: [] })
      expect(body.permissionOptions['assessment.publish']).toEqual({ schemaVersion: 1, examScope: 'selected', classSectionIds: ['section-1'], classSubjectPairs: [] })
    })
  })
})
