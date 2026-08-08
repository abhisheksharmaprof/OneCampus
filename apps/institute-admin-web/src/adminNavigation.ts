export type AdminView =
  | 'dashboard' | 'branches' | 'institute-profile' | 'branding' | 'staff' | 'students'
  | 'parents' | 'enquiries' | 'admissions-funnel' | 'attendance'
  | 'fee-collections' | 'calendar' | 'timetable' | 'operational' | 'coming-soon'
  | 'academic-operations' | 'academics' | 'finance'

export type NavigationIcon =
  | 'dashboard' | 'institute' | 'roles' | 'people' | 'admissions'
  | 'attendance' | 'academics' | 'communication' | 'fees' | 'calendar'
  | 'gamification' | 'network' | 'reports' | 'audit' | 'compliance'
  | 'subscription' | 'addons'

export interface AdminRoute {
  id: string
  label: string
  path: string
  breadcrumb: string
  view: AdminView
  description?: string
  subTabs?: string[]
}

export interface AdminNavigationItem {
  label: string
  icon: NavigationIcon
  route?: AdminRoute
  children?: AdminRoute[]
}

const route = (id: string, label: string, path: string, section: string, view: AdminView = 'operational', description?: string, subTabs?: string[]): AdminRoute => ({
  id, label, path, breadcrumb: section === label ? label : `${section} / ${label}`, view, description, subTabs,
})

export const adminNavigation: AdminNavigationItem[] = [
  { label: 'Dashboard', icon: 'dashboard', route: route('H1', 'Dashboard', '/dashboard', 'Dashboard', 'dashboard') },
  { label: 'Institute Setup', icon: 'institute', children: [
    route('BR1', 'Branches & Campuses', '/branches', 'Institute Setup', 'branches'),
    route('AHS1', 'Academic Structure', '/academics/structure', 'Institute Setup'),
    route('RF1', 'Rooms & Facilities', '/setup/rooms-facilities', 'Institute Setup'),
    route('HC1', 'Holidays & Calendar', '/setup/holidays-calendar', 'Institute Setup', 'calendar'),
    route('SE0', 'Institute Details', '/settings/institute-details', 'Institute Setup', 'institute-profile'),
    route('SE1', 'Branding', '/settings/profile', 'Institute Setup', 'branding'),
  ] },
  { label: 'Roles & Permissions', icon: 'roles', children: [
    route('RP1', 'Role Builder', '/roles', 'Roles & Permissions'),
    route('RP3', 'Assignments', '/roles/assignments', 'Roles & Permissions'),
    route('SE2', 'Governance Settings', '/settings/governance', 'Roles & Permissions'),
  ] },
  { label: 'People', icon: 'people', children: [
    route('ST1', 'Staff', '/staff', 'People', 'staff'),
    route('SD1', 'Students', '/students', 'People', 'students'),
    route('PD1', 'Parents', '/parents', 'People', 'parents'),
  ] },
  { label: 'Admissions CRM', icon: 'admissions', children: [
    route('AD2', 'Enquiries', '/admissions/enquiries', 'Admissions CRM', 'enquiries'),
    route('AD1', 'Funnel Report', '/admissions', 'Admissions CRM', 'admissions-funnel'),
    route('AD4', 'Form Builder', '/admissions/forms', 'Admissions CRM'),
  ] },
  { label: 'Attendance', icon: 'attendance', children: [
    route('AT2', 'Overview', '/attendance', 'Attendance', 'attendance'),
    route('AT1', 'Mark Attendance', '/attendance/mark', 'Attendance', 'attendance'),
    route('AT6', 'Student Leave', '/attendance/student-leave', 'Attendance'),
    route('AT7', 'Staff Leave', '/attendance/staff-leave', 'Attendance'),
    route('AT4', 'Reports & Analytics', '/attendance/reports', 'Attendance'),
    route('AT5', 'Settings', '/attendance/settings', 'Attendance'),
  ] },
  { label: 'Academics', icon: 'academics', children: [
    route('AH1', 'Academic Overview', '/academics', 'Academics', 'academics'),
    route('AHT1', 'Teaching & Learning', '/academics/teaching-learning', 'Academics', 'academic-operations'),
    route('AAR1', 'Assessment & Results', '/academics/assessment-results', 'Academics', 'academic-operations'),
  ] },
  { label: 'Communication', icon: 'communication', children: [
    route('CM1', 'Circulars', '/communication/circulars', 'Communication'),
    route('CM2', 'Templates', '/communication/templates', 'Communication'),
  ] },
  { label: 'Finance', icon: 'fees', children: [
    route('FH1', 'Finance Overview', '/finance', 'Finance', 'finance'),
    route('FF1', 'Fees & Collections', '/finance/fees', 'Finance', 'finance'),
    route('FO1', 'Operations & Reports', '/finance/operations', 'Finance', 'finance'),
  ] },
  { label: 'Timetable', icon: 'calendar', children: [
    route('TT1', 'View Timetable', '/timetable', 'Timetable', 'timetable'),
    route('TTG1', 'Generate Timetable', '/timetable/generate', 'Timetable', 'timetable'),
  ] },
  { label: 'Gamification', icon: 'gamification', children: [
    route('RG1', 'Points & Categories', '/recognition/points', 'Gamification'),
    route('RG2', 'Batch Catalog', '/recognition/badges', 'Gamification'),
    route('RG4', 'Leaderboards', '/recognition/leaderboard', 'Gamification'),
    route('RG6', 'Award Approvals', '/recognition/award-approvals', 'Gamification'),
  ] },
  { label: 'Network', icon: 'network', children: [
    route('RG5', 'Partnerships', '/recognition/partnerships', 'Network'),
  ] },
  { label: 'Audit Log', icon: 'audit', route: route('AL1', 'Audit Log', '/audit-log', 'Audit Log') },
  { label: 'Compliance & Consent', icon: 'compliance', route: route('SE4', 'Compliance & Consent', '/settings/privacy', 'Compliance & Consent') },
  { label: 'Subscription & Plan', icon: 'subscription', route: route('SE3', 'Subscription & Plan', '/settings/billing', 'Subscription & Plan') },
  { label: 'Add-on Modules', icon: 'addons', children: [
    route('AO1', 'Transport', '/addons/transport', 'Add-on Modules', 'coming-soon'),
    route('AO2', 'Library', '/addons/library', 'Add-on Modules', 'coming-soon'),
    route('AO3', 'Hostel', '/addons/hostel', 'Add-on Modules', 'coming-soon'),
  ] },
]

