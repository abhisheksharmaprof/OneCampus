export interface AcademicBranchOption {
  id: string
  name: string
  code?: string
}

export interface AcademicTeacherOption {
  id: string
  fullName: string
  email?: string
  branchId: string
}

export interface AcademicYear {
  id: string
  name: string
  startDate: string
  endDate: string
  isCurrent: boolean
  classesCount: number
  createdAt: string
  updatedAt: string
}

export interface AcademicTerm {
  id: string
  academicYearId: string
  name: string
  startDate: string
  endDate: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface AcademicClass {
  id: string
  name: string
  sortOrder: number
  subjectsCount: number
  createdAt: string
  updatedAt: string
}

export interface Subject {
  id: string
  name: string
  subjectCode: string
  classesCount: number
  createdAt: string
  updatedAt: string
}
export interface ClassSubject {
  id: string
  classId: string
  subjectId: string
  subject: { id: string; name: string; subjectCode: string }
  subjectCode: string
  subjectCodeOverride: string
  isElective: boolean
  isLab: boolean
  periodsPerWeek: number | null
  defaultMaxMarks: number | null
  sortOrder: number
  roomId: string | null
}

export interface ClassSection {
  id: string
  branch: { id: string; name: string; code: string }
  grade: { id: string; name: string; sortOrder: number }
  academicYear: AcademicYear
  sectionName: string
  classTeacher: { id: string; fullName: string; email: string } | null
  maxStrength: number | null
  enrollmentCount: number
  createdAt: string
  updatedAt: string
}

export interface PageData<T> {
  count: number
  page: number
  pageSize: number
  totalPages: number
  next: string | null
  previous: string | null
  items: T[]
}

export type AcademicResource = 'academic-years' | 'classes' | 'subjects' | 'sections'
export type PageSize = 25 | 50 | 100

export interface ListParams {
  page: number
  pageSize: PageSize
  search?: string
  branchId?: string
  academicYearId?: string
  gradeId?: string
}

export type AcademicYearInput = Pick<AcademicYear, 'name' | 'startDate' | 'endDate'> & { isCurrent?: boolean }
export type AcademicTermInput = Pick<AcademicTerm, 'name' | 'startDate' | 'endDate'> & { academicYearId: string; sortOrder?: number }
export type AcademicClassInput = Pick<AcademicClass, 'name' | 'sortOrder'>
export type SubjectInput = Pick<Subject, 'name' | 'subjectCode'>
export interface ClassSectionInput {
  branchId: string
  gradeId: string
  academicYearId: string
  sectionName: string
  classTeacherId?: string | null
  maxStrength?: number | null
}

export interface Room {
  id: string
  name: string
  roomType: string
  capacity: number | null
  floor: number
  equipment: string[]
  isActive: boolean
  branch: { id: string; name: string; code: string }
}

export interface SubjectTeacherAssignment {
  id: string
  classSectionId: string
  classSectionLabel?: string
  classSectionIds: string[]
  classSections?: Array<{ id: string; label: string; grade: string; sectionName: string }>
  combinedSlotLabel?: string
  subject: { id: string; name: string; subjectCode: string }
  teacher: { id: string; fullName: string; email: string }
}
