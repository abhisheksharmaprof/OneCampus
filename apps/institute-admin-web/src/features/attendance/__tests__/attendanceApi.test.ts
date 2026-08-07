import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  approveLeaveApplication,
  bulkMarkAttendance,
  getAttendanceSettings,
  getDailyRoster,
  getLeaveApplications,
  getLeaveBalances,
  getLeaveTypes,
  getLowAttendanceAlerts,
  getOverviewRegister,
  rejectLeaveApplication,
  updateAttendanceSettings,
  updateLeaveQuota,
} from '../api/attendanceApi'

describe('attendanceApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches daily roster via API contract', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              id: 'roster-1',
              studentId: 'st-101',
              firstName: 'Aarav',
              lastName: 'Sharma',
              admissionNumber: 'ADM-001',
              classId: 'cls-1',
              sectionId: 'sec-1',
              status: 'PRESENT',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const result = await getDailyRoster('token', { date: '2026-07-21', search: 'Aarav', branchId: 'b-1' })
    expect(result).toHaveLength(1)
    expect(result[0].studentId).toBe('st-101')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/admin/attendance/daily-roster')
    expect(fetchMock.mock.calls[0][0]).toContain('date=2026-07-21')
    expect(fetchMock.mock.calls[0][0]).toContain('search=Aarav')
  })

  it('bulk marks attendance via POST request', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { success: true, updatedCount: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const payload = {
      date: '2026-07-21',
      records: [
        { studentId: 'st-101', status: 'PRESENT' as const },
        { studentId: 'st-102', status: 'ABSENT' as const, remark: 'Unexcused' },
      ],
    }

    const res = await bulkMarkAttendance('token', payload)
    expect(res.success).toBe(true)
    expect(res.updatedCount).toBe(2)
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST')
    expect(fetchMock.mock.calls[0][1]?.body).toBe(JSON.stringify(payload))
  })

  it('fetches overview register and calendar dates', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            records: [{ id: '1', studentId: 'st-101', date: '2026-07-01', status: 'PRESENT' }],
            calendarDates: ['2026-07-01', '2026-07-02'],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const res = await getOverviewRegister('token', { month: '2026-07' })
    expect(res.records).toHaveLength(1)
    expect(res.calendarDates).toEqual(['2026-07-01', '2026-07-02'])
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/admin/attendance/overview?month=2026-07')
  })

  it('approves leave application', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: 'la-1', status: 'approved', reviewNote: 'Granted' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const res = await approveLeaveApplication('token', 'la-1', 'Granted')
    expect(res.status).toBe('approved')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/admin/attendance/leaves/la-1/approve')
  })

  it('throws error when rejecting leave application without rejectionReason', async () => {
    await expect(rejectLeaveApplication('token', 'la-1', '')).rejects.toThrow('Rejection reason is required')
    await expect(rejectLeaveApplication('token', 'la-1', '   ')).rejects.toThrow('Rejection reason is required')
  })

  it('rejects leave application with mandatory rejection reason', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { id: 'la-1', status: 'rejected', rejectionReason: 'Insufficient notice' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const res = await rejectLeaveApplication('token', 'la-1', 'Insufficient notice')
    expect(res.status).toBe('rejected')
    expect(res.rejectionReason).toBe('Insufficient notice')
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/admin/attendance/leaves/la-1/reject')
  })

  it('fetches low attendance alert list with threshold filtering', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: [
            {
              studentId: 'st-103',
              studentName: 'Bhavya Patel',
              admissionNumber: 'ADM-003',
              className: 'Class 10',
              sectionName: 'A',
              branchId: 'b-1',
              totalClasses: 40,
              attendedClasses: 25,
              attendancePercentage: 62.5,
              consecutiveAbsences: 3,
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )

    const alerts = await getLowAttendanceAlerts('token', { threshold: 75 })
    expect(alerts).toHaveLength(1)
    expect(alerts[0].attendancePercentage).toBeLessThan(75)
    expect(fetchMock.mock.calls[0][0]).toContain('/api/v1/admin/attendance/alerts?threshold=75')
  })

  it('fetches and updates attendance settings and leave quotas', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 'att-set', instituteId: 'inst-1', lowAttendanceThreshold: 75, enableParentNotifications: true, enableAutoAlerts: true, consecutiveAbsentThreshold: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 'att-set', instituteId: 'inst-1', lowAttendanceThreshold: 80, enableParentNotifications: true, enableAutoAlerts: true, consecutiveAbsentThreshold: 3 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const settings = await getAttendanceSettings('token')
    expect(settings.lowAttendanceThreshold).toBe(75)

    const updatedSettings = await updateAttendanceSettings('token', { lowAttendanceThreshold: 80 })
    expect(updatedSettings.lowAttendanceThreshold).toBe(80)
  })

  it('fetches leave types, leave balances, and updates leave quota', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 'lt-1', instituteId: 'inst-1', name: 'Casual Leave', code: 'CL', applicableTo: 'both', maxDaysPerYear: 12, requiresDocument: false, isActive: true }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: [{ id: 'lb-1', studentId: 'st-101', leaveTypeId: 'lt-1', academicYearId: 'ay-1', totalAllocated: 12, usedDays: 2, pendingDays: 0, remainingDays: 10 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: true,
            data: { id: 'lb-1', studentId: 'st-101', leaveTypeId: 'lt-1', academicYearId: 'ay-1', totalAllocated: 15, usedDays: 2, pendingDays: 0, remainingDays: 13 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )

    const types = await getLeaveTypes('token')
    expect(types).toHaveLength(1)

    const balances = await getLeaveBalances('token', { studentId: 'st-101' })
    expect(balances).toHaveLength(1)

    const updatedQuota = await updateLeaveQuota('token', { leaveTypeId: 'lt-1', targetId: 'st-101', targetType: 'student', allocatedDays: 15 })
    expect(updatedQuota.totalAllocated).toBe(15)
  })
})
