import { describe, it, expect } from 'vitest';
import { processStudents } from './attendanceLogic';
import { type FilterState } from '../components/AttendanceFilters';

describe('attendanceLogic - processStudents', () => {
  const mockStudents = [
    { id: '1', firstName: 'Alice', lastName: 'Smith', admissionNumber: 'A001' },
    { id: '2', firstName: 'Bob', lastName: 'Jones', admissionNumber: 'A002' },
    { id: '3', firstName: 'Charlie', lastName: 'Brown', admissionNumber: 'A003' },
  ];

  const mockRecords = [
    { id: 'r1', studentId: '1', studentName: 'Alice Smith', date: '2026-07-21', status: 'PRESENT' as const },
    { id: 'r2', studentId: '2', studentName: 'Bob Jones', date: '2026-07-21', status: 'ABSENT' as const },
    { id: 'r3', studentId: '2', studentName: 'Bob Jones', date: '2026-07-20', status: 'ABSENT' as const },
    // Charlie is NOT_MARKED on 2026-07-21
  ];

  it('filters by status', () => {
    const filters: FilterState = { status: 'PRESENT', sort: 'name' };
    const result = processStudents(mockStudents, mockRecords, '2026-07-21', filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by NOT_MARKED status', () => {
    const filters: FilterState = { status: 'NOT_MARKED', sort: 'name' };
    const result = processStudents(mockStudents, mockRecords, '2026-07-21', filters);
    expect(result.length).toBe(1);
    expect(result[0].id).toBe('3');
  });

  it('sorts by name', () => {
    const filters: FilterState = { status: '', sort: 'name' };
    const reversedStudents = [...mockStudents].reverse();
    const result = processStudents(reversedStudents, mockRecords, '2026-07-21', filters);
    expect(result[0].firstName).toBe('Alice');
    expect(result[1].firstName).toBe('Bob');
    expect(result[2].firstName).toBe('Charlie');
  });

  it('sorts by total_absences', () => {
    const filters: FilterState = { status: '', sort: 'total_absences' };
    const result = processStudents(mockStudents, mockRecords, '2026-07-21', filters);
    // Bob has 2 absences, Alice 0, Charlie 0
    expect(result[0].id).toBe('2'); // Bob
  });

  it('sorts by recent_attendance', () => {
    const filters: FilterState = { status: '', sort: 'recent_attendance' };
    const result = processStudents(mockStudents, mockRecords, '2026-07-21', filters);
    // Order: PRESENT (Alice) > LATE > EXCUSED > ABSENT (Bob) > NOT_MARKED (Charlie)
    expect(result[0].id).toBe('1');
    expect(result[1].id).toBe('2');
    expect(result[2].id).toBe('3');
  });
});
