import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AcademicStructurePage } from '../AcademicStructurePage'

const year = { id: 'year-1', name: '2026-27', startDate: '2026-04-01', endDate: '2027-03-31', isCurrent: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const grade = { id: 'grade-1', name: 'Class 8', sortOrder: 8, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const subject = { id: 'subject-1', name: 'Mathematics', subjectCode: 'MATH', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' }
const page = (items: unknown[]) => ({ count: items.length, page: 1, pageSize: items.length, totalPages: 1, next: null, previous: null, items })

function response(data: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(status < 400 ? { success: true, data } : data), { status, headers: { 'Content-Type': 'application/json' } }))
}

function installApi() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input, options) => {
    const url = String(input)
    if (options?.method === 'POST' && url.includes('/subjects')) return response({ ...subject, id: 'subject-2', name: 'Physics', subjectCode: 'PHY' }, 201)
    if (url.includes('/academic-years')) return response(page([year]))
    if (url.includes('/classes')) return response(page([grade]))
    if (url.includes('/subjects')) return response(page([subject]))
    if (url.includes('/sections')) return response(page([]))
    return response(page([]))
  })
}

describe('AcademicStructurePage', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('renders accessible resource tabs, loading data, and the active branch context', async () => {
    const fetchMock = installApi()
    const user = userEvent.setup()
    render(<AcademicStructurePage accessToken="token" branches={[{ id: 'branch-1', name: 'Main Campus', code: 'MAIN' }]} selectedBranch="branch-1" />)

    expect(screen.getByRole('heading', { name: 'Academic Structure' })).toBeInTheDocument()
    expect(screen.getByLabelText('Active branch context')).toHaveTextContent('Main Campus')
    expect(await screen.findByRole('table', { name: 'Academic years' })).toHaveTextContent('2026-27')
    expect(screen.getByRole('tab', { name: 'Academic years' })).toHaveAttribute('aria-selected', 'true')

    await user.click(screen.getByRole('tab', { name: 'Sections' }))
    expect(await screen.findByRole('heading', { name: 'No sections found' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => {
      const parsed = new URL(String(url))
      return parsed.pathname.endsWith('/academics/sections') && parsed.searchParams.get('branchId') === 'branch-1'
    })).toBe(true))
    expect(screen.getByRole('combobox', { name: 'Filter sections by academic year' })).toHaveTextContent('2026-27')
  })

  it('creates a subject with the serializer field names and refreshes the list', async () => {
    const fetchMock = installApi()
    const user = userEvent.setup()
    render(<AcademicStructurePage accessToken="token" branches={[]} selectedBranch="all" initialTab="subjects" />)

    await screen.findByText('Mathematics')
    await user.click(screen.getByRole('button', { name: 'Add subject' }))
    const dialog = screen.getByRole('dialog', { name: 'Add subject' })
    await user.type(within(dialog).getByLabelText(/subject name/i), 'Physics')
    await user.type(within(dialog).getByLabelText(/subject code/i), 'PHY')
    await user.click(within(dialog).getByRole('button', { name: 'Save subject' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    const createCall = fetchMock.mock.calls.find(([url, options]) => String(url).endsWith('/api/v1/admin/academics/subjects') && options?.method === 'POST')
    expect(createCall).toBeDefined()
    expect(JSON.parse(String(createCall?.[1]?.body))).toEqual({ name: 'Physics', subjectCode: 'PHY' })
  })

  it('shows server field errors with the trace reference in the modal', async () => {
    const fetchMock = installApi()
    fetchMock.mockImplementationOnce(() => response(page([subject])))
    const user = userEvent.setup()
    render(<AcademicStructurePage accessToken="token" branches={[]} selectedBranch="all" initialTab="subjects" />)
    await screen.findByText('Mathematics')
    await user.click(screen.getByRole('button', { name: 'Edit Mathematics' }))
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Please correct the highlighted fields.', fieldErrors: { name: ['A subject with this name already exists.'] }, traceId: 'trace-academics-42' } }), { status: 400, headers: { 'Content-Type': 'application/json' } }))
    const dialog = screen.getByRole('dialog', { name: 'Edit subject' })
    await user.click(within(dialog).getByRole('button', { name: 'Save subject' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('A subject with this name already exists.')
    expect(dialog).toHaveTextContent('Reference: trace-academics-42')
    expect(within(dialog).getByLabelText(/subject name/i)).toHaveAttribute('aria-invalid', 'true')
  })
})
