import { describe, expect, it } from "vitest";
import { generateTimetable } from "./TimetableGenerator.jsx";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
const PERIODS = [1, 2, 3, 4, 5, 6];

function makeBundle() {
  return {
    config: {
      workingDays: DAYS,
      periods: PERIODS.map((number) => ({ number, type: "teaching", start: "08:00", end: "08:40" })),
    },
    teachers: ["t1", "t2", "t3"].map((id) => ({
      id,
      name: `Teacher ${id}`,
      maxPeriodsPerDay: 6,
      maxPeriodsPerWeek: 36,
      availableDays: DAYS,
      availablePeriods: PERIODS,
    })),
    subjects: [
      { id: "s1", name: "Combined Elective", isDouble: false, requiresRoomId: null },
      { id: "s2", name: "Mathematics", isDouble: false, requiresRoomId: null },
      { id: "s_fr", name: "French", isDouble: false, requiresRoomId: null },
      { id: "s_es", name: "Spanish", isDouble: false, requiresRoomId: null },
    ],
    classes: [
      { id: "c1", name: "Class 1" },
      { id: "c2", name: "Class 2" },
    ],
    rooms: [],
    assignments: [
      { id: "asg_a", teacherId: "t1", subjectId: "s2", classIds: ["c1"], periodsPerWeek: 4, avoidRepeatSameDay: true },
      { id: "asg_b", teacherId: "t2", subjectId: "s_fr", classIds: ["c2"], periodsPerWeek: 4, avoidRepeatSameDay: true },
    ],
  };
}

function withAssignments(bundle, assignments) {
  return { ...bundle, assignments };
}

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
        classIds: ["class-1"],
        periodsPerWeek: 6,
        avoidRepeatSameDay: true,
      }],
    };

    const result = generateTimetable(data, { attempts: 1, localSearchIterations: 0 });

    expect(result.feasible).toBe(true);
    expect(new Set(result.entries.map((entry) => entry.periods[0])).size).toBe(1);
  });
});

describe("combined section lessons", () => {
  const base = makeBundle();

  it("blocks every participating section at the joint slot", () => {
    const bundle = withAssignments(base, [
      { id: "asg_joint", teacherId: "t1", subjectId: "s1", classIds: ["c1", "c2"], periodsPerWeek: 2, avoidRepeatSameDay: true },
      { id: "asg_math", teacherId: "t2", subjectId: "s2", classIds: ["c1"], periodsPerWeek: 4, avoidRepeatSameDay: true },
    ]);
    const result = generateTimetable(bundle, { attempts: 5 });
    expect(result.feasible).toBe(true);
    const joint = result.entries.filter((e) => e.assignmentId === "asg_joint");
    expect(joint).toHaveLength(2);
    for (const entry of joint) {
      expect(entry.classIds).toEqual(["c1", "c2"]);
      const clash = result.entries.find(
        (other) =>
          other !== entry &&
          other.day === entry.day &&
          other.periods.some((p) => entry.periods.includes(p)) &&
          other.classIds.some((c) => entry.classIds.includes(c))
      );
      expect(clash).toBeUndefined();
    }
  });

  it("co-locates parallel options sharing a combined slot label", () => {
    const bundle = withAssignments(base, [
      { id: "asg_fr", teacherId: "t1", subjectId: "s_fr", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 3, avoidRepeatSameDay: true },
      { id: "asg_es", teacherId: "t2", subjectId: "s_es", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 3, avoidRepeatSameDay: true },
    ]);
    const result = generateTimetable(bundle, { attempts: 5 });
    expect(result.feasible).toBe(true);
    const fr = result.entries.filter((e) => e.assignmentId === "asg_fr");
    const es = result.entries.filter((e) => e.assignmentId === "asg_es");
    expect(fr).toHaveLength(3);
    expect(es).toHaveLength(3);
    const key = (e) => `${e.day}-${e.periods.join(",")}`;
    expect(fr.map(key).sort()).toEqual(es.map(key).sort()); // identical slots, every occurrence
    for (const e of [...fr, ...es]) expect(e.slotGroupId).toBeTruthy();
  });

  it("rejects a joint group whose options share a teacher", () => {
    const bundle = withAssignments(base, [
      { id: "a1", teacherId: "t1", subjectId: "s_fr", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 2, avoidRepeatSameDay: true },
      { id: "a2", teacherId: "t1", subjectId: "s_es", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 2, avoidRepeatSameDay: true },
    ]);
    const result = generateTimetable(bundle, { attempts: 2 });
    expect(result.feasible).toBe(false);
    expect(result.diagnostics.join(" ")).toMatch(/same teacher/i);
  });

  it("keeps single-section behavior identical (classIds length 1)", () => {
    const result = generateTimetable(base, { attempts: 5 });
    expect(result.feasible).toBe(true);
    for (const e of result.entries) {
      expect(e.classIds).toHaveLength(1);
      expect(e.classId).toBe(e.classIds[0]);
      expect(e.slotGroupId).toBeFalsy();
    }
  });

  it("still schedules legacy assignments that only carry classId", () => {
    const bundle = withAssignments(base, [
      { id: "asg_legacy", teacherId: "t1", subjectId: "s2", classId: "c1", periodsPerWeek: 3, avoidRepeatSameDay: true },
    ]);
    const result = generateTimetable(bundle, { attempts: 3 });
    expect(result.feasible).toBe(true);
    const entries = result.entries.filter((e) => e.assignmentId === "asg_legacy");
    expect(entries).toHaveLength(3);
    for (const e of entries) {
      expect(e.classIds).toEqual(["c1"]);
      expect(e.classId).toBe("c1");
    }
  });
});
