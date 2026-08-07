import React from 'react'

export type SortCriteria = 'name' | 'recent_attendance' | 'total_absences'

export type FilterState = {
  status: string
  sort: SortCriteria
}

// eslint-disable-next-line react-refresh/only-export-components
export const defaultFilters: FilterState = {
  status: '',
  sort: 'name',
}

interface AttendanceFiltersProps {
  filters: FilterState
  onChange: (newFilters: FilterState) => void
}

export function AttendanceFilters({ filters, onChange }: AttendanceFiltersProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    onChange({ ...filters, [name]: value })
  }

  return (
    <div className="attendance-filters" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
      <label className="select-control">
        <span style={{ fontSize: '0.875rem', marginRight: '0.5rem' }}>Status</span>
        <select name="status" value={filters.status} onChange={handleChange}>
          <option value="">All</option>
          <option value="PRESENT">Present</option>
          <option value="ABSENT">Absent</option>
          <option value="EXCUSED">Excused</option>
          <option value="ON_LEAVE">On Leave</option>
          <option value="LATE">Late</option>
          <option value="NOT_MARKED">Not Marked</option>
        </select>
      </label>
      <label className="select-control">
        <span style={{ fontSize: '0.875rem', marginRight: '0.5rem' }}>Sort By</span>
        <select name="sort" value={filters.sort} onChange={handleChange}>
          <option value="name">Name</option>
          <option value="recent_attendance">Recent Attendance</option>
          <option value="total_absences">Total Absences</option>
        </select>
      </label>
    </div>
  )
}
