import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Papa from "papaparse";
import { storage } from "./storage.js";
import { BoneScreen } from "../../components/admin-ui";
import {
  Plus,
  Trash2,
  Pencil,
  Calendar,
  Users,
  BookOpen,
  Building2,
  ClipboardList,
  Grid3x3,
  Download,
  Save,
  Printer,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  School,
  Loader2,
  Sparkles,
  UploadCloud,
  FileSpreadsheet,
  FileUp,
  Info,
  ArrowRight,
} from "lucide-react";

/* =====================================================================
   DESIGN TOKENS
   A calm, information-dense "admin console" palette — this is a tool
   people will stare at for hours while building a real schedule, so
   legibility and low visual noise win over decoration.
===================================================================== */
const COLORS = {
  bg: "#F4F5F7",
  surface: "#FFFFFF",
  border: "#E2E5EA",
  ink: "#1C2333",
  inkMuted: "#5B6472",
  inkFaint: "#8A93A3",
  primary: "#243B6B",
  primaryDark: "#182A4E",
  accent: "#1E8A72",
  accentSoft: "#E3F3EE",
  warn: "#C9791C",
  warnSoft: "#FBEEDD",
  danger: "#C4433B",
  dangerSoft: "#FBEAE9",
  breakBg: "#EFEFF3",
};

const TIMETABLE_UI_STYLES = `
  @media print { .no-print { display: none !important; } body { background: #fff !important; } }
  .spin { animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .tt-tooltip { position: relative; }
  .tt-tooltip::after {
    content: attr(data-tooltip); position: absolute; z-index: 100; left: 50%; bottom: calc(100% + 8px);
    width: max-content; max-width: 240px; padding: 6px 9px; border-radius: 6px;
    background: #172033; color: #fff; font-size: 11.5px; font-weight: 500; line-height: 1.35;
    white-space: normal; text-align: center; box-shadow: 0 6px 20px rgba(23,32,51,.22);
    opacity: 0; visibility: hidden; pointer-events: none; transform: translate(-50%, 4px);
    transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
  }
  .tt-tooltip::before {
    content: ""; position: absolute; z-index: 101; left: 50%; bottom: calc(100% + 3px);
    border: 5px solid transparent; border-top-color: #172033;
    opacity: 0; visibility: hidden; pointer-events: none; transform: translateX(-50%);
    transition: opacity 120ms ease, visibility 120ms ease;
  }
  .tt-tooltip:hover::after, .tt-tooltip:focus-visible::after,
  .tt-tooltip:hover::before, .tt-tooltip:focus-visible::before { opacity: 1; visibility: visible; transform: translate(-50%, 0); }
  .tt-tooltip:hover::before, .tt-tooltip:focus-visible::before { transform: translateX(-50%); }
  .tt-skeleton { overflow: hidden; border-radius: 6px; background: linear-gradient(100deg, #e8eaee 25%, #f4f5f7 42%, #e8eaee 60%); background-size: 300% 100%; animation: tt-shimmer 1.35s ease-in-out infinite; }
  @keyframes tt-shimmer { 0% { background-position: 100% 0; } 100% { background-position: -100% 0; } }
  @media (prefers-reduced-motion: reduce) { .tt-skeleton { animation: none; } .tt-tooltip::after, .tt-tooltip::before { transition: none; } }
`;

function tooltipProps(label) {
  return { className: "tt-tooltip", "data-tooltip": label, "aria-label": label, title: label };
}

function SkeletonBlock({ width = "100%", height = 14, radius = 6 }) {
  return <span className="tt-skeleton" aria-hidden="true" style={{ display: "block", width, height, borderRadius: radius }} />;
}

function SkeletonCard({ children, style }) {
  return <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18, ...style }}>{children}</div>;
}

function SkeletonRows({ count = 5, columns = 3 }) {
  return <div style={{ display: "grid", gap: 10, marginTop: 16 }}>{Array.from({ length: count }, (_, row) => <div key={row} style={{ display: "grid", gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, gap: 12, padding: "11px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 8 }}>{Array.from({ length: columns }, (_, column) => <SkeletonBlock key={column} width={column === 0 ? "82%" : row % 2 ? "58%" : "70%"} height={13} />)}</div>)}</div>;
}

function TimetableScreenSkeleton({ tab }) {
  const heading = <><SkeletonBlock width={180} height={18} /><div style={{ marginTop: 8 }}><SkeletonBlock width="48%" height={12} /></div></>;
  if (tab === "teachers") return <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: 16 }}><SkeletonCard>{heading}<SkeletonRows count={5} columns={2} /></SkeletonCard><SkeletonCard>{heading}<div style={{ display: "grid", gap: 14, marginTop: 18 }}>{Array.from({ length: 7 }, (_, index) => <div key={index}><SkeletonBlock width={index % 2 ? "38%" : "28%"} height={11} /><div style={{ marginTop: 6 }}><SkeletonBlock height={38} /></div></div>)}</div></SkeletonCard></div>;
  if (tab === "structure") return <div style={{ display: "grid", gap: 16 }}><SkeletonCard>{heading}<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}><SkeletonRows count={4} columns={2} /><div style={{ display: "grid", gap: 12, marginTop: 16 }}>{Array.from({ length: 4 }, (_, index) => <SkeletonBlock key={index} height={38} />)}</div></div></SkeletonCard><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}><SkeletonCard>{heading}<SkeletonRows count={3} columns={2} /></SkeletonCard><SkeletonCard>{heading}<SkeletonRows count={3} columns={2} /></SkeletonCard></div></div>;
  if (tab === "assignments") return <div style={{ display: "grid", gap: 16 }}><SkeletonCard>{heading}<div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 10, marginTop: 18 }}>{Array.from({ length: 5 }, (_, index) => <SkeletonBlock key={index} height={38} />)}</div></SkeletonCard><SkeletonCard>{heading}<SkeletonRows count={6} columns={4} /></SkeletonCard></div>;
  if (tab === "import") return <div style={{ display: "grid", gap: 16 }}><SkeletonCard>{heading}<div style={{ display: "flex", gap: 10, marginTop: 18 }}><SkeletonBlock width={190} height={38} /><SkeletonBlock width={180} height={38} /></div></SkeletonCard><SkeletonCard>{heading}<SkeletonBlock height={190} radius={10} /><div style={{ display: "flex", gap: 10, marginTop: 14 }}><SkeletonBlock width={160} height={38} /><SkeletonBlock width={100} height={38} /></div></SkeletonCard></div>;
  if (tab === "timetable") return <div style={{ display: "grid", gap: 16 }}><SkeletonCard><div style={{ display: "flex", justifyContent: "space-between" }}>{heading}<SkeletonBlock width={150} height={38} /></div></SkeletonCard><SkeletonCard><div style={{ display: "grid", gridTemplateColumns: "100px repeat(6, 1fr)", gap: 8 }}>{Array.from({ length: 49 }, (_, index) => <SkeletonBlock key={index} height={index < 7 ? 28 : 58} />)}</div></SkeletonCard></div>;
  return <div style={{ display: "grid", gap: 16 }}><SkeletonCard>{heading}<div style={{ display: "flex", gap: 10, marginTop: 18 }}>{Array.from({ length: 6 }, (_, index) => <SkeletonBlock key={index} width={92} height={38} />)}</div></SkeletonCard><SkeletonCard>{heading}<SkeletonRows count={8} columns={4} /></SkeletonCard></div>;
}

