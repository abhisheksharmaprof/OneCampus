import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimetablePage } from './TimetablePage'

vi.mock('./TimetableGenerator.jsx', () => ({
  IntegratedTimetableGenerator: ({ initialBundle, loading, saveTimetable }: { initialBundle?: { teachers: Array<{ availablePeriods: number[] }>; subjects: unknown[]; classes: unknown[]; assignments: Array<{ periodsPerWeek: number; classIds?: string[]; combinedSlotLabel?: string }> }; loading: boolean; saveTimetable?: (bundle: unknown, status: 'DRAFT' | 'PUBLISHED') => Promise<unknown> }) => loading
    ? <div>Loading generator</div>
    : <div>Generator data: {initialBundle?.teachers.length} teachers, {initialBundle?.subjects.length} subjects, {initialBundle?.classes.length} classes, {initialBundle?.assignments.length} assignments; periods {initialBundle?.assignments[0]?.periodsPerWeek}; availability {initialBundle?.teachers[0]?.availablePeriods.join(',')}; combined {initialBundle?.assignments[1]?.classIds?.length ?? 0} sections labelled {initialBundle?.assignments[1]?.combinedSlotLabel || 'none'}{saveTimetable ? <button type="button" onClick={() => void saveTimetable(initialBundle, 'PUBLISHED')}>Test publish</button> : null}</div>,
  SavedTimetableViewer: ({ initialBundle }: { initialBundle?: { classes: unknown[] } }) => <div>Saved timetable with {initialBundle?.classes.length ?? 0} classes</div>,
}))

const page = (items: unknown[]) => ({ success: true, data: { count: items.length, page: 1, pageSize: 100, totalPages: 1, next: null, previous: null, items } })

describe('TimetablePage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/staff?')) return Promise.resolve({ ok: true, json: async () => page([{ id: 'profile-1', userId: 'teacher-1', fullName: 'Meera Iyer', role: 'TEACHER', employmentType: 'PART_TIME', availableDays: ['MON', 'WED'], availablePeriods: [1, 2, 3, 4, 5, 6, 7, 8], maxPeriodsPerDay: 3, maxPeriodsPerWeek: 12 }]) })
      if (url.includes('/class-subjects?')) return Promise.resolve({ ok: true, json: async () => page([{ id: 'curriculum-1', classId: 'grade-1', subjectId: 'subject-1', periodsPerWeek: 6 }]) })
      if (url.includes('/subjects?')) return Promise.resolve({ ok: true, json: async () => page([{ id: 'subject-1', name: 'Mathematics', subjectCode: 'MATH' }]) })
      if (url.includes('/sections?')) return Promise.resolve({ ok: true, json: async () => page([{ id: 'section-1', branch: { id: 'branch-1' }, grade: { id: 'grade-1', name: 'Class 8' }, academicYear: { isCurrent: true }, sectionName: 'A' }, { id: 'section-2', branch: { id: 'branch-1' }, grade: { id: 'grade-1', name: 'Class 8' }, academicYear: { isCurrent: true }, sectionName: 'B' }]) })
      if (url.includes('/section-subject-teachers?')) return Promise.resolve({ ok: true, json: async () => page([{ id: 'assignment-1', classSectionIds: ['section-1'], classSectionId: 'section-1', subject: { id: 'subject-1' }, teacher: { id: 'teacher-1' } }, { id: 'assignment-2', classSectionIds: ['section-1', 'section-2'], classSectionId: 'section-1', combinedSlotLabel: 'Lang', subject: { id: 'subject-1' }, teacher: { id: 'teacher-1' } }]) })
      if (url.includes('/rooms?')) return Promise.resolve({ ok: true, json: async () => page([]) })
      if (url.includes('/academic-years?')) return Promise.resolve({ ok: true, json: async () => page([{ id: 'year-1', name: '2026-27', isCurrent: true }]) })
      if (url.includes('/classes?')) return Promise.resolve({ ok: true, json: async () => page([{ id: 'grade-1', name: 'Class 8' }]) })
      if (url.includes('/timetable/publish')) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { record: { id: 'saved-1', recordType: 'generated-timetable', title: 'All Classes Timetable', status: 'PUBLISHED', data: {}, updatedAt: '2026-07-30T08:00:00Z' }, archivedCount: 0 } }) })
      if (url.includes('/screens/TT1/records')) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { id: 'saved-1', recordType: 'generated-timetable', title: 'All Classes Timetable', status: 'DRAFT', data: {}, updatedAt: '2026-07-30T08:00:00Z' } }) })
      throw new Error(`Unexpected URL: ${url}`)
    }))
  })

  it('publishes a complete all-classes timetable snapshot through TT1', async () => {
    render(<TimetablePage mode="generate" accessToken="token" selectedBranch="branch-1" />)
    fireEvent.click(await screen.findByRole('button', { name: 'Test publish' }))

    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/screens/TT1/records'), expect.objectContaining({ method: 'POST' })))
    const saveCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/screens/TT1/records'))
    const saveBody = JSON.parse(String((saveCall?.[1] as RequestInit).body))
    // Always saved as DRAFT first
    expect(saveBody).toMatchObject({ branchId: 'branch-1', recordType: 'generated-timetable', title: 'All Classes Timetable', status: 'DRAFT', data: { scope: 'all', lifecycleStatus: 'PUBLISHED' } })

    // Then published via dedicated endpoint
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/timetable/publish'), expect.objectContaining({ method: 'POST' })))
    const publishCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).includes('/timetable/publish'))
    const publishBody = JSON.parse(String((publishCall?.[1] as RequestInit).body))
    expect(publishBody).toMatchObject({ recordId: 'saved-1' })
  })

  it('loads branch-scoped CampusOne scheduling records and maps them into the generator', async () => {
    render(<TimetablePage mode="generate" accessToken="token" selectedBranch="branch-1" />)

    expect(await screen.findByText('Generator data: 1 teachers, 1 subjects, 2 classes, 2 assignments; periods 6; availability 1,2,3,4,6,7,8,9; combined 2 sections labelled Lang')).toBeInTheDocument()
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(8))
    for (const call of vi.mocked(fetch).mock.calls) expect(String(call[0])).toContain('pageSize=100')
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/staff?') || String(url).includes('/sections?')).every(([url]) => String(url).includes('branchId=branch-1'))).toBe(true)
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/staff?page=1&pageSize=100&branchId=branch-1&role=TEACHER'), expect.any(Object))
  })

  it('loads saved timetable snapshots for the view page', async () => {
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/screens/TT1?')) return Promise.resolve({ ok: true, json: async () => ({ success: true, data: { records: { count: 1, page: 1, pageSize: 100, totalPages: 1, next: null, previous: null, items: [{ id: 'saved-1', recordType: 'generated-timetable', title: 'Class 8 Timetable', status: 'SAVED', updatedAt: '2026-07-29T08:00:00Z', data: { bundle: { config: { workingDays: [], periods: [] }, teachers: [], subjects: [], classes: [{ id: 'section-1', name: 'Class 8 - A' }], rooms: [], assignments: [], lastResult: null } } }] } } }) })
      throw new Error(`Unexpected URL: ${url}`)
    }))

    render(<TimetablePage mode="view" accessToken="token" selectedBranch="branch-1" />)

    expect(await screen.findByRole('heading', { name: 'View Timetable' })).toBeInTheDocument()
    expect(await screen.findByText('Class 8 Timetable')).toBeInTheDocument()
    expect(screen.getByText('Saved timetable with 1 classes')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/screens/TT1?page=1&pageSize=100&order=-updatedAt&branchId=branch-1'), expect.any(Object))
  })
})
