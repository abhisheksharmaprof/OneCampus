import { AdminApiError, adminRequest } from '../../admin/admin.api'
import type {
  AttendanceAlertStudent,
  AttendanceSettings,
  AttendanceStatus,
  BulkMarkAttendancePayload,
  LeaveApplication,
  LeaveBalance,
  LeaveType,
  StudentRosterItem,
  UpdateLeaveQuotaPayload,
} from '../types'
import {
  mockAttendanceAlertStudents,
  mockAttendanceSettings,
  mockLeaveApplications,
  mockLeaveBalances,
  mockLeaveTypes,
  mockStudentRoster,
} from '../utils/mockData'

export { AdminApiError as AttendanceApiError }

export interface MissingAttendanceSection {
  sectionId: string
  classId?: string
  className: string
  sectionName: string
  branchId: string
  teacherName?: string | null
}

function isNetworkError(error: unknown): boolean {
  if (error instanceof AdminApiError && error.status === 0) return true
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('fetch failed') || msg.includes('failed to fetch') || msg.includes('networkerror')
  }
  return false
}

// In-memory mock state for offline fallback
let localLeaveApplications = [...mockLeaveApplications]
let localLeaveBalances = [...mockLeaveBalances]
let localAttendanceSettings = { ...mockAttendanceSettings }
let localStudentRoster = [...mockStudentRoster]

export async function getDailyRoster(
  accessToken: string,
  params: { date: string; branchId?: string; classId?: string; sectionId?: string; search?: string },
  signal?: AbortSignal,
): Promise<StudentRosterItem[]> {
  const query = new URLSearchParams({ date: params.date })
  if (params.branchId) query.set('branchId', params.branchId)
  if (params.classId) query.set('classId', params.classId)
  if (params.sectionId) query.set('sectionId', params.sectionId)
  if (params.search?.trim()) query.set('search', params.search.trim())

  try {
    return await adminRequest<StudentRosterItem[]>(accessToken, `attendance/daily-roster?${query}`, { signal })
  } catch (error) {
    if (isNetworkError(error)) {
      let roster = [...localStudentRoster]
      if (params.search?.trim()) {
        const s = params.search.trim().toLowerCase()
        roster = roster.filter(
          (item) =>
            item.firstName.toLowerCase().includes(s) ||
            item.lastName.toLowerCase().includes(s) ||
            item.admissionNumber.toLowerCase().includes(s),
        )
      }
      return roster
    }
    throw error
  }
}

export async function getAttendanceReminders(
  accessToken: string,
  params: { date: string; branchId?: string },
  signal?: AbortSignal,
): Promise<{ date: string; missingSections: MissingAttendanceSection[] }> {
  const query = new URLSearchParams({ date: params.date })
  if (params.branchId) query.set('branchId', params.branchId)
  return adminRequest<{ date: string; missingSections: MissingAttendanceSection[] }>(
    accessToken,
    `attendance/reminders?${query}`,
    { signal },
  )
}

