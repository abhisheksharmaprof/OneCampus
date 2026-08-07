import type {
  AttendanceAlertStudent,
  AttendanceSettings,
  LeaveApplication,
  LeaveBalance,
  LeaveType,
  StudentRosterItem,
} from '../types'

export type MockChartData = {
  date: string
  present: number
  absent: number
  late: number
  excused: number
}

export const generateMockTrends = (days: number, selectedDate: string): MockChartData[] => {
  const data: MockChartData[] = []
  const [y, m, dParam] = selectedDate.split('-')
  const today = new Date(+y, +m - 1, +dParam)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    data.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      present: Math.floor(Math.random() * 50) + 200,
      absent: Math.floor(Math.random() * 10) + 5,
      late: Math.floor(Math.random() * 5) + 1,
      excused: Math.floor(Math.random() * 3) + 1,
    })
  }
  return data
}

export const getPieData = (data: MockChartData[]) => {
  let present = 0
  let absent = 0
  let late = 0
  let excused = 0
  data.forEach((d) => {
    present += d.present
    absent += d.absent
    late += d.late
    excused += d.excused
  })
  return [
    { name: 'Present', value: present },
    { name: 'Absent', value: absent },
    { name: 'Late', value: late },
    { name: 'Excused', value: excused },
  ]
}

export const getChartData = (selectedDate: string) => {
  const chartData = generateMockTrends(30, selectedDate)
  const pieData = getPieData(chartData)
  return { mockChartData: chartData, mockPieData: pieData }
}

export const mockLeaveTypes: LeaveType[] = [
  {
    id: 'lt-1',
    instituteId: 'inst-1',
    name: 'Casual Leave',
    code: 'CL',
    description: 'Casual absence quota',
    applicableTo: 'both',
    maxDaysPerYear: 12,
    requiresDocument: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'lt-2',
    instituteId: 'inst-1',
    name: 'Sick Leave',
    code: 'SL',
    description: 'Medical leave with optional document attachment',
    applicableTo: 'both',
    maxDaysPerYear: 10,
    requiresDocument: true,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'lt-3',
    instituteId: 'inst-1',
    name: 'Earned Leave',
    code: 'EL',
    description: 'Staff earned privilege leave',
    applicableTo: 'staff',
    maxDaysPerYear: 15,
    requiresDocument: false,
    isActive: true,
    createdAt: '2026-01-01T00:00:00Z',
  },
]

export const mockLeaveApplications: LeaveApplication[] = [
  {
    id: 'la-1',
    applicantType: 'student',
    studentId: 'st-101',
    studentName: 'Aarav Sharma',
    branchId: 'branch-1',
    appliedBy: 'user-parent-1',
    appliedByName: 'Rajesh Sharma',
    leaveTypeId: 'lt-2',
    leaveTypeName: 'Sick Leave',
    startDate: '2026-07-20',
    endDate: '2026-07-22',
    totalDays: 3,
    halfDayType: 'none',
    reason: 'High fever and viral flu',
    status: 'pending',
    documentUrl: 'https://storage.campusone.internal/docs/med-cert-101.pdf',
    autoPrefilledAttendance: true,
    createdAt: '2026-07-19T10:00:00Z',
  },
  {
    id: 'la-2',
    applicantType: 'student',
    studentId: 'st-102',
    studentName: 'Ananya Verma',
    branchId: 'branch-1',
    appliedBy: 'user-parent-2',
    appliedByName: 'Suresh Verma',
    leaveTypeId: 'lt-1',
    leaveTypeName: 'Casual Leave',
    startDate: '2026-07-18',
    endDate: '2026-07-18',
    totalDays: 1,
    halfDayType: 'none',
    reason: 'Family wedding event',
    status: 'approved',
    reviewedBy: 'admin-1',
    reviewedByName: 'Principal Admin',
    reviewedAt: '2026-07-17T14:30:00Z',
    reviewNote: 'Approved for family function.',
    createdAt: '2026-07-16T09:00:00Z',
  },
  {
    id: 'la-3',
    applicantType: 'staff',
    staffUserId: 'staff-201',
    staffName: 'Priya Nair (Teacher)',
    branchId: 'branch-1',
    appliedBy: 'staff-201',
    appliedByName: 'Priya Nair',
    leaveTypeId: 'lt-3',
    leaveTypeName: 'Earned Leave',
    startDate: '2026-07-25',
    endDate: '2026-07-27',
    totalDays: 3,
    halfDayType: 'none',
    reason: 'Attending personal seminar in Bangalore',
    status: 'pending',
    createdAt: '2026-07-21T08:00:00Z',
  },
  {
    id: 'la-4',
    applicantType: 'staff',
    staffUserId: 'staff-202',
    staffName: 'Rohan Gupta (Math Faculty)',
    branchId: 'branch-1',
    appliedBy: 'staff-202',
    appliedByName: 'Rohan Gupta',
    leaveTypeId: 'lt-1',
    leaveTypeName: 'Casual Leave',
    startDate: '2026-07-15',
    endDate: '2026-07-15',
    totalDays: 0.5,
    halfDayType: 'first_half',
    reason: 'Personal errand in morning',
    status: 'rejected',
    reviewedBy: 'admin-1',
    reviewedByName: 'Principal Admin',
    reviewedAt: '2026-07-14T16:00:00Z',
    reviewNote: 'Insufficient substitute coverage',
    rejectionReason: 'No teacher available for first morning period substitute.',
    createdAt: '2026-07-14T10:00:00Z',
  },
]

