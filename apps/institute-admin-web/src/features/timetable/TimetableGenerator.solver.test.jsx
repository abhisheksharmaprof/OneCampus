import { describe, expect, it } from "vitest";
import { buildCsvRows, generateTimetable, importAssignmentsRows } from "./TimetableGenerator.jsx";

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

  it("keeps a group-atomically locked joint block in place across regeneration", () => {
    const bundle = withAssignments(base, [
      { id: "asg_fr", teacherId: "t1", subjectId: "s_fr", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 3, avoidRepeatSameDay: true },
      { id: "asg_es", teacherId: "t2", subjectId: "s_es", classIds: ["c1", "c2"], combinedSlotLabel: "Lang", periodsPerWeek: 3, avoidRepeatSameDay: true },
      { id: "asg_math", teacherId: "t3", subjectId: "s2", classIds: ["c1"], periodsPerWeek: 4, avoidRepeatSameDay: true },
    ]);
    const first = generateTimetable(bundle, { attempts: 5 });
    expect(first.feasible).toBe(true);

    // Lock the way the UI's toggleLock does: the same isLocked flag applied to
    // every entry sharing the clicked entry's slotGroupId (group-atomic).
    const groupId = first.entries.find((e) => e.slotGroupId).slotGroupId;
    const lockedEntries = first.entries.filter((e) => e.slotGroupId === groupId).map((e) => ({ ...e, isLocked: true }));
    expect(lockedEntries).toHaveLength(2); // both parallel options of the joint block

    const second = generateTimetable(bundle, { lockedEntries, generateScope: "all" });
    expect(second.feasible).toBe(true);
    // Each locked option stays at the locked slot, exactly once (no drop, no duplicate).
    for (const locked of lockedEntries) {
      const kept = second.entries.filter((e) => e.assignmentId === locked.assignmentId && e.day === locked.day && e.periods[0] === locked.periods[0]);
      expect(kept).toHaveLength(1);
    }
    // Weekly occurrence counts are unchanged for every parallel option.
    const fr = second.entries.filter((e) => e.assignmentId === "asg_fr");
    const es = second.entries.filter((e) => e.assignmentId === "asg_es");
    expect(fr).toHaveLength(3);
    expect(es).toHaveLength(3);
    // And the options are still co-located at every occurrence.
    const key = (e) => `${e.day}-${e.periods.join(",")}`;
    expect(fr.map(key).sort()).toEqual(es.map(key).sort());
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

describe("csv export rows", () => {
  it("explodes a 2-option × 2-section joint slot into 4 rows with correct pairings", () => {
    const bundle = makeBundle();
    const result = {
      feasible: true,
      entries: [
        { assignmentId: "asg_fr", teacherId: "t1", subjectId: "s_fr", classIds: ["c1", "c2"], classId: "c1", slotGroupId: "g1", day: "MON", periods: [1] },
        { assignmentId: "asg_es", teacherId: "t2", subjectId: "s_es", classIds: ["c1", "c2"], classId: "c1", slotGroupId: "g1", day: "MON", periods: [1] },
      ],
    };
    const rows = buildCsvRows(result, bundle);
    expect(rows[0]).toEqual(["Day", "Period", "Class", "Subject", "Teacher"]);
    expect(rows.slice(1)).toEqual([
      ["MON", 1, "Class 1", "French", "Teacher t1"],
      ["MON", 1, "Class 2", "French", "Teacher t1"],
      ["MON", 1, "Class 1", "Spanish", "Teacher t2"],
      ["MON", 1, "Class 2", "Spanish", "Teacher t2"],
    ]);
  });

  it("keeps one row per period for legacy single-class entries", () => {
    const bundle = makeBundle();
    const result = {
      feasible: true,
      entries: [{ assignmentId: "asg_a", teacherId: "t1", subjectId: "s2", classId: "c1", day: "TUE", periods: [2, 3] }],
    };
    expect(buildCsvRows(result, bundle).slice(1)).toEqual([
      ["TUE", 2, "Class 1", "Mathematics", "Teacher t1"],
      ["TUE", 3, "Class 1", "Mathematics", "Teacher t1"],
    ]);
  });
});

describe("bulk import combined", () => {
  const refs = {
    teachers: [{ id: "t1", name: "Mrs. Sharma" }],
    subjects: [{ id: "s_fr", name: "French" }],
    classes: [
      { id: "c6a", name: "6A" },
      { id: "c6b", name: "6B" },
    ],
  };

  it("imports a multi-class row with a combined slot label", () => {
    const rows = [
      { "Teacher Name": "Mrs. Sharma", "Subject Name": "French", "Class Name": "6A; 6B", "Combined Slot": "Lang", "Periods Per Week": 3, "Avoid Repeat Same Day": "YES" },
    ];
    const r = importAssignmentsRows([], refs, rows);
    expect(r.errors).toEqual([]);
    expect(r.added).toBe(1);
    const a = r.assignments[0];
    expect(a.classIds).toEqual(["c6a", "c6b"]);
    expect(a.classId).toBe("c6a");
    expect(a.combinedSlotLabel).toBe("Lang");
    expect(a.periodsPerWeek).toBe(3);
  });

  it("updates a legacy classId-only assignment when the section set matches", () => {
    const existing = [
      { id: "asg1", teacherId: "t1", subjectId: "s_fr", classId: "c6a", periodsPerWeek: 2, avoidRepeatSameDay: true },
    ];
    const rows = [{ "Teacher Name": "Mrs. Sharma", "Subject Name": "French", "Class Name": "6A", "Periods Per Week": 4 }];
    const r = importAssignmentsRows(existing, refs, rows);
    expect(r.errors).toEqual([]);
    expect(r.updated).toBe(1);
    expect(r.assignments).toHaveLength(1);
    expect(r.assignments[0].periodsPerWeek).toBe(4);
  });

  it("treats the same section set in a different order as an update, not a duplicate", () => {
    const existing = [
      { id: "asg1", teacherId: "t1", subjectId: "s_fr", classIds: ["c6b", "c6a"], classId: "c6b", combinedSlotLabel: "", periodsPerWeek: 2, avoidRepeatSameDay: true },
    ];
    const rows = [{ "Teacher Name": "Mrs. Sharma", "Subject Name": "French", "Class Name": "6A / 6B", "Combined Slot": "Lang", "Periods Per Week": 5 }];
    const r = importAssignmentsRows(existing, refs, rows);
    expect(r.updated).toBe(1);
    expect(r.assignments).toHaveLength(1);
    expect(r.assignments[0].combinedSlotLabel).toBe("Lang");
    expect(r.assignments[0].periodsPerWeek).toBe(5);
  });

  it("reports the missing class name when one section is unknown", () => {
    const rows = [{ "Teacher Name": "Mrs. Sharma", "Subject Name": "French", "Class Name": "6A; 6Z", "Periods Per Week": 3 }];
    const r = importAssignmentsRows([], refs, rows);
    expect(r.added).toBe(0);
    expect(r.assignments).toHaveLength(0);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatch(/class "6Z" not found/);
  });
});
