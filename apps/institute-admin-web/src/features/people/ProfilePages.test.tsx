import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfilePage } from './ProfilePages'

const page = (items: unknown[]) => ({
  success: true,
  data: { count: items.length, page: 1, pageSize: 100, totalPages: 1, next: null, previous: null, items },
})

const staff = (isTeacher: boolean) => ({
  id: 'profile-1',
  userId: 'user-1',
  fullName: isTeacher ? 'Meera Iyer' : 'Anita Rao',
  email: 'staff@northstar.test',
  phone: '',
  branch: { id: 'branch-1', name: 'Main Campus' },
  role: isTeacher ? 'TEACHER' : 'STAFF',
  isTeacher,
  status: 'ACTIVE',
  availableDays: ['MON'],
  availablePeriods: [1],
  teachingAssignments: [],
})

function mockProfileApi(isTeacher: boolean) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/staff?page=1&pageSize=100')) return Promise.resolve({ ok: true, json: async () => page([staff(isTeacher)]) })
    if (url.includes('/staff/profile-1/timetable')) return Promise.resolve({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          timetableRecordId: 'record-1',
          timetableTitle: 'Published weekly timetable',
          timetableUpdatedAt: '2026-09-09T08:00:00Z',
          workingDays: ['MON'],
          periods: [{ number: 1, start: '09:00', end: '09:45' }],
          slots: [{ day: 'MON', period: 1, className: 'Class 8 - A', subjectName: 'Mathematics', roomName: 'Room 12' }],
        },
      }),
    })
    if (url.includes('/academics/section-subject-teachers')) return Promise.resolve({ ok: true, json: async () => page([]) })
    if (url.includes('/role-assignments')) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { items: [] } }) })
    if (url.includes('/academics/sections')) return Promise.resolve({ ok: true, json: async () => page([]) })
    if (url.includes('/academics/subjects')) return Promise.resolve({ ok: true, json: async () => page([]) })
    if (url.includes('/academics/classes')) return Promise.resolve({ ok: true, json: async () => page([]) })
    throw new Error(`Unexpected URL: ${url}`)
  }))
}

describe('Staff profile timetable', () => {
  beforeEach(() => {
    mockProfileApi(true)
  })

  it('shows the latest published timetable for teacher staff', async () => {
    render(
      <MemoryRouter initialEntries={['/staff/profile?staff=profile-1&tab=timetable']}>
        <ProfilePage kind="staff" id="profile-1" accessToken="token" onBack={() => undefined} />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Published weekly timetable')).toBeInTheDocument()
    expect(screen.getByText(/Mathematics/)).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/staff/profile-1/timetable'))).toBe(true)
  })

  it('does not expose or request a timetable for non-teacher staff', async () => {
    mockProfileApi(false)

    render(
      <MemoryRouter initialEntries={['/staff/profile?staff=profile-1&tab=timetable']}>
        <ProfilePage kind="staff" id="profile-1" accessToken="token" onBack={() => undefined} />
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.queryByRole('tab', { name: 'Timetable' })).not.toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true')
    })
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/timetable'))).toBe(false)
  })
})
