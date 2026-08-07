import { adminRequest } from '../admin/admin.api'

export interface DashboardBranch {
  id: string
  name: string
  isHeadOffice: boolean
}

export interface DashboardData {
  context: {
    instituteId: string
    branchId: string | null
    branches: DashboardBranch[]
  }
  kpis: {
    activeStudents: number
    activeStudentsChange: number | null
    totalStaff: number
    totalStaffChange: number | null
    todayAttendance: { percentage: number | null; present: number; total: number; change: number | null }
    feeCollection: { collected: string; expected: string; percentage: number | null }
    feeCollectionChange: number | null
    openEnquiries: number
    newEnquiriesToday: number
    totalTeachers?: number
    totalSubjects?: number
    pendingLeaves?: number
    atRiskStudents?: number
  }
  attentionItems: Array<{
    id: string
    label: string
    count: number
    tone: 'warning' | 'danger' | 'info'
    destination: string
  }>
  branchComparison: Array<{
    branchId: string
    name: string
    attendancePercentage: number | null
    feeCollectionPercentage: number | null
    averageLeaderboardPoints: number | null
  }>
  recentActivity: Array<{
    id: string
    message: string
    actorName: string
    createdAt: string
  }>
  upcoming: Array<{
    id: string
    title: string
    type: string
    startsOn: string
  }>
  admissionsFunnel: {
    enquiry: number
    visitScheduled: number
    applied: number
    enrolled: number
  }
  enrollmentByBranch?: Array<{ branchId: string; name: string; code: string; students: number }>
  feeLastSevenDays?: Array<{ date: string; amount: string }>
  attendanceBreakdown?: {
    students: { present: number; absent: number; late: number; excused: number; total: number }
    teachers: { present: number; absent: number; late: number; total: number }
    staff: { present: number; absent: number; late: number; total: number }
  }
  leaveRequests?: Array<{ id: string; applicantName: string; applicantType: string; leaveType: string; startsOn: string; endsOn: string }>
  financeSnapshot?: { feesCollected: string; expenses: string; outstanding: string; defaulters: number; net: string }
  noticeBoard?: Array<{ id: string; title: string; status: string; updatedAt: string }>
}

export async function getDashboard(accessToken: string, branchId: string | null, signal?: AbortSignal) {
  const query = branchId ? `?branchId=${encodeURIComponent(branchId)}` : ''
  return adminRequest<DashboardData>(accessToken, `dashboard${query}`, { signal })
}
