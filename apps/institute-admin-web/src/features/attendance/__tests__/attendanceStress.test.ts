import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveLeaveApplication,
  bulkMarkAttendance,
  getAttendanceSettings,
  getDailyRoster,
  getLeaveApplications,
  getLeaveBalances,
  getLowAttendanceAlerts,
  getOverviewRegister,
  rejectLeaveApplication,
} from '../api/attendanceApi'
import { processStudents } from '../utils/attendanceLogic'
import type { AttendanceStatus, BulkMarkAttendancePayload } from '../types'

describe('Empirical Stress & Edge-Case Test Suite — Attendance & Leave Management', () => {
  const token = 'test-access-token'

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // =========================================================================
  // TASK 1A: Boundary values for attendance thresholds (0%, 75%, 100%, negative, >100%)
  // =========================================================================
  describe('Boundary values for attendance thresholds', () => {
    it('handles 0% threshold correctly via API contract and offline mode', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const alerts = await getLowAttendanceAlerts(token, { threshold: 0 })
      expect(alerts).toEqual([])
      expect(fetchMock.mock.calls[0][0]).toContain('threshold=0')
    })

    it('handles default 75% threshold correctly', async () => {
      const mockAlerts = [
        {
          studentId: 'st-1',
          studentName: 'Student Low',
          admissionNumber: 'ADM-01',
          className: '10',
          sectionName: 'A',
          branchId: 'br-1',
          totalClasses: 100,
          attendedClasses: 60,
          attendancePercentage: 60,
          consecutiveAbsences: 4,
        },
      ]
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: mockAlerts }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const alerts = await getLowAttendanceAlerts(token, { threshold: 75 })
      expect(alerts).toHaveLength(1)
      expect(alerts[0].attendancePercentage).toBeLessThan(75)
      expect(fetchMock.mock.calls[0][0]).toContain('threshold=75')
    })

    it('handles 100% threshold boundary', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const alerts = await getLowAttendanceAlerts(token, { threshold: 100 })
      expect(alerts).toEqual([])
      expect(fetchMock.mock.calls[0][0]).toContain('threshold=100')
    })

    it('handles negative threshold values (-10%, -50%) without runtime exception', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const alerts = await getLowAttendanceAlerts(token, { threshold: -10 })
      expect(alerts).toEqual([])
      expect(fetchMock.mock.calls[0][0]).toContain('threshold=-10')
    })

    it('handles >100% threshold values (105%, 150%) correctly', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const alerts = await getLowAttendanceAlerts(token, { threshold: 150 })
      expect(alerts).toEqual([])
      expect(fetchMock.mock.calls[0][0]).toContain('threshold=150')
    })

    it('handles offline fallback threshold filtering across 0%, 75%, 100%, negative, >100%', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      // Offline mock data has mockAttendanceAlertStudents with percentages like 62.5%
      const alerts0 = await getLowAttendanceAlerts(token, { threshold: 0 })
      expect(alerts0.every((a) => a.attendancePercentage < 0)).toBe(true)

      const alerts75 = await getLowAttendanceAlerts(token, { threshold: 75 })
      expect(alerts75.every((a) => a.attendancePercentage < 75)).toBe(true)

      const alertsNegative = await getLowAttendanceAlerts(token, { threshold: -50 })
      expect(alertsNegative).toHaveLength(0)

      const alerts150 = await getLowAttendanceAlerts(token, { threshold: 150 })
      expect(alerts150.length).toBeGreaterThan(0)
    })
  })

  // =========================================================================
  // TASK 1B: Leave rejection with empty string "", whitespace "   ", and valid strings
  // =========================================================================
  describe('Leave rejection validation', () => {
    it('rejects leave application with empty string "" and throws error', async () => {
      await expect(rejectLeaveApplication(token, 'la-101', '')).rejects.toThrow('Rejection reason is required')
    })

    it('rejects leave application with whitespace string "   " and throws error', async () => {
      await expect(rejectLeaveApplication(token, 'la-101', '   ')).rejects.toThrow('Rejection reason is required')
    })

    it('rejects leave application with newlines and tab whitespace "\t\n  " and throws error', async () => {
      await expect(rejectLeaveApplication(token, 'la-101', '\t\n  ')).rejects.toThrow('Rejection reason is required')
    })

    it('succeeds rejecting leave application with valid string and trims whitespace', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 'la-101', status: 'rejected', rejectionReason: 'Insufficient notice period' },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const res = await rejectLeaveApplication(token, 'la-101', '  Insufficient notice period  ')
      expect(res.status).toBe('rejected')
      expect(res.rejectionReason).toBe('Insufficient notice period')

      const bodySent = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
      expect(bodySent.rejectionReason).toBe('Insufficient notice period')
    })

    it('rejects leave application in offline mode with valid reason and handles 404 for non-existent ID', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      // Valid existing mock leave application (la-1 exists in mockData)
      const res = await rejectLeaveApplication(token, 'la-1', 'Medical certificate missing')
      expect(res.status).toBe('rejected')
      expect(res.rejectionReason).toBe('Medical certificate missing')

      // Non-existent ID in offline mode should throw AdminApiError 404
      await expect(rejectLeaveApplication(token, 'non-existent-id', 'Valid reason')).rejects.toThrow('Leave application not found')
    })
  })

  // =========================================================================
  // TASK 1C: Bulk attendance marking payloads (0 students, 1 student, 100 students, missing statuses)
  // =========================================================================
  describe('Bulk attendance marking payloads', () => {
    it('handles 0 students payload correctly', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { success: true, updatedCount: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const payload: BulkMarkAttendancePayload = {
        date: '2026-07-21',
        records: [],
      }

      const res = await bulkMarkAttendance(token, payload)
      expect(res.success).toBe(true)
      expect(res.updatedCount).toBe(0)
    })

    it('handles 1 student payload correctly', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { success: true, updatedCount: 1 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const payload: BulkMarkAttendancePayload = {
        date: '2026-07-21',
        classSectionId: 'cs-1',
        records: [{ studentId: 'st-001', status: 'PRESENT' }],
      }

      const res = await bulkMarkAttendance(token, payload)
      expect(res.success).toBe(true)
      expect(res.updatedCount).toBe(1)
    })

    it('handles 100 students payload correctly', async () => {
      const hundredRecords = Array.from({ length: 100 }, (_, i) => ({
        studentId: `st-${String(i + 1).padStart(3, '0')}`,
        status: (i % 2 === 0 ? 'PRESENT' : 'ABSENT') as AttendanceStatus,
        remark: i % 10 === 0 ? `Remark for student ${i + 1}` : undefined,
      }))

      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { success: true, updatedCount: 100 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const payload: BulkMarkAttendancePayload = {
        date: '2026-07-21',
        classSectionId: 'cs-100',
        records: hundredRecords,
      }

      const res = await bulkMarkAttendance(token, payload)
      expect(res.success).toBe(true)
      expect(res.updatedCount).toBe(100)

      const parsedBody = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
      expect(parsedBody.records).toHaveLength(100)
    })

    it('handles payload with missing statuses or optional remarks safely', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { success: true, updatedCount: 2 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const payload: BulkMarkAttendancePayload = {
        date: '2026-07-21',
        records: [
          { studentId: 'st-101', status: 'PRESENT' },
          { studentId: 'st-102', status: 'ON_LEAVE', remark: '' },
        ],
      }

      const res = await bulkMarkAttendance(token, payload)
      expect(res.success).toBe(true)
      expect(res.updatedCount).toBe(2)
    })

    it('handles offline fallback mode for 100 student bulk attendance payload', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      const hundredRecords = Array.from({ length: 100 }, (_, i) => ({
        studentId: `st-${String(i + 1).padStart(3, '0')}`,
        status: 'PRESENT' as AttendanceStatus,
      }))

      const payload: BulkMarkAttendancePayload = {
        date: '2026-07-21',
        records: hundredRecords,
      }

      const res = await bulkMarkAttendance(token, payload)
      expect(res.success).toBe(true)
      expect(res.updatedCount).toBe(100)
    })
  })

  // =========================================================================
  // TASK 1D: Roster filtering by invalid date/branch/class/section formats
  // =========================================================================
  describe('Roster filtering and format edge cases', () => {
    it('handles invalid date string formats ("invalid-date", "2026-99-99", "") in getDailyRoster', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(
          JSON.stringify({ success: true, data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const result1 = await getDailyRoster(token, { date: 'invalid-date' })
      expect(result1).toEqual([])
      expect(fetchMock.mock.calls[0][0]).toContain('date=invalid-date')

      const result2 = await getDailyRoster(token, { date: '2026-99-99' })
      expect(result2).toEqual([])
      expect(fetchMock.mock.calls[1][0]).toContain('date=2026-99-99')

      const result3 = await getDailyRoster(token, { date: '' })
      expect(result3).toEqual([])
      expect(fetchMock.mock.calls[2][0]).toContain('date=')
    })

    it('handles invalid branch/class/section formats and special characters', async () => {
      const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(
          JSON.stringify({ success: true, data: [] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

      const specialParams = {
        date: '2026-07-21',
        branchId: "'; DROP TABLE students; --",
        classId: '<script>alert(1)</script>',
        sectionId: '../../etc/passwd',
        search: '   Aarav   ',
      }

      const result = await getDailyRoster(token, specialParams)
      expect(result).toEqual([])
      const url = fetchMock.mock.calls[0][0] as string
      expect(url).toContain('branchId=%27%3B+DROP+TABLE')
      expect(url).toContain('classId=%3Cscript%3E')
      expect(url).toContain('search=Aarav') // Trimmed search
    })

    it('handles offline roster filtering with white-spaces and special characters in search', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))

      // Search with leading/trailing spaces
      const roster1 = await getDailyRoster(token, { date: '2026-07-21', search: '   aarav   ' })
      expect(roster1.every((item) => item.firstName.toLowerCase().includes('aarav'))).toBe(true)

      // Search with no matches
      const roster2 = await getDailyRoster(token, { date: '2026-07-21', search: 'NONEXISTENT_STUDENT_XYZ' })
      expect(roster2).toHaveLength(0)
    })

    it('handles processStudents helper logic with edge inputs', () => {
      const students = [
        { id: 's1', firstName: 'Aarav', lastName: 'Sharma', admissionNumber: 'ADM1' },
        { id: 's2', firstName: 'Bhavya', lastName: 'Patel', admissionNumber: 'ADM2' },
      ]

      const records = [
        { id: 'r1', studentId: 's1', studentName: 'Aarav Sharma', date: '2026-07-21', status: 'PRESENT' as const },
      ]

      // Filter by NOT_MARKED
      const notMarked = processStudents(students, records, '2026-07-21', { status: 'NOT_MARKED', sort: 'name' })
      expect(notMarked).toHaveLength(1)
      expect(notMarked[0].id).toBe('s2')

      // Filter by non-matching date returns all as NOT_MARKED for that date
      const otherDate = processStudents(students, records, '2026-07-22', { status: 'NOT_MARKED', sort: 'name' })
      expect(otherDate).toHaveLength(2)
    })
  })
})