export async function bulkMarkAttendance(
  accessToken: string,
  payload: BulkMarkAttendancePayload,
): Promise<{ success: boolean; updatedCount: number }> {
  try {
    return await adminRequest<{ success: boolean; updatedCount: number }>(accessToken, 'attendance/bulk', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (isNetworkError(error)) {
      // update local mock roster
      payload.records.forEach((rec) => {
        const idx = localStudentRoster.findIndex((item) => item.studentId === rec.studentId)
        if (idx !== -1) {
          localStudentRoster[idx] = {
            ...localStudentRoster[idx],
            status: rec.status,
            remark: rec.remark ?? localStudentRoster[idx].remark,
          }
        }
      })
      return { success: true, updatedCount: payload.records.length }
    }
    throw error
  }
}

export async function getOverviewRegister(
  accessToken: string,
  params: { month: string; branchId?: string; classId?: string; sectionId?: string },
  signal?: AbortSignal,
): Promise<{
  records: Array<{ id: string; studentId: string; date: string; status: AttendanceStatus; remark?: string }>
  calendarDates: string[]
  calendar?: Array<{ date: string; state: string; percentage?: number | null }>
}> {
  const query = new URLSearchParams({ month: params.month })
  if (params.branchId) query.set('branchId', params.branchId)
  if (params.classId) query.set('classId', params.classId)
  if (params.sectionId) query.set('sectionId', params.sectionId)

  try {
    return await adminRequest<{
      records: Array<{ id: string; studentId: string; date: string; status: AttendanceStatus; remark?: string }>
      calendarDates: string[]
      calendar?: Array<{ date: string; state: string; percentage?: number | null }>
    }>(accessToken, `attendance/overview?${query}`, { signal })
  } catch (error) {
    if (isNetworkError(error)) {
      // generate calendar dates for month YYYY-MM
      const [year, mon] = params.month.split('-').map(Number)
      const numDays = new Date(year, mon, 0).getDate()
      const calendarDates: string[] = []
      for (let d = 1; d <= numDays; d++) {
        calendarDates.push(`${year}-${String(mon).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
      }

      const records = localStudentRoster.map((student, idx) => ({
        id: `att-rec-${idx + 1}`,
        studentId: student.studentId,
        date: `${params.month}-15`,
        status: student.status,
        remark: student.remark,
      }))

      return { records, calendarDates }
    }
    throw error
  }
}

export async function getLeaveApplications(
  accessToken: string,
  params?: { applicantType?: 'student' | 'staff'; status?: string; branchId?: string; search?: string },
  signal?: AbortSignal,
): Promise<LeaveApplication[]> {
  const query = new URLSearchParams()
  if (params?.applicantType) query.set('applicantType', params.applicantType)
  if (params?.status) query.set('status', params.status)
  if (params?.branchId) query.set('branchId', params.branchId)
  if (params?.search?.trim()) query.set('search', params.search.trim())

  try {
    return await adminRequest<LeaveApplication[]>(accessToken, `attendance/leaves?${query}`, { signal })
  } catch (error) {
    if (isNetworkError(error)) {
      let result = [...localLeaveApplications]
      if (params?.applicantType) {
        result = result.filter((item) => item.applicantType === params.applicantType)
      }
      if (params?.status) {
        result = result.filter((item) => item.status === params.status)
      }
      if (params?.search?.trim()) {
        const s = params.search.trim().toLowerCase()
        result = result.filter(
          (item) =>
            (item.studentName && item.studentName.toLowerCase().includes(s)) ||
            (item.staffName && item.staffName.toLowerCase().includes(s)) ||
            item.reason.toLowerCase().includes(s),
        )
      }
      return result
    }
    throw error
  }
}

export async function approveLeaveApplication(
  accessToken: string,
  leaveId: string,
  note?: string,
): Promise<LeaveApplication> {
  try {
    return await adminRequest<LeaveApplication>(
      accessToken,
      `attendance/leaves/${encodeURIComponent(leaveId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      },
    )
  } catch (error) {
    if (isNetworkError(error)) {
      const idx = localLeaveApplications.findIndex((item) => item.id === leaveId)
      if (idx === -1) {
        throw new AdminApiError('Leave application not found', { status: 404 })
      }
      const updated: LeaveApplication = {
        ...localLeaveApplications[idx],
        status: 'approved',
        reviewedBy: 'current-user-id',
        reviewedByName: 'Institute Admin',
        reviewedAt: new Date().toISOString(),
        reviewNote: note ?? localLeaveApplications[idx].reviewNote,
      }
      localLeaveApplications[idx] = updated
      return updated
    }
    throw error
  }
}

export async function rejectLeaveApplication(
  accessToken: string,
  leaveId: string,
  rejectionReason: string,
): Promise<LeaveApplication> {
  if (!rejectionReason || !rejectionReason.trim()) {
    throw new Error('Rejection reason is required')
  }

  try {
    return await adminRequest<LeaveApplication>(
      accessToken,
      `attendance/leaves/${encodeURIComponent(leaveId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      },
    )
  } catch (error) {
    if (isNetworkError(error)) {
      const idx = localLeaveApplications.findIndex((item) => item.id === leaveId)
      if (idx === -1) {
        throw new AdminApiError('Leave application not found', { status: 404 })
      }
      const updated: LeaveApplication = {
        ...localLeaveApplications[idx],
        status: 'rejected',
        reviewedBy: 'current-user-id',
        reviewedByName: 'Institute Admin',
        reviewedAt: new Date().toISOString(),
        rejectionReason: rejectionReason.trim(),
        reviewNote: rejectionReason.trim(),
      }
      localLeaveApplications[idx] = updated
      return updated
    }
    throw error
  }
}

export async function getLowAttendanceAlerts(
  accessToken: string,
  params?: { branchId?: string; threshold?: number },
  signal?: AbortSignal,
): Promise<AttendanceAlertStudent[]> {
  const threshold = params?.threshold ?? 75
  const query = new URLSearchParams({ threshold: String(threshold) })
  if (params?.branchId) query.set('branchId', params.branchId)

  try {
    return await adminRequest<AttendanceAlertStudent[]>(accessToken, `attendance/alerts?${query}`, { signal })
  } catch (error) {
    if (isNetworkError(error)) {
      let alerts = [...mockAttendanceAlertStudents]
      if (params?.branchId) {
        alerts = alerts.filter((item) => item.branchId === params.branchId)
      }
      return alerts.filter((item) => item.attendancePercentage < threshold)
    }
    throw error
  }
}

export async function getAttendanceSettings(
  accessToken: string,
  branchId?: string,
  signal?: AbortSignal,
): Promise<AttendanceSettings> {
  const query = new URLSearchParams()
  if (branchId) query.set('branchId', branchId)

  try {
    return await adminRequest<AttendanceSettings>(accessToken, `attendance/settings?${query}`, { signal })
  } catch (error) {
    if (isNetworkError(error)) {
      return { ...localAttendanceSettings, ...(branchId ? { branchId } : {}) }
    }
    throw error
  }
}

export async function updateAttendanceSettings(
  accessToken: string,
  settings: Partial<AttendanceSettings>,
): Promise<AttendanceSettings> {
  try {
    return await adminRequest<AttendanceSettings>(accessToken, 'attendance/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    })
  } catch (error) {
    if (isNetworkError(error)) {
      localAttendanceSettings = {
        ...localAttendanceSettings,
        ...settings,
        updatedAt: new Date().toISOString(),
      }
      return localAttendanceSettings
    }
    throw error
  }
}

export async function getLeaveTypes(
  accessToken: string,
  instituteId?: string,
  signal?: AbortSignal,
): Promise<LeaveType[]> {
  const query = new URLSearchParams()
  if (instituteId) query.set('instituteId', instituteId)

  try {
    return await adminRequest<LeaveType[]>(accessToken, `attendance/leave-types?${query}`, { signal })
  } catch (error) {
    if (isNetworkError(error)) {
      let types = [...mockLeaveTypes]
      if (instituteId) {
        types = types.filter((item) => item.instituteId === instituteId)
      }
      return types
    }
    throw error
  }
}

export async function getLeaveBalances(
  accessToken: string,
  params?: { studentId?: string; userId?: string; academicYearId?: string },
  signal?: AbortSignal,
): Promise<LeaveBalance[]> {
  const query = new URLSearchParams()
  if (params?.studentId) query.set('studentId', params.studentId)
  if (params?.userId) query.set('userId', params.userId)
  if (params?.academicYearId) query.set('academicYearId', params.academicYearId)

  try {
    return await adminRequest<LeaveBalance[]>(accessToken, `attendance/leave-balances?${query}`, { signal })
  } catch (error) {
    if (isNetworkError(error)) {
      let balances = [...localLeaveBalances]
      if (params?.studentId) {
        balances = balances.filter((item) => item.studentId === params.studentId)
      }
      if (params?.userId) {
        balances = balances.filter((item) => item.userId === params.userId)
      }
      return balances
    }
    throw error
  }
}

export async function updateLeaveQuota(
  accessToken: string,
  payload: UpdateLeaveQuotaPayload,
): Promise<LeaveBalance> {
  try {
    return await adminRequest<LeaveBalance>(accessToken, 'attendance/leave-quotas', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (isNetworkError(error)) {
      const idx = localLeaveBalances.findIndex(
        (item) =>
          item.leaveTypeId === payload.leaveTypeId &&
          (payload.targetType === 'student' ? item.studentId === payload.targetId : item.userId === payload.targetId),
      )
      if (idx !== -1) {
        const updated: LeaveBalance = {
          ...localLeaveBalances[idx],
          totalAllocated: payload.allocatedDays,
          remainingDays: payload.allocatedDays - localLeaveBalances[idx].usedDays,
        }
        localLeaveBalances[idx] = updated
        return updated
      } else {
        const newBalance: LeaveBalance = {
          id: `lb-new-${Date.now()}`,
          ...(payload.targetType === 'student' ? { studentId: payload.targetId } : { userId: payload.targetId }),
          leaveTypeId: payload.leaveTypeId,
          leaveTypeName: mockLeaveTypes.find((t) => t.id === payload.leaveTypeId)?.name ?? 'Custom Leave',
          academicYearId: 'ay-2026',
          totalAllocated: payload.allocatedDays,
          usedDays: 0,
          pendingDays: 0,
          remainingDays: payload.allocatedDays,
        }
        localLeaveBalances.push(newBalance)
        return newBalance
      }
    }
    throw error
  }
}

export async function getLeaveHistory(accessToken: string, leaveId: string, signal?: AbortSignal) {
  return adminRequest<Array<{ id: string; action: string; actorName?: string; note?: string; createdAt: string }>>(accessToken, `attendance/leaves/${encodeURIComponent(leaveId)}/history`, { signal })
}

export async function actOnAttendanceNotification(accessToken: string, notificationId: string, action: 'acknowledge' | 'dispute') {
  return adminRequest<{ id: string; action: string }>(accessToken, `attendance/notifications/${encodeURIComponent(notificationId)}/${action}`, { method: 'POST' })
}
