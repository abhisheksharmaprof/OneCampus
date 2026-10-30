export type ExamCategory = 'CLASS_TEST' | 'UNIT_TEST' | 'HALF_YEARLY' | 'PRE_BOARD' | 'ANNUAL' | 'PRACTICAL' | 'OTHER'

export interface ExamChoice { id: string; name: string; academicYearId?: string; gradeId?: string; gradeName?: string; sectionName?: string; campusId?: string }
export interface ExamOptions {
  campuses: ExamChoice[]
  academicYears: ExamChoice[]
  sections: ExamChoice[]
  terms: ExamChoice[]
  coordinators: ExamChoice[]
  categories: Array<{ value: ExamCategory; label: string }>
  actions: { create: boolean; view: boolean; edit: boolean; publish: boolean }
  currentAcademicYearId?: string | null
  page?: number
  totalPages?: number
}
export interface ExamRow {
  id: string; name: string; category: ExamCategory; status: 'DRAFT' | 'PUBLISHED'; targetSummary: string[]
  startsOn: string | null; endsOn: string | null; revision: number; timetablePublished?: boolean; actions: { view: boolean; edit: boolean; duplicate: boolean; publish: boolean; schedule?: boolean; timetablePublish?: boolean }
}
export interface ExamDetail {
  id: string; campusId: string; academicYearId: string; termId: string | null; category: ExamCategory; name: string
  classSectionIds: string[]; sections: ExamChoice[]; startsOn: string | null; endsOn: string | null
  coordinatorId: string | null; instructions: string | null; status: 'DRAFT' | 'PUBLISHED'; revision: number
  actions: { view: boolean; edit: boolean; duplicate: boolean; publish: boolean; schedule?: boolean }
}
export interface ExamSubjectChoice { id: string; name: string; code?: string | null; isElective: boolean; isLab: boolean; theoryMax?: string | null; practicalMax?: string | null; passMarks?: string | null; durationMinutes?: number | null; defaultMaxMarks?: string | null }
export interface ExamStaleSubjectChoice { id: string; name: string; code?: string | null; isElective: boolean; isLab: boolean; staleMapping: true }
export interface ExamSubjectTarget { classSectionId: string; sectionName: string; gradeName: string; subjects: ExamSubjectChoice[]; selectedSubjectIds: string[]; staleSelections: ExamStaleSubjectChoice[] }
export interface ExamSubjects { examId: string; revision: number; targets: ExamSubjectTarget[] }
export interface ExamPaperScheduleRow {
  classSectionId: string; sectionName: string; gradeName: string; subjectId: string; subjectName: string
  subjectCode?: string | null; durationMinutes?: number; scheduledOn: string | null; startTime: string | null; endTime: string | null
  roomId?: string | null; invigilatorId?: string | null
}
export interface ExamPaperSchedule { examId: string; revision: number; papers: ExamPaperScheduleRow[]; rooms?: ExamChoice[]; invigilators?: ExamChoice[] }
export interface ExamTimetableCheck { code: string; label: string; passed: boolean; message?: string }
export interface ExamTimetableIssue { code: string; message: string; classSectionId?: string; subjectId?: string; studentId?: string; paperLabel?: string; otherExamName?: string; scheduledOn?: string; startTime?: string; endTime?: string }
export interface ExamTimetablePublication {
  revision: number; publishedAt: string; publishedBy?: string | null; snapshot?: Record<string, unknown>
}
export interface ExamTimetable {
  examId: string; revision: number; ready: boolean; checks: ExamTimetableCheck[]; blockers: ExamTimetableIssue[]
  conflicts: ExamTimetableIssue[]; publication: ExamTimetablePublication | null; actions: { publish: boolean }
  papers?: Array<{ classSectionId: string; subjectId: string; paperLabel: string; scheduledOn: string; startTime: string; endTime: string }>
}
export interface ExamCoverageSection {
  classSectionId: string; sectionName: string; gradeName: string; activeStudentCount: number
  coveredStudentCount: number; uncoveredStudentCount: number; nonElectivePaperCount: number; electivePaperCount: number
}
export interface ExamCoverageUncoveredStudent {
  studentId: string; fullName: string; admissionNumber?: string | null; rollNumber?: string | null
  classSectionId: string; sectionName: string; missingElectiveAssignment: boolean
}
export interface ExamCoverage {
  examId: string; revision: number; complete: boolean; activeStudentCount: number; coveredStudentCount: number
  uncoveredStudentCount: number; nonElectivePaperCount: number; electivePaperCount: number
  sections: ExamCoverageSection[]; uncoveredStudents: ExamCoverageUncoveredStudent[]; uncoveredStudentsTruncated: boolean
}
export interface ExamElectiveCandidate {
  studentId: string; fullName: string; admissionNumber?: string | null; rollNumber?: string | null; isAssigned: boolean
}
export interface ExamElectiveCandidates {
  examId: string; revision: number; classSectionId: string; subjectId: string; subjectName: string
  assignedStudentIds: string[]; count: number; page: number; pageSize: number; totalPages: number; items: ExamElectiveCandidate[]
}
export interface ExamPageData { count: number; page: number; pageSize: number; totalPages: number; next: string | null; previous: string | null; results: ExamRow[] }
export interface ExamDraftInput {
  requestId: string; campusId: string; academicYearId: string; termId?: string | null; category: ExamCategory; name: string
  classSectionIds: string[]; startsOn?: string | null; endsOn?: string | null; coordinatorId?: string | null; instructions?: string | null
}
export interface ExamSaveReceipt { requestId: string; examId: string; savedRevision: number }
export type ExamSaveResult = ExamDetail | ExamSaveReceipt

export function isExamSaveReceipt(result: ExamSaveResult): result is ExamSaveReceipt {
  return 'requestId' in result && !('name' in result)
}
