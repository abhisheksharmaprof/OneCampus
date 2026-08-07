export interface TimetableBundle {
  config: { workingDays: string[]; periods: Array<{ number: number; type: 'teaching' | 'break'; start: string; end: string }> }
  teachers: Array<{ id: string; profileId?: string; name: string; email?: string; employmentType?: string; maxPeriodsPerDay: number; maxPeriodsPerWeek: number; availableDays: string[]; availablePeriods: number[] }>
  subjects: Array<{ id: string; name: string; isDouble: boolean; requiresRoomId: string | null }>
  classes: Array<{ id: string; gradeId?: string; name: string }>
  rooms: Array<{ id: string; name: string }>
  curriculum?: Array<{ id: string; classId: string; subjectId: string; periodsPerWeek: number }>
  assignments: Array<{ id: string; curriculumId?: string; teacherId: string; subjectId: string; classId: string; periodsPerWeek: number; avoidRepeatSameDay: boolean }>
  lastResult: unknown
}

export function IntegratedTimetableGenerator(props: {
  initialBundle?: TimetableBundle
  loading?: boolean
  loadError?: string
  accessToken?: string
  selectedBranch?: string
  structureOptions?: { branches: Array<{ id: string; name: string }>; years: Array<{ id: string; name: string; isCurrent: boolean }>; classes: Array<{ id: string; name: string }> }
  createTeacher?: (input: Record<string, unknown>, config: TimetableBundle['config']) => Promise<unknown>
  updateTeacher?: (profileId: string, input: Record<string, unknown>, config: TimetableBundle['config']) => Promise<unknown>
  createSubject?: (input: Record<string, unknown>) => Promise<unknown>
  createSection?: (input: Record<string, unknown>) => Promise<unknown>
  createRoom?: (input: Record<string, unknown>) => Promise<unknown>
  saveAssignment?: (input: { id?: string; classSectionId: string; gradeId: string; subjectId: string; teacherId: string; periodsPerWeek: number }) => Promise<unknown>
  deleteAssignment?: (id: string) => Promise<unknown>
  saveTimetable?: (bundle: TimetableBundle, status: 'DRAFT' | 'PUBLISHED') => Promise<unknown>
  onNavigate?: (path: string) => void
}): JSX.Element

export function SavedTimetableViewer(props: {
  initialBundle?: TimetableBundle
  loading?: boolean
  loadError?: string
}): JSX.Element