export const globalRoutes: AdminRoute[] = [
  route('NT1', 'Notifications', '/notifications', 'Notifications'),
  route('PR1', 'My Account', '/account', 'My Account'),
  route('HP1', 'Help & Support', '/help', 'Help & Support'),
]

export const authScreenIds = ['A1', 'A2'] as const
export const adminRoutes = adminNavigation.flatMap((item) => item.route ? [item.route] : item.children ?? [])
// Detail and builder screens are reachable from their parent-screen actions, not sidebar items.
export const auxiliaryRoutes: AdminRoute[] = [
  route('BR2', 'Branch Detail', '/branches/detail', 'Institute Setup'),
  route('RP2', 'Create / Edit Role', '/roles/builder', 'Roles & Permissions'),
  route('CAL1', 'Academic Calendar', '/academics/calendar', 'Timetable', 'calendar'),
  route('STP1', 'Staff Profile', '/staff/profile', 'People'),
  route('SDP1', 'Student Profile', '/students/profile', 'People'),
  route('PDP1', 'Parent Profile', '/parents/profile', 'People'),
]

export const allAdminRoutes = [...adminRoutes, ...auxiliaryRoutes, ...globalRoutes]

const legacyPaths = new Map<string, AdminRoute>([
  ['/institute/branches', adminRoutes.find((item) => item.id === 'BR1')!],
  ['/institute/academic-structure', { ...adminRoutes.find((item) => item.id === 'AY1')!, label: 'Academic Years', breadcrumb: 'Institute Setup / Academic Years' }],
  ['/institute/profile', adminRoutes.find((item) => item.id === 'SE1')!],
  ['/people/staff', adminRoutes.find((item) => item.id === 'ST1')!],
  ['/people/students', adminRoutes.find((item) => item.id === 'SD1')!],
  ['/people/parents', route('SD2', 'Parents', '/people/parents', 'Students', 'parents')],
  ['/admissions/funnel', adminRoutes.find((item) => item.id === 'AD1')!],
  ['/attendance/leave-approvals', adminRoutes.find((item) => item.id === 'AT6')!],
  ['/staff/leave-approvals', adminRoutes.find((item) => item.id === 'AT6')!],
  ['/gamification/points', adminRoutes.find((item) => item.id === 'RG1')!],
  ['/gamification/batches', adminRoutes.find((item) => item.id === 'RG2')!],
  ['/gamification/leaderboards', adminRoutes.find((item) => item.id === 'RG4')!],
  ['/network/partnerships', adminRoutes.find((item) => item.id === 'RG5')!],
  ['/compliance', adminRoutes.find((item) => item.id === 'SE4')!],
  ['/subscription', adminRoutes.find((item) => item.id === 'SE3')!],
  ['/settings/academic', adminRoutes.find((item) => item.id === 'SE2')!],
  ['/setup/academic-years', route('AY1', 'Academic Years', '/setup/academic-years', 'Institute Setup')],
  ['/setup/classes-sections', route('CL1', 'Classes & Sections', '/setup/classes-sections', 'Institute Setup')],
  ['/setup/subjects-curriculum', route('SU1', 'Subjects & Curriculum', '/setup/subjects-curriculum', 'Institute Setup')],
  ['/academics/lesson-plans', adminRoutes.find((item) => item.id === 'AHT1')!],
  ['/academics/homework', adminRoutes.find((item) => item.id === 'AHT1')!],
  ['/academics/exams', adminRoutes.find((item) => item.id === 'AAR1')!],
  ['/academics/marks-grades', adminRoutes.find((item) => item.id === 'AAR1')!],
  ['/academics/curriculum', adminRoutes.find((item) => item.id === 'AHS1')!],
  ['/academics/assessments', adminRoutes.find((item) => item.id === 'AAR1')!],
  ['/academics/common-tests', adminRoutes.find((item) => item.id === 'AAR1')!],
  ['/academics/report-cards', adminRoutes.find((item) => item.id === 'AAR1')!],
  ['/fees/structure', adminRoutes.find((item) => item.id === 'FF1')!],
  ['/fees/collections', adminRoutes.find((item) => item.id === 'FF1')!],
  ['/finance/expenses', adminRoutes.find((item) => item.id === 'FO1')!],
  ['/finance/payroll', adminRoutes.find((item) => item.id === 'FO1')!],
  ['/finance/budget', adminRoutes.find((item) => item.id === 'FO1')!],
  ['/finance/reports', adminRoutes.find((item) => item.id === 'FO1')!],
])

