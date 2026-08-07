import { type FilterState } from '../components/AttendanceFilters'
import type { AttendanceStatus } from '../types'

type Student = { id: string; firstName: string; lastName: string; admissionNumber: string }
type AttendanceRecord = { id: string; studentId: string; studentName: string; date: string; status: AttendanceStatus }

export function processStudents(
  students: Student[],
  allRecords: AttendanceRecord[],
  selectedDate: string,
  filters: FilterState,
): Student[] {
  const selectedDayRecords = allRecords.filter((record) => record.date === selectedDate)
  const recordByStudent = new Map(selectedDayRecords.map((record) => [record.studentId, record]))

  let processed = [...students]

  if (filters.status) {
    processed = processed.filter((student) => {
      const status = recordByStudent.get(student.id)?.status ?? 'NOT_MARKED'
      return status === filters.status
    })
  }

  const absencesMap = new Map<string, number>()
  if (filters.sort === 'total_absences') {
    allRecords.forEach((r) => {
      if (r.status === 'ABSENT') {
        absencesMap.set(r.studentId, (absencesMap.get(r.studentId) || 0) + 1)
      }
    })
  }

  processed.sort((a, b) => {
    if (filters.sort === 'name') {
      return a.firstName.localeCompare(b.firstName)
    } else if (filters.sort === 'total_absences') {
      const absA = absencesMap.get(a.id) || 0
      const absB = absencesMap.get(b.id) || 0
      return absB - absA
    } else if (filters.sort === 'recent_attendance') {
      const order: Record<string, number> = {
        PRESENT: 5,
        LATE: 4,
        EXCUSED: 3,
        ON_LEAVE: 2,
        ABSENT: 1,
        NOT_MARKED: 0,
      }
      const statA = recordByStudent.get(a.id)?.status ?? 'NOT_MARKED'
      const statB = recordByStudent.get(b.id)?.status ?? 'NOT_MARKED'
      return (order[statB] || 0) - (order[statA] || 0)
    }
    return 0
  })

  return processed
}
