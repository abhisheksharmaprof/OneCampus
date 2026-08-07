import { describe, expect, it } from "vitest";
import { generateTimetable } from "./TimetableGenerator.jsx";

describe("timetable period consistency", () => {
  it("keeps a subject in the same period across weekdays when slots are available", () => {
    const data = {
      config: {
        workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
        periods: [1, 2, 3].map((number) => ({ number, type: "teaching", start: "08:00", end: "08:40" })),
      },
      teachers: [{
        id: "teacher-1",
        name: "Teacher",
        maxPeriodsPerDay: 1,
        maxPeriodsPerWeek: 6,
        availableDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
        availablePeriods: [1, 2, 3],
      }],
      subjects: [{ id: "subject-1", name: "Mathematics", isDouble: false, requiresRoomId: null }],
      classes: [{ id: "class-1", name: "Class 1" }],
      rooms: [],
      assignments: [{
        id: "assignment-1",
        teacherId: "teacher-1",
        subjectId: "subject-1",
        classId: "class-1",
        periodsPerWeek: 6,
        avoidRepeatSameDay: true,
      }],
    };

    const result = generateTimetable(data, { attempts: 1, localSearchIterations: 0 });

    expect(result.feasible).toBe(true);
    expect(new Set(result.entries.map((entry) => entry.periods[0])).size).toBe(1);
  });
});