const routesByLabel = new Map(allAdminRoutes.map((item) => [item.label, item]))
const routesByPath = new Map(allAdminRoutes.map((item) => [item.path, item]))

// Transitional action aliases preserve every existing dashboard and deep-link button while
// presenting the concise, role-based labels defined by the Institute Admin specification.
const actionAliases: Record<string, string> = {
  'Staff Leave Approvals': 'Leave Approvals',
  'Branch Detail': 'Branches',
  'Timetable Builder': 'Generate Timetable',
  'Admissions Dashboard & Funnel': 'Funnel Report',
  'Student Directory': 'Students',
  'Staff Directory': 'Staff',
  'Circulars & Broadcast': 'Circulars',
  'Common Test Builder': 'Common Tests',
  'Academic Structure': 'Academic Structure',
  'Structure & Curriculum': 'Academic Structure',
  'Subjects & Curriculum': 'Academic Structure',
  'Curriculum': 'Academic Structure',
  'Lesson Plans': 'Teaching & Learning',
  'Homework': 'Teaching & Learning',
  'Exams': 'Assessment & Results',
  'Marks & Grades': 'Assessment & Results',
  'Assessments': 'Assessment & Results',
  'Common Tests': 'Assessment & Results',
  'Marks & Report Cards': 'Assessment & Results',
  'Branches List': 'Branches',
  'Attendance Dashboard': 'Overview',
  'Collection Dashboard & Invoices': 'Collections',
  'Collections': 'Fees & Collections',
  'Fee Structure': 'Fees & Collections',
  'Expenses': 'Operations & Reports',
  'Payroll': 'Operations & Reports',
  'Budget': 'Operations & Reports',
  'Reports': 'Operations & Reports',
  'Finance Reports': 'Operations & Reports',
  'Enquiries Inbox': 'Enquiries',
}

export function getAdminRouteByLabel(label: string) { return routesByLabel.get(actionAliases[label.trim()] ?? label.trim()) }
export function getAdminRouteByPath(path: string) { return routesByPath.get(path) ?? legacyPaths.get(path) }
