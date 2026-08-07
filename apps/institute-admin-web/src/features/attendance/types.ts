export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'ON_LEAVE' | 'EXCUSED' | 'NOT_MARKED'

export interface StudentRosterItem {
  id: string
  studentId: string
  firstName: string
  lastName: string
  rollNumber?: string
  admissionNumber: string
  classId: string
  sectionId: string
  className?: string
  sectionName?: string
  status: AttendanceStatus
  remark?: string
  captureMode?: string
  periodLabel?: string
  subjectId?: string
  leaveApplicationId?: string
  autoPrefilled?: boolean
}

export type LeaveApplicantType = 'student' | 'staff'
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'
export type HalfDayType = 'none' | 'first_half' | 'second_half'

export interface LeaveApplication {
  id: string
  applicantType: LeaveApplicantType
  studentId?: string
  studentName?: string
  staffUserId?: string
  staffName?: string
  branchId: string
  appliedBy: string
  appliedByName?: string
  leaveTypeId: string
  leaveTypeName?: string
  startDate: string
  endDate: string
  totalDays: number
  halfDayType?: HalfDayType
  reason: string
  status: LeaveStatus
  reviewedBy?: string
  reviewedByName?: string
  reviewedAt?: string
  reviewNote?: string
  rejectionReason?: string
  documentUrl?: string
  balanceAllocated?: number
  balanceUsed?: number
  balanceRemaining?: number
  autoPrefilledAttendance?: boolean
  createdAt: string
}

export interface LeaveType {
  id: string
  instituteId: string
  name: string
  code: string
  description?: string
  applicableTo: 'student' | 'staff' | 'both'
  maxDaysPerYear: number
  requiresDocument: boolean
  isActive: boolean
  createdAt?: string
}

export interface LeaveBalance {
  id: string
  userId?: string
  studentId?: string
  leaveTypeId: string
  leaveTypeName?: string
  academicYearId: string
  totalAllocated: number
  usedDays: number
  pendingDays: number
  remainingDays: number
}

export interface AttendanceAlertStudent {
  studentId: string
  studentName: string
  admissionNumber: string
  className: string
  sectionName: string
  branchId: string
  totalClasses: number
  attendedClasses: number
  attendancePercentage: number
  consecutiveAbsences: number
  lastAbsentDate?: string
}

export interface AttendanceSettings {
  id: string
  instituteId: string
  branchId?: string
  lowAttendanceThreshold: number
  enableParentNotifications: boolean
  enableAutoAlerts: boolean
  consecutiveAbsentThreshold: number
  notifyClassTeacher?: boolean
  notifyBranchAdmin?: boolean
  enabledCaptureModes?: string[]
  studentLeaveRouting?: 'class_teacher' | 'branch_admin' | 'both'
  staffLeaveRouting?: 'branch_admin' | 'institute_admin'
  parentAcknowledgementEnabled?: boolean
  periodWiseEnabled?: boolean
  updatedAt?: string
}

export interface OfflineAttendanceAction {
  id: string
  studentId: string
  classSectionId: string
  attendanceDate: string
  status: AttendanceStatus
  remark?: string
  timestamp: number
  synced: boolean
}

export interface BulkMarkAttendancePayload {
  date: string
  classSectionId?: string
  periodId?: string
  periodLabel?: string
  subjectId?: string
  captureMode?: string
  records: Array<{
    studentId: string
    status: AttendanceStatus
    remark?: string
  }>
}

export interface UpdateLeaveQuotaPayload {
  leaveTypeId: string
  targetId: string
  targetType: 'student' | 'staff'
  allocatedDays: number
}
