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

export { AdminApiError as AttendanceApiError }

export interface MissingAttendanceSection {
  sectionId: string
  classId?: string
  className: string
  sectionName: string
  branchId: string
  teacherName?: string | null
}

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

  return adminRequest<StudentRosterItem[]>(accessToken, `attendance/daily-roster?${query}`, { signal })
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
  return adminRequest<{ success: boolean; updatedCount: number }>(accessToken, 'attendance/bulk', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
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

  return adminRequest<{
      records: Array<{ id: string; studentId: string; date: string; status: AttendanceStatus; remark?: string }>
      calendarDates: string[]
      calendar?: Array<{ date: string; state: string; percentage?: number | null }>
    }>(accessToken, `attendance/overview?${query}`, { signal })
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

  return adminRequest<LeaveApplication[]>(accessToken, `attendance/leaves?${query}`, { signal })
}

export async function approveLeaveApplication(
  accessToken: string,
  leaveId: string,
  note?: string,
): Promise<LeaveApplication> {
  return adminRequest<LeaveApplication>(
      accessToken,
      `attendance/leaves/${encodeURIComponent(leaveId)}/approve`,
      {
        method: 'POST',
        body: JSON.stringify({ note }),
      },
    )
}

export async function rejectLeaveApplication(
  accessToken: string,
  leaveId: string,
  rejectionReason: string,
): Promise<LeaveApplication> {
  if (!rejectionReason || !rejectionReason.trim()) {
    throw new Error('Rejection reason is required')
  }

  return adminRequest<LeaveApplication>(
      accessToken,
      `attendance/leaves/${encodeURIComponent(leaveId)}/reject`,
      {
        method: 'POST',
        body: JSON.stringify({ rejectionReason: rejectionReason.trim() }),
      },
    )
}

export async function getLowAttendanceAlerts(
  accessToken: string,
  params?: { branchId?: string; threshold?: number },
  signal?: AbortSignal,
): Promise<AttendanceAlertStudent[]> {
  const threshold = params?.threshold ?? 75
  const query = new URLSearchParams({ threshold: String(threshold) })
  if (params?.branchId) query.set('branchId', params.branchId)

  return adminRequest<AttendanceAlertStudent[]>(accessToken, `attendance/alerts?${query}`, { signal })
}

export async function getAttendanceSettings(
  accessToken: string,
  branchId?: string,
  signal?: AbortSignal,
): Promise<AttendanceSettings> {
  const query = new URLSearchParams()
  if (branchId) query.set('branchId', branchId)

  return adminRequest<AttendanceSettings>(accessToken, `attendance/settings?${query}`, { signal })
}

export async function updateAttendanceSettings(
  accessToken: string,
  settings: Partial<AttendanceSettings>,
): Promise<AttendanceSettings> {
  return adminRequest<AttendanceSettings>(accessToken, 'attendance/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    })
}

export async function getLeaveTypes(
  accessToken: string,
  instituteId?: string,
  signal?: AbortSignal,
): Promise<LeaveType[]> {
  const query = new URLSearchParams()
  if (instituteId) query.set('instituteId', instituteId)

  return adminRequest<LeaveType[]>(accessToken, `attendance/leave-types?${query}`, { signal })
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

  return adminRequest<LeaveBalance[]>(accessToken, `attendance/leave-balances?${query}`, { signal })
}

export async function updateLeaveQuota(
  accessToken: string,
  payload: UpdateLeaveQuotaPayload,
): Promise<LeaveBalance> {
  return adminRequest<LeaveBalance>(accessToken, 'attendance/leave-quotas', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
}

export async function getLeaveHistory(accessToken: string, leaveId: string, signal?: AbortSignal) {
  return adminRequest<Array<{ id: string; action: string; actorName?: string; note?: string; createdAt: string }>>(accessToken, `attendance/leaves/${encodeURIComponent(leaveId)}/history`, { signal })
}

export async function actOnAttendanceNotification(accessToken: string, notificationId: string, action: 'acknowledge' | 'dispute') {
  return adminRequest<{ id: string; action: string }>(accessToken, `attendance/notifications/${encodeURIComponent(notificationId)}/${action}`, { method: 'POST' })
}