function TimetableLoadingShell({ tab, includeImport = false }) {
  const visibleTabs = includeImport ? TABS : TABS.filter((item) => item.id !== "import");
  return <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: COLORS.bg, minHeight: "100%", color: COLORS.ink }}><style>{TIMETABLE_UI_STYLES}</style><div className="no-print" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`, padding: "14px 20px", color: "#fff" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Grid3x3 size={20} /><div><strong>Timetable Builder</strong><div style={{ opacity: .72, fontSize: 12 }}>Loading live timetable data…</div></div></div></div><div className="no-print" style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "0 20px" }}><div style={{ display: "flex", gap: 4, overflowX: "auto" }}>{visibleTabs.map((item, index) => { const Icon = item.icon; const active = tab === item.id; return <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", borderBottom: `2px solid ${active ? COLORS.primary : "transparent"}`, color: active ? COLORS.primary : COLORS.inkMuted, fontWeight: 600, whiteSpace: "nowrap" }}><span>{index + 1}</span><Icon size={15} />{item.label}</div> })}</div></div><div role="status" aria-live="polite" aria-label={`Loading ${tab} timetable screen`} style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Loading timetable data</span><BoneScreen name={`timetable-${tab}`} loading label={`Loading ${tab} timetable`}><TimetableScreenSkeleton tab={tab} /></BoneScreen></div></div>;
}

const SUBJECT_PALETTE = [
  "#2E5C8A", "#1E8A72", "#B5622A", "#7A4FA0", "#B33E63",
  "#3A7CA5", "#5E8B3A", "#A0522D", "#4B5566", "#8A5FBF",
  "#C9791C", "#2E7D6B", "#9A4747", "#3F6D9E",
];
function colorForSubject(subjectId, subjects) {
  const idx = subjects.findIndex((s) => s.id === subjectId);
  return SUBJECT_PALETTE[idx >= 0 ? idx % SUBJECT_PALETTE.length : 0];
}

const DAYS = [
  { code: "MON", label: "Monday", short: "Mon" },
  { code: "TUE", label: "Tuesday", short: "Tue" },
  { code: "WED", label: "Wednesday", short: "Wed" },
  { code: "THU", label: "Thursday", short: "Thu" },
  { code: "FRI", label: "Friday", short: "Fri" },
  { code: "SAT", label: "Saturday", short: "Sat" },
];

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

/* =====================================================================
   SOLVER ENGINE (pure functions, no React/DOM dependency)
   Ported from a tested OR-Tools-style constraint model. Runs entirely
   client-side since artifacts have no Python backend available.

   Strategy: greedy construction with randomized restarts guarantees
   hard constraints; a local-search pass then improves soft-constraint
   quality (spreading subjects across the week, reducing idle gaps).
===================================================================== */
function makeRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return function () {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}
function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function teachingPeriodsPerDay(config) {
  const teaching = config.periods.filter((p) => p.type === "teaching").map((p) => p.number);
  const map = {};
  for (const day of config.workingDays) map[day] = teaching.slice();
  return map;
}
function allTeachingSlots(config) {
  const teaching = config.periods.filter((p) => p.type === "teaching").map((p) => p.number);
  const slots = [];
  for (const day of config.workingDays) for (const p of teaching) slots.push({ day, period: p });
  return slots;
}
function teacherAvailable(teacher, day, period) {
  return teacher.availableDays.includes(day) && teacher.availablePeriods.includes(period);
}
function validateTimetableInput(data) {
  const errors = [];
  const { config, teachers, subjects, classes, rooms, assignments } = data;
  if (config.workingDays.length === 0) errors.push("Select at least one working day in Setup.");
  if (config.periods.filter((p) => p.type === "teaching").length === 0)
    errors.push("Add at least one teaching period in Setup.");
  if (teachers.length === 0) errors.push("Add at least one teacher.");
  if (classes.length === 0) errors.push("Add at least one class.");
  if (assignments.length === 0) errors.push("Add at least one teacher-subject-class assignment.");
  if (errors.length > 0) return errors;

  const teacherById = Object.fromEntries(teachers.map((t) => [t.id, t]));
  const subjectById = Object.fromEntries(subjects.map((s) => [s.id, s]));
  const classById = Object.fromEntries(classes.map((c) => [c.id, c]));
  const roomIds = new Set(rooms.map((r) => r.id));
  const totalSlots = allTeachingSlots(config).length;
  const teacherLoad = {};
  const classLoad = {};

  for (const a of assignments) {
    const teacher = teacherById[a.teacherId];
    const subject = subjectById[a.subjectId];
    const cls = classById[a.classId];
    if (!teacher || !subject || !cls) {
      errors.push("An assignment references a teacher, subject, or class that was deleted. Remove or fix it in Assignments.");
      continue;
    }
    if (subject.isDouble && a.periodsPerWeek % 2 !== 0) {
      errors.push(
        `${teacher.name} → ${subject.name} / ${cls.name}: "${subject.name}" needs double periods, so periods/week must be an even number (currently ${a.periodsPerWeek}).`
      );
    }
    if (subject.requiresRoomId && !roomIds.has(subject.requiresRoomId)) {
      errors.push(`Subject "${subject.name}" needs a room that no longer exists. Fix it in Structure.`);
    }
    teacherLoad[teacher.id] = (teacherLoad[teacher.id] || 0) + a.periodsPerWeek;
    classLoad[cls.id] = (classLoad[cls.id] || 0) + a.periodsPerWeek;
  }
  for (const [teacherId, load] of Object.entries(teacherLoad)) {
    const teacher = teacherById[teacherId];
    if (load > teacher.maxPeriodsPerWeek) {
      errors.push(`${teacher.name} is assigned ${load} periods/week but their limit is ${teacher.maxPeriodsPerWeek}/week. Raise the limit or reduce their load.`);
    }
    const availableSlots = allTeachingSlots(config).filter((s) => teacherAvailable(teacher, s.day, s.period)).length;
    if (load > availableSlots) {
      errors.push(`${teacher.name} is assigned ${load} periods/week but only has ${availableSlots} slots available given their availability settings.`);
    }
  }
  for (const [classId, load] of Object.entries(classLoad)) {
    const cls = classById[classId];
    if (load > totalSlots) {
      errors.push(`${cls.name} requires ${load} periods/week but the week only has ${totalSlots} teaching slots. Add more periods/days or reduce subject load.`);
    }
  }
  return errors;
}

function buildTaskQueue(data, rng, lockedEntries = [], generateScope = "all") {
  const subjectById = Object.fromEntries(data.subjects.map((s) => [s.id, s]));
  const teacherById = Object.fromEntries(data.teachers.map((t) => [t.id, t]));
  const lockedCount = {};
  for (const e of lockedEntries) {
    lockedCount[e.assignmentId] = (lockedCount[e.assignmentId] || 0) + e.periods.length;
  }
  const withSlack = data.assignments.map((a) => {
    const subject = subjectById[a.subjectId];
    const teacher = teacherById[a.teacherId];
    const availableSlots = allTeachingSlots(data.config).filter((s) => teacherAvailable(teacher, s.day, s.period)).length;
    return { assignment: a, subject, slack: availableSlots - a.periodsPerWeek };
  });
  const priorityOrder = shuffle(withSlack, rng).sort((x, y) => x.slack - y.slack);
  const remaining = priorityOrder.map(({ assignment, subject }) => {
    if (generateScope !== "all" && assignment.classId !== generateScope) {
      return { assignmentId: assignment.id, unitsLeft: 0, unitType: "single" };
    }
    const lockedP = lockedCount[assignment.id] || 0;
    const needed = Math.max(0, assignment.periodsPerWeek - lockedP);
    return {
      assignmentId: assignment.id,
      unitsLeft: subject.isDouble ? Math.floor(needed / 2) : needed,
      unitType: subject.isDouble ? "double" : "single",
    };
  });
  const queue = [];
  let any = true;
  while (any) {
    any = false;
    for (const r of remaining) {
      if (r.unitsLeft > 0) {
        queue.push({ assignmentId: r.assignmentId, unitType: r.unitType });
        r.unitsLeft -= 1;
        any = true;
      }
    }
  }
  return queue;
}
function initSolverState(data) {
  const teacherBusy = {}, classBusy = {}, roomBusy = {};
  for (const t of data.teachers) teacherBusy[t.id] = {};
  for (const c of data.classes) classBusy[c.id] = {};
  for (const r of data.rooms) roomBusy[r.id] = {};
  return { teacherBusy, classBusy, roomBusy, teacherDayCount: {}, assignmentDayCount: {}, assignmentPeriodCount: {}, entries: [] };
}
function slotKey(day, period) {
  return `${day}-${period}`;
}
function getSingleCandidates(task, data, state) {
  const assignment = data.assignments.find((a) => a.id === task.assignmentId);
  const teacher = data.teachers.find((t) => t.id === assignment.teacherId);
  const subject = data.subjects.find((s) => s.id === assignment.subjectId);
  const roomId = subject.requiresRoomId || null;
  const candidates = [];
  for (const slot of allTeachingSlots(data.config)) {
    if (!teacherAvailable(teacher, slot.day, slot.period)) continue;
    const k = slotKey(slot.day, slot.period);
    if (state.teacherBusy[teacher.id][k]) continue;
    if (state.classBusy[assignment.classId][k]) continue;
    if (roomId && (state.roomBusy[roomId] || {})[k]) continue;
    const dayCount = state.teacherDayCount[teacher.id]?.[slot.day] || 0;
    if (dayCount >= teacher.maxPeriodsPerDay) continue;
    candidates.push({ day: slot.day, periods: [slot.period], teacherId: teacher.id, roomId });
  }
  return candidates;
}
function getDoubleCandidates(task, data, state) {
  const assignment = data.assignments.find((a) => a.id === task.assignmentId);
  const teacher = data.teachers.find((t) => t.id === assignment.teacherId);
  const subject = data.subjects.find((s) => s.id === assignment.subjectId);
  const roomId = subject.requiresRoomId || null;
  const byDay = teachingPeriodsPerDay(data.config);
  const candidates = [];
  for (const day of data.config.workingDays) {
    const periods = byDay[day];
    for (let i = 0; i < periods.length - 1; i++) {
      const p1 = periods[i], p2 = periods[i + 1];
      if (p2 !== p1 + 1) continue;
      if (!teacherAvailable(teacher, day, p1) || !teacherAvailable(teacher, day, p2)) continue;
      const k1 = slotKey(day, p1), k2 = slotKey(day, p2);
      if (state.teacherBusy[teacher.id][k1] || state.teacherBusy[teacher.id][k2]) continue;
      if (state.classBusy[assignment.classId][k1] || state.classBusy[assignment.classId][k2]) continue;
      if (roomId && ((state.roomBusy[roomId] || {})[k1] || (state.roomBusy[roomId] || {})[k2])) continue;
      const dayCount = state.teacherDayCount[teacher.id]?.[day] || 0;
      if (dayCount + 2 > teacher.maxPeriodsPerDay) continue;
      candidates.push({ day, periods: [p1, p2], teacherId: teacher.id, roomId });
    }
  }
  return candidates;
}
function scoreCandidate(candidate, task, data, state, rng) {
  const assignment = data.assignments.find((a) => a.id === task.assignmentId);
  let score = 0;
  const dayRepeats = state.assignmentDayCount[assignment.id]?.[candidate.day] || 0;
  if (assignment.avoidRepeatSameDay) score += dayRepeats * 6;

  // Prefer a stable period for an assignment across the week. This is a soft
  // constraint: candidates that are unavailable or clash with another class,
  // teacher, or room have already been removed before scoring.
  const periodCounts = state.assignmentPeriodCount[assignment.id] || {};
  if (Object.keys(periodCounts).length > 0) {
    const preferredPeriodCount = Math.max(...Object.values(periodCounts));
    const matchingPeriods = candidate.periods.reduce((count, period) => count + (periodCounts[period] || 0), 0);
    score += (candidate.periods.length * preferredPeriodCount - matchingPeriods) * 8;
  }
  score += (state.teacherDayCount[candidate.teacherId]?.[candidate.day] || 0) * 1.2;
  score += rng() * 0.75;
  return score;
}
function placeCandidate(candidate, task, data, state) {
  const assignment = data.assignments.find((a) => a.id === task.assignmentId);
  for (const p of candidate.periods) {
    const k = slotKey(candidate.day, p);
    state.teacherBusy[candidate.teacherId][k] = true;
    state.classBusy[assignment.classId][k] = true;
    if (candidate.roomId) {
      state.roomBusy[candidate.roomId] = state.roomBusy[candidate.roomId] || {};
      state.roomBusy[candidate.roomId][k] = true;
    }
  }
  state.teacherDayCount[candidate.teacherId] = state.teacherDayCount[candidate.teacherId] || {};
  state.teacherDayCount[candidate.teacherId][candidate.day] =
    (state.teacherDayCount[candidate.teacherId][candidate.day] || 0) + candidate.periods.length;
  state.assignmentDayCount[assignment.id] = state.assignmentDayCount[assignment.id] || {};
  state.assignmentDayCount[assignment.id][candidate.day] =
    (state.assignmentDayCount[assignment.id][candidate.day] || 0) + 1;
  state.assignmentPeriodCount[assignment.id] = state.assignmentPeriodCount[assignment.id] || {};
  for (const p of candidate.periods) {
    state.assignmentPeriodCount[assignment.id][p] = (state.assignmentPeriodCount[assignment.id][p] || 0) + 1;
  }
  state.entries.push({
    assignmentId: assignment.id, teacherId: assignment.teacherId, subjectId: assignment.subjectId,
    classId: assignment.classId, day: candidate.day, periods: candidate.periods, roomId: candidate.roomId,
  });
}
function greedyConstruct(data, seed, lockedEntries = [], generateScope = "all") {
  const rng = makeRng(seed);
  const state = initSolverState(data);
  for (const e of lockedEntries) {
    placeCandidate(e, { assignmentId: e.assignmentId }, data, state);
    state.entries[state.entries.length - 1].isLocked = e.isLocked; // Keep the lock state
  }
  const queue = buildTaskQueue(data, rng, lockedEntries, generateScope);
  const missing = [];
  for (const task of queue) {
    const candidates = task.unitType === "double" ? getDoubleCandidates(task, data, state) : getSingleCandidates(task, data, state);
    if (candidates.length === 0) {
      missing.push(task);
      continue;
    }
    const scored = candidates.map((c) => ({ c, score: scoreCandidate(c, task, data, state, rng) })).sort((x, y) => x.score - y.score);
    placeCandidate(scored[0].c, task, data, state);
  }
  return { complete: missing.length === 0, entries: state.entries, missing };
}
function computeCost(entries, data) {
  const assignmentById = Object.fromEntries(data.assignments.map((a) => [a.id, a]));
  const teachingByDay = teachingPeriodsPerDay(data.config);
  let cost = 0;
  const perAssignmentDay = {};
  for (const e of entries) {
    const a = assignmentById[e.assignmentId];
    if (!a || !a.avoidRepeatSameDay) continue;
    perAssignmentDay[e.assignmentId] = perAssignmentDay[e.assignmentId] || {};
    perAssignmentDay[e.assignmentId][e.day] = (perAssignmentDay[e.assignmentId][e.day] || 0) + 1;
  }
  for (const dayMap of Object.values(perAssignmentDay)) for (const c of Object.values(dayMap)) cost += Math.max(0, c - 1) * 6;

  // Keep each subject/assignment in the same period on each weekday whenever
  // possible. Counting periods individually also keeps double periods aligned
  // as a pair, while still allowing a conflict-driven exception.
  const perAssignmentPeriod = {};
  for (const e of entries) {
    perAssignmentPeriod[e.assignmentId] = perAssignmentPeriod[e.assignmentId] || {};
    for (const p of e.periods) perAssignmentPeriod[e.assignmentId][p] = (perAssignmentPeriod[e.assignmentId][p] || 0) + 1;
  }
  for (const periodMap of Object.values(perAssignmentPeriod)) {
    const counts = Object.values(periodMap);
    if (counts.length > 1) cost += (counts.reduce((sum, count) => sum + count, 0) - Math.max(...counts)) * 8;
  }
  const teacherDayBusy = {};
  for (const e of entries) {
    teacherDayBusy[e.teacherId] = teacherDayBusy[e.teacherId] || {};
    teacherDayBusy[e.teacherId][e.day] = teacherDayBusy[e.teacherId][e.day] || new Set();
    for (const p of e.periods) teacherDayBusy[e.teacherId][e.day].add(p);
  }
  for (const dayMap of Object.values(teacherDayBusy)) {
    for (const [day, busySet] of Object.entries(dayMap)) {
      const order = teachingByDay[day] || [];
      const busyIdx = order.map((p, i) => (busySet.has(p) ? i : -1)).filter((i) => i >= 0);
      if (busyIdx.length === 0) continue;
      const span = Math.max(...busyIdx) - Math.min(...busyIdx) + 1;
      cost += (span - busyIdx.length) * 3;
    }
  }
  return cost;
}
function canPlaceAt(entry, day, period, data, entries) {
  const teacher = data.teachers.find((t) => t.id === entry.teacherId);
  if (!teacher || !teacherAvailable(teacher, day, period)) return false;
  for (const other of entries) {
    if (other === entry) continue;
    if (!other.periods.includes(period) || other.day !== day) continue;
    if (other.teacherId === entry.teacherId) return false;
    if (other.classId === entry.classId) return false;
    if (entry.roomId && other.roomId === entry.roomId) return false;
  }
  const dayLoad = entries.filter((e) => e !== entry && e.teacherId === entry.teacherId && e.day === day).reduce((s, e) => s + e.periods.length, 0);
  if (dayLoad + 1 > teacher.maxPeriodsPerDay) return false;
  return true;
}
function localSearchImprove(entries, data, iterations, seed) {
  const rng = makeRng(seed + 999);
  let current = entries.map((e) => ({ ...e, periods: e.periods.slice() }));
  let currentCost = computeCost(current, data);
  for (let iter = 0; iter < iterations; iter++) {
    const idxs = current.map((e, i) => i).filter((i) => current[i].periods.length === 1 && !current[i].isLocked);
    if (idxs.length < 2) break;
    const i = idxs[Math.floor(rng() * idxs.length)];
    const j = idxs[Math.floor(rng() * idxs.length)];
    if (i === j) continue;
    const a = current[i], b = current[j];
    if (a.day === b.day && a.periods[0] === b.periods[0]) continue;
    const aDay = a.day, aPeriod = a.periods[0], bDay = b.day, bPeriod = b.periods[0];
    const others = current.filter((_, idx) => idx !== i && idx !== j);
    if (!canPlaceAt(a, bDay, bPeriod, data, [...others, b])) continue;
    if (!canPlaceAt(b, aDay, aPeriod, data, [...others, a])) continue;
    const trial = current.map((e, idx) => {
      if (idx === i) return { ...e, day: bDay, periods: [bPeriod] };
      if (idx === j) return { ...e, day: aDay, periods: [aPeriod] };
      return e;
    });
    const trialCost = computeCost(trial, data);
    if (trialCost < currentCost) {
      current = trial;
      currentCost = trialCost;
    }
  }
  return current;
}
export function generateTimetable(data, options = {}) {
  const attempts = options.attempts || 20;
  const localSearchIterations = options.localSearchIterations || 400;
  const lockedEntries = options.lockedEntries || [];
  const generateScope = options.generateScope || "all";
  const errors = validateTimetableInput(data);
  // Do not immediately fail if there are errors but we have lockedEntries (user might be trying to resolve it)
  // Actually, validation errors on max periods might still occur. It's safer to just return them.
  if (errors.length > 0) return { feasible: false, diagnostics: errors, entries: [] };
  let best = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = greedyConstruct(data, attempt * 7919 + 13, lockedEntries, generateScope);
    if (result.complete) {
      const improved = localSearchImprove(result.entries, data, localSearchIterations, attempt);
      return { feasible: true, entries: improved, attemptsUsed: attempt, finalCost: computeCost(improved, data) };
    }
    if (!best || result.missing.length < best.missing.length) best = result;
  }
  const subjectById = Object.fromEntries(data.subjects.map((s) => [s.id, s]));
  const teacherById = Object.fromEntries(data.teachers.map((t) => [t.id, t]));
  const classById = Object.fromEntries(data.classes.map((c) => [c.id, c]));
  const missingSummary = {};
  for (const m of best.missing) missingSummary[m.assignmentId] = (missingSummary[m.assignmentId] || 0) + 1;
  const diagnostics = Object.entries(missingSummary).map(([assignmentId, count]) => {
    const a = data.assignments.find((x) => x.id === assignmentId);
    const t = teacherById[a.teacherId], s = subjectById[a.subjectId], c = classById[a.classId];
    return `Could not place ${count} of ${a.periodsPerWeek} period(s)/week for ${t.name} → ${s.name} (${c.name}). Try relaxing availability, raising max periods/day, or lowering the weekly requirement.`;
  });
  return { feasible: false, diagnostics, entries: best.entries };
}

/* =====================================================================
   BULK IMPORT ENGINE (CSV / Excel)
   Turns parsed spreadsheet rows (plain objects keyed by column header)
   into upserts against the data model. Matching is by name
   (case-insensitive), so re-uploading an updated file safely updates
   existing records instead of duplicating them.
===================================================================== */
const DAY_CODES = ["MON", "TUE", "WED", "THU", "FRI", "SAT"];

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}
function getVal(row, aliases) {
  for (const k of Object.keys(row)) {
    if (aliases.includes(normalizeHeader(k))) return row[k];
  }
  return undefined;
}
function parseBoolYes(v, def) {
  if (v === undefined || v === null || String(v).trim() === "") return def;
  return ["yes", "y", "true", "1"].includes(String(v).trim().toLowerCase());
}
function parseDaysList(v, allDays) {
  if (v === undefined || String(v).trim() === "") return allDays.slice();
  const s = String(v).trim();
  if (s.toUpperCase() === "ALL") return allDays.slice();
  return s.split(",").map((x) => x.trim().toUpperCase()).filter((d) => DAY_CODES.includes(d));
}
function parsePeriodsList(v, allPeriods) {
  if (v === undefined || String(v).trim() === "") return allPeriods.slice();
  const s = String(v).trim();
  if (s.toUpperCase() === "ALL") return allPeriods.slice();
  return s.split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => Number.isFinite(n) && allPeriods.includes(n));
}
function findByNameCI(list, name) {
  const target = String(name || "").trim().toLowerCase();
  return list.find((x) => x.name.trim().toLowerCase() === target);
}

function importRoomsRows(existingRooms, rows) {
  const rooms = existingRooms.slice();
  const errors = [];
  let added = 0;
  rows.forEach((row, i) => {
    const name = getVal(row, ["name"]);
    if (!name || !String(name).trim()) { errors.push(`Rooms row ${i + 2}: missing Name, skipped.`); return; }
    if (!findByNameCI(rooms, name)) { rooms.push({ id: uid("room"), name: String(name).trim() }); added++; }
  });
  return { rooms, added, updated: 0, errors };
}
function importClassesRows(existingClasses, rows) {
  const classes = existingClasses.slice();
  const errors = [];
  let added = 0;
  rows.forEach((row, i) => {
    const name = getVal(row, ["name"]);
    if (!name || !String(name).trim()) { errors.push(`Classes row ${i + 2}: missing Name, skipped.`); return; }
    if (!findByNameCI(classes, name)) { classes.push({ id: uid("cls"), name: String(name).trim() }); added++; }
  });
  return { classes, added, updated: 0, errors };
}
function importSubjectsRows(existingSubjects, existingRooms, rows) {
  const subjects = existingSubjects.slice();
  const rooms = existingRooms.slice();
  const errors = [];
  let added = 0, updated = 0, roomsAutoCreated = 0;
  rows.forEach((row, i) => {
    const name = getVal(row, ["name"]);
    if (!name || !String(name).trim()) { errors.push(`Subjects row ${i + 2}: missing Name, skipped.`); return; }
    const isDouble = parseBoolYes(getVal(row, ["doubleperiod", "isdouble", "double"]), false);
    const roomName = getVal(row, ["requiresroom", "room", "requiredroom"]);
    let requiresRoomId = null;
    if (roomName && String(roomName).trim()) {
      let room = findByNameCI(rooms, roomName);
      if (!room) { room = { id: uid("room"), name: String(roomName).trim() }; rooms.push(room); roomsAutoCreated++; }
      requiresRoomId = room.id;
    }
    const existing = findByNameCI(subjects, name);
    if (existing) { Object.assign(existing, { isDouble, requiresRoomId }); updated++; }
    else { subjects.push({ id: uid("sub"), name: String(name).trim(), isDouble, requiresRoomId }); added++; }
  });
  return { subjects, rooms, added, updated, roomsAutoCreated, errors };
}
function importTeachersRows(existingTeachers, rows, config) {
  const teachers = existingTeachers.slice();
  const errors = [];
  let added = 0, updated = 0;
  const teachingPeriods = config.periods.filter((p) => p.type === "teaching").map((p) => p.number);
  rows.forEach((row, i) => {
    const name = getVal(row, ["name"]);
    if (!name || !String(name).trim()) { errors.push(`Teachers row ${i + 2}: missing Name, skipped.`); return; }
    const maxPeriodsPerDay = parseInt(getVal(row, ["maxperiodsperday", "maxperday"]), 10) || 6;
    const maxPeriodsPerWeek = parseInt(getVal(row, ["maxperiodsperweek", "maxperweek"]), 10) || 30;
    const availableDays = parseDaysList(getVal(row, ["availabledays", "days"]), config.workingDays);
    const availablePeriods = parsePeriodsList(getVal(row, ["availableperiods", "periods"]), teachingPeriods);
    const payload = {
      name: String(name).trim(), maxPeriodsPerDay, maxPeriodsPerWeek,
      availableDays: availableDays.length ? availableDays : config.workingDays.slice(),
      availablePeriods: availablePeriods.length ? availablePeriods : teachingPeriods.slice(),
    };
    const existing = findByNameCI(teachers, name);
    if (existing) { Object.assign(existing, payload); updated++; }
    else { teachers.push({ id: uid("t"), ...payload }); added++; }
  });
  return { teachers, added, updated, errors };
}
function importAssignmentsRows(existingAssignments, refs, rows) {
  const assignments = existingAssignments.slice();
  const errors = [];
  let added = 0, updated = 0;
  rows.forEach((row, i) => {
    const teacherName = getVal(row, ["teachername", "teacher"]);
    const subjectName = getVal(row, ["subjectname", "subject"]);
    const className = getVal(row, ["classname", "class"]);
    const periodsPerWeek = parseInt(getVal(row, ["periodsperweek", "periodsweek", "periods"]), 10);
    const avoidRepeatSameDay = parseBoolYes(getVal(row, ["avoidrepeatsameday", "avoidrepeat", "samedaytwice"]), true);
    if (!teacherName || !subjectName || !className) { errors.push(`Assignments row ${i + 2}: missing Teacher/Subject/Class name, skipped.`); return; }
    const teacher = findByNameCI(refs.teachers, teacherName);
    const subject = findByNameCI(refs.subjects, subjectName);
    const cls = findByNameCI(refs.classes, className);
    if (!teacher) { errors.push(`Assignments row ${i + 2}: teacher "${teacherName}" not found — add them in the Teachers sheet first.`); return; }
    if (!subject) { errors.push(`Assignments row ${i + 2}: subject "${subjectName}" not found — add it in the Subjects sheet first.`); return; }
    if (!cls) { errors.push(`Assignments row ${i + 2}: class "${className}" not found — add it in the Classes sheet first.`); return; }
    if (!periodsPerWeek || periodsPerWeek < 1) { errors.push(`Assignments row ${i + 2}: Periods/Week must be a positive number.`); return; }
    const existing = assignments.find((a) => a.teacherId === teacher.id && a.subjectId === subject.id && a.classId === cls.id);
    if (existing) { existing.periodsPerWeek = periodsPerWeek; existing.avoidRepeatSameDay = avoidRepeatSameDay; updated++; }
    else { assignments.push({ id: uid("asg"), teacherId: teacher.id, subjectId: subject.id, classId: cls.id, periodsPerWeek, avoidRepeatSameDay }); added++; }
  });
  return { assignments, added, updated, errors };
}
function applyBulkImport(bundle, sheets) {
  let rooms = bundle.rooms.slice(), classes = bundle.classes.slice(), subjects = bundle.subjects.slice();
  let teachers = bundle.teachers.slice(), assignments = bundle.assignments.slice();
  const errors = [];
  const summary = {};
  if (sheets.rooms?.length) {
    const r = importRoomsRows(rooms, sheets.rooms);
    rooms = r.rooms; errors.push(...r.errors); summary.rooms = { added: r.added, updated: r.updated };
  }
  if (sheets.subjects?.length) {
    const r = importSubjectsRows(subjects, rooms, sheets.subjects);
    subjects = r.subjects; rooms = r.rooms; errors.push(...r.errors);
    summary.subjects = { added: r.added, updated: r.updated, roomsAutoCreated: r.roomsAutoCreated };
  }
  if (sheets.classes?.length) {
    const r = importClassesRows(classes, sheets.classes);
    classes = r.classes; errors.push(...r.errors); summary.classes = { added: r.added, updated: r.updated };
  }
  if (sheets.teachers?.length) {
    const r = importTeachersRows(teachers, sheets.teachers, bundle.config);
    teachers = r.teachers; errors.push(...r.errors); summary.teachers = { added: r.added, updated: r.updated };
  }
  if (sheets.assignments?.length) {
    const r = importAssignmentsRows(assignments, { teachers, subjects, classes }, sheets.assignments);
    assignments = r.assignments; errors.push(...r.errors); summary.assignments = { added: r.added, updated: r.updated };
  }
  return { bundle: { ...bundle, rooms, subjects, classes, teachers, assignments }, summary, errors };
}

// Recognized sheet names in an uploaded workbook, matched case-insensitively.
const IMPORT_SHEET_NAMES = { rooms: "Rooms", subjects: "Subjects", classes: "Classes", teachers: "Teachers", assignments: "Assignments" };

// xlsx (SheetJS) is a large library only needed on the Import tab, so it's
// code-split via dynamic import rather than living in the main bundle —
// keeps the initial page load fast for the common case of just building
// a timetable and never touching bulk import.
let _xlsxModulePromise = null;
function loadXLSX() {
  if (!_xlsxModulePromise) _xlsxModulePromise = import("xlsx");
  return _xlsxModulePromise;
}

async function buildTemplateWorkbook() {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const instructions = [
    ["Timetable Builder — Bulk Import Template"],
    [""],
    ["How to use this file:"],
    ["1. Fill in each sheet below (Rooms, Subjects, Classes, Teachers, Assignments)."],
    ["2. You don't need every sheet — only include the ones you're importing."],
    ["3. Column headers must stay the same, but you can reorder columns."],
    ["4. Re-upload this file on the Import tab. Matching names update existing records; new names are added."],
    [""],
    ["Sheet: Rooms — only needed for shared/scarce spaces like a lab."],
    ["  Name"],
    [""],
    ["Sheet: Subjects"],
    ["  Name, Double Period (YES/NO), Requires Room (leave blank if none)"],
    [""],
    ["Sheet: Classes"],
    ["  Name"],
    [""],
    ["Sheet: Teachers"],
    ["  Name, Max Periods Per Day, Max Periods Per Week,"],
    ["  Available Days (comma-separated MON,TUE,... or ALL),"],
    ["  Available Periods (comma-separated period numbers or ALL)"],
    [""],
    ["Sheet: Assignments — who teaches what to which class, and how often"],
    ["  Teacher Name, Subject Name, Class Name, Periods Per Week, Avoid Repeat Same Day (YES/NO)"],
    ["  Set Periods Per Week to 2 for a subject that should only meet twice a week, for example."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([{ Name: "Chemistry Lab" }]), "Rooms");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Name: "Mathematics", "Double Period": "NO", "Requires Room": "" },
      { Name: "English", "Double Period": "NO", "Requires Room": "" },
      { Name: "Science", "Double Period": "NO", "Requires Room": "" },
      { Name: "Chemistry Lab", "Double Period": "YES", "Requires Room": "Chemistry Lab" },
      { Name: "Art", "Double Period": "NO", "Requires Room": "" },
      { Name: "Physical Education", "Double Period": "NO", "Requires Room": "" },
      { Name: "Computer Science", "Double Period": "NO", "Requires Room": "" },
      { Name: "Social Studies", "Double Period": "NO", "Requires Room": "" },
    ]),
    "Subjects"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([{ Name: "Grade 6 - A" }, { Name: "Grade 6 - B" }, { Name: "Grade 7 - A" }]),
    "Classes"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { Name: "Mrs. Sharma", "Max Periods Per Day": 6, "Max Periods Per Week": 26, "Available Days": "ALL", "Available Periods": "ALL" },
      { Name: "Mr. Verma", "Max Periods Per Day": 6, "Max Periods Per Week": 26, "Available Days": "ALL", "Available Periods": "ALL" },
      { Name: "Ms. Iyer", "Max Periods Per Day": 3, "Max Periods Per Week": 14, "Available Days": "ALL", "Available Periods": "1,2,3" },
      { Name: "Mr. Khan", "Max Periods Per Day": 4, "Max Periods Per Week": 18, "Available Days": "ALL", "Available Periods": "5,6,7,8" },
      { Name: "Mr. Das", "Max Periods Per Day": 4, "Max Periods Per Week": 8, "Available Days": "TUE,THU", "Available Periods": "ALL" },
    ]),
    "Teachers"
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet([
      { "Teacher Name": "Mrs. Sharma", "Subject Name": "Science", "Class Name": "Grade 6 - A", "Periods Per Week": 5, "Avoid Repeat Same Day": "YES" },
      { "Teacher Name": "Mrs. Sharma", "Subject Name": "English", "Class Name": "Grade 6 - B", "Periods Per Week": 5, "Avoid Repeat Same Day": "YES" },
      { "Teacher Name": "Mr. Verma", "Subject Name": "Mathematics", "Class Name": "Grade 6 - A", "Periods Per Week": 6, "Avoid Repeat Same Day": "YES" },
      { "Teacher Name": "Ms. Iyer", "Subject Name": "Art", "Class Name": "Grade 6 - A", "Periods Per Week": 2, "Avoid Repeat Same Day": "YES" },
      { "Teacher Name": "Mr. Khan", "Subject Name": "Physical Education", "Class Name": "Grade 6 - A", "Periods Per Week": 2, "Avoid Repeat Same Day": "YES" },
      { "Teacher Name": "Mr. Das", "Subject Name": "Social Studies", "Class Name": "Grade 6 - A", "Periods Per Week": 3, "Avoid Repeat Same Day": "YES" },
    ]),
    "Assignments"
  );
  return wb;
}

/* =====================================================================
   DEFAULT / SAMPLE DATA
===================================================================== */
function defaultConfig() {
  return {
    workingDays: ["MON", "TUE", "WED", "THU", "FRI", "SAT"],
    periods: [
      { number: 1, type: "teaching", start: "08:00", end: "08:40" },
      { number: 2, type: "teaching", start: "08:40", end: "09:20" },
      { number: 3, type: "teaching", start: "09:20", end: "10:00" },
      { number: 4, type: "teaching", start: "10:00", end: "10:40" },
      { number: 5, type: "break", start: "10:40", end: "11:20" },
      { number: 6, type: "teaching", start: "11:20", end: "12:00" },
      { number: 7, type: "teaching", start: "12:00", end: "12:40" },
      { number: 8, type: "teaching", start: "12:40", end: "13:20" },
      { number: 9, type: "teaching", start: "13:20", end: "14:00" },
    ],
  };
}
function emptyBundle() {
  return { config: defaultConfig(), teachers: [], subjects: [], classes: [], rooms: [], curriculum: [], assignments: [], lastResult: null };
}
function sampleBundle() {
  const config = defaultConfig();
  const rooms = [{ id: "room_lab", name: "Chemistry Lab" }];
  const classes = [
    { id: "cls_6a", name: "Grade 6 - A" },
    { id: "cls_6b", name: "Grade 6 - B" },
    { id: "cls_7a", name: "Grade 7 - A" },
  ];
  const subjects = [
    { id: "sub_math", name: "Mathematics", isDouble: false, requiresRoomId: null },
    { id: "sub_eng", name: "English", isDouble: false, requiresRoomId: null },
    { id: "sub_sci", name: "Science", isDouble: false, requiresRoomId: null },
    { id: "sub_lab", name: "Chemistry Lab", isDouble: true, requiresRoomId: "room_lab" },
    { id: "sub_art", name: "Art", isDouble: false, requiresRoomId: null },
    { id: "sub_pe", name: "Physical Education", isDouble: false, requiresRoomId: null },
    { id: "sub_cs", name: "Computer Science", isDouble: false, requiresRoomId: null },
    { id: "sub_soc", name: "Social Studies", isDouble: false, requiresRoomId: null },
  ];
  const allDays = config.workingDays;
  const allPeriods = [1, 2, 3, 4, 6, 7, 8, 9];
  const teachers = [
    { id: "t_sharma", name: "Mrs. Sharma", maxPeriodsPerDay: 6, maxPeriodsPerWeek: 26, availableDays: allDays, availablePeriods: allPeriods },
    { id: "t_verma", name: "Mr. Verma", maxPeriodsPerDay: 6, maxPeriodsPerWeek: 26, availableDays: allDays, availablePeriods: allPeriods },
    { id: "t_iyer", name: "Ms. Iyer", maxPeriodsPerDay: 3, maxPeriodsPerWeek: 14, availableDays: allDays, availablePeriods: [1, 2, 3] },
    { id: "t_khan", name: "Mr. Khan", maxPeriodsPerDay: 4, maxPeriodsPerWeek: 18, availableDays: allDays, availablePeriods: [6, 7, 8, 9] },
    { id: "t_rao", name: "Dr. Rao", maxPeriodsPerDay: 6, maxPeriodsPerWeek: 20, availableDays: allDays, availablePeriods: allPeriods },
    { id: "t_nair", name: "Mrs. Nair", maxPeriodsPerDay: 6, maxPeriodsPerWeek: 26, availableDays: allDays, availablePeriods: allPeriods },
    { id: "t_das", name: "Mr. Das", maxPeriodsPerDay: 4, maxPeriodsPerWeek: 8, availableDays: ["TUE", "THU"], availablePeriods: allPeriods },
  ];
  const assignments = [
    { id: uid("asg"), teacherId: "t_sharma", subjectId: "sub_sci", classId: "cls_6a", periodsPerWeek: 5, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_sharma", subjectId: "sub_eng", classId: "cls_6b", periodsPerWeek: 5, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_verma", subjectId: "sub_math", classId: "cls_6a", periodsPerWeek: 6, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_verma", subjectId: "sub_math", classId: "cls_6b", periodsPerWeek: 6, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_verma", subjectId: "sub_math", classId: "cls_7a", periodsPerWeek: 6, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_iyer", subjectId: "sub_art", classId: "cls_6a", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_iyer", subjectId: "sub_art", classId: "cls_7a", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_khan", subjectId: "sub_pe", classId: "cls_6a", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_khan", subjectId: "sub_pe", classId: "cls_6b", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_khan", subjectId: "sub_pe", classId: "cls_7a", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_rao", subjectId: "sub_lab", classId: "cls_7a", periodsPerWeek: 4, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_nair", subjectId: "sub_cs", classId: "cls_6a", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_nair", subjectId: "sub_cs", classId: "cls_6b", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_nair", subjectId: "sub_cs", classId: "cls_7a", periodsPerWeek: 2, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_nair", subjectId: "sub_soc", classId: "cls_7a", periodsPerWeek: 4, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_das", subjectId: "sub_soc", classId: "cls_6a", periodsPerWeek: 3, avoidRepeatSameDay: true },
    { id: uid("asg"), teacherId: "t_das", subjectId: "sub_soc", classId: "cls_6b", periodsPerWeek: 3, avoidRepeatSameDay: true },
  ];
  return { config, teachers, subjects, classes, rooms, assignments, lastResult: null };
}

/* =====================================================================
   DATA NORMALIZATION
   Storage can, in principle, contain partial/corrupted/older-schema data
   (an interrupted write, a future field that didn't exist yet, etc).
   Every load path runs through here so the app never crashes on bad
   data — it just quietly repairs it back to something valid.
===================================================================== */
function normalizeConfig(c) {
  if (c && Array.isArray(c.workingDays) && Array.isArray(c.periods) && c.periods.length) return c;
  return defaultConfig();
}
function sanitizeTeacher(t, config) {
  const teachingNums = config.periods.filter((p) => p.type === "teaching").map((p) => p.number);
  return {
    id: t?.id || uid("t"),
    profileId: t?.profileId || null,
    name: typeof t?.name === "string" ? t.name : "Unnamed teacher",
    email: typeof t?.email === "string" ? t.email : "",
    branchId: typeof t?.branchId === "string" ? t.branchId : "",
    employeeCode: typeof t?.employeeCode === "string" ? t.employeeCode : "",
    department: typeof t?.department === "string" ? t.department : "",
    employmentType: t?.employmentType || "FULL_TIME",
    maxPeriodsPerDay: Number.isFinite(Number(t?.maxPeriodsPerDay)) && Number(t.maxPeriodsPerDay) > 0 ? Number(t.maxPeriodsPerDay) : 6,
    maxPeriodsPerWeek: Number.isFinite(Number(t?.maxPeriodsPerWeek)) && Number(t.maxPeriodsPerWeek) > 0 ? Number(t.maxPeriodsPerWeek) : 30,
    availableDays: Array.isArray(t?.availableDays) && t.availableDays.length ? t.availableDays : config.workingDays.slice(),
    availablePeriods: Array.isArray(t?.availablePeriods) && t.availablePeriods.length ? t.availablePeriods : teachingNums.slice(),
  };
}
function normalizeBundle(raw) {
  const base = emptyBundle();
  if (!raw || typeof raw !== "object") return base;
  const config = normalizeConfig(raw.config);
  const rooms = Array.isArray(raw.rooms) ? raw.rooms.filter((r) => r && r.id && typeof r.name === "string") : [];
  const classes = Array.isArray(raw.classes) ? raw.classes.filter((c) => c && c.id && typeof c.name === "string").map((c) => ({ ...c, gradeId: c.gradeId || "" })) : [];
  const subjects = Array.isArray(raw.subjects)
    ? raw.subjects
        .filter((s) => s && s.id && typeof s.name === "string")
        .map((s) => ({ ...s, subjectCode: s.subjectCode || "", isDouble: !!s.isDouble, requiresRoomId: s.requiresRoomId || null }))
    : [];
  const teachers = Array.isArray(raw.teachers)
    ? raw.teachers.filter((t) => t && t.id && typeof t.name === "string").map((t) => sanitizeTeacher(t, config))
    : [];
  const assignments = Array.isArray(raw.assignments)
    ? raw.assignments
        .filter((a) => a && a.id && a.teacherId && a.subjectId && a.classId)
        .map((a) => ({
          id: a.id, curriculumId: a.curriculumId || null, teacherId: a.teacherId, subjectId: a.subjectId, classId: a.classId,
          periodsPerWeek: Number.isFinite(Number(a.periodsPerWeek)) && Number(a.periodsPerWeek) > 0 ? Number(a.periodsPerWeek) : 1,
          avoidRepeatSameDay: a.avoidRepeatSameDay !== false,
        }))
    : [];
  const curriculum = Array.isArray(raw.curriculum) ? raw.curriculum.filter((item) => item?.id && item?.classId && item?.subjectId) : [];
  return {
    config, teachers, subjects, classes, rooms, curriculum, assignments,
    lastResult: raw.lastResult && typeof raw.lastResult === "object" ? raw.lastResult : null,
  };
}
function normalizeInstituteList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((i) => i && typeof i.id === "string" && typeof i.name === "string");
}

/* =====================================================================
   STORAGE LAYER
   Backed by IndexedDB (see storage.js) — all data lives in the user's
   own browser, no server involved. Every school's data lives under its
   own key (`institute:{id}:data`), so any number of institutes can
   coexist with zero risk of one school's data colliding with another's
   — there's no shared record they could contend over. Reads/writes
   retry with backoff on transient failures so a flaky moment doesn't
   silently drop data, and every load is passed through
   normalizeBundle/normalizeInstituteList so partial or corrupted data
   never crashes the app.
===================================================================== */
async function withRetry(fn, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}
async function loadInstitutes() {
  try {
    const res = await withRetry(() => storage.get("institutes"));
    return normalizeInstituteList(res ? res.value : []);
  } catch (e) {
    console.error("Failed to load institute list", e);
    return [];
  }
}
async function saveInstitutes(list) {
  try {
    await withRetry(() => storage.set("institutes", list));
    return true;
  } catch (e) {
    console.error("Failed to save institute list", e);
    return false;
  }
}
async function loadBundle(instituteId) {
  try {
    const res = await withRetry(() => storage.get(`institute:${instituteId}:data`));
    return res ? normalizeBundle(res.value) : null;
  } catch (e) {
    console.error("Failed to load institute data", e);
    return null;
  }
}
async function saveBundle(instituteId, bundle) {
  try {
    await withRetry(() => storage.set(`institute:${instituteId}:data`, bundle));
    return true;
  } catch (e) {
    console.error("Failed to save institute data", e);
    return false;
  }
}
async function deleteBundle(instituteId) {
  try {
    await withRetry(() => storage.delete(`institute:${instituteId}:data`));
  } catch {
    /* best-effort — a leftover orphaned key does no harm */
  }
}

/* =====================================================================
   SMALL UI PRIMITIVES
===================================================================== */
function Button({ children, onClick, variant = "primary", size = "md", icon: Icon, disabled, type = "button", title, tooltip }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, justifyContent: "center",
    fontWeight: 600, borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
    border: "1px solid transparent", transition: "background 120ms, border-color 120ms",
    opacity: disabled ? 0.55 : 1, whiteSpace: "nowrap",
  };
  const sizes = { sm: { padding: "5px 10px", fontSize: 13 }, md: { padding: "8px 14px", fontSize: 14 } };
  const variants = {
    primary: { background: COLORS.primary, color: "#fff" },
    accent: { background: COLORS.accent, color: "#fff" },
    ghost: { background: "transparent", color: COLORS.ink, border: `1px solid ${COLORS.border}` },
    danger: { background: "transparent", color: COLORS.danger, border: `1px solid ${COLORS.dangerSoft}` },
    subtle: { background: COLORS.bg, color: COLORS.inkMuted, border: `1px solid ${COLORS.border}` },
  };
  const tooltipLabel = tooltip || title || (typeof children === "string" ? children : "Action");
  return (
    <button
      type={type}
      className="tt-tooltip"
      data-tooltip={tooltipLabel}
      aria-label={tooltipLabel}
      title={tooltipLabel}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...sizes[size], ...variants[variant] }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (variant === "primary") e.currentTarget.style.background = COLORS.primaryDark;
        if (variant === "ghost" || variant === "subtle") e.currentTarget.style.background = "#ECEEF2";
        if (variant === "danger") e.currentTarget.style.background = COLORS.dangerSoft;
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = variants[variant].background;
      }}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
}

function Field({ label, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
      <span style={{ fontWeight: 600, color: COLORS.ink }}>{label}</span>
      {children}
      {hint && <span style={{ color: COLORS.inkFaint, fontSize: 12 }}>{hint}</span>}
    </label>
  );
}

const inputStyle = {
  padding: "8px 10px", borderRadius: 7, border: `1px solid ${COLORS.border}`,
  fontSize: 14, color: COLORS.ink, background: "#fff", outline: "none",
};

function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />;
}
function NumberInput(props) {
  return <input type="number" {...props} style={{ ...inputStyle, width: 90, ...(props.style || {}) }} />;
}
function Select({ children, ...props }) {
  return (
    <select {...props} style={{ ...inputStyle, ...(props.style || {}) }}>
      {children}
    </select>
  );
}
function Card({ children, style }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 18, ...style }}>
      {children}
    </div>
  );
}
function Badge({ children, tone = "muted" }) {
  const tones = {
    muted: { bg: "#EEF0F3", fg: COLORS.inkMuted },
    accent: { bg: COLORS.accentSoft, fg: COLORS.accent },
    warn: { bg: COLORS.warnSoft, fg: COLORS.warn },
    danger: { bg: COLORS.dangerSoft, fg: COLORS.danger },
  };
  const t = tones[tone];
  return (
    <span style={{ background: t.bg, color: t.fg, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, letterSpacing: 0.3 }}>
      {children}
    </span>
  );
}
function EmptyState({ icon: Icon, title, body }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: COLORS.inkFaint }}>
      <Icon size={30} style={{ marginBottom: 10, opacity: 0.6 }} />
      <div style={{ fontWeight: 600, color: COLORS.inkMuted, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 380, margin: "0 auto" }}>{body}</div>
    </div>
  );
}

/* =====================================================================
   SETUP TAB
===================================================================== */
function SetupTab({ bundle, updateBundle, onLoadSample }) {
  const { config } = bundle;
  const toggleDay = (code) => {
    const has = config.workingDays.includes(code);
    const workingDays = has ? config.workingDays.filter((d) => d !== code) : [...config.workingDays, code];
    updateBundle({ ...bundle, config: { ...config, workingDays } });
  };
  const updatePeriod = (number, patch) => {
    const periods = config.periods.map((p) => (p.number === number ? { ...p, ...patch } : p));
    updateBundle({ ...bundle, config: { ...config, periods } });
  };
  const addPeriod = () => {
    const nextNumber = config.periods.length ? Math.max(...config.periods.map((p) => p.number)) + 1 : 1;
    updateBundle({ ...bundle, config: { ...config, periods: [...config.periods, { number: nextNumber, type: "teaching", start: "", end: "" }] } });
  };
  const removePeriod = (number) => {
    updateBundle({ ...bundle, config: { ...config, periods: config.periods.filter((p) => p.number !== number) } });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle step="1" title="Working days" subtitle="Which days does the school run classes?" />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {DAYS.map((d) => {
            const active = config.workingDays.includes(d.code);
            return (
              <button
                key={d.code}
                {...tooltipProps(`${active ? "Remove" : "Add"} ${d.label} as a working day`)}
                onClick={() => toggleDay(d.code)}
                style={{
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600,
                  border: `1px solid ${active ? COLORS.primary : COLORS.border}`,
                  background: active ? COLORS.primary : "#fff", color: active ? "#fff" : COLORS.inkMuted,
                }}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <SectionTitle step="2" title="Daily period structure" subtitle="Define every period slot, in order. Mark lunch/recess as a break — nothing gets scheduled there." />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 160px 40px", gap: 8, fontSize: 12, fontWeight: 700, color: COLORS.inkFaint, padding: "0 4px" }}>
            <span>PERIOD</span><span>START</span><span>END</span><span>TYPE</span><span />
          </div>
          {config.periods.map((p) => (
            <div key={p.number} style={{ display: "grid", gridTemplateColumns: "70px 1fr 1fr 160px 40px", gap: 8, alignItems: "center" }}>
              <span style={{ fontWeight: 700, color: COLORS.ink }}>P{p.number}</span>
              <TextInput type="time" value={p.start} onChange={(e) => updatePeriod(p.number, { start: e.target.value })} />
              <TextInput type="time" value={p.end} onChange={(e) => updatePeriod(p.number, { end: e.target.value })} />
              <Select value={p.type} onChange={(e) => updatePeriod(p.number, { type: e.target.value })}>
                <option value="teaching">Teaching period</option>
                <option value="break">Break / Lunch (fixed)</option>
              </Select>
              <button {...tooltipProps(`Remove period ${p.number}`)} onClick={() => removePeriod(p.number)} style={{ border: "none", background: "none", cursor: "pointer", color: COLORS.inkFaint }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          <Button variant="ghost" icon={Plus} size="sm" onClick={addPeriod}>Add period</Button>
        </div>
      </Card>

      {onLoadSample && <Card style={{ background: COLORS.accentSoft, border: `1px solid ${COLORS.accent}22` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Sparkles size={18} color={COLORS.accent} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, color: COLORS.ink }}>New here? Load example data</div>
              <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 2 }}>
                Fills every tab with a realistic sample school — teachers, part-timers, a lab subject —
                so you can see how everything fits together before entering your own data.
              </div>
            </div>
          </div>
          <Button variant="accent" onClick={onLoadSample}>Load example data</Button>
        </div>
      </Card>}
    </div>
  );
}

function SectionTitle({ step, title, subtitle }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      {step && (
        <span style={{
          width: 22, height: 22, borderRadius: 6, background: COLORS.primary, color: "#fff",
          fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1,
        }}>
          {step}
        </span>
      )}
      <div>
        <div style={{ fontWeight: 700, fontSize: 15, color: COLORS.ink }}>{title}</div>
        {subtitle && <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 2 }}>{subtitle}</div>}
      </div>
    </div>
  );
}

/* =====================================================================
   TEACHERS TAB
===================================================================== */
function emptyTeacherForm(config, branchId = "") {
  return {
    id: null, profileId: null, name: "", email: "", branchId, role: "TEACHER", employeeCode: "", department: "",
    employmentType: "FULL_TIME", maxPeriodsPerDay: 6, maxPeriodsPerWeek: 42,
    availableDays: [...config.workingDays],
    availablePeriods: config.periods.filter((p) => p.type === "teaching").map((p) => p.number),
  };
}

function TeachersTab({ bundle, onNavigate }) {
  const { teachers, config } = bundle;
  const teachingPeriods = config.periods.filter((p) => p.type === "teaching");
  const goToStaff = () => onNavigate?.("/staff");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle title="Teachers" subtitle="Teacher records and availability are managed in People → Staff." />
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 12, background: COLORS.bg, borderRadius: 9 }}>
          <span style={{ fontSize: 13, color: COLORS.inkMuted }}>Changes made in Staff are automatically reflected here.</span>
          <Button size="sm" icon={ArrowRight} onClick={goToStaff}>Manage teachers</Button>
        </div>
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {teachers.length === 0 && <EmptyState icon={Users} title="No teachers yet" body="Add teachers from People → Staff." />}
          {teachers.map((t) => {
            const isFullTime = t.availableDays.length === config.workingDays.length && t.availablePeriods.length === teachingPeriods.length;
            return <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 9 }}><div><div style={{ fontWeight: 700, color: COLORS.ink, display: "flex", gap: 8, alignItems: "center" }}>{t.name}{isFullTime ? <Badge tone="muted">Full-time</Badge> : <Badge tone="warn">Part-time</Badge>}</div><div style={{ fontSize: 12.5, color: COLORS.inkFaint, marginTop: 3 }}>Up to {t.maxPeriodsPerDay}/day · {t.maxPeriodsPerWeek}/week · {t.availableDays.length === config.workingDays.length ? "all days" : t.availableDays.join(", ")} · {t.availablePeriods.length === teachingPeriods.length ? "all periods" : `periods ${t.availablePeriods.slice().sort((a,b)=>a-b).join(", ")}`}</div></div></div>;
          })}
        </div>
      </Card>
    </div>
  );
}

/* =====================================================================
   STRUCTURE TAB — Subjects, Classes, Rooms
===================================================================== */
function StructureTab({ bundle, onNavigate }) {
  const { teachers, subjects, classes, rooms } = bundle;
  const goTo = (path) => onNavigate?.(path);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle title="Structure" subtitle="Subjects, classes, and rooms are managed in Institute Setup and shown here for scheduling context." />
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, padding: 12, background: COLORS.bg, borderRadius: 9 }}>
          <Button size="sm" icon={ArrowRight} onClick={() => goTo("/setup/subjects-curriculum")}>Manage subjects &amp; classes</Button>
          <Button size="sm" icon={ArrowRight} onClick={() => goTo("/setup/rooms-facilities")}>Manage rooms</Button>
        </div>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Subjects ({subjects.length})</div>
            {subjects.length === 0 ? <EmptyState icon={BookOpen} title="No subjects" body="Add subjects from Institute Setup." /> : subjects.map((s) => <div key={s.id} style={{ padding: "9px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 9, marginBottom: 8 }}><span style={{ fontWeight: 700 }}>{s.name}</span>{s.isDouble && <span style={{ marginLeft: 6 }}><Badge tone="accent">double period</Badge></span>}</div>)}
          </div>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Classes ({classes.length})</div>
            {classes.length === 0 ? <EmptyState icon={School} title="No classes" body="Add classes and sections from Institute Setup." /> : classes.map((c) => <div key={c.id} style={{ padding: "9px 12px", border: `1px solid ${COLORS.border}`, borderRadius: 9, marginBottom: 8, fontWeight: 600 }}>{c.name}</div>)}
          </div>
        </div>
      </Card>
      <Card>
        <SectionTitle title="Rooms" subtitle="Only active shared rooms are included in timetable generation." />
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: 12, background: COLORS.bg, borderRadius: 9 }}>
          <span style={{ fontSize: 13, color: COLORS.inkMuted }}>{rooms.length} shared room{rooms.length === 1 ? "" : "s"} available.</span>
          <Button size="sm" icon={ArrowRight} onClick={() => goTo("/setup/rooms-facilities")}>Manage rooms</Button>
        </div>
        {rooms.length > 0 && <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8 }}>{rooms.map((room) => <Badge key={room.id} tone="muted">{room.name}</Badge>)}</div>}
      </Card>
    </div>
  );
}
const iconBtnStyle = { border: "none", background: "none", cursor: "pointer", color: COLORS.inkFaint, padding: 4 };

/* =====================================================================
   ASSIGNMENTS TAB
===================================================================== */
function AssignmentsTab({ bundle, onNavigate }) {
  const { teachers, subjects, classes, assignments } = bundle;
  const goToMappings = () => onNavigate?.("/setup/subjects-curriculum?tab=teacher-mapping");
  const teacherName = (id) => teachers.find((t) => t.id === id)?.name || "—";
  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || "—";
  const className = (id) => classes.find((c) => c.id === id)?.name || "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle title="Teacher → Subject → Class assignments" subtitle="Mappings are managed in Institute Setup → Subjects & Curriculum and are used here by the timetable generator." />
        <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: 12, background: COLORS.bg, borderRadius: 9 }}><span style={{ fontSize: 13, color: COLORS.inkMuted }}>Changes made in Teacher mapping are automatically reflected here.</span><Button size="sm" icon={ArrowRight} onClick={goToMappings}>Manage assignments</Button></div>
      </Card>

      <Card>
        <SectionTitle title="All assignments" subtitle={`${assignments.length} mapping${assignments.length === 1 ? "" : "s"}`} />
        <div style={{ marginTop: 12 }}>
          {assignments.length === 0 ? (
            <EmptyState icon={ClipboardList} title="No assignments yet" body="Create teacher mappings from Institute Setup → Subjects & Curriculum." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: COLORS.inkFaint, fontSize: 11.5, fontWeight: 700 }}>
                  <th style={thStyle}>TEACHER</th><th style={thStyle}>SUBJECT</th><th style={thStyle}>CLASS</th>
                  <th style={thStyle}>PERIODS/WEEK</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                    <td style={tdStyle}>{teacherName(a.teacherId)}</td>
                    <td style={tdStyle}>{subjectName(a.subjectId)}</td>
                    <td style={tdStyle}>{className(a.classId)}</td>
                    <td style={tdStyle}>{a.periodsPerWeek}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
const thStyle = { padding: "6px 8px" };
const tdStyle = { padding: "9px 8px", color: COLORS.ink };

/* =====================================================================
   IMPORT TAB — bulk insert from CSV, or upload a full Excel workbook
===================================================================== */
const CSV_TYPE_OPTIONS = [
  { id: "teachers", label: "Teachers" },
  { id: "subjects", label: "Subjects" },
  { id: "classes", label: "Classes" },
  { id: "rooms", label: "Rooms" },
  { id: "assignments", label: "Assignments" },
];

function ImportTab({ bundle, updateBundle, instituteName }) {
  const fileInputRef = useRef(null);
  const backupInputRef = useRef(null);
  const [pendingCsv, setPendingCsv] = useState(null); // { fileName, rows, headers }
  const [csvType, setCsvType] = useState("teachers");
  const [pendingXlsx, setPendingXlsx] = useState(null); // { fileName, sheets: {key: rows} }
  const [outcome, setOutcome] = useState(null); // { summary, errors }
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const downloadTemplate = async () => {
    setBusy(true);
    try {
      const [wb, XLSX] = await Promise.all([buildTemplateWorkbook(), loadXLSX()]);
      XLSX.writeFile(wb, "timetable-import-template.xlsx");
    } catch (e) {
      setOutcome({ summary: {}, errors: [`Couldn't generate the template: ${e.message}`] });
    }
    setBusy(false);
  };

  const downloadBackup = () => {
    const payload = { exportedAt: new Date().toISOString(), institute: instituteName || "School", data: bundle };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (instituteName || "school").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = `${safeName}-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onBackupFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setOutcome(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const raw = parsed && parsed.data ? parsed.data : parsed; // accept both the wrapped export format and a raw bundle
      const normalized = normalizeBundle(raw);
      if (window.confirm(`This will replace all current data for "${instituteName}" with the contents of this backup. Continue?`)) {
        updateBundle(normalized);
        setOutcome({ summary: {}, errors: [] });
      }
    } catch (err) {
      setOutcome({ summary: {}, errors: [`Couldn't read that backup file: ${err.message}`] });
    }
    if (backupInputRef.current) backupInputRef.current.value = "";
  };

  const resetPending = () => {
    setPendingCsv(null);
    setPendingXlsx(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFile = async (file) => {
    setOutcome(null);
    const ext = file.name.split(".").pop().toLowerCase();
    setBusy(true);
    try {
      if (ext === "csv") {
        const text = await file.text();
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
        setPendingXlsx(null);
        setPendingCsv({ fileName: file.name, rows: parsed.data, headers: parsed.meta.fields || [] });
      } else if (ext === "xlsx" || ext === "xls") {
        const XLSX = await loadXLSX();
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const found = {};
        for (const [key, sheetName] of Object.entries(IMPORT_SHEET_NAMES)) {
          const match = wb.SheetNames.find((n) => n.trim().toLowerCase() === sheetName.toLowerCase());
          if (match) {
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[match], { defval: "" });
            if (rows.length) found[key] = rows;
          }
        }
        setPendingCsv(null);
        setPendingXlsx({ fileName: file.name, sheets: found });
      } else {
        setOutcome({ summary: {}, errors: [`Unsupported file type ".${ext}" — please upload a .xlsx, .xls, or .csv file.`] });
      }
    } catch (e) {
      setOutcome({ summary: {}, errors: [`Couldn't read that file: ${e.message}`] });
    }
    setBusy(false);
  };

  const onFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const confirmCsvImport = () => {
    const result = applyBulkImport(bundle, { [csvType]: pendingCsv.rows });
    updateBundle(result.bundle);
    setOutcome({ summary: result.summary, errors: result.errors });
    resetPending();
  };
  const confirmXlsxImport = () => {
    const result = applyBulkImport(bundle, pendingXlsx.sheets);
    updateBundle(result.bundle);
    setOutcome({ summary: result.summary, errors: result.errors });
    resetPending();
  };

  const summaryLine = (key, label) => {
    const s = outcome?.summary?.[key];
    if (!s) return null;
    const parts = [];
    if (s.added) parts.push(`${s.added} added`);
    if (s.updated) parts.push(`${s.updated} updated`);
    if (s.roomsAutoCreated) parts.push(`${s.roomsAutoCreated} room(s) auto-created`);
    if (parts.length === 0) return null;
    return <li key={key}><strong>{label}:</strong> {parts.join(", ")}</li>;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card>
        <SectionTitle
          title="Backup & restore"
          subtitle={`A safety net independent of autosave — download a full snapshot of "${instituteName}" any time, and restore it later or on another device.`}
        />
        <div style={{ marginTop: 14, display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button variant="ghost" icon={Download} onClick={downloadBackup}>Download backup (.json)</Button>
          <Button variant="ghost" icon={UploadCloud} onClick={() => backupInputRef.current?.click()}>Restore from backup</Button>
          <input ref={backupInputRef} type="file" accept=".json" onChange={onBackupFile} style={{ display: "none" }} />
        </div>
      </Card>

      <Card>
        <SectionTitle
          title="Bulk import"
          subtitle="Upload one Excel workbook with all your data, or a single CSV for one type at a time. Re-uploading later updates existing records (matched by name) instead of duplicating them."
        />

        <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: COLORS.accentSoft, borderRadius: 10, padding: 16, border: `1px solid ${COLORS.accent}22` }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <FileSpreadsheet size={20} color={COLORS.accent} style={{ marginTop: 2, flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: COLORS.ink }}>Not sure of the format?</div>
                <div style={{ fontSize: 13, color: COLORS.inkMuted, marginTop: 3 }}>
                  Download a ready-made Excel template — five sheets (Rooms, Subjects, Classes, Teachers, Assignments),
                  pre-filled with a working example and an Instructions sheet explaining every column.
                </div>
                <div style={{ marginTop: 10 }}>
                  <Button size="sm" variant="accent" icon={Download} onClick={downloadTemplate}>Download sample template</Button>
                </div>
              </div>
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragOver ? COLORS.primary : COLORS.border}`,
              borderRadius: 10, padding: 16, display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", textAlign: "center", gap: 8,
              background: dragOver ? "#F0F3F9" : "transparent", cursor: "pointer",
            }}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadCloud size={22} color={COLORS.inkFaint} />
            <div style={{ fontWeight: 700, fontSize: 13.5, color: COLORS.ink }}>Click to upload, or drag a file here</div>
            <div style={{ fontSize: 12, color: COLORS.inkFaint }}>.xlsx, .xls, or .csv</div>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileInputChange} style={{ display: "none" }} />
          </div>
        </div>

        {busy && (
          <div style={{ marginTop: 14, display: "flex", alignItems: "center", gap: 8, color: COLORS.inkMuted, fontSize: 13.5 }}>
            <Loader2 size={15} className="spin" /> Reading file…
          </div>
        )}

        {pendingXlsx && (
          <div style={{ marginTop: 16, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>“{pendingXlsx.fileName}” — found:</div>
            {Object.keys(pendingXlsx.sheets).length === 0 ? (
              <div style={{ fontSize: 13, color: COLORS.danger }}>
                No recognizable sheets found. Expected sheet names: Rooms, Subjects, Classes, Teachers, Assignments.
              </div>
            ) : (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: COLORS.inkMuted, display: "flex", flexDirection: "column", gap: 3 }}>
                {Object.entries(pendingXlsx.sheets).map(([key, rows]) => (
                  <li key={key}><strong style={{ color: COLORS.ink }}>{IMPORT_SHEET_NAMES[key]}</strong>: {rows.length} row(s)</li>
                ))}
              </ul>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button size="sm" icon={FileUp} onClick={confirmXlsxImport} disabled={Object.keys(pendingXlsx.sheets).length === 0}>Import this file</Button>
              <Button size="sm" variant="ghost" onClick={resetPending}>Cancel</Button>
            </div>
          </div>
        )}

        {pendingCsv && (
          <div style={{ marginTop: 16, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 8 }}>
              “{pendingCsv.fileName}” — {pendingCsv.rows.length} row(s), columns: {pendingCsv.headers.join(", ")}
            </div>
            <Field label="What does this CSV contain?">
              <Select value={csvType} onChange={(e) => setCsvType(e.target.value)} style={{ maxWidth: 260 }}>
                {CSV_TYPE_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </Select>
            </Field>
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <Button size="sm" icon={FileUp} onClick={confirmCsvImport}>Import as {CSV_TYPE_OPTIONS.find((o) => o.id === csvType)?.label}</Button>
              <Button size="sm" variant="ghost" onClick={resetPending}>Cancel</Button>
            </div>
          </div>
        )}

        {outcome && (
          <div style={{ marginTop: 16, borderRadius: 10, padding: 14, background: outcome.errors.length ? COLORS.warnSoft : COLORS.accentSoft }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, color: outcome.errors.length ? COLORS.warn : COLORS.accent, marginBottom: 6 }}>
              {outcome.errors.length ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              Import {outcome.errors.length ? "completed with some issues" : "completed"}
            </div>
            {Object.keys(outcome.summary).length > 0 && (
              <ul style={{ margin: "0 0 8px 0", paddingLeft: 18, fontSize: 13.5, color: COLORS.ink, display: "flex", flexDirection: "column", gap: 2 }}>
                {summaryLine("rooms", "Rooms")}
                {summaryLine("subjects", "Subjects")}
                {summaryLine("classes", "Classes")}
                {summaryLine("teachers", "Teachers")}
                {summaryLine("assignments", "Assignments")}
              </ul>
            )}
            {outcome.errors.length > 0 && (
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#7A5A1E", display: "flex", flexDirection: "column", gap: 3 }}>
                {outcome.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
          </div>
        )}
      </Card>

      <Card style={{ background: COLORS.bg }}>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Info size={18} color={COLORS.inkFaint} style={{ marginTop: 2, flexShrink: 0 }} />
          <div style={{ fontSize: 13, color: COLORS.inkMuted, lineHeight: 1.6 }}>
            <strong style={{ color: COLORS.ink }}>Format reference</strong>
            <ul style={{ margin: "6px 0 0 0", paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>
              <li><strong>Rooms:</strong> Name</li>
              <li><strong>Subjects:</strong> Name, Double Period (YES/NO), Requires Room</li>
              <li><strong>Classes:</strong> Name</li>
              <li><strong>Teachers:</strong> Name, Max Periods Per Day, Max Periods Per Week, Available Days (e.g. <code>MON,TUE,WED</code> or <code>ALL</code>), Available Periods (e.g. <code>1,2,3</code> or <code>ALL</code>)</li>
              <li><strong>Assignments:</strong> Teacher Name, Subject Name, Class Name, Periods Per Week, Avoid Repeat Same Day (YES/NO)</li>
            </ul>
            <div style={{ marginTop: 8 }}>Names are matched case-insensitively across sheets — "Chemistry Lab" in Subjects will correctly link to "Chemistry Lab" in Rooms, for example.</div>
          </div>
        </div>
      </Card>
    </div>
  );
}

/* =====================================================================
   TIMETABLE TAB
===================================================================== */
function TimetableTab({ bundle, updateBundle, readOnly = false, saveTimetable }) {
  const [generating, setGenerating] = useState(false);
  const [savingTimetable, setSavingTimetable] = useState("");
  const [saveError, setSaveError] = useState("");
  const [savedStatus, setSavedStatus] = useState("");
  const [view, setView] = useState("class");
  const [focusId, setFocusId] = useState(null);
  const printRef = useRef(null);

  const result = bundle.lastResult;

  const focusOptions = view === "class" ? bundle.classes : bundle.teachers;
  useEffect(() => {
    if (focusOptions.length && !focusOptions.find((o) => o.id === focusId)) setFocusId(focusOptions[0].id);
  }, [view, bundle.classes, bundle.teachers]); // eslint-disable-line

  const runGenerate = async () => {
    setGenerating(true); setSaveError(""); setSavedStatus("");
    await new Promise((r) => setTimeout(r, 30)); // let the UI paint the loading state
    
    const lockedEntries = [];
    if (result && result.entries) {
      for (const e of result.entries) {
        if (e.isLocked) {
          lockedEntries.push({ ...e, isLocked: true });
        }
      }
    }
    
    const data = { config: bundle.config, teachers: bundle.teachers, subjects: bundle.subjects, classes: bundle.classes, rooms: bundle.rooms, assignments: bundle.assignments };
    const r = generateTimetable(data, { lockedEntries, generateScope: "all" });
    const nextBundle = { ...bundle, lastResult: { ...r, generatedAt: Date.now() } };
    updateBundle(nextBundle);
    setGenerating(false);
  };

  const persistTimetable = async (status) => {
    if (!result?.feasible || !saveTimetable) return;
    setSavingTimetable(status); setSaveError("");
    try {
      await saveTimetable(bundle, status);
      setSavedStatus(status);
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : `The timetable could not be ${status === "PUBLISHED" ? "published" : "saved"}.`);
    } finally { setSavingTimetable(""); }
  };

  const handleDrop = (e, targetDay, targetPeriod) => {
    e.preventDefault();
    if (!result?.feasible) return;
    const payloadStr = e.dataTransfer.getData("application/json");
    if (!payloadStr) return;
    const { id, oldDay, oldPeriods, classId, teacherId } = JSON.parse(payloadStr);
    if (oldDay === targetDay && oldPeriods[0] === targetPeriod) return; // No change

    const newPeriods = oldPeriods.length === 2 ? [targetPeriod, targetPeriod + 1] : [targetPeriod];
    const subjectId = bundle.assignments.find(a => a.id === id).subjectId;
    const requiresRoomId = bundle.subjects.find(s => s.id === subjectId).requiresRoomId || null;

    const conflictingIds = new Set();
    for (const entry of result.entries) {
      if (entry.assignmentId === id && entry.day === oldDay && entry.periods[0] === oldPeriods[0]) continue;
      if (entry.day === targetDay) {
        const overlap = entry.periods.some(p => newPeriods.includes(p));
        if (overlap) {
          if (entry.teacherId === teacherId || entry.classId === classId || (requiresRoomId && entry.roomId === requiresRoomId)) {
            conflictingIds.add(entry.assignmentId);
          }
        }
      }
    }

    const lockedEntries = [];
    for (const entry of result.entries) {
      if (entry.assignmentId === id && entry.day === oldDay && entry.periods[0] === oldPeriods[0]) continue; // removed
      if (conflictingIds.has(entry.assignmentId) && !entry.isLocked) continue; // let it be rescheduled
      lockedEntries.push({ ...entry }); // lock it for this generation run
    }
    
    lockedEntries.push({
      assignmentId: id,
      teacherId,
      classId,
      subjectId,
      roomId: requiresRoomId,
      day: targetDay,
      periods: newPeriods,
      isLocked: true 
    });
    
    setGenerating(true);
    setTimeout(() => {
      const data = { config: bundle.config, teachers: bundle.teachers, subjects: bundle.subjects, classes: bundle.classes, rooms: bundle.rooms, assignments: bundle.assignments };
      const r = generateTimetable(data, { lockedEntries });
      if (!r.feasible) {
        updateBundle({ ...bundle, lastResult: { ...r, generatedAt: Date.now(), previousEntries: result.entries } });
      } else {
        updateBundle({ ...bundle, lastResult: { ...r, generatedAt: Date.now() } });
      }
      setGenerating(false);
    }, 30);
  };

  const toggleLock = (e, entry) => {
    e.stopPropagation();
    const newEntries = result.entries.map(ent => 
      (ent.assignmentId === entry.assignmentId && ent.day === entry.day && ent.periods[0] === entry.periods[0])
        ? { ...ent, isLocked: !ent.isLocked }
        : ent
    );
    updateBundle({ ...bundle, lastResult: { ...result, entries: newEntries } });
  };

  const grid = useMemo(() => {
    if (!result?.feasible || !focusId) return null;
    const cell = {};
    for (const e of result.entries) {
      const matches = view === "class" ? e.classId === focusId : e.teacherId === focusId;
      if (!matches) continue;
      for (const p of e.periods) cell[`${e.day}-${p}`] = e;
    }
    return cell;
  }, [result, focusId, view]);

  const exportCsv = () => {
    if (!result?.feasible) return;
    const teacherById = Object.fromEntries(bundle.teachers.map((t) => [t.id, t]));
    const subjectById = Object.fromEntries(bundle.subjects.map((s) => [s.id, s]));
    const classById = Object.fromEntries(bundle.classes.map((c) => [c.id, c]));
    const rows = [["Day", "Period", "Class", "Subject", "Teacher"]];
    const sorted = [...result.entries].sort((a, b) => a.day.localeCompare(b.day) || a.periods[0] - b.periods[0]);
    for (const e of sorted) for (const p of e.periods) rows.push([e.day, p, classById[e.classId]?.name, subjectById[e.subjectId]?.name, teacherById[e.teacherId]?.name]);
    const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "timetable.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {readOnly && (
        <Card>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <SectionTitle title="Existing timetable" subtitle={result?.feasible ? `Latest generated schedule${result.generatedAt ? ` · ${new Date(result.generatedAt).toLocaleString()}` : ""}` : "No generated timetable is available yet."} />
          </div>
          {!result?.feasible && <div style={{ marginTop: 12 }}><EmptyState icon={Grid3x3} title="No saved timetable" body="Use Generate Timetable from the left navigation to create and save a schedule." /></div>}
        </Card>
      )}

      {!readOnly && <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <SectionTitle
            title="Generate the timetable"
            subtitle="Runs every hard constraint (availability, clashes, double periods, room sharing) and keeps each subject in the same period across weekdays when possible."
          />
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <Button variant="accent" icon={generating ? Loader2 : Sparkles} onClick={runGenerate} disabled={generating || Boolean(savingTimetable)}>
              {generating ? "Generating…" : result ? "Regenerate all classes" : "Generate all classes"}
            </Button>
          </div>
        </div>
        {result && (
          <div style={{ marginTop: 14 }}>
            {result.feasible ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.accent, fontWeight: 600, fontSize: 13.5 }}>
                <CheckCircle2 size={16} /> Timetable generated successfully.
              </div>
            ) : (
              <div style={{ background: COLORS.dangerSoft, borderRadius: 9, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.danger, fontWeight: 700, marginBottom: 8 }}>
                  <AlertTriangle size={16} /> Couldn't build a complete timetable
                </div>
                {result.previousEntries && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, color: COLORS.danger, marginBottom: 8 }}>The manual adjustment caused a conflict that couldn't be resolved.</div>
                    <Button size="sm" onClick={() => updateBundle({ ...bundle, lastResult: { feasible: true, entries: result.previousEntries } })}>Revert Adjustment</Button>
                  </div>
                )}
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, color: "#7A2E29", display: "flex", flexDirection: "column", gap: 4 }}>
                  {result.diagnostics.map((d, i) => <li key={i}>{d}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
        {saveError && <div role="alert" style={{ marginTop: 12, color: COLORS.danger, fontSize: 13 }}>{saveError}</div>}
        {result?.feasible && <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginTop: 14, paddingTop: 14, borderTop: `1px solid ${COLORS.border}` }}>
          <div style={{ fontSize: 13, color: savedStatus ? COLORS.accent : COLORS.inkMuted }}>{savedStatus === "PUBLISHED" ? "Published for all classes and available under View Timetable." : savedStatus === "DRAFT" ? "Draft saved for all classes and available under View Timetable." : "Review the generated timetable, then save it as a draft or publish it for all classes."}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="ghost" icon={savingTimetable === "DRAFT" ? Loader2 : Save} onClick={() => persistTimetable("DRAFT")} disabled={Boolean(savingTimetable)} tooltip="Save this generated timetable as a draft for all classes">{savingTimetable === "DRAFT" ? "Saving…" : "Save Draft"}</Button>
            <Button variant="accent" icon={savingTimetable === "PUBLISHED" ? Loader2 : CheckCircle2} onClick={() => persistTimetable("PUBLISHED")} disabled={Boolean(savingTimetable)} tooltip="Publish this generated timetable for all classes">{savingTimetable === "PUBLISHED" ? "Publishing…" : "Publish Timetable"}</Button>
          </div>
        </div>}
      </Card>}

      {result?.feasible && (
        <Card>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
            <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
                {["class", "teacher"].map((v) => (
                  <button key={v} {...tooltipProps(`Show timetable grouped by ${v}`)} onClick={() => setView(v)} style={{
                    padding: "7px 14px", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer",
                    background: view === v ? COLORS.primary : "#fff", color: view === v ? "#fff" : COLORS.inkMuted,
                  }}>
                    By {v === "class" ? "class" : "teacher"}
                  </button>
                ))}
              </div>
              <Select value={focusId || ""} onChange={(e) => setFocusId(e.target.value)} style={{ minWidth: 200 }}>
                {focusOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Button size="sm" variant="ghost" icon={Download} onClick={exportCsv}>Export CSV</Button>
              <Button size="sm" variant="ghost" icon={Printer} onClick={() => window.print()}>Print</Button>
            </div>
          </div>

          <div ref={printRef} style={{ marginTop: 16, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
              <thead>
                <tr>
                  <th style={gridHeadStyle}></th>
                  {bundle.config.workingDays.map((d) => (
                    <th key={d} style={gridHeadStyle}>{DAYS.find((x) => x.code === d)?.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bundle.config.periods.map((p) => (
                  <tr key={p.number}>
                    <td style={{ ...gridCellStyle, fontWeight: 700, color: COLORS.inkMuted, background: COLORS.bg, whiteSpace: "nowrap" }}>
                      {p.type === "break" ? "Break" : `P${p.number}`}
                      <div style={{ fontWeight: 400, fontSize: 10.5, color: COLORS.inkFaint }}>{p.start}–{p.end}</div>
                    </td>
                    {bundle.config.workingDays.map((d) => {
                      if (p.type === "break") {
                        return <td key={d} style={{ ...gridCellStyle, background: COLORS.breakBg, color: COLORS.inkFaint, fontSize: 12, textAlign: "center", fontStyle: "italic" }}>Lunch</td>;
                      }
                      const entry = grid?.[`${d}-${p.number}`];
                      if (!entry) {
                        return (
                          <td
                            key={d} 
                            style={gridCellStyle}
                            onDragOver={!readOnly ? (e) => e.preventDefault() : undefined}
                            onDrop={!readOnly ? (e) => handleDrop(e, d, p.number) : undefined}
                          >
                            —
                          </td>
                        );
                      }
                      const subject = bundle.subjects.find((s) => s.id === entry.subjectId);
                      const other = view === "class" ? bundle.teachers.find((t) => t.id === entry.teacherId) : bundle.classes.find((c) => c.id === entry.classId);
                      const color = colorForSubject(entry.subjectId, bundle.subjects);
                      return (
                        <td
                          key={d} 
                          style={gridCellStyle}
                          onDragOver={!readOnly ? (e) => e.preventDefault() : undefined}
                          onDrop={!readOnly ? (e) => handleDrop(e, d, p.number) : undefined}
                        >
                          <div
                            draggable={!readOnly}
                            onDragStart={(e) => {
                              if (readOnly) return;
                              e.dataTransfer.setData("application/json", JSON.stringify({
                                id: entry.assignmentId, oldDay: entry.day, oldPeriods: entry.periods, classId: entry.classId, teacherId: entry.teacherId
                              }));
                            }}
                            style={{ background: `${color}18`, borderLeft: `3px solid ${color}`, borderRadius: 6, padding: "6px 8px", cursor: readOnly ? "default" : "grab", position: "relative" }}
                          >
                            {!readOnly && <button
                              {...tooltipProps(entry.isLocked ? "Unlock this timetable period" : "Lock this timetable period")}
                              onClick={(e) => toggleLock(e, entry)} 
                              style={{ position: "absolute", top: 4, right: 4, background: "none", border: "none", cursor: "pointer", color: entry.isLocked ? COLORS.warn : COLORS.inkFaint, opacity: entry.isLocked ? 1 : 0.4 }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                {entry.isLocked ? (
                                   <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></>
                                ) : (
                                   <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 9.9-1"></path></>
                                )}
                              </svg>
                            </button>}
                            <div style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.ink, paddingRight: readOnly ? 0 : 16 }}>{subject?.name}</div>
                            <div style={{ fontSize: 11.5, color: COLORS.inkMuted }}>{other?.name}</div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const gridHeadStyle = { padding: "8px 10px", fontSize: 12, fontWeight: 700, color: COLORS.inkFaint, textAlign: "left", borderBottom: `2px solid ${COLORS.border}` };
const gridCellStyle = { padding: "6px 8px", borderBottom: `1px solid ${COLORS.border}`, verticalAlign: "top", fontSize: 12 };

/* =====================================================================
   INSTITUTE PICKER
===================================================================== */
function InstitutePicker({ institutes, currentId, onSelect, onCreate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [filter, setFilter] = useState("");
  const current = institutes.find((i) => i.id === currentId);
  const visible = filter.trim()
    ? institutes.filter((i) => i.name.toLowerCase().includes(filter.trim().toLowerCase()))
    : institutes;

  return (
    <div style={{ position: "relative" }}>
      <button {...tooltipProps(open ? "Close institute selector" : "Choose an institute")} onClick={() => setOpen((o) => !o)} style={{
        display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 8, padding: "7px 12px", color: "#fff", cursor: "pointer", fontSize: 13.5, fontWeight: 600,
      }}>
        <School size={15} />
        {current?.name || "Select institute"}
        {institutes.length > 1 && <Badge tone="muted">{institutes.length} schools</Badge>}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#fff", borderRadius: 10, boxShadow: "0 8px 30px rgba(0,0,0,0.18)", width: 300, zIndex: 20, overflow: "hidden" }}>
          {institutes.length > 6 && (
            <div style={{ padding: 10, borderBottom: `1px solid ${COLORS.border}` }}>
              <TextInput autoFocus value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search schools…" style={{ width: "100%", fontSize: 13 }} />
            </div>
          )}
          <div style={{ maxHeight: 260, overflowY: "auto" }}>
            {visible.length === 0 && <div style={{ padding: 12, fontSize: 13, color: COLORS.inkFaint }}>No schools match "{filter}".</div>}
            {visible.map((inst) => (
              <div key={inst.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px",
                background: inst.id === currentId ? COLORS.bg : "#fff", cursor: "pointer",
              }} onClick={() => { onSelect(inst.id); setOpen(false); }}>
                <span style={{ fontSize: 13.5, color: COLORS.ink, fontWeight: inst.id === currentId ? 700 : 500 }}>{inst.name}</span>
                <button {...tooltipProps(`Delete ${inst.name}`)} onClick={(e) => { e.stopPropagation(); if (window.confirm(`Delete "${inst.name}" and all its data? This cannot be undone.`)) onDelete(inst.id); }} style={{ ...iconBtnStyle, padding: 2 }}>
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
          <div style={{ borderTop: `1px solid ${COLORS.border}`, padding: 10 }}>
            {creating ? (
              <div style={{ display: "flex", gap: 6 }}>
                <TextInput autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="School name" style={{ flex: 1, fontSize: 13 }}
                  onKeyDown={(e) => { if (e.key === "Enter" && newName.trim()) { onCreate(newName.trim()); setNewName(""); setCreating(false); setOpen(false); } }} />
                <Button size="sm" onClick={() => { if (newName.trim()) { onCreate(newName.trim()); setNewName(""); setCreating(false); setOpen(false); } }}>Add</Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" icon={Plus} onClick={() => setCreating(true)}>New institute</Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================================
   MAIN APP
===================================================================== */
const TABS = [
  { id: "setup", label: "Setup", icon: Calendar },
  { id: "teachers", label: "Teachers", icon: Users },
  { id: "structure", label: "Structure", icon: BookOpen },
  { id: "assignments", label: "Assignments", icon: ClipboardList },
  { id: "import", label: "Import", icon: UploadCloud },
  { id: "timetable", label: "Timetable", icon: Grid3x3 },
];

export default function TimetableApp() {
  const [institutes, setInstitutes] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("setup");
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const activeInstituteRef = useRef(null); // guards against a stale async write landing after the user switched schools
  const pendingRetryRef = useRef(null); // last bundle that failed to save, for the Retry button

  // Initial load
  useEffect(() => {
    (async () => {
      let list = await loadInstitutes();
      if (list.length === 0) {
        const id = uid("inst");
        list = [{ id, name: "My School", createdAt: Date.now() }];
        const ok = await saveInstitutes(list);
        await saveBundle(id, emptyBundle());
        if (!ok) console.error("Could not create the initial institute record — storage may be unavailable.");
      }
      setInstitutes(list);
      activeInstituteRef.current = list[0].id;
      setCurrentId(list[0].id);
      setLoading(false);
    })();
  }, []);

  // Load bundle whenever institute changes
  useEffect(() => {
    if (!currentId) return;
    activeInstituteRef.current = currentId;
    (async () => {
      setLoading(true);
      setSaveState("idle");
      let b = await loadBundle(currentId);
      if (!b) b = emptyBundle();
      // Guard: if the user switched schools again before this resolved, drop this result.
      if (activeInstituteRef.current === currentId) {
        setBundle(b);
        setLoading(false);
      }
    })();
  }, [currentId]);

  const persist = useCallback(
    async (next) => {
      const targetId = currentId;
      setBundle(next);
      setSaveState("saving");
      const ok = await saveBundle(targetId, next);
      // Guard: only touch shared UI state if we're still looking at that school.
      if (activeInstituteRef.current !== targetId) return;
      if (ok) {
        pendingRetryRef.current = null;
        setSaveState("saved");
        setTimeout(() => {
          if (activeInstituteRef.current === targetId) setSaveState((s) => (s === "saved" ? "idle" : s));
        }, 1200);
      } else {
        pendingRetryRef.current = { targetId, next };
        setSaveState("error");
      }
    },
    [currentId]
  );

  const retrySave = useCallback(async () => {
    if (!pendingRetryRef.current) return;
    const { targetId, next } = pendingRetryRef.current;
    setSaveState("saving");
    const ok = await saveBundle(targetId, next);
    if (activeInstituteRef.current !== targetId) return;
    if (ok) {
      pendingRetryRef.current = null;
      setSaveState("saved");
      setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1200);
    } else {
      setSaveState("error");
    }
  }, []);

  const createInstitute = async (name) => {
    const id = uid("inst");
    const list = [...institutes, { id, name, createdAt: Date.now() }];
    setInstitutes(list);
    const ok = await saveInstitutes(list);
    if (!ok) window.alert("Couldn't save the new school to storage. Please check your connection and try again.");
    await saveBundle(id, emptyBundle());
    setCurrentId(id);
  };
  const deleteInstitute = async (id) => {
    const list = institutes.filter((i) => i.id !== id);
    setInstitutes(list);
    await saveInstitutes(list);
    await deleteBundle(id);
    if (id === currentId) setCurrentId(list[0]?.id || null);
    if (list.length === 0) {
      const newId = uid("inst");
      const fresh = [{ id: newId, name: "My School", createdAt: Date.now() }];
      setInstitutes(fresh);
      await saveInstitutes(fresh);
      await saveBundle(newId, emptyBundle());
      setCurrentId(newId);
    }
  };

  if (loading || !bundle) return <TimetableLoadingShell tab={tab} includeImport />;

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: COLORS.bg, minHeight: "100%", color: COLORS.ink }}>
      <style>{`${TIMETABLE_UI_STYLES}
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
        }
        .spin { animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        input:focus, select:focus { border-color: ${COLORS.primary} !important; box-shadow: 0 0 0 3px ${COLORS.primary}22; }
      `}</style>

      <div className="no-print" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`, padding: "14px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Grid3x3 size={18} color="#fff" />
            </div>
            <div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.1 }}>Timetable Builder</div>
              <div style={{ color: "rgba(255,255,255,0.65)", fontSize: 11.5, display: "flex", alignItems: "center", gap: 8 }}>
                {saveState === "saving" && "Saving…"}
                {saveState === "saved" && "All changes saved"}
                {saveState === "idle" && "Autosaves as you go"}
                {saveState === "error" && (
                  <span style={{ display: "flex", alignItems: "center", gap: 6, color: "#FFD9D6" }}>
                    <AlertTriangle size={12} /> Couldn't save your last change
                    <button {...tooltipProps("Retry saving the last timetable change")} onClick={retrySave} style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: 5, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", cursor: "pointer" }}>
                      Retry
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
          <InstitutePicker institutes={institutes} currentId={currentId} onSelect={setCurrentId} onCreate={createInstitute} onDelete={deleteInstitute} />
        </div>
      </div>

      <div className="no-print" style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>
          {TABS.map((t, i) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button key={t.id} {...tooltipProps(`Open ${t.label} screen`)} onClick={() => setTab(t.id)} style={{
                display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", border: "none", background: "none", cursor: "pointer",
                borderBottom: `2px solid ${active ? COLORS.primary : "transparent"}`, color: active ? COLORS.primary : COLORS.inkMuted,
                fontWeight: 600, fontSize: 13.5, whiteSpace: "nowrap",
              }}>
                <span style={{
                  width: 18, height: 18, borderRadius: 5, fontSize: 10.5, display: "flex", alignItems: "center", justifyContent: "center",
                  background: active ? COLORS.primary : COLORS.bg, color: active ? "#fff" : COLORS.inkFaint, fontWeight: 700,
                }}>{i + 1}</span>
                <Icon size={15} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px" }}>
        {tab === "setup" && <SetupTab bundle={bundle} updateBundle={setBundle} onLoadSample={null} />}
        {tab === "teachers" && <TeachersTab bundle={bundle} updateBundle={setBundle} />}
        {tab === "structure" && <StructureTab bundle={bundle} updateBundle={setBundle} />}
        {tab === "assignments" && <AssignmentsTab bundle={bundle} updateBundle={setBundle} />}
        {tab === "timetable" && <TimetableTab bundle={bundle} updateBundle={setBundle} />}
      </div>
    </div>
  );
}

// Authenticated CampusOne shell. This reuses the supplied solver and editors
// without exposing its standalone multi-institute IndexedDB ownership model.
export function IntegratedTimetableGenerator({ initialBundle, loading = false, loadError = "", accessToken, selectedBranch, structureOptions, createTeacher, updateTeacher, createSubject, createSection, createRoom, saveAssignment, deleteAssignment, saveTimetable, onNavigate }) {
  const [bundle, setBundle] = useState(() => normalizeBundle(initialBundle || emptyBundle()));
  const [tab, setTab] = useState("setup");

  useEffect(() => {
    if (initialBundle) setBundle(normalizeBundle(initialBundle));
  }, [initialBundle]);

  if (loading) return <TimetableLoadingShell tab={tab} />;
  if (loadError) return <div role="alert" style={{ padding: 20, color: COLORS.danger }}>{loadError}</div>;

  const visibleTabs = TABS.filter((item) => item.id !== "import");
  return (
    <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", background: COLORS.bg, minHeight: "100%", color: COLORS.ink }}>
      <style>{TIMETABLE_UI_STYLES}</style>
      <div className="no-print" style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryDark})`, padding: "14px 20px", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}><Grid3x3 size={20} /><div><strong>Timetable Builder</strong><div style={{ opacity: 0.72, fontSize: 12 }}>Live classes, teachers, subjects, and teaching assignments from CampusOne</div></div></div>
      </div>
      <div className="no-print" style={{ background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`, padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 4, overflowX: "auto" }}>{visibleTabs.map((item, index) => { const Icon = item.icon; const active = tab === item.id; return <button key={item.id} type="button" {...tooltipProps(`Open ${item.label} screen`)} onClick={() => setTab(item.id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "12px 14px", border: "none", background: "none", cursor: "pointer", borderBottom: `2px solid ${active ? COLORS.primary : "transparent"}`, color: active ? COLORS.primary : COLORS.inkMuted, fontWeight: 600, whiteSpace: "nowrap" }}><span>{index + 1}</span><Icon size={15} />{item.label}</button> })}</div>
      </div>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: 20 }}>
        {tab === "setup" && <SetupTab bundle={bundle} updateBundle={setBundle} onLoadSample={null} />}
        {tab === "teachers" && <TeachersTab bundle={bundle} onNavigate={onNavigate} />}
        {tab === "structure" && <StructureTab bundle={bundle} onNavigate={onNavigate} />}
        {tab === "assignments" && <AssignmentsTab bundle={bundle} onNavigate={onNavigate} />}
        {tab === "timetable" && <TimetableTab bundle={bundle} updateBundle={setBundle} saveTimetable={saveTimetable} />}
      </div>
    </div>
  );
}

export function SavedTimetableViewer({ initialBundle, loading = false, loadError = "" }) {
  const [bundle, setBundle] = useState(() => normalizeBundle(initialBundle || emptyBundle()));
  useEffect(() => { if (initialBundle) setBundle(normalizeBundle(initialBundle)); }, [initialBundle]);
  if (loading) return <BoneScreen name="timetable-saved-view" loading label="Loading saved timetable"><TimetableScreenSkeleton tab="timetable" /></BoneScreen>;
  if (loadError) return <div role="alert" style={{ padding: 20, color: COLORS.danger }}>{loadError}</div>;
  return <div style={{ fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif", color: COLORS.ink }}><style>{TIMETABLE_UI_STYLES}</style><TimetableTab bundle={bundle} updateBundle={setBundle} readOnly /></div>;
}
