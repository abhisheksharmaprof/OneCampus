import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AdminRoute } from '../../adminNavigation'
import { AdmissionsAttendanceLayouts } from './AdmissionsAttendanceLayouts'
import { DedicatedOperationalLayouts } from './DedicatedOperationalLayouts'
import { ReferenceOperationalLayouts } from './ReferenceOperationalLayouts'
import { screenWorkflows } from './screenWorkflows'

const route = (id: string, label: string): AdminRoute => ({ id, label, path: `/${id.toLowerCase()}`, breadcrumb: 'Institute Admin', view: 'operational' })

describe('reference operational layouts', () => {
  beforeEach(() => window.history.replaceState({}, '', '/'))

  it('opens the common-test creation wizard from its mapped CTA', () => {
    const action = vi.fn()
    render(<ReferenceOperationalLayouts route={route('AC5', 'Common Tests')} onOpenAction={action} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /create common test/i }))
    expect(action).toHaveBeenCalledWith('create-common-test', undefined)
    expect(screen.getByRole('heading', { name: 'Create Common Test' })).toBeInTheDocument()
  })

  it('maps award approvals to the approval workflow', () => {
    const modal = vi.fn()
    render(<DedicatedOperationalLayouts route={route('RG6', 'Award Approvals')} onOpenModal={modal} onAction={vi.fn()} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /approve award for ira nair/i }))
    expect(modal).toHaveBeenCalledWith('award-approval', { student: 'Ira Nair' })
  })

  it('maps the application form builder CTA to a field workflow', () => {
    const action = vi.fn()
    render(<AdmissionsAttendanceLayouts route={route('AD4', 'Application Form Builder')} onOpenAction={action} onNavigate={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /add field/i }))
    expect(action).toHaveBeenCalledWith('create-field')
  })

  it('restores the common-test detail surface from a direct query deep link', () => {
    window.history.replaceState({}, '', '/academics/common-tests?test=Term%201%20Benchmark')
    render(<ReferenceOperationalLayouts route={route('AC5', 'Common Tests')} onOpenAction={vi.fn()} onNavigate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Term 1 Benchmark' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Common test detail views' })).toBeInTheDocument()
    expect(screen.getByText('Shared and locked')).toBeInTheDocument()
  })

  it('restores report details from a direct query deep link', () => {
    window.history.replaceState({}, '', '/reports?report=Attendance%20Trends')
    render(<DedicatedOperationalLayouts route={route('RA1', 'Reports & Analytics')} onOpenModal={vi.fn()} onAction={vi.fn()} onNavigate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Attendance Trends' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /attendance trends trend rising/i })).toBeInTheDocument()
    expect(screen.getByRole('table', { name: 'Attendance Trends report data' })).toBeInTheDocument()
  })

  it('keeps communication and reminder workflows aligned with configured channels', () => {
    for (const workflow of [screenWorkflows.CM2, screenWorkflows.FN3, screenWorkflows.SE5]) {
      expect(JSON.stringify(workflow)).not.toContain('SMS')
    }
  })
})