export const mockLeaveBalances: LeaveBalance[] = [
  {
    id: 'lb-101',
    studentId: 'st-101',
    leaveTypeId: 'lt-1',
    leaveTypeName: 'Casual Leave',
    academicYearId: 'ay-2026',
    totalAllocated: 12,
    usedDays: 2,
    pendingDays: 0,
    remainingDays: 10,
  },
  {
    id: 'lb-102',
    studentId: 'st-101',
    leaveTypeId: 'lt-2',
    leaveTypeName: 'Sick Leave',
    academicYearId: 'ay-2026',
    totalAllocated: 10,
    usedDays: 0,
    pendingDays: 3,
    remainingDays: 7,
  },
  {
    id: 'lb-201',
    userId: 'staff-201',
    leaveTypeId: 'lt-3',
    leaveTypeName: 'Earned Leave',
    academicYearId: 'ay-2026',
    totalAllocated: 15,
    usedDays: 5,
    pendingDays: 3,
    remainingDays: 7,
  },
]

export const mockStudentRoster: StudentRosterItem[] = [
  {
    id: 'roster-1',
    studentId: 'st-101',
    firstName: 'Aarav',
    lastName: 'Sharma',
    rollNumber: '01',
    admissionNumber: 'ADM-2026-001',
    classId: 'cls-10',
    sectionId: 'sec-a',
    className: 'Class 10',
    sectionName: 'Section A',
    status: 'ON_LEAVE',
    remark: 'Medical Leave - Fever',
    leaveApplicationId: 'la-1',
    autoPrefilled: true,
  },
  {
    id: 'roster-2',
    studentId: 'st-102',
    firstName: 'Ananya',
    lastName: 'Verma',
    rollNumber: '02',
    admissionNumber: 'ADM-2026-002',
    classId: 'cls-10',
    sectionId: 'sec-a',
    className: 'Class 10',
    sectionName: 'Section A',
    status: 'PRESENT',
    autoPrefilled: false,
  },
  {
    id: 'roster-3',
    studentId: 'st-103',
    firstName: 'Bhavya',
    lastName: 'Patel',
    rollNumber: '03',
    admissionNumber: 'ADM-2026-003',
    classId: 'cls-10',
    sectionId: 'sec-a',
    className: 'Class 10',
    sectionName: 'Section A',
    status: 'ABSENT',
    remark: 'Uninformed absence',
    autoPrefilled: false,
  },
  {
    id: 'roster-4',
    studentId: 'st-104',
    firstName: 'Chirag',
    lastName: 'Reddy',
    rollNumber: '04',
    admissionNumber: 'ADM-2026-004',
    classId: 'cls-10',
    sectionId: 'sec-a',
    className: 'Class 10',
    sectionName: 'Section A',
    status: 'EXCUSED',
    remark: 'Representing school in District Sports',
    autoPrefilled: false,
  },
  {
    id: 'roster-5',
    studentId: 'st-105',
    firstName: 'Diya',
    lastName: 'Joshi',
    rollNumber: '05',
    admissionNumber: 'ADM-2026-005',
    classId: 'cls-10',
    sectionId: 'sec-a',
    className: 'Class 10',
    sectionName: 'Section A',
    status: 'NOT_MARKED',
    autoPrefilled: false,
  },
]

export const mockAttendanceAlertStudents: AttendanceAlertStudent[] = [
  {
    studentId: 'st-103',
    studentName: 'Bhavya Patel',
    admissionNumber: 'ADM-2026-003',
    className: 'Class 10',
    sectionName: 'Section A',
    branchId: 'branch-1',
    totalClasses: 40,
    attendedClasses: 26,
    attendancePercentage: 65.0,
    consecutiveAbsences: 4,
    lastAbsentDate: '2026-07-21',
  },
  {
    studentId: 'st-108',
    studentName: 'Eshan Malhotra',
    admissionNumber: 'ADM-2026-008',
    className: 'Class 9',
    sectionName: 'Section B',
    branchId: 'branch-1',
    totalClasses: 40,
    attendedClasses: 28,
    attendancePercentage: 70.0,
    consecutiveAbsences: 3,
    lastAbsentDate: '2026-07-20',
  },
  {
    studentId: 'st-112',
    studentName: 'Farhan Ali',
    admissionNumber: 'ADM-2026-012',
    className: 'Class 8',
    sectionName: 'Section C',
    branchId: 'branch-2',
    totalClasses: 40,
    attendedClasses: 29,
    attendancePercentage: 72.5,
    consecutiveAbsences: 2,
    lastAbsentDate: '2026-07-19',
  },
]

export const mockAttendanceSettings: AttendanceSettings = {
  id: 'att-settings-1',
  instituteId: 'inst-1',
  branchId: 'branch-1',
  lowAttendanceThreshold: 75.0,
  enableParentNotifications: true,
  enableAutoAlerts: true,
  consecutiveAbsentThreshold: 3,
  updatedAt: '2026-07-21T12:00:00Z',
}
