import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CalendarPage } from './CalendarPage'

const request = vi.hoisted(() => vi.fn())
const localStorageMock = vi.hoisted(() => ({ clear: vi.fn(), getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() }))
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: localStorageMock })
vi.mock('../admin/admin.api', () => ({ adminRequest: request }))

const empty = { count: 0, page: 1, pageSize: 25, totalPages: 1, next: null, previous: null, items: [] }

describe('CalendarPage holiday sync', () => {
  beforeEach(() => {
    request.mockReset()
    request.mockResolvedValue(empty)
  })

  it('imports national holidays and refreshes the scheduled events table', async () => {
    const imported = { id: 'event-1', title: 'Republic Day', eventType: 'HOLIDAY', branchId: null, startsOn: '2026-01-26', endsOn: '2026-01-26' }
    request.mockImplementation(async (_token: string, path: string, options?: RequestInit) => {
      if (path === 'calendar/sync-holidays') return { count: 1, added: [imported] }
      if (options?.method === 'GET' || path.startsWith('calendar/events?')) return { ...empty, count: 1, items: [imported] }
      return empty
    })
    render(<CalendarPage accessToken="test" branches={[]} selectedBranch="all" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sync Holidays' }))
    expect(screen.getByRole('dialog', { name: 'Sync holidays' })).toBeInTheDocument()
    expect(screen.getByLabelText('Country')).toHaveValue('IN')
    fireEvent.click(screen.getByRole('button', { name: 'Fetch & Import' }))
    await waitFor(() => expect(screen.getByText('Imported 1 holiday.')).toBeInTheDocument())
    await waitFor(() => expect(screen.getByText('Republic Day')).toBeInTheDocument())
    expect(request).toHaveBeenCalledWith('test', 'calendar/sync-holidays', expect.objectContaining({ method: 'POST' }))
  })

  it('shows sync errors in an accessible alert and supports the iCal tab', async () => {
    request.mockImplementation(async (_token: string, path: string) => {
      if (path === 'calendar/sync-holidays') throw new Error('Calendar URL is not publicly accessible.')
      return empty
    })
    render(<CalendarPage accessToken="test" branches={[]} selectedBranch="all" />)
    fireEvent.click(screen.getByRole('button', { name: 'Sync Holidays' }))
    fireEvent.click(screen.getByRole('tab', { name: /iCal/i }))
    expect(screen.getByLabelText('Public iCal URL')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Public iCal URL'), { target: { value: 'https://calendar.example/public.ics' } })
    fireEvent.click(screen.getByRole('button', { name: 'Sync from URL' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Calendar URL is not publicly accessible.'))
  })
})
