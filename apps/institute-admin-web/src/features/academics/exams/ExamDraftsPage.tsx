import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, ArrowRight, Award, ChevronRight, Copy, Edit3, IdCard, Layers3, ListChecks, Plus, Search, X } from 'lucide-react'
import { AdminApiError } from '../../admin/admin.api'
import { ConfirmationDialog } from '../../../components/admin-ui'
import { createExam, duplicateExam, getExam, getExamCoverage, getExamElectiveCandidates, getExamOptions, getExamSchedule, getExamSubjects, getExamTimetable, listAllExamSections, listExams, publishExamTimetable, updateExam, updateExamElectiveCandidates, updateExamSchedule, updateExamSubjects } from './exams.api'
import { isExamSaveReceipt, type ExamCategory, type ExamChoice, type ExamCoverage, type ExamDetail, type ExamDraftInput, type ExamElectiveCandidates, type ExamOptions, type ExamPaperSchedule, type ExamRow, type ExamSaveResult, type ExamSubjectTarget, type ExamSubjects, type ExamTimetable } from './exams.types'
import { ExamLoadingSkeleton } from './ExamLoadingSkeleton'
import { AdmitCardsStage } from './AdmitCardsStage'
import './exams.css'

const blankOptions: ExamOptions = { campuses: [], academicYears: [], sections: [], terms: [], coordinators: [], categories: [], actions: { create: false, view: false, edit: false, publish: false } }
const categoryNames: Record<ExamCategory, string> = { CLASS_TEST: 'Class test', UNIT_TEST: 'Unit test', HALF_YEARLY: 'Half-yearly', PRE_BOARD: 'Pre-board', ANNUAL: 'Annual', PRACTICAL: 'Practical', OTHER: 'Other' }
const gradeWing = (grade: string) => /^(nursery|lkg|ukg)$/i.test(grade.trim()) ? 'Pre-Primary' : Number(grade.match(/\d+/)?.[0] ?? 99) <= 5 ? 'Primary' : Number(grade.match(/\d+/)?.[0] ?? 99) <= 8 ? 'Middle' : 'Secondary & Sr.'
const compareGrades = (left: string, right: string) => {
  const rank = (grade: string) => ({ Nursery: 0, LKG: 1, UKG: 2 } as Record<string, number>)[grade] ?? (Number(grade.match(/\d+/)?.[0] ?? 99) + 2)
  return rank(left) - rank(right) || left.localeCompare(right, undefined, { numeric: true })
}
const targetSectionCount = (count: number) => `${count} target section${count === 1 ? '' : 's'}`
const targetGrade = (target: string) => target.match(/^(Nursery|LKG|UKG|Class\s+\d+)/i)?.[1] ?? 'Classes'
const sameSubject = (left: { subjectName: string; subjectCode?: string | null }, right: { subjectName: string; subjectCode?: string | null }) => left.subjectCode && right.subjectCode
  ? left.subjectCode.trim().toLowerCase() === right.subjectCode.trim().toLowerCase()
  : left.subjectName.trim().toLowerCase() === right.subjectName.trim().toLowerCase()
type EditorValues = { campusId: string; academicYearId: string; termId: string; category: ExamCategory; name: string; classSectionIds: string[]; startsOn: string; endsOn: string; coordinatorId: string; instructions: string }
const emptyValues = (): EditorValues => ({ campusId: '', academicYearId: '', termId: '', category: 'CLASS_TEST', name: '', classSectionIds: [], startsOn: '', endsOn: '', coordinatorId: '', instructions: '' })
const requestId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`

function valuesFromDetail(exam: ExamDetail): EditorValues {
  return { campusId: exam.campusId, academicYearId: exam.academicYearId, termId: exam.termId ?? '', category: exam.category, name: exam.name, classSectionIds: exam.classSectionIds, startsOn: exam.startsOn ?? '', endsOn: exam.endsOn ?? '', coordinatorId: exam.coordinatorId ?? '', instructions: exam.instructions ?? '' }
}

function payloadFromValues(values: EditorValues, id = requestId()): ExamDraftInput {
  return { requestId: id, campusId: values.campusId, academicYearId: values.academicYearId, termId: values.termId || null, category: values.category, name: values.name.trim(), classSectionIds: [...new Set(values.classSectionIds)], startsOn: values.startsOn || null, endsOn: values.endsOn || null, coordinatorId: values.coordinatorId || null, instructions: values.instructions || null }
}

function apiMessage(error: unknown) {
  if (!(error instanceof AdminApiError)) return 'We could not reach the exam service. Check your connection and try again.'
  const fieldMessage = Object.values(error.fieldErrors ?? {}).flat()[0]
  if (fieldMessage) return fieldMessage
  if (error.message === 'No User matches the given query.') return 'The selected coordinator is no longer eligible for this campus. Choose an active coordinator and try again.'
  if (error.code === 'revision_conflict') return 'This draft changed after you opened it. Your entries are still here. Copy any changes you need, then reload the latest version.'
  if (error.code === 'permission_required') return 'Your exam permission changed. This action is no longer available.'
  if (error.code === 'request_key_conflict') return 'This save key was already used with different details. Start a fresh save.'
  if (error.code === 'request_target_unavailable') return 'The original saved draft is no longer available. It was not recreated.'
  return error.message || 'The exam request could not be completed. Try again.'
}

export function ExamDraftsPage({ accessToken, selectedBranch, initialAdmitCards = false }: { accessToken: string; selectedBranch: string; initialAdmitCards?: boolean }) {
  const [options, setOptions] = useState<ExamOptions>(blankOptions)
  const [optionsLoading, setOptionsLoading] = useState(true)
  const [optionsError, setOptionsError] = useState('')
  const [loadedRows, setRows] = useState<ExamRow[]>([])
  const [loadedExamsFor, setLoadedExamsFor] = useState('')
  const [listError, setListError] = useState('')
  const [campusId, setCampusId] = useState(selectedBranch === 'all' ? '' : selectedBranch)
  const [academicYearId, setAcademicYearId] = useState('')
  const [category, setCategory] = useState('')
  const [lifecycleFilter, setLifecycleFilter] = useState(initialAdmitCards ? 'published' : 'all')
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState<{ initial?: ExamDetail; source?: ExamDetail; defaults?: EditorValues } | null>(null)
  const [busy, setBusy] = useState(false)
  const [detailLoading, setDetailLoading] = useState(false)
  const savedSubjectsRef = useRef('')
  const savedScheduleRef = useRef('')
  const [subjectTarget, setSubjectTarget] = useState<ExamRow | null>(null)
  const [subjectSetup, setSubjectSetup] = useState<ExamSubjects | null>(null)
  const [subjectLoading, setSubjectLoading] = useState(false)
  const [subjectBusy, setSubjectBusy] = useState(false)
  const [subjectError, setSubjectError] = useState('')
  const [pendingDiscard, setPendingDiscard] = useState<{ message: string; action: () => void } | null>(null)
  const subjectTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [scheduleTarget, setScheduleTarget] = useState<ExamRow | null>(null)
  const [schedule, setSchedule] = useState<ExamPaperSchedule | null>(null)
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleConflict, setScheduleConflict] = useState(false)
  const scheduleTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [coverageTarget, setCoverageTarget] = useState<ExamRow | null>(null)
  const [coverage, setCoverage] = useState<ExamCoverage | null>(null)
  const [coverageSubjects, setCoverageSubjects] = useState<ExamSubjectTarget[]>([])
  const [coverageLoading, setCoverageLoading] = useState(false)
  const [coverageBusy, setCoverageBusy] = useState(false)
  const [coverageError, setCoverageError] = useState('')
  const [coverageConflict, setCoverageConflict] = useState(false)
  const [coveragePair, setCoveragePair] = useState<{ classSectionId: string; subjectId: string } | null>(null)
  const [timetableTarget, setTimetableTarget] = useState<ExamRow | null>(null)
  const [timetable, setTimetable] = useState<ExamTimetable | null>(null)
  const [timetableLoading, setTimetableLoading] = useState(false)
  const [timetableBusy, setTimetableBusy] = useState(false)
  const [timetableError, setTimetableError] = useState('')
  const [timetableConfirm, setTimetableConfirm] = useState(false)
  const timetableTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [candidateSearch, setCandidateSearch] = useState('')
  const [candidatePage, setCandidatePage] = useState(1)
  const [candidateData, setCandidateData] = useState<ExamElectiveCandidates | null>(null)
  const [candidateLoading, setCandidateLoading] = useState(false)
  const [candidateError, setCandidateError] = useState('')
  const [assignedStudentIds, setAssignedStudentIds] = useState<string[]>([])
  const [assignmentDirty, setAssignmentDirty] = useState(false)
  const assignmentDirtyRef = useRef(false)
  const assignmentKeyRef = useRef('')
  const coverageTriggerRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [workspaceExam, setWorkspaceExam] = useState<ExamRow | null>(null)
  const [admitCardsTarget, setAdmitCardsTarget] = useState<ExamRow | null>(null)
  const [notice, setNotice] = useState('')
  const [saveError, setSaveError] = useState('')
  const examsQueryKey = `${accessToken}:${options.actions.view}:${campusId}:${academicYearId}:${category}:${search}:${revision}`

  useEffect(() => {
    if (!notice) return
    const timeout = window.setTimeout(() => setNotice(''), 5000)
    return () => window.clearTimeout(timeout)
  }, [notice])

  useEffect(() => {
    const controller = new AbortController()
    getExamOptions(accessToken, { kind: 'bootstrap', signal: controller.signal }).then((data) => {
      setOptions(data)
      setOptionsError('')
      const year = data.currentAcademicYearId ?? data.academicYears.find((item) => (item as ExamChoice & { isCurrent?: boolean }).isCurrent)?.id ?? data.academicYears[0]?.id ?? ''
      setAcademicYearId((current) => current || year)
      setCampusId((current) => current || data.campuses[0]?.id || '')
    }).catch((error: unknown) => { if (!controller.signal.aborted) setOptionsError(apiMessage(error)) }).finally(() => { if (!controller.signal.aborted) setOptionsLoading(false) })
    return () => controller.abort()
  }, [accessToken, revision])

  const reload = useCallback(() => setRevision((value) => value + 1), [])
  useEffect(() => {
    if (!options.actions.view || !academicYearId) return
    const controller = new AbortController()
    const requestKey = `${accessToken}:${options.actions.view}:${campusId}:${academicYearId}:${category}:${search}:${revision}`
    listExams(accessToken, { campusId: campusId || undefined, academicYearId, category: category || undefined, search, page: 1, pageSize: 50, signal: controller.signal }).then((data) => {
      setRows(data.results); setListError('')
    }).catch((error: unknown) => { if (!controller.signal.aborted) setListError(apiMessage(error)) }).finally(() => { if (!controller.signal.aborted) setLoadedExamsFor(requestKey) })
    return () => controller.abort()
  }, [accessToken, academicYearId, campusId, category, search, options.actions.view, revision])

  const openCreate = () => { setSaveError(''); setEditor({ defaults: { ...emptyValues(), campusId, academicYearId } }) }
  const loadSubjectSetup = async (exam: ExamRow, replace = false) => {
    if (!options.actions.view || !options.actions.edit || exam.status !== 'DRAFT' || !exam.actions.edit) return
    setSubjectLoading(true); setSubjectError('')
    try {
      const data = await getExamSubjects(accessToken, exam.id)
      savedSubjectsRef.current = JSON.stringify(data.targets)
      setSubjectSetup(data)
      if (replace) setNotice('')
    } catch (error) { setSubjectError(apiMessage(error)) }
    finally { setSubjectLoading(false) }
  }
  const openSubjectSetup = (exam: ExamRow) => {
    setSubjectTarget(exam); setSubjectSetup(null); setSubjectError('')
    void loadSubjectSetup(exam)
  }
  const loadSchedule = async (exam: ExamRow) => {
    if (!options.actions.view || !options.actions.edit || !exam.actions.schedule) return
    setScheduleLoading(true); setScheduleError('')
    try {
      const data = await getExamSchedule(accessToken, exam.id)
      savedScheduleRef.current = JSON.stringify(data.papers)
      setSchedule(data)
      setScheduleConflict(false)
    } catch (error) { setScheduleError(apiMessage(error)) }
    finally { setScheduleLoading(false) }
  }
  const openSchedule = (exam: ExamRow) => {
    setScheduleTarget(exam); setSchedule(null); setScheduleError(''); setScheduleConflict(false)
    void loadSchedule(exam)
  }
  const loadCoverage = async (exam: ExamRow) => {
    if (!options.actions.view || !options.actions.edit || !exam.actions.schedule) return
    setCoverageLoading(true); setCoverageError('')
    try {
      const detail = await getExam(accessToken, exam.id)
      if (!['DRAFT', 'PUBLISHED'].includes(detail.status) || !detail.actions.schedule) {
        setCoverageError('Coverage setup is no longer available for this exam or your schedule permission changed.')
        return
      }
      const [subjectSetupData, coverageData] = await Promise.all([getExamSubjects(accessToken, exam.id), getExamCoverage(accessToken, exam.id)])
      const electiveTargets = subjectSetupData.targets.map((target) => ({
        ...target,
        subjects: target.subjects.filter((subject) => subject.isElective && target.selectedSubjectIds.includes(subject.id)),
      })).filter((target) => target.subjects.length > 0)
      setCoverageSubjects(electiveTargets)
      setCoverage(coverageData)
      setCoverageConflict(false)
      const firstTarget = electiveTargets[0]
      const firstSubject = firstTarget?.subjects[0]
      const nextPair = firstTarget && firstSubject ? { classSectionId: firstTarget.classSectionId, subjectId: firstSubject.id } : null
      setCoveragePair(nextPair)
      setCandidateLoading(Boolean(nextPair))
      setCandidateSearch(''); setCandidatePage(1); setCandidateData(null); setAssignedStudentIds([]); setAssignmentDirty(false); assignmentDirtyRef.current = false
      assignmentKeyRef.current = nextPair ? `${nextPair.classSectionId}:${nextPair.subjectId}` : ''
    } catch (error) { setCoverageError(apiMessage(error)) }
    finally { setCoverageLoading(false) }
  }
  const openCoverage = (exam: ExamRow) => {
    setCoverageTarget(exam); setCoverage(null); setCoverageSubjects([]); setCoveragePair(null); setCoverageError(''); setCoverageConflict(false)
    setCandidateData(null); setCandidateError(''); setCandidateSearch(''); setCandidatePage(1); setCandidateLoading(false); setAssignmentDirty(false); assignmentDirtyRef.current = false
    void loadCoverage(exam)
  }
  useEffect(() => {
    if (!coverageTarget || !coveragePair || !coverage) return
    const controller = new AbortController()
    const key = `${coveragePair.classSectionId}:${coveragePair.subjectId}`
    getExamElectiveCandidates(accessToken, coverageTarget.id, coveragePair.classSectionId, coveragePair.subjectId, { page: candidatePage, pageSize: 25, search: candidateSearch, signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return
      setCandidateData(data)
      if (assignmentKeyRef.current !== key || !assignmentDirtyRef.current) {
        setAssignedStudentIds(data.assignedStudentIds)
        setAssignmentDirty(false)
        assignmentDirtyRef.current = false
        assignmentKeyRef.current = key
      }
    }).catch((error: unknown) => { if (!controller.signal.aborted) setCandidateError(apiMessage(error)) }).finally(() => { if (!controller.signal.aborted) setCandidateLoading(false) })
    return () => controller.abort()
  }, [accessToken, coverageTarget, coveragePair, coverage, candidatePage, candidateSearch])
  const saveElectiveAssignments = async () => {
    if (!coverageTarget || !coverage || !coveragePair || !assignmentDirty || coverageBusy || coverageConflict || coverageTarget.timetablePublished || !coverageTarget.actions.schedule) return
    setCoverageBusy(true); setCandidateError('')
    try {
      const result = await updateExamElectiveCandidates(accessToken, coverageTarget.id, coveragePair.classSectionId, coveragePair.subjectId, { expectedRevision: coverage.revision, studentIds: assignedStudentIds })
      setAssignedStudentIds(result.assignedStudentIds)
      setAssignmentDirty(false); assignmentDirtyRef.current = false
      assignmentKeyRef.current = `${coveragePair.classSectionId}:${coveragePair.subjectId}`
      const freshCoverage = await getExamCoverage(accessToken, coverageTarget.id)
      setCoverage(freshCoverage)
      setCandidateLoading(true)
      setCandidateData((current) => current ? { ...current, revision: result.revision, assignedStudentIds: result.assignedStudentIds } : result)
      setNotice(`Elective assignments saved at revision ${result.revision}.`)
      reload()
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'revision_conflict') {
        setCoverageConflict(true)
        setCandidateError('This exam changed after coverage loaded. Your assignments are preserved. Reload coverage before saving again.')
      } else setCandidateError(apiMessage(error))
    } finally { setCoverageBusy(false) }
  }
  const saveSchedule = async () => {
    if (!scheduleTarget || !schedule || scheduleBusy || scheduleConflict || scheduleTarget.timetablePublished || !['DRAFT', 'PUBLISHED'].includes(scheduleTarget.status) || !options.actions.edit || !scheduleTarget.actions.schedule) return
    const invalid = schedule.papers.find((paper) => {
      const values = [paper.scheduledOn, paper.startTime, paper.endTime]
      return values.some(Boolean) && (!paper.scheduledOn || !paper.startTime || !paper.endTime || paper.endTime <= paper.startTime)
    })
    if (invalid) {
      setScheduleError(!invalid.scheduledOn || !invalid.startTime || !invalid.endTime
        ? 'For each scheduled paper, enter a date, start time, and end time. Leave all three blank to keep it unscheduled.'
        : 'End time must be later than start time for every scheduled paper.')
      return
    }
    setScheduleBusy(true); setScheduleError('')
    try {
      const result = await updateExamSchedule(accessToken, scheduleTarget.id, {
        expectedRevision: schedule.revision,
        papers: schedule.papers.map(({ classSectionId, subjectId, scheduledOn, startTime, endTime, roomId, invigilatorId }) => ({ classSectionId, subjectId, scheduledOn, startTime, endTime, ...(roomId !== undefined ? { roomId } : {}), ...(invigilatorId !== undefined ? { invigilatorId } : {}) })),
      })
      savedScheduleRef.current = JSON.stringify(result.papers)
      setSchedule(result)
      setNotice(`Paper schedule saved at revision ${result.revision}.`)
      setWorkspaceExam((current) => current?.id === result.examId ? { ...current, revision: result.revision } : current)
      setRows((current) => current.map((row) => row.id === result.examId ? { ...row, revision: result.revision } : row))
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'revision_conflict') {
        setScheduleConflict(true)
        setScheduleError('This exam changed after paper scheduling loaded. Your entries are preserved. Reload the latest schedule before saving again.')
      } else setScheduleError(apiMessage(error))
    } finally { setScheduleBusy(false) }
  }
  const saveSubjectSetup = async () => {
    if (!subjectTarget || !subjectSetup || subjectTarget.status !== 'DRAFT' || !options.actions.edit || !subjectTarget.actions.edit) return
    setSubjectBusy(true); setSubjectError('')
    try {
      const result = await updateExamSubjects(accessToken, subjectTarget.id, {
        expectedRevision: subjectSetup.revision,
        targets: subjectSetup.targets.map((target) => ({
          classSectionId: target.classSectionId,
          subjectIds: target.selectedSubjectIds,
          ...(target.subjects.some((subject) => target.selectedSubjectIds.includes(subject.id)) ? { paperMarks: target.subjects.filter((subject) => target.selectedSubjectIds.includes(subject.id)).map((subject) => ({ subjectId: subject.id, theoryMax: subject.theoryMax ?? '100', practicalMax: subject.practicalMax ?? null, passMarks: subject.passMarks ?? '33', durationMinutes: subject.durationMinutes ?? 180 })) } : {}),
        })),
      })
      savedSubjectsRef.current = JSON.stringify(result.targets)
      setSubjectSetup(result)
      setNotice(`Subject setup saved at revision ${result.revision}.`)
      setWorkspaceExam((current) => current?.id === result.examId ? { ...current, revision: result.revision } : current)
      setRows((current) => current.map((row) => row.id === result.examId ? { ...row, revision: result.revision } : row))
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'revision_conflict') {
        setSubjectError('This exam changed after subject setup loaded. Your selections are preserved. Reload the latest setup before saving again.')
      } else setSubjectError(apiMessage(error))
    } finally { setSubjectBusy(false) }
  }
  const openDetail = async (id: string, mode: 'view' | 'edit' | 'duplicate') => {
    setBusy(true); setDetailLoading(true); setListError(''); setSaveError('')
    try {
      const detail = await getExam(accessToken, id)
      if (mode === 'view') setEditor({ initial: detail })
      else if (mode === 'edit') {
        if (detail.status === 'DRAFT' && options.actions.view && options.actions.edit) setEditor({ initial: detail })
        else setListError('Only draft exams with your current edit permission can be changed.')
      } else setEditor({ source: detail })
    } catch (error) { setListError(apiMessage(error)) }
    finally { setBusy(false); setDetailLoading(false) }
  }
  const save = async (values: EditorValues, exam?: ExamDetail, source?: ExamDetail) => {
    setBusy(true); setNotice(''); setSaveError('')
    try {
      const input = payloadFromValues(values)
      let result: ExamSaveResult
      if (source) {
        result = await duplicateExam(accessToken, source.id, { requestId: input.requestId, campusId: input.campusId, academicYearId: input.academicYearId, classSectionIds: input.classSectionIds, name: input.name, termId: input.termId, startsOn: input.startsOn, endsOn: input.endsOn })
      } else if (exam) {
        const body: Partial<ExamDraftInput> = { ...input }
        delete body.requestId
        delete body.campusId
        delete body.academicYearId
        result = await updateExam(accessToken, exam.id, { ...body, expectedRevision: exam.revision })
      } else result = await createExam(accessToken, input)
      if (isExamSaveReceipt(result)) {
        setNotice(`Draft saved (revision ${result.savedRevision}). This account can create drafts but needs view permission to reopen them.`)
      } else setNotice(`Draft saved at revision ${result.revision}.`)
      setEditor(null); reload()
    } catch (error) {
      setSaveError(apiMessage(error))
    } finally { setBusy(false) }
  }

  const loadTimetable = async (exam: ExamRow) => {
    if (!options.actions.view) return
    setTimetableLoading(true); setTimetableError('')
    try {
      const data = await getExamTimetable(accessToken, exam.id)
      setTimetable(data)
      setTimetableConfirm(false)
      if (data.publication) reload()
    } catch (error) { setTimetableError(apiMessage(error)) }
    finally { setTimetableLoading(false) }
  }
  const openTimetable = (exam: ExamRow) => {
    setTimetableTarget(exam); setTimetable(null); setTimetableError(''); setTimetableConfirm(false)
    void loadTimetable(exam)
  }
  const publishTimetable = async () => {
    if (!timetableTarget || !timetable || !timetable.ready || !timetable.actions.publish || timetable.publication || timetableBusy) return
    setTimetableBusy(true); setTimetableError('')
    try {
      const result = await publishExamTimetable(accessToken, timetableTarget.id, timetable.revision)
      setTimetable(result); setTimetableConfirm(false)
      setNotice(`Timetable published at revision ${result.publication?.revision ?? result.revision}.`)
      reload()
    } catch (error) {
      if (error instanceof AdminApiError && error.code === 'revision_conflict') {
        setTimetableError('This exam changed after validation. Refresh the latest checks before publishing.')
      } else setTimetableError(apiMessage(error))
    } finally { setTimetableBusy(false) }
  }

  const canCreate = options.actions.create
  const canView = options.actions.view
  const rows = canView && academicYearId ? loadedRows : []
  const draftRows = rows.filter((row) => row.status === 'DRAFT')
  const publishedTimetables = rows.filter((row) => row.timetablePublished)
  const directoryRows = rows.filter((row) => lifecycleFilter === 'all' || (lifecycleFilter === 'published' ? row.timetablePublished : !row.timetablePublished))
  const listLoading = canView && Boolean(academicYearId) && loadedExamsFor !== examsQueryKey
  const activeExam = workspaceExam ? loadedRows.find((row) => row.id === workspaceExam.id) ?? workspaceExam : null
  const currentStage = subjectTarget ? 'subjects' : scheduleTarget ? 'schedule' : coverageTarget ? 'coverage' : timetableTarget ? 'publish' : admitCardsTarget ? 'admit-cards' : ''
  const changeStage = (exam: ExamRow, stage: 'subjects' | 'schedule' | 'coverage' | 'publish') => {
    if (currentStage === stage || subjectBusy || scheduleBusy || coverageBusy || timetableBusy) return
    const dirty = (subjectTarget && subjectSetup && JSON.stringify(subjectSetup.targets) !== savedSubjectsRef.current) || (scheduleTarget && schedule && JSON.stringify(schedule.papers) !== savedScheduleRef.current) || (coverageTarget && assignmentDirty)
    const change = () => {
      setPendingDiscard(null)
      setSubjectTarget(null); setScheduleTarget(null); setCoverageTarget(null); setTimetableTarget(null); setAdmitCardsTarget(null)
      if (stage === 'subjects') openSubjectSetup(exam)
      else if (stage === 'schedule') openSchedule(exam)
      else if (stage === 'coverage') openCoverage(exam)
      else openTimetable(exam)
    }
    if (dirty) setPendingDiscard({ message: 'Your unsaved changes will be lost when you switch exam stages.', action: change })
    else change()
  }
  const closeCoverage = () => {
    if (coverageBusy) return
    const close = () => { setPendingDiscard(null); coverageTriggerRefs.current[coverageTarget?.id ?? '']?.focus(); setCoverageTarget(null); setCoverage(null); setCoveragePair(null); setCandidateData(null); setCoverageError(''); setAssignmentDirty(false); assignmentDirtyRef.current = false }
    if (assignmentDirty) setPendingDiscard({ message: 'Your unsaved elective assignments will be lost.', action: close })
    else close()
  }
  const currentYearName = options.academicYears.find((item) => item.id === academicYearId)?.name ?? 'selected year'
  return <main className="exam-drafts-page exam-workspace">
    {!activeExam && <header className="exam-directory-heading"><div><div className="exam-breadcrumb"><span>Academics</span><ChevronRight aria-hidden="true" /><span>{initialAdmitCards ? 'Admit Cards' : 'Assessment & Results'}</span></div><h1>{initialAdmitCards ? 'Admit Cards' : 'Assessment & Results'}</h1><p>{initialAdmitCards ? 'Choose a published exam to review candidates and print admit cards.' : 'Plan exams, map subjects, schedule class-wise papers, and validate student coverage before publishing the timetable.'}</p></div>{canCreate && !initialAdmitCards && <button className="exam-primary" type="button" onClick={openCreate}><Plus aria-hidden="true" /> New Exam</button>}</header>}
    {notice && <div className="exam-notice" role="status">{notice}</div>}
    {saveError && !editor && <div className="exam-error" role="alert">{saveError}</div>}
    {optionsError && <div className="exam-error" role="alert">{optionsError}<button type="button" onClick={reload}>Retry</button></div>}
    {optionsLoading ? <section className="exam-card exam-access-state" aria-busy="true"><ExamLoadingSkeleton label="Loading your exam access" kind="options" /></section> : !canView && !canCreate ? <section className="exam-card exam-access-state"><h2>No exam access</h2><p>Your role does not currently have an exam view or create permission. Ask an institute administrator to configure your access.</p></section> : null}
    {!activeExam && !optionsLoading && (canView || canCreate) && <>
      {canView && <section className="exam-summary-grid" aria-label="Exam summary">
        <article className="exam-summary-cycles"><span>Exam Cycles ({currentYearName})</span><strong>{listLoading ? '—' : rows.length}</strong><small>{listLoading ? 'Loading exam cycles' : `${draftRows.length} draft${draftRows.length === 1 ? '' : 's'} · ${publishedTimetables.length} timetable${publishedTimetables.length === 1 ? '' : 's'} published`}</small><Layers3 aria-hidden="true" /></article>
        <article className="exam-summary-progress"><span>Draft Setup</span><strong>{listLoading ? '—' : draftRows.length}<small> / {listLoading ? '—' : rows.length}</small></strong><small>Exams still in the setup lifecycle</small><ListChecks aria-hidden="true" /></article>
        <article className="exam-summary-admit"><span>Admit Card Eligibility</span><strong>Placeholder</strong><small>Generation is not available yet</small><IdCard aria-hidden="true" /></article>
        <article className="exam-summary-marks"><span>Marks &amp; Marksheet</span><strong>Placeholder</strong><small>Marks entry is not available yet</small><Award aria-hidden="true" /></article>
      </section>}
      <section className="exam-filters exam-card exam-filter-panel" aria-label="Exam filters">
        {canView && <nav className="exam-directory-categories" aria-label="Filter by exam category"><button type="button" aria-pressed={!category} onClick={() => setCategory('')}>All Exams ({rows.length})</button>{(['HALF_YEARLY', 'ANNUAL', 'UNIT_TEST'] as const).map((value) => options.categories.find((item) => item.value === value)).filter((item) => item !== undefined).map((item) => <button type="button" aria-pressed={category === item.value} key={item.value} onClick={() => setCategory(category === item.value ? '' : item.value)}>{item.value === 'HALF_YEARLY' ? 'Half-Yearly / Term 1' : item.value === 'ANNUAL' ? 'Annual / Term 2' : 'Unit Tests'}</button>)}</nav>}
        {canView && <label className="exam-search"><Search aria-hidden="true" /><span className="sr-only">Search exams</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search exam name or coordinator…" /></label>}
        {canView && <label className="exam-status-filter"><span className="sr-only">Lifecycle state</span><select aria-label="Lifecycle state" value={lifecycleFilter} onChange={(event) => setLifecycleFilter(event.target.value)}><option value="all">All Lifecycle States</option><option value="draft">Draft setup</option><option value="published">Published</option></select></label>}
      </section>
      {canView ? <section className="exam-card exam-exam-list" aria-label={`Exams for ${currentYearName}`}>
        <h2 className="sr-only">Exams</h2>
        <>
        {listError && <div className="exam-error" role="alert">{listError}<button type="button" onClick={reload}>Retry</button></div>}
        {listLoading && <ExamLoadingSkeleton label="Loading exams" kind="list" />}
        {!listLoading && directoryRows.length === 0 && <div className="exam-empty"><h3>No exams found</h3><p>{search || category || lifecycleFilter !== 'all' ? 'Try another search or clear your filters.' : 'Create a draft for the classes you are authorized to manage.'}</p>{canCreate && <button className="exam-primary" type="button" onClick={openCreate}><Plus aria-hidden="true" /> New exam</button>}</div>}
        {!listLoading && directoryRows.length > 0 && <section className="exam-record-list" aria-label="Exam records">{directoryRows.map((row) => {
          const status = row.timetablePublished ? 'Timetable published' : row.status === 'DRAFT' ? 'Draft' : 'Setup notice published'
          return <article className="exam-record" key={row.id}>
            <div className="exam-record-main">
              <div className="exam-record-title"><span className="exam-record-term">{categoryNames[row.category]}</span><h3>{row.name}</h3><span className={`exam-record-status ${row.timetablePublished ? 'is-published' : row.status === 'DRAFT' ? 'is-draft' : 'is-notice'}`}>{status}</span></div>
              <p className="exam-record-context"><span>Window: <strong>{row.startsOn && row.endsOn ? `${row.startsOn} – ${row.endsOn}` : 'Dates not set'}</strong></span><span>Scope: <strong>{targetSectionCount(row.targetSummary.length)}</strong></span>{row.timetablePublished && <span>Timetable: <strong>Published</strong></span>}</p>
              <div className="exam-record-stages" aria-label="Exam stages"><span>1. Subjects</span><span>2. Schedule</span><span>3. Coverage</span><span>4. Publish</span><span className={row.timetablePublished ? '' : 'is-placeholder'}>5. {row.timetablePublished ? 'Generate admit cards' : 'Admit cards · Publish timetable first'}</span><span className="is-placeholder">6. Marks entry · Placeholder</span></div>
            </div>
            <div className="exam-record-actions" role="group" aria-label={`${row.name} actions`}>
              <button type="button" aria-label={initialAdmitCards && row.timetablePublished ? `Generate admit cards for ${row.name}` : 'Manage exam'} className="exam-primary" onClick={() => { setWorkspaceExam(row); if (initialAdmitCards && row.timetablePublished) setAdmitCardsTarget(row); else if (row.status === 'DRAFT' && row.actions.edit && options.actions.edit) openSubjectSetup(row); else if (row.timetablePublished) openTimetable(row) }}> {initialAdmitCards && row.timetablePublished ? 'Generate admit cards' : row.timetablePublished ? 'View timetable' : 'Configure & Publish Exam'} <ArrowRight aria-hidden="true" /></button>
              {row.actions.duplicate && <details className="exam-row-more"><summary aria-label={`More actions for ${row.name}`}>More</summary><div><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); void openDetail(row.id, 'duplicate') }}><Copy aria-hidden="true" /> Duplicate</button></div></details>}
            </div>
          </article>
        })}</section>}
        </>
      </section> : <section className="exam-card exam-create-only"><span className="exam-eyebrow">Create access</span><h2>Create-only access</h2><p>You can create a draft in your authorized scope. A saved receipt will be shown without exposing draft details. Ask an administrator for view access if you need to reopen it.</p><button className="exam-primary" type="button" onClick={openCreate}><Plus aria-hidden="true" /> Create exam draft</button></section>}
    </>}
    {activeExam && listError && <div className="exam-error" role="alert">{listError}<button type="button" onClick={reload}>Retry</button></div>}
    {activeExam && <section className="exam-detail-workspace" aria-label={`${activeExam.name} workspace`}>
      <div className="exam-lifecycle-card">
        <div className="exam-lifecycle-head">
          <div><div className="exam-breadcrumb"><button className="exam-back" type="button" onClick={() => { const dirty = (subjectTarget && subjectSetup && JSON.stringify(subjectSetup.targets) !== savedSubjectsRef.current) || (scheduleTarget && schedule && JSON.stringify(schedule.papers) !== savedScheduleRef.current) || (coverageTarget && assignmentDirty); const leave = () => { setPendingDiscard(null); setSubjectTarget(null); setScheduleTarget(null); setCoverageTarget(null); setTimetableTarget(null); setAdmitCardsTarget(null); setWorkspaceExam(null) }; if (dirty) setPendingDiscard({ message: 'Your unsaved changes will be lost when you return to all exams.', action: leave }); else leave() }}><ArrowLeft aria-hidden="true" /> All exams</button><span> / </span> Exam workspace · {currentYearName} <span> / </span> Revision {activeExam.revision}</div>
            <div className="exam-record-title"><h1>{activeExam.name}</h1><span className={`exam-record-status ${activeExam.timetablePublished ? 'is-published' : activeExam.status === 'DRAFT' ? 'is-draft' : 'is-notice'}`}>{activeExam.timetablePublished ? 'Published' : activeExam.status === 'DRAFT' ? 'Draft · Pre-publish setup' : 'Setup notice published'}</span><span className="exam-lifecycle-category">{categoryNames[activeExam.category]}</span></div>
            <p>Exam window: <strong>{activeExam.startsOn && activeExam.endsOn ? `${activeExam.startsOn} – ${activeExam.endsOn}` : 'Not set'}</strong> <span> · </span> Target scope: <strong>{activeExam.targetSummary.length} sections</strong></p>
          </div><div className="exam-lifecycle-actions">{activeExam.status === 'DRAFT' && activeExam.actions.edit && <button type="button" aria-label="Edit" className="exam-secondary" onClick={() => void openDetail(activeExam.id, 'edit')}><Edit3 aria-hidden="true" /> Edit setup</button>}{activeExam.actions.duplicate && <button type="button" className="exam-secondary" onClick={() => void openDetail(activeExam.id, 'duplicate')}><Copy aria-hidden="true" /> Duplicate</button>}<button type="button" className="exam-primary" onClick={() => activeExam.timetablePublished ? openTimetable(activeExam) : changeStage(activeExam, 'publish')}>{activeExam.timetablePublished ? 'View timetable' : 'Validate & publish exam'}</button></div>
        </div>
        <div className="exam-lifecycle-scope"><strong>{targetSectionCount(activeExam.targetSummary.length)}:</strong><div className="exam-target-wings">{(['Pre-Primary', 'Primary', 'Middle', 'Secondary & Sr.'] as const).map((wing) => {
          const grades = [...new Set(activeExam.targetSummary.map(targetGrade).filter((grade) => grade !== 'Classes' && gradeWing(grade) === wing))].sort(compareGrades)
          if (!grades.length) return null
          return <span key={wing} className={`exam-target-wing is-${wing === 'Pre-Primary' ? 'preprimary' : wing === 'Secondary & Sr.' ? 'senior' : wing.toLowerCase()}`}><i aria-hidden="true" />{wing}: <strong>{grades.join(', ')}</strong></span>
        })}</div>{activeExam.actions.edit && <button type="button" className="exam-scope-edit" onClick={() => void openDetail(activeExam.id, 'edit')}>Modify class scope <ArrowRight aria-hidden="true" /></button>}</div>
        <nav className="exam-lifecycle-nav" aria-label="Exam lifecycle">
          <button ref={(button) => { subjectTriggerRefs.current[activeExam.id] = button }} type="button" aria-label="Set subjects" aria-current={currentStage === 'subjects' ? 'step' : undefined} className={currentStage === 'subjects' ? 'is-active' : ''} disabled={!options.actions.edit || activeExam.status !== 'DRAFT' || !activeExam.actions.edit} onClick={() => changeStage(activeExam, 'subjects')}><strong>1. SUBJECTS</strong><span>Set subjects</span><small>Choose mapped papers per class</small></button>
          <button ref={(button) => { scheduleTriggerRefs.current[activeExam.id] = button }} type="button" aria-label="Schedule papers" aria-current={currentStage === 'schedule' ? 'step' : undefined} className={currentStage === 'schedule' ? 'is-active' : ''} disabled={!options.actions.edit || !activeExam.actions.schedule} onClick={() => changeStage(activeExam, 'schedule')}><strong>2. SCHEDULE</strong><span>Schedule papers</span><small>Set dates and times class by class</small></button>
          <button ref={(button) => { coverageTriggerRefs.current[activeExam.id] = button }} type="button" aria-label="Review coverage" aria-current={currentStage === 'coverage' ? 'step' : undefined} className={currentStage === 'coverage' ? 'is-active' : ''} disabled={!options.actions.edit || !activeExam.actions.schedule} onClick={() => changeStage(activeExam, 'coverage')}><strong>3. COVERAGE</strong><span>Student coverage</span><small>Review sections and electives</small></button>
          <button ref={(button) => { timetableTriggerRefs.current[activeExam.id] = button }} type="button" aria-label="Review and publish" aria-current={currentStage === 'publish' ? 'step' : undefined} className={currentStage === 'publish' ? 'is-active' : ''} onClick={() => changeStage(activeExam, 'publish')}><strong>4. PUBLISH</strong><span>Validate & publish</span><small>Review and release timetable</small></button>
          <button type="button" aria-label="Generate admit cards" aria-current={currentStage === 'admit-cards' ? 'step' : undefined} className={currentStage === 'admit-cards' ? 'is-active' : ''} disabled={!activeExam.timetablePublished} onClick={() => { setSubjectTarget(null); setScheduleTarget(null); setCoverageTarget(null); setTimetableTarget(null); setAdmitCardsTarget(activeExam) }}><strong>5. ADMIT CARDS</strong><span>Generate admit cards</span><small>{activeExam.timetablePublished ? 'Review candidates and print cards' : 'Publish timetable to continue'}</small></button><div className="exam-lifecycle-locked"><strong>POST-EXAM</strong><span>6. Marks & marksheets</span><small>Coming later</small></div>
        </nav>
      </div>
      {!currentStage && <div className="exam-card exam-stage-empty"><h2>Exam workspace</h2><p>Choose an available stage above to continue.</p></div>}
      {currentStage === 'admit-cards' && admitCardsTarget && <AdmitCardsStage accessToken={accessToken} examId={admitCardsTarget.id} examName={admitCardsTarget.name} onBack={() => setAdmitCardsTarget(null)} />}
    </section>}
    {detailLoading && !editor && <div className="exam-modal-backdrop exam-open-loading-backdrop"><section className="exam-editor exam-open-loading-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-open-loading-title" aria-busy="true"><header className="exam-dialog-header"><div className="exam-dialog-titleblock"><span className="exam-eyebrow">Exam details</span><h2 id="exam-open-loading-title">Opening exam</h2><p>Loading the latest exam details…</p></div></header><ExamLoadingSkeleton label="Loading exam details" kind="detail" /></section></div>}
    {timetableTarget && <ExamTimetableDialog exam={timetableTarget} timetable={timetable} loading={timetableLoading} busy={timetableBusy} error={timetableError} confirm={timetableConfirm} onClose={() => { if (!timetableBusy) { timetableTriggerRefs.current[timetableTarget.id]?.focus(); setTimetableTarget(null); setTimetable(null); setTimetableError(''); setTimetableConfirm(false) } }} onReload={() => void loadTimetable(timetableTarget)} onConfirm={() => setTimetableConfirm(true)} onCancelConfirm={() => setTimetableConfirm(false)} onPublish={() => void publishTimetable()} onFix={(step) => { setTimetableTarget(null); if (step === 'subjects') openSubjectSetup(timetableTarget); else if (step === 'coverage') openCoverage(timetableTarget); else openSchedule(timetableTarget) }} />}
    <ConfirmationDialog open={Boolean(pendingDiscard)} title="Discard unsaved changes?" consequence={pendingDiscard?.message ?? ''} confirmLabel="Discard changes" onConfirm={() => pendingDiscard?.action()} onCancel={() => setPendingDiscard(null)} />
    {subjectTarget && <ExamSubjectSetupDialog exam={subjectTarget} setup={subjectSetup} loading={subjectLoading} busy={subjectBusy} error={subjectError} onClose={() => { if (!subjectBusy) { subjectTriggerRefs.current[subjectTarget.id]?.focus(); setSubjectTarget(null); setSubjectSetup(null); setSubjectError('') } }} onNext={() => changeStage(activeExam ?? subjectTarget, 'schedule')} onReload={() => void loadSubjectSetup(subjectTarget, true)} onSave={() => void saveSubjectSetup()} onToggle={(sectionId, subjectId, selected) => setSubjectSetup((current) => current ? ({ ...current, targets: current.targets.map((target) => target.classSectionId !== sectionId ? target : ({ ...target, selectedSubjectIds: selected ? [...new Set([...target.selectedSubjectIds, subjectId])] : target.selectedSubjectIds.filter((id) => id !== subjectId) })) }) : current)} onMarksChange={(sectionId, subjectId, field, value) => setSubjectSetup((current) => current ? ({ ...current, targets: current.targets.map((target) => target.classSectionId !== sectionId ? target : ({ ...target, subjects: target.subjects.map((subject) => subject.id === subjectId ? { ...subject, [field]: field === 'durationMinutes' ? value === null ? null : Number(value) : value } : subject) })) }) : current)} onToggleAll={(sectionId, subjectIds, selected) => setSubjectSetup((current) => current ? ({ ...current, targets: current.targets.map((target) => target.classSectionId !== sectionId ? target : ({ ...target, selectedSubjectIds: selected ? [...new Set([...target.selectedSubjectIds, ...subjectIds])] : [] })) }) : current)} onToggleAllTargets={(selected) => setSubjectSetup((current) => current ? ({ ...current, targets: current.targets.map((target) => ({ ...target, selectedSubjectIds: selected ? [...new Set([...target.selectedSubjectIds, ...target.subjects.map((subject) => subject.id)])] : [] })) }) : current)} onCopyWing={(source) => setSubjectSetup((current) => current ? ({ ...current, targets: current.targets.map((target) => {
      if (target.classSectionId === source.classSectionId || gradeWing(target.gradeName) !== gradeWing(source.gradeName)) return target
      const selected = source.subjects.filter((subject) => source.selectedSubjectIds.includes(subject.id))
      const selectedSubjectIds = target.subjects.filter((subject) => selected.some((candidate) => candidate.code && subject.code ? candidate.code.trim().toLowerCase() === subject.code.trim().toLowerCase() : candidate.name.trim().toLowerCase() === subject.name.trim().toLowerCase())).map((subject) => subject.id)
      return { ...target, selectedSubjectIds }
    }) }) : current)} />}
    {scheduleTarget && <ExamPaperScheduleDialog exam={scheduleTarget} schedule={schedule} loading={scheduleLoading} busy={scheduleBusy} error={scheduleError} conflict={scheduleConflict} published={Boolean(scheduleTarget.timetablePublished)} onNext={() => changeStage(activeExam ?? scheduleTarget, 'coverage')} onClose={() => { if (!scheduleBusy) { scheduleTriggerRefs.current[scheduleTarget.id]?.focus(); setScheduleTarget(null); setSchedule(null); setScheduleError(''); setScheduleConflict(false) } }} onReload={() => void loadSchedule(scheduleTarget)} onSave={() => void saveSchedule()} onChange={(index, key, value) => { setScheduleError(''); setSchedule((current) => current ? ({ ...current, papers: current.papers.map((paper, itemIndex) => itemIndex === index ? { ...paper, [key]: value } : paper) }) : current) }} />}
    {coverageTarget && <ExamCoverageDialog exam={coverageTarget} coverage={coverage} electiveTargets={coverageSubjects} loading={coverageLoading} busy={coverageBusy} error={coverageError} conflict={coverageConflict} published={Boolean(coverageTarget.timetablePublished)} pair={coveragePair} onClose={closeCoverage} onNext={() => changeStage(activeExam ?? coverageTarget, 'publish')} onReload={() => void loadCoverage(coverageTarget)} onSelectPaper={(classSectionId, subjectId) => { assignmentDirtyRef.current = false; setAssignmentDirty(false); setCoveragePair({ classSectionId, subjectId }); setCandidateSearch(''); setCandidatePage(1); setCandidateData(null); setCandidateLoading(true); setCandidateError('') }} candidateSearch={candidateSearch} onSearch={(value) => { setCandidateSearch(value); setCandidatePage(1); setCandidateLoading(true); setCandidateError('') }} candidatePage={candidatePage} onPage={(page) => { setCandidatePage(page); setCandidateLoading(true); setCandidateError('') }} candidates={candidateData} candidateLoading={candidateLoading} candidateError={candidateError} assignedStudentIds={assignedStudentIds} assignmentDirty={assignmentDirty} onToggleStudent={(studentId, selected) => { assignmentDirtyRef.current = true; setAssignmentDirty(true); setAssignedStudentIds((current) => selected ? [...new Set([...current, studentId])] : current.filter((id) => id !== studentId)) }} onSaveAssignments={() => void saveElectiveAssignments()} />}
    {editor && <ExamEditor key={`${editor.initial?.id ?? 'new'}:${editor.source?.id ?? ''}`} accessToken={accessToken} options={options} initial={editor.initial} source={editor.source} defaults={editor.defaults} busy={busy} saveError={saveError} onClose={() => { setEditor(null); setSaveError('') }} onSave={(values) => void save(values, editor.initial?.actions?.edit ? editor.initial : undefined, editor.source)} />}
  </main>
}

function ExamClassSwitcher({ grades, activeGrade, onSelect, ariaLabel }: { grades: string[]; activeGrade: string; onSelect: (grade: string) => void; ariaLabel: string }) {
  const wings = ['All Wings', 'Pre-Primary', 'Primary', 'Middle', 'Secondary & Sr.']
  const [activeWing, setActiveWing] = useState('All Wings')
  const wingGrades = activeWing === 'All Wings' ? grades : grades.filter((grade) => gradeWing(grade) === activeWing)
  const currentIndex = wingGrades.indexOf(activeGrade)
  return <section className="exam-class-switcher-panel" aria-label={ariaLabel}>
    <nav className="exam-wing-switcher" aria-label="Filter classes by wing"><strong>SWITCH CLASS:</strong>{wings.map((wing) => <button type="button" key={wing} className={activeWing === wing ? 'is-active' : ''} onClick={() => { setActiveWing(wing); if (wing !== 'All Wings') { const nextGrades = grades.filter((grade) => gradeWing(grade) === wing); if (!nextGrades.includes(activeGrade)) onSelect(nextGrades[0] ?? '') } }}>{wing}{wing === 'Pre-Primary' ? ' (Nur–UKG)' : wing === 'Primary' ? ' (Class 1–5)' : wing === 'Middle' ? ' (Class 6–8)' : wing === 'Secondary & Sr.' ? ' (Class 9–12)' : ` (${grades.length})`}</button>)}</nav>
    <div className="exam-class-switcher-jump"><button className="exam-secondary" type="button" disabled={currentIndex <= 0} onClick={() => onSelect(wingGrades[currentIndex - 1] ?? '')}>‹ Prev Class</button><label>Jump to class<select aria-label={`Jump to ${ariaLabel.toLowerCase()}`} value={activeGrade} onChange={(event) => onSelect(event.target.value)}><option value="">All classes</option>{wingGrades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}</select></label><button className="exam-secondary" type="button" disabled={currentIndex < 0 || currentIndex >= wingGrades.length - 1} onClick={() => onSelect(wingGrades[currentIndex + 1] ?? '')}>Next Class ›</button></div>
    <nav className="exam-class-switcher" aria-label={ariaLabel}><button type="button" className={!activeGrade ? 'is-active' : ''} onClick={() => onSelect('')}>All classes</button>{wingGrades.map((grade) => <button type="button" key={grade} className={activeGrade === grade ? 'is-active' : ''} onClick={() => onSelect(grade)}>{grade}</button>)}</nav>
  </section>
}

function ExamSubjectSetupDialog({ exam, setup, loading, busy, error, onClose, onNext, onReload, onSave, onToggle, onMarksChange, onToggleAll, onToggleAllTargets, onCopyWing }: { exam: ExamRow; setup: ExamSubjects | null; loading: boolean; busy: boolean; error: string; onClose: () => void; onNext: () => void; onReload: () => void; onSave: () => void; onToggle: (sectionId: string, subjectId: string, selected: boolean) => void; onMarksChange: (sectionId: string, subjectId: string, field: 'theoryMax' | 'practicalMax' | 'passMarks' | 'durationMinutes', value: string | null) => void; onToggleAll: (sectionId: string, subjectIds: string[], selected: boolean) => void; onToggleAllTargets: (selected: boolean) => void; onCopyWing: (source: ExamSubjectTarget) => void }) {
  const [classSearch, setClassSearch] = useState('')
  const [selectedGrade, setSelectedGrade] = useState<string | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  const [classDefaults, setClassDefaults] = useState<Record<string, { theoryMax: string; practicalMax: string; passMarks: string; durationMinutes: string }>>({})
  const visibleGrade = selectedGrade === null ? setup?.targets[0]?.gradeName ?? '' : selectedGrade
  const baseline = useRef<{ revision: number; targets: string } | null>(null)
  useEffect(() => { if (setup && baseline.current?.revision !== setup.revision) baseline.current = { revision: setup.revision, targets: JSON.stringify(setup.targets) } }, [setup])
  const closeSubjects = useCallback(() => {
    if (setup && baseline.current && baseline.current.targets !== JSON.stringify(setup.targets)) { setDiscardOpen(true); return }
    onClose()
  }, [setup, onClose])
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) closeSubjects() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, closeSubjects])
  return <div className="exam-modal-backdrop exam-subject-backdrop"><section className="exam-editor exam-subject-dialog" role="region" aria-labelledby="exam-subject-title" aria-busy={loading || busy}>
    <header className="exam-dialog-header"><div className="exam-dialog-titleblock"><span className="exam-eyebrow">Paper setup</span><h2 id="exam-subject-title">Subjects · {exam.name}</h2><p>Choose the mapped subjects included for each target section. One paper is created per subject.</p><div className="exam-dialog-context"><span>{categoryNames[exam.category]}</span><span title={exam.targetSummary.join(', ')}>{targetSectionCount(exam.targetSummary.length)}</span></div></div><button autoFocus className="exam-secondary exam-icon-close" type="button" aria-label="Close subjects" disabled={busy} onClick={closeSubjects}><X aria-hidden="true" /></button></header>
    {error && <div className="exam-error" role="alert">{error}{(!setup || error.includes('preserved')) && <button type="button" className="exam-secondary" disabled={loading || busy} onClick={onReload}>{setup ? 'Reload latest setup' : 'Try again'}</button>}</div>}
    {loading && <ExamLoadingSkeleton label="Loading mapped subjects" kind="subjects" />}
    {!loading && setup && <>
      <p className="exam-subject-revision">Revision {setup.revision}</p>
      <div className="exam-subject-global-bulk" role="group" aria-label="Subject selection for all classes">
        <span>{setup.targets.reduce((count, target) => count + target.subjects.filter((subject) => target.selectedSubjectIds.includes(subject.id)).length, 0)} of {setup.targets.reduce((count, target) => count + target.subjects.length, 0)} mapped subjects selected across {setup.targets.length} classes</span>
        <button className="exam-secondary" type="button" disabled={busy || !setup.targets.some((target) => target.subjects.length > 0) || setup.targets.every((target) => target.subjects.every((subject) => target.selectedSubjectIds.includes(subject.id)))} onClick={() => onToggleAllTargets(true)}>Select all subjects in all classes</button>
        <button className="exam-secondary" type="button" disabled={busy || !setup.targets.some((target) => target.selectedSubjectIds.length > 0)} onClick={() => onToggleAllTargets(false)}>Deselect all subjects</button>
      </div>
      <div className="exam-subject-list-heading"><div><h3>Subjects by class</h3><p>Selections are saved together for all classes.</p></div><label className="exam-subject-search"><Search aria-hidden="true" /><span className="sr-only">Search classes</span><input type="search" value={classSearch} onChange={(event) => { setSelectedGrade(''); setClassSearch(event.target.value) }} placeholder="Search classes" /></label></div>
      <ExamClassSwitcher grades={[...new Set(setup.targets.map((target) => target.gradeName))].sort(compareGrades)} activeGrade={visibleGrade} onSelect={setSelectedGrade} ariaLabel="Switch subject class" />
      {setup.targets.length === 0 && <p className="exam-subject-empty">No classes are available for this exam.</p>}
      {setup.targets.length > 0 && !setup.targets.some((target) => `${target.gradeName} ${target.sectionName}`.toLowerCase().includes(classSearch.trim().toLowerCase())) && <p className="exam-subject-empty">No classes match your search. Try a different class name.</p>}
      <div className="exam-dialog-body exam-subject-targets">{setup.targets.map((target, targetIndex) => ({ target, targetIndex })).filter(({ target }) => (!visibleGrade || target.gradeName === visibleGrade) && `${target.gradeName} ${target.sectionName}`.toLowerCase().includes(classSearch.trim().toLowerCase())).map(({ target, targetIndex }) => <fieldset key={target.classSectionId}>
        <legend>{target.gradeName} {target.sectionName}</legend>
          <div className="exam-class-mark-defaults" role="group" aria-label={`Default marks for all subjects in ${target.gradeName} ${target.sectionName}`}>
          <strong>Class-wide marks defaults</strong>
          {(['theoryMax', 'practicalMax', 'passMarks', 'durationMinutes'] as const).map((field) => <label key={field}>{field === 'theoryMax' ? 'Theory max' : field === 'practicalMax' ? 'Practical / IA max' : field === 'passMarks' ? 'Pass marks' : 'Duration (minutes)'}<input aria-label={`${field === 'theoryMax' ? 'Theory max' : field === 'practicalMax' ? 'Practical / IA max' : field === 'passMarks' ? 'Pass marks' : 'Duration'} default for ${target.gradeName} ${target.sectionName}`} type="number" min={field === 'durationMinutes' ? 1 : 0} max={field === 'durationMinutes' ? 1440 : 9999.99} step={field === 'durationMinutes' ? 1 : 0.01} value={classDefaults[target.classSectionId]?.[field] ?? (field === 'theoryMax' ? '100' : field === 'passMarks' ? '33' : field === 'durationMinutes' ? '180' : '')} onChange={(event) => setClassDefaults((current) => { const defaults = current[target.classSectionId] ?? { theoryMax: '100', practicalMax: '', passMarks: '33', durationMinutes: '180' }; return { ...current, [target.classSectionId]: { ...defaults, [field]: event.target.value } } })} /></label>)}
          <button className="exam-secondary" type="button" disabled={busy || !target.subjects.length} onClick={() => { onToggleAll(target.classSectionId, target.subjects.map((subject) => subject.id), true); target.subjects.forEach((subject) => (['theoryMax', 'practicalMax', 'passMarks', 'durationMinutes'] as const).forEach((field) => onMarksChange(target.classSectionId, subject.id, field, classDefaults[target.classSectionId]?.[field] || (field === 'theoryMax' ? '100' : field === 'passMarks' ? '33' : field === 'durationMinutes' ? '180' : null)))) }}>Select all subjects and apply defaults</button>
        </div>
        <div className="exam-subject-bulk" role="group" aria-label={`Subject selection for ${target.gradeName} ${target.sectionName}`}>
          <span>{target.subjects.filter((subject) => target.selectedSubjectIds.includes(subject.id)).length} of {target.subjects.length} subjects selected</span>
          <button className="exam-secondary" type="button" disabled={busy} onClick={() => onCopyWing(target)}>Copy subject selection to {gradeWing(target.gradeName)} wing</button>
          <button className="exam-secondary" type="button" disabled={busy || target.subjects.length === 0 || target.subjects.every((subject) => target.selectedSubjectIds.includes(subject.id))} onClick={() => onToggleAll(target.classSectionId, target.subjects.map((subject) => subject.id), true)}>Select all subjects</button>
          <button className="exam-secondary" type="button" disabled={busy || target.selectedSubjectIds.length === 0} onClick={() => onToggleAll(target.classSectionId, [], false)}>Deselect all</button>
        </div>
        {target.subjects.length === 0 && target.staleSelections.length === 0 && <p>No active subjects are mapped to this section.</p>}
        {target.subjects.length > 0 && <><div className="exam-subject-table-head" aria-hidden="true"><span>Subject &amp; code</span><span>Category</span><span>Theory max</span><span>Practical / IA</span><span>Total marks</span><span>Pass marks</span><span>Duration</span></div><div className="exam-subject-list">{target.subjects.map((subject) => {
          const id = `exam-subject-${targetIndex}-${subject.id}`
          const metadata = [subject.code, subject.isElective ? 'Elective' : '', subject.isLab ? 'Lab' : ''].filter(Boolean).join(' · ')
          const selected = target.selectedSubjectIds.includes(subject.id)
          const duration = subject.durationMinutes ?? 180
          return <div className="exam-subject-paper" key={subject.id}><label className="exam-check" htmlFor={id}><input id={id} type="checkbox" checked={selected} disabled={busy} onChange={(event) => onToggle(target.classSectionId, subject.id, event.target.checked)} /><span>{subject.name}{metadata && <small>{metadata}</small>}</span></label><span className="exam-paper-category">{subject.isElective ? 'Elective' : subject.isLab ? 'Practical' : 'Core'}</span><label className="exam-mark-field">Theory max<input type="number" min="0" max="9999.99" step="0.01" aria-label={`Theory max for ${subject.name} in ${target.gradeName} ${target.sectionName}`} disabled={busy || !selected} value={subject.theoryMax ?? ''} onChange={(event) => onMarksChange(target.classSectionId, subject.id, 'theoryMax', event.target.value || null)} /></label><div className="exam-practical-field"><label><input type="checkbox" aria-label={`Include practical marks for ${subject.name}`} checked={subject.practicalMax !== null && subject.practicalMax !== undefined} disabled={busy || !selected} onChange={(event) => onMarksChange(target.classSectionId, subject.id, 'practicalMax', event.target.checked ? '0' : null)} /> Practical / IA</label>{subject.practicalMax !== null && subject.practicalMax !== undefined && <input type="number" min="0" max="9999.99" step="0.01" aria-label={`Practical max for ${subject.name} in ${target.gradeName} ${target.sectionName}`} disabled={busy || !selected} value={subject.practicalMax} onChange={(event) => onMarksChange(target.classSectionId, subject.id, 'practicalMax', event.target.value || '0')} />}</div><span className="exam-paper-total">{Number((Number(subject.theoryMax || 0) + Number(subject.practicalMax || 0)).toFixed(2))}</span><label className="exam-mark-field">Pass marks<input type="number" min="0" max="9999.99" step="0.01" aria-label={`Pass marks for ${subject.name} in ${target.gradeName} ${target.sectionName}`} disabled={busy || !selected} value={subject.passMarks ?? ''} onChange={(event) => onMarksChange(target.classSectionId, subject.id, 'passMarks', event.target.value || null)} /></label><label className="exam-mark-field">Duration<input type="number" min="1" max="1440" step="1" aria-label={`Duration minutes for ${subject.name} in ${target.gradeName} ${target.sectionName}`} disabled={busy || !selected} value={subject.durationMinutes ?? ''} onChange={(event) => onMarksChange(target.classSectionId, subject.id, 'durationMinutes', event.target.value || null)} /><small>{Math.floor(duration / 60)}h {String(duration % 60).padStart(2, '0')}m</small></label></div>
        })}</div></>}
        {target.staleSelections.length > 0 && <div className="exam-subject-stale" role="note"><h3>Previously selected · mapping changed</h3><p>These subjects are no longer in the current class mapping. They remain selected until you remove them.</p><div className="exam-subject-list">{target.staleSelections.map((subject) => {
          const id = `exam-stale-subject-${targetIndex}-${subject.id}`
          const metadata = [subject.code, subject.isElective ? 'Elective' : '', subject.isLab ? 'Lab' : ''].filter(Boolean).join(' · ')
          return <label className="exam-check" htmlFor={id} key={subject.id}><input id={id} type="checkbox" checked={target.selectedSubjectIds.includes(subject.id)} disabled={busy} onChange={(event) => onToggle(target.classSectionId, subject.id, event.target.checked)} /><span>{subject.name} <strong>(mapping changed)</strong>{metadata && <small>{metadata}</small>}</span></label>
        })}</div></div>}
      </fieldset>)}</div>
    </>}
    <footer className="exam-dialog-footer"><button className="exam-secondary" type="button" disabled={loading || busy} onClick={closeSubjects}>Cancel</button><button className="exam-secondary" type="button" disabled={!setup || loading || busy || Boolean(error && error.includes('changed after'))} onClick={onSave}>{busy ? 'Saving…' : 'Save subjects'}</button><button className="exam-primary" type="button" disabled={!setup || loading || busy || Boolean(error && error.includes('changed after'))} onClick={onNext}>Next: 2. Schedule Papers <ArrowRight aria-hidden="true" /></button></footer>
    <ConfirmationDialog open={discardOpen} title="Discard unsaved subject changes?" consequence="Your subject selections and marks edits will be lost." confirmLabel="Discard changes" onConfirm={onClose} onCancel={() => setDiscardOpen(false)} />
  </section></div>
}

function ExamCoverageDialog({ exam, coverage, electiveTargets, loading, busy, error, conflict, published, pair, onClose, onNext, onReload, onSelectPaper, candidateSearch, onSearch, candidatePage, onPage, candidates, candidateLoading, candidateError, assignedStudentIds, assignmentDirty, onToggleStudent, onSaveAssignments }: {
  exam: ExamRow; coverage: ExamCoverage | null; electiveTargets: ExamSubjectTarget[]; loading: boolean; busy: boolean; error: string; conflict: boolean; published: boolean
  pair: { classSectionId: string; subjectId: string } | null; onClose: () => void; onNext: () => void; onReload: () => void
  onSelectPaper: (classSectionId: string, subjectId: string) => void; candidateSearch: string; onSearch: (value: string) => void
  candidatePage: number; onPage: (page: number) => void; candidates: ExamElectiveCandidates | null; candidateLoading: boolean
  candidateError: string; assignedStudentIds: string[]; assignmentDirty: boolean; onToggleStudent: (studentId: string, selected: boolean) => void; onSaveAssignments: () => void
}) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])
  const electivePapers = electiveTargets.flatMap((target) => target.subjects.map((subject) => ({ target, subject })))
  const paperValue = pair ? `${pair.classSectionId}:${pair.subjectId}` : ''
  const selectedPaper = electivePapers.find(({ target, subject }) => `${target.classSectionId}:${subject.id}` === paperValue)
  const assignedSet = new Set(assignedStudentIds)
  const [selectedGrade, setSelectedGrade] = useState('')
  const orderedSections = [...(coverage?.sections ?? [])].sort((left, right) => compareGrades(left.gradeName, right.gradeName) || left.sectionName.localeCompare(right.sectionName, undefined, { numeric: true }))
  const selectedSections = orderedSections.filter((section) => !selectedGrade || section.gradeName === selectedGrade)
  const selectedSection = selectedGrade ? selectedSections[0] : undefined
  const selectedGradeStats = selectedSections.length ? {
    students: selectedSections.reduce((count, section) => count + section.activeStudentCount, 0),
    covered: selectedSections.reduce((count, section) => count + section.coveredStudentCount, 0),
    unassigned: selectedSections.reduce((count, section) => count + section.uncoveredStudentCount, 0),
    required: selectedSections.reduce((count, section) => count + section.nonElectivePaperCount, 0),
    electives: selectedSections.reduce((count, section) => count + section.electivePaperCount, 0),
  } : null
  return <div className="exam-modal-backdrop exam-coverage-backdrop"><section className="exam-editor exam-coverage-dialog" role="region" aria-label={`Candidate coverage · ${exam.name}`} aria-busy={loading || busy}>
    <header className="exam-dialog-header"><div className="exam-dialog-titleblock"><span className="exam-eyebrow">Student coverage</span><h2 id="exam-coverage-title">3. Student Coverage &amp; Section Mapping{selectedGrade ? ` — ${selectedSection ? `${selectedSection.gradeName} ${selectedSection.sectionName}` : selectedGrade}` : ' — All target classes'}</h2><p>Review active enrollments, selected papers and elective assignments before publishing the timetable.</p><div className="exam-dialog-context"><span>{categoryNames[exam.category]}</span><span title={exam.targetSummary.join(', ')}>{targetSectionCount(exam.targetSummary.length)}</span></div></div><button autoFocus className="exam-secondary exam-icon-close" type="button" aria-label="Close coverage" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
    {published && <p className="exam-timetable-immutable" role="status">The timetable is published. Candidate assignments are read-only.</p>}
    {error && <div className="exam-error" role="alert">{error}<button type="button" className="exam-secondary" disabled={loading || busy} onClick={onReload}>{coverage ? 'Reload coverage' : 'Try again'}</button></div>}
    {loading && <ExamLoadingSkeleton label="Checking active enrollments and selected papers" kind="coverage" />}
    {!loading && coverage && <div className="exam-dialog-body">
      <p className={`exam-coverage-status ${coverage.complete ? 'is-complete' : 'is-incomplete'}`} role="status">{coverage.complete ? 'Coverage complete' : 'Coverage incomplete'} · Revision {coverage.revision}</p>
      <ExamClassSwitcher grades={[...new Set(orderedSections.map((section) => section.gradeName))]} activeGrade={selectedGrade} onSelect={setSelectedGrade} ariaLabel="Switch coverage class" />
      {selectedGradeStats && <div className="exam-coverage-selected-metrics"><article><span>{selectedGrade ? 'Enrolled in selected class' : 'Enrolled across target sections'}</span><strong>{selectedGradeStats.students} students</strong><small>{selectedGrade ? selectedSections.map((section) => `${section.sectionName}: ${section.activeStudentCount}`).join(' · ') : `${selectedSections.length} class sections`}</small></article><article><span>{selectedGrade ? 'Selected papers' : 'Selected papers across sections'}</span><strong>{selectedGradeStats.required + selectedGradeStats.electives} papers</strong><small>{selectedGradeStats.required} core · {selectedGradeStats.electives} elective</small></article><article><span>Student coverage</span><strong>{selectedGradeStats.students ? Math.round(selectedGradeStats.covered / selectedGradeStats.students * 100) : 100}% mapped</strong><small>{selectedGradeStats.unassigned ? `${selectedGradeStats.unassigned} need attention` : 'Ready for publication checks'}</small></article></div>}
      <div className="exam-coverage-metrics" aria-label="Candidate coverage totals">
        <article><strong>{coverage.activeStudentCount}</strong><span>Active students</span></article>
        <article><strong>{coverage.coveredStudentCount}</strong><span>Covered</span></article>
        <article><strong>{coverage.uncoveredStudentCount}</strong><span>Uncovered</span></article>
        <article><strong>{coverage.nonElectivePaperCount}</strong><span>Required papers</span></article>
        <article><strong>{coverage.electivePaperCount}</strong><span>Elective papers</span></article>
      </div>
      <section className="exam-coverage-sections" aria-label="Coverage by section"><div className="exam-coverage-table-title"><h3>Section-wise student coverage</h3><span>Total coverage: {coverage.coveredStudentCount} / {coverage.activeStudentCount} students ({coverage.uncoveredStudentCount} unassigned)</span></div><div className="exam-coverage-table-wrap"><table><thead><tr><th>Class &amp; wing</th><th>Target sections</th><th>Enrolled students</th><th>Core papers</th><th>Elective assignment</th><th>Coverage status</th></tr></thead><tbody>
        {orderedSections.map((section) => <tr key={section.classSectionId}><th scope="row">{section.gradeName}</th><td>{section.sectionName}</td><td>{section.activeStudentCount} students</td><td>{section.nonElectivePaperCount} papers</td><td>{section.electivePaperCount ? `${section.electivePaperCount} paper${section.electivePaperCount === 1 ? '' : 's'} · ${section.uncoveredStudentCount ? 'Needs review' : '100% assigned'}` : 'Not required'}</td><td>{section.uncoveredStudentCount ? `${section.uncoveredStudentCount} uncovered` : '✓ Verified'}</td></tr>)}
      </tbody></table></div></section>
      {coverage.uncoveredStudents.length > 0 && <section className="exam-coverage-uncovered" aria-label="Uncovered active students"><h3>Students needing coverage</h3><ul>{coverage.uncoveredStudents.map((student) => <li key={`${student.classSectionId}:${student.studentId}`}><span>{student.fullName}</span><small>{student.sectionName}{student.admissionNumber ? ` · ${student.admissionNumber}` : ''}{student.rollNumber ? ` · Roll ${student.rollNumber}` : ''}</small>{student.missingElectiveAssignment && <strong>Missing elective assignment</strong>}</li>)}</ul>{coverage.uncoveredStudentsTruncated && <p>Showing the first {coverage.uncoveredStudents.length} uncovered students. Search within an elective paper below to assign others.</p>}</section>}
      {electivePapers.length > 0 ? <section className="exam-coverage-electives" aria-label="Elective paper assignments"><h3>Elective assignments</h3><label htmlFor="coverage-paper-select">Elective paper<select id="coverage-paper-select" value={paperValue} disabled={busy || conflict || published} onChange={(event) => { const [classSectionId, subjectId] = event.target.value.split(':'); if (classSectionId && subjectId) onSelectPaper(classSectionId, subjectId) }}><option value="">Choose a paper</option>{electivePapers.map(({ target, subject }) => <option key={`${target.classSectionId}:${subject.id}`} value={`${target.classSectionId}:${subject.id}`}>{target.gradeName} {target.sectionName} · {subject.name}{subject.code ? ` (${subject.code})` : ''}</option>)}</select></label>
        {selectedPaper && <><p className="exam-coverage-help">{assignedStudentIds.length} active student{assignedStudentIds.length === 1 ? '' : 's'} assigned to this elective paper. Search and paginate to adjust assignments; selections are saved as one complete set.</p><label htmlFor="coverage-candidate-search">Search active students<input id="coverage-candidate-search" type="search" value={candidateSearch} disabled={busy || conflict || published} onChange={(event) => onSearch(event.target.value)} placeholder="Name, admission number, or roll number" /></label>
          {candidateError && <div className="exam-error" role="alert">{candidateError}{conflict && <button type="button" className="exam-secondary" disabled={loading || busy} onClick={onReload}>Reload latest coverage</button>}</div>}
    {candidateLoading && <ExamLoadingSkeleton label="Loading candidates" kind="candidates" />}
          {!candidateLoading && candidates && candidates.items.length > 0 && <div className="exam-candidate-list">{candidates.items.map((student) => <label className="exam-check" key={student.studentId}><input type="checkbox" checked={assignedSet.has(student.studentId)} disabled={busy || conflict || published} onChange={(event) => onToggleStudent(student.studentId, event.target.checked)} /><span>{student.fullName}<small>{student.admissionNumber ? `Admission ${student.admissionNumber}` : ''}{student.admissionNumber && student.rollNumber ? ' · ' : ''}{student.rollNumber ? `Roll ${student.rollNumber}` : ''}</small></span></label>)}</div>}
          {!candidateLoading && candidates && candidates.items.length === 0 && <p>No active students match this search in the selected section.</p>}
          {candidates && candidates.totalPages > 1 && <nav className="exam-coverage-pagination" aria-label="Candidate pages"><span>Page {candidates.page} of {candidates.totalPages} · {candidates.count} active students</span><button className="exam-secondary" type="button" disabled={candidateLoading || candidatePage <= 1} onClick={() => onPage(Math.max(1, candidatePage - 1))}>Previous</button><button className="exam-secondary" type="button" disabled={candidateLoading || candidatePage >= candidates.totalPages} onClick={() => onPage(Math.min(candidates.totalPages, candidatePage + 1))}>Next</button></nav>}
        </>}
      </section> : <p className="exam-coverage-help">There are no selected elective papers. Every active student is counted against each selected non-elective paper.</p>}
      <p className="exam-coverage-footnote">Only active students in these target sections count. Timetable publication will remain blocked until all active students are covered; no override is available.</p>
    </div>}
    <footer className="exam-dialog-footer">{!published && <>{selectedPaper && <button className="exam-secondary" type="button" disabled={!assignmentDirty || loading || candidateLoading || busy || conflict} onClick={onSaveAssignments}>{busy ? 'Saving assignments…' : 'Save elective assignments'}</button>}<button className="exam-primary" type="button" disabled={loading || busy || conflict} onClick={onNext}>Next: 4. Validate &amp; Publish <ArrowRight aria-hidden="true" /></button></>}</footer>
  </section></div>
}

function ExamTimetableDialog({ exam, timetable, loading, busy, error, confirm, onClose, onReload, onConfirm, onCancelConfirm, onPublish, onFix }: { exam: ExamRow; timetable: ExamTimetable | null; loading: boolean; busy: boolean; error: string; confirm: boolean; onClose: () => void; onReload: () => void; onConfirm: () => void; onCancelConfirm: () => void; onPublish: () => void; onFix: (step: 'subjects' | 'schedule' | 'coverage') => void }) {
  const [selectedPublishedClass, setSelectedPublishedClass] = useState('')
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, onClose])
  useEffect(() => setSelectedPublishedClass(''), [exam.id])
  const publication = timetable?.publication
  const publishedPapers = [...(timetable?.papers ?? [])].sort((left, right) => left.scheduledOn.localeCompare(right.scheduledOn) || left.startTime.localeCompare(right.startTime) || left.paperLabel.localeCompare(right.paperLabel, undefined, { numeric: true }))
  const classLabels = [...new Set(publishedPapers.map((paper) => paper.paperLabel.split(' · ')[0]))].sort((left, right) => compareGrades(targetGrade(left), targetGrade(right)) || left.localeCompare(right, undefined, { numeric: true }))
  const visibleClassLabels = selectedPublishedClass ? classLabels.filter((label) => label === selectedPublishedClass) : classLabels
  return <div className="exam-modal-backdrop exam-timetable-backdrop"><section className="exam-editor exam-timetable-dialog" role="region" aria-labelledby="exam-timetable-title" aria-busy={loading || busy}>
    <header className="exam-dialog-header"><div className="exam-dialog-titleblock"><span className="exam-eyebrow">Timetable release</span><h2 id="exam-timetable-title">{publication ? 'Published timetable' : 'Validate timetable'} · {exam.name}</h2><p>{publication ? 'Review the released paper schedule and validation results. This published snapshot is immutable.' : 'Publication validates every paper schedule, live student coverage, and candidate time conflicts. Publishing creates the exam notice and timetable together in the admin workspace.'}</p><div className="exam-dialog-context"><span>{categoryNames[exam.category]}</span><span title={exam.targetSummary.join(', ')}>{targetSectionCount(exam.targetSummary.length)}</span></div></div><button autoFocus className="exam-secondary exam-icon-close" type="button" aria-label="Close timetable" disabled={busy} onClick={onClose}><X aria-hidden="true" /></button></header>
    {error && <div className="exam-error" role="alert">{error}<button type="button" className="exam-secondary" disabled={loading || busy} onClick={onReload}>{timetable ? 'Refresh validation' : 'Try again'}</button></div>}
    {loading && <ExamLoadingSkeleton label="Checking timetable readiness" kind="readiness" />}
    {!loading && timetable && <div className="exam-dialog-body">
      <p className={`exam-timetable-status ${publication ? 'is-published' : timetable.ready ? 'is-ready' : 'is-blocked'}`} role="status">{publication ? `Published at revision ${publication.revision}${publication.publishedAt ? ` · ${new Date(publication.publishedAt).toLocaleString()}` : ''}${publication.publishedBy ? ` · ${publication.publishedBy}` : ''}` : timetable.ready ? 'Ready to publish' : 'Publication blocked'} · Exam revision {timetable.revision}</p>
      {publication && <p className="exam-timetable-immutable">This published timetable is an immutable snapshot. Paper scheduling and candidate coverage are locked.</p>}
      {publication && timetable.papers && <section className="exam-published-papers" aria-label="Published timetable by class"><div className="exam-published-papers-title"><h3>Class-wise timetable</h3><span>{publishedPapers.length} papers · {classLabels.length} classes</span></div><nav className="exam-published-class-filter" aria-label="Filter published timetable by class"><button type="button" aria-pressed={!selectedPublishedClass} onClick={() => setSelectedPublishedClass('')}>All classes</button>{classLabels.map((label) => <button type="button" aria-pressed={selectedPublishedClass === label} key={label} onClick={() => setSelectedPublishedClass(label)}>{label}</button>)}</nav><div className="exam-published-class-list">{visibleClassLabels.map((classLabel) => { const classPapers = publishedPapers.filter((paper) => paper.paperLabel.split(' · ')[0] === classLabel); return <section className="exam-published-class" key={classLabel} aria-label={`Timetable for ${classLabel}`}><div className="exam-published-class-title"><h4>{classLabel}</h4><span>{classPapers.length} papers</span></div><div className="exam-published-papers-table"><table><thead><tr><th>Date</th><th>Subject</th><th>Time</th></tr></thead><tbody>{classPapers.map((paper) => { const [, subjectLabel = paper.paperLabel] = paper.paperLabel.split(' · '); return <tr key={`${paper.classSectionId}:${paper.subjectId}`}><td>{paper.scheduledOn}</td><th scope="row">{subjectLabel}</th><td>{paper.startTime}–{paper.endTime}</td></tr> })}</tbody></table></div></section> })}</div></section>}
      {timetable.checks.length > 0 && <ul className="exam-timetable-checks" aria-label="Timetable validation checks">{timetable.checks.map((check) => <li key={check.code} className={check.passed ? 'is-passed' : 'is-failed'}><strong>{check.passed ? 'Passed' : 'Needs attention'} · {check.label}</strong>{check.message && <span>{check.message}</span>}</li>)}</ul>}
      {timetable.blockers.length > 0 && <section className="exam-timetable-issues" aria-label="Publication blockers"><h3>Blockers</h3><ul>{timetable.blockers.map((issue, index) => <li key={`${issue.code}:${issue.classSectionId ?? ''}:${issue.subjectId ?? ''}:${issue.studentId ?? ''}:${index}`}>{issue.message} <button type="button" className="exam-secondary" onClick={() => onFix(issue.code === 'NO_PAPERS' ? 'subjects' : issue.code === 'CANDIDATE_UNCOVERED' ? 'coverage' : 'schedule')}>Fix</button></li>)}</ul></section>}
      {timetable.conflicts.length > 0 && <section className="exam-timetable-issues is-conflict" aria-label="Candidate conflicts"><h3>Candidate time conflicts</h3><ul>{timetable.conflicts.map((issue, index) => <li key={`${issue.code}:${issue.studentId ?? ''}:${index}`}>{issue.message}</li>)}</ul></section>}
      {publication && publication.snapshot && <details className="exam-timetable-snapshot"><summary>Snapshot details</summary><pre>{JSON.stringify(publication.snapshot, null, 2)}</pre></details>}
      {!publication && confirm && <div className="exam-timetable-confirm" role="alertdialog" aria-label="Confirm timetable publication"><p>Publish this timetable snapshot now? The schedule and candidate coverage will become immutable.</p><button type="button" className="exam-secondary" disabled={busy} onClick={onCancelConfirm}>Cancel</button><button type="button" className="exam-primary" disabled={busy || !timetable.ready || !timetable.actions.publish} onClick={onPublish}>{busy ? 'Publishing…' : 'Confirm publish'}</button></div>}
    </div>}
    <footer className="exam-dialog-footer">{!publication && timetable && <><button className="exam-secondary" type="button" disabled={loading || busy} onClick={onReload}>Refresh validation</button>{timetable.actions.publish && <button className="exam-primary" type="button" disabled={!timetable.ready || loading || busy || confirm} onClick={onConfirm}>Publish exam</button>}</>}</footer>
  </section></div>
}

type ExamPaperScheduleField = 'scheduledOn' | 'startTime' | 'endTime' | 'roomId' | 'invigilatorId'
function ExamPaperScheduleDialog({ exam, schedule, loading, busy, error, conflict, published, onClose, onNext, onReload, onSave, onChange }: { exam: ExamRow; schedule: ExamPaperSchedule | null; loading: boolean; busy: boolean; error: string; conflict: boolean; published: boolean; onClose: () => void; onNext: () => void; onReload: () => void; onSave: () => void; onChange: (index: number, key: ExamPaperScheduleField, value: string | null) => void }) {
  const baseline = useRef<{ revision: number; papers: string } | null>(null)
  const [discardOpen, setDiscardOpen] = useState(false)
  useEffect(() => { if (schedule && baseline.current?.revision !== schedule.revision) baseline.current = { revision: schedule.revision, papers: JSON.stringify(schedule.papers) } }, [schedule])
  const closeSchedule = useCallback(() => {
    if (schedule && baseline.current && baseline.current.papers !== JSON.stringify(schedule.papers)) { setDiscardOpen(true); return }
    onClose()
  }, [schedule, onClose])
  const [startDate, setStartDate] = useState(exam.startsOn ?? '')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('12:00')
  const [sourceSection, setSourceSection] = useState('')
  const [classFilter, setClassFilter] = useState<string | null>(null)
  const visibleClass = classFilter === null ? schedule?.papers[0]?.gradeName ?? '' : classFilter
  const [preview, setPreview] = useState<Array<{ index: number; scheduledOn: string; startTime: string; endTime: string }>>([])
  const [previewError, setPreviewError] = useState('')
  const [autoAssignOpen, setAutoAssignOpen] = useState(false)
  const [previewClass, setPreviewClass] = useState('')
  const [subjectsPerDay, setSubjectsPerDay] = useState(1)
  const [secondStartTime, setSecondStartTime] = useState('13:00')
  const [secondEndTime, setSecondEndTime] = useState('16:00')
  const buildAutoPreview = (perDay: number, secondStart = secondStartTime, secondEnd = secondEndTime) => {
    if (!schedule) return
    const targets = schedule.papers
    const subjectKey = (paper: ExamPaperSchedule['papers'][number]) => paper.subjectCode?.trim().toLowerCase() || paper.subjectName.trim().toLowerCase()
    const subjectsByClass = new Map<string, string[]>()
    targets.forEach((paper) => {
      const subjects = subjectsByClass.get(paper.gradeName) ?? []
      const key = subjectKey(paper)
      if (!subjects.includes(key)) subjects.push(key)
      subjectsByClass.set(paper.gradeName, subjects)
    })
    const largestClass = [...subjectsByClass].sort((left, right) => right[1].length - left[1].length)[0]
    const subjectCount = largestClass?.[1].length ?? 0
    const daysAvailable = exam.endsOn
      ? Math.floor((Date.parse(`${exam.endsOn}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000) + 1
      : Infinity
    const changes = schedule.papers.flatMap((paper, index) => {
      const subjects = subjectsByClass.get(paper.gradeName) ?? []
      const subjectIndex = subjects.indexOf(subjectKey(paper))
      const date = new Date(`${startDate}T00:00:00Z`)
      date.setUTCDate(date.getUTCDate() + Math.floor(subjectIndex / perDay))
      return [{ index, scheduledOn: date.toISOString().slice(0, 10), startTime: subjectIndex % perDay === 0 ? startTime : secondStart, endTime: subjectIndex % perDay === 0 ? endTime : secondEnd }]
    })
    setSubjectsPerDay(perDay)
    setPreviewClass(largestClass?.[0] ?? '')
    setPreview(changes)
    setPreviewError(startDate < (exam.startsOn ?? '') || subjectCount > daysAvailable * perDay
      ? `This plan does not fit the exam window or has invalid times (${largestClass?.[0] ?? 'A class'} has ${subjectCount} subjects across ${Number.isFinite(daysAvailable) ? daysAvailable : 'unlimited'} days). Choose two papers per day or adjust the dates.`
      : previewErrorFor(changes, perDay))
  }
  const previewErrorFor = (changes: typeof preview, perDay: number) => {
    if (!schedule) return ''
    const counts = new Map<string, Set<string>>()
    for (const change of changes) {
      const paper = schedule.papers[change.index]
      if ((exam.startsOn && change.scheduledOn < exam.startsOn) || (exam.endsOn && change.scheduledOn > exam.endsOn)) return 'Every proposed date must stay within the exam window.'
      if (!change.scheduledOn || !change.startTime || !change.endTime || change.endTime <= change.startTime) return 'Enter a valid date and a start and end time for every paper.'
      const key = `${paper.gradeName}:${change.scheduledOn}`
      const subjects = counts.get(key) ?? new Set<string>()
      subjects.add(paper.subjectCode?.trim().toLowerCase() || paper.subjectName.trim().toLowerCase())
      counts.set(key, subjects)
    }
    const overCapacity = [...counts].find(([, subjects]) => subjects.size > perDay)
    return overCapacity ? `A class has more than ${perDay} papers on ${overCapacity[0].split(':').at(-1)}. Move a paper to another date or allow two papers per day.` : ''
  }
  const editPreview = (index: number, field: 'scheduledOn' | 'startTime' | 'endTime', value: string) => {
    const next = preview.map((item) => item.index === index ? { ...item, [field]: value } : item)
    setPreview(next)
    setPreviewError(previewErrorFor(next, subjectsPerDay))
  }
  const closeAutoAssignPreview = () => {
    setAutoAssignOpen(false)
    setPreview([])
    setPreviewError('')
  }
  const makePreview = (mode: 'auto' | 'copy') => {
    if (!schedule) return
    setPreviewError('')
    const papers = schedule.papers
    const targets = papers
    const sourcePaper = mode === 'copy' ? papers.find((paper) => paper.classSectionId === sourceSection) : undefined
    if (mode === 'copy' && !sourcePaper) { setPreview([]); setPreviewError('Choose a section with a scheduled paper to copy from.'); return }
    if (mode === 'auto') { setAutoAssignOpen(true); buildAutoPreview(1); return }
    const changes = papers.flatMap((paper, index) => {
      if (!targets.includes(paper)) return []
      if (mode === 'copy') {
        if (paper.classSectionId === sourceSection || gradeWing(paper.gradeName) !== gradeWing(sourcePaper!.gradeName)) return []
        const source = papers.find((item) => item.classSectionId === sourceSection && sameSubject(item, paper) && item.scheduledOn && item.startTime && item.endTime)
        return source ? [{ index, scheduledOn: source.scheduledOn!, startTime: source.startTime!, endTime: source.endTime! }] : []
      }
      return []
    })
    if (mode === 'copy' && changes.length === 0) { setPreview([]); setPreviewError('No matching scheduled subjects were found in the source section’s wing.'); return }
    setPreview(changes)
  }
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) closeSchedule() }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [busy, closeSchedule])
  return <div className="exam-modal-backdrop exam-schedule-backdrop"><section className="exam-editor exam-schedule-dialog" role="region" aria-labelledby="exam-schedule-title" aria-busy={loading || busy}>
    <header className="exam-dialog-header"><div className="exam-dialog-titleblock"><span className="exam-eyebrow">Paper schedule</span><h2 id="exam-schedule-title">Schedule papers · {exam.name}</h2><p>Set one date and time for each selected subject paper. This saves paper slots only; it does not publish a timetable.</p><div className="exam-dialog-context"><span>{categoryNames[exam.category]}</span><span title={exam.targetSummary.join(', ')}>{targetSectionCount(exam.targetSummary.length)}</span></div></div><button autoFocus className="exam-secondary exam-icon-close" type="button" aria-label="Close schedule" disabled={busy} onClick={closeSchedule}><X aria-hidden="true" /></button></header>
    {published && <p className="exam-timetable-immutable" role="status">The timetable has been published. These paper slots are read-only.</p>}
    {schedule && <p className="exam-subject-revision">Revision {schedule.revision} · Leave all three fields blank to keep a paper unscheduled.</p>}
    {error && <div className="exam-error" role="alert">{error}{(!schedule || conflict) && <button type="button" className="exam-secondary" disabled={loading || busy} onClick={onReload}>{schedule ? 'Reload latest schedule' : 'Try again'}</button>}</div>}
    {loading && <ExamLoadingSkeleton label="Checking exam access and selected subjects" kind="schedule" />}
    {!loading && schedule && schedule.papers.length > 0 && <ExamClassSwitcher grades={[...new Set(schedule.papers.map((paper) => paper.gradeName))].sort(compareGrades)} activeGrade={visibleClass} onSelect={setClassFilter} ariaLabel="Switch schedule class" />}
    {!published && schedule && schedule.papers.length > 0 && <section className="exam-schedule-toolbar" aria-label="Scheduling shortcuts">
      <div className="exam-schedule-toolbar-heading"><div><h3>2. Schedule Papers — {visibleClass || 'All Classes'}</h3><p>{schedule.papers.filter((paper) => !visibleClass || paper.gradeName === visibleClass).filter((paper) => paper.scheduledOn && paper.startTime && paper.endTime).length} of {schedule.papers.filter((paper) => !visibleClass || paper.gradeName === visibleClass).length} scheduled</p></div><span className="exam-window-badge">Window: {exam.startsOn ?? 'Not set'} – {exam.endsOn ?? 'Not set'}</span></div>
      <div className="exam-schedule-toolbar-controls"><div className="exam-schedule-view-toggle"><button type="button" className={visibleClass ? 'is-active' : ''} onClick={() => setClassFilter(schedule.papers[0]?.gradeName ?? '')}>Class-by-Class View</button><button type="button" className={!visibleClass ? 'is-active' : ''} onClick={() => setClassFilter('')}>All-Classes Master Grid</button></div><label>Copy from section<select value={sourceSection} onChange={(event) => setSourceSection(event.target.value)}><option value="">Copy Dates to Wing…</option>{[...new Map(schedule.papers.map((paper) => [paper.classSectionId, paper])).values()].map((paper) => <option key={paper.classSectionId} value={paper.classSectionId}>{paper.gradeName} {paper.sectionName}</option>)}</select></label><button className="exam-secondary" type="button" disabled={busy || conflict || !sourceSection} onClick={() => makePreview('copy')}>Preview copy</button><div className="exam-schedule-auto-fields"><label>First date<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>Start<input type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} /></label><label>End<input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} /></label></div><button className="exam-primary" aria-label="Auto-assign dates and times" type="button" disabled={busy || conflict || !startDate || !startTime || !endTime || endTime <= startTime} onClick={() => makePreview('auto')}>Auto-Assign Dates &amp; Times</button></div>
      {previewError && <p className="exam-field-error" role="alert">{previewError}</p>}
      {preview.length > 0 && <div><h4>Proposed changes ({preview.length})</h4><ul>{preview.map((change) => { const paper = schedule.papers[change.index]; return <li key={`${paper.classSectionId}:${paper.subjectId}`}>{paper.gradeName} {paper.sectionName} · {paper.subjectName}: {change.scheduledOn}, {change.startTime}–{change.endTime}{paper.scheduledOn ? ` (replaces ${paper.scheduledOn} ${paper.startTime ?? ''}–${paper.endTime ?? ''})` : ''}</li> })}</ul><button type="button" className="exam-primary" onClick={() => { preview.forEach((change) => { onChange(change.index, 'scheduledOn', change.scheduledOn); onChange(change.index, 'startTime', change.startTime); onChange(change.index, 'endTime', change.endTime) }); setPreview([]) }}>Apply preview</button><button type="button" className="exam-secondary" onClick={() => setPreview([])}>Cancel preview</button></div>}
      {autoAssignOpen && <div className="exam-preview-backdrop"><section className="exam-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-auto-preview-title"><header><div><span className="exam-eyebrow">Schedule review</span><h2 id="exam-auto-preview-title">Auto-assign papers · All classes</h2><p>Review and edit dates and times by class. Applying keeps every class in the schedule.</p></div><button className="exam-secondary" type="button" aria-label="Close auto-assign preview" onClick={closeAutoAssignPreview}>×</button></header><label className="exam-preview-capacity">Papers per day<select value={subjectsPerDay} onChange={(event) => buildAutoPreview(Number(event.target.value))}><option value={1}>One paper per day</option><option value={2}>Two papers per day</option></select></label>{subjectsPerDay === 2 && <div className="exam-preview-slots"><label>Second paper starts<input type="time" value={secondStartTime} onChange={(event) => { setSecondStartTime(event.target.value); buildAutoPreview(2, event.target.value, secondEndTime) }} /></label><label>Second paper ends<input type="time" value={secondEndTime} onChange={(event) => { setSecondEndTime(event.target.value); buildAutoPreview(2, secondStartTime, event.target.value) }} /></label></div>}{previewError && <p className="exam-field-error" role="alert">{previewError}</p>}<nav className="exam-preview-classes" aria-label="Preview class"><button type="button" className={!previewClass ? 'is-active' : ''} onClick={() => setPreviewClass('')}>All classes</button>{[...new Set(schedule.papers.map((paper) => paper.gradeName))].sort(compareGrades).map((grade) => <button type="button" key={grade} className={previewClass === grade ? 'is-active' : ''} onClick={() => setPreviewClass(grade)}>{grade}</button>)}</nav><div key={previewClass} className="exam-preview-list"><table><thead><tr><th>Class</th><th>Subject</th><th>Date</th><th>Start</th><th>End</th></tr></thead><tbody>{preview.filter((change) => !previewClass || schedule.papers[change.index].gradeName === previewClass).map((change) => { const paper = schedule.papers[change.index]; const label = `${paper.subjectName} in ${paper.gradeName} ${paper.sectionName}`; return <tr key={`${paper.classSectionId}:${paper.subjectId}`}><td>{paper.gradeName} {paper.sectionName}</td><td>{paper.subjectName}</td><td><input aria-label={`Date for ${label}`} type="date" value={change.scheduledOn} onChange={(event) => editPreview(change.index, 'scheduledOn', event.target.value)} /></td><td><input aria-label={`Start time for ${label}`} type="time" value={change.startTime} onChange={(event) => editPreview(change.index, 'startTime', event.target.value)} /></td><td><input aria-label={`End time for ${label}`} type="time" value={change.endTime} onChange={(event) => editPreview(change.index, 'endTime', event.target.value)} /></td></tr> })}</tbody></table></div><footer><button className="exam-secondary" type="button" onClick={closeAutoAssignPreview}>Cancel</button><button className="exam-primary" type="button" disabled={Boolean(previewError)} onClick={() => { preview.forEach((change) => { onChange(change.index, 'scheduledOn', change.scheduledOn); onChange(change.index, 'startTime', change.startTime); onChange(change.index, 'endTime', change.endTime) }); closeAutoAssignPreview() }}>Apply schedule to all classes</button></footer></section></div>}
    </section>}
    {!loading && schedule && schedule.papers.length === 0 && <p>No selected subject papers are available. Close this dialog and select mapped subjects first.</p>}
    {!loading && schedule && schedule.papers.length > 0 && <div className="exam-schedule-table-wrap"><table className="exam-schedule-table"><thead><tr><th scope="col">Paper &amp; subject code</th><th scope="col">Exam date</th><th scope="col">Day</th><th scope="col">Shift &amp; paper timing</th><th scope="col">Room / hall</th><th scope="col">Invigilator</th><th scope="col">Validation</th></tr></thead><tbody>{schedule.papers.map((paper, index) => {
      if (visibleClass && paper.gradeName !== visibleClass) return null
      const rowId = `${index}-${paper.classSectionId}-${paper.subjectId}`
      const timeError = Boolean(paper.startTime && paper.endTime && paper.endTime <= paper.startTime)
      const day = paper.scheduledOn ? new Date(`${paper.scheduledOn}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'
      const scheduled = Boolean(paper.scheduledOn && paper.startTime && paper.endTime && !timeError)
      return <tr key={`${paper.classSectionId}:${paper.subjectId}`}>
        <td><strong>{paper.subjectName}</strong><small>{paper.subjectCode ?? 'Subject code unavailable'} · {Math.floor((paper.durationMinutes ?? 180) / 60)}h {String((paper.durationMinutes ?? 180) % 60).padStart(2, '0')}m · {paper.gradeName} {paper.sectionName}</small></td>
        <td><label className="sr-only" htmlFor={`paper-date-${rowId}`}>Date</label><input id={`paper-date-${rowId}`} aria-label={`Date for ${paper.subjectName} in ${paper.gradeName} ${paper.sectionName}`} type="date" disabled={published || busy || conflict} value={paper.scheduledOn ?? ''} onChange={(event) => onChange(index, 'scheduledOn', event.target.value || null)} /></td>
        <td>{day}</td>
        <td><div className="exam-schedule-time"><label><span className="sr-only">Start time</span><input aria-label={`Start time for ${paper.subjectName} in ${paper.gradeName} ${paper.sectionName}`} type="time" disabled={published || busy || conflict} value={paper.startTime ?? ''} onChange={(event) => onChange(index, 'startTime', event.target.value || null)} /></label><span>to</span><label><span className="sr-only">End time</span><input aria-label={`End time for ${paper.subjectName} in ${paper.gradeName} ${paper.sectionName}`} type="time" disabled={published || busy || conflict} value={paper.endTime ?? ''} onChange={(event) => onChange(index, 'endTime', event.target.value || null)} /></label></div>{timeError && <span className="exam-field-error" role="alert">End time must be later than start.</span>}</td>
        <td><label className="sr-only" htmlFor={`paper-room-${rowId}`}>Room / hall for {paper.subjectName}</label><select id={`paper-room-${rowId}`} disabled={published || busy || conflict} value={paper.roomId ?? ''} onChange={(event) => onChange(index, 'roomId', event.target.value || null)}><option value="">Not assigned</option>{paper.roomId && !(schedule.rooms ?? []).some((room) => room.id === paper.roomId) && <option value={paper.roomId}>Previously assigned · unavailable</option>}{(schedule.rooms ?? []).map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></td>
        <td><label className="sr-only" htmlFor={`paper-invigilator-${rowId}`}>Invigilator for {paper.subjectName}</label><select id={`paper-invigilator-${rowId}`} disabled={published || busy || conflict} value={paper.invigilatorId ?? ''} onChange={(event) => onChange(index, 'invigilatorId', event.target.value || null)}><option value="">Not assigned</option>{paper.invigilatorId && !(schedule.invigilators ?? []).some((person) => person.id === paper.invigilatorId) && <option value={paper.invigilatorId}>Previously assigned · unavailable</option>}{(schedule.invigilators ?? []).map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></td>
        <td><span className={`exam-schedule-status ${scheduled ? 'is-ready' : 'is-pending'}`}>{scheduled ? '✓ Scheduled' : 'Needs schedule'}</span></td>
      </tr>
    })}</tbody></table></div>}
    <footer className="exam-dialog-footer">{!published && <><button className="exam-secondary" type="button" disabled={!schedule || schedule.papers.length === 0 || loading || busy || conflict} onClick={onSave}>{busy ? 'Saving…' : 'Save schedule'}</button><button className="exam-primary" type="button" disabled={!schedule || schedule.papers.length === 0 || loading || busy || conflict} onClick={onNext}>Next: 3. Student Coverage <ArrowRight aria-hidden="true" /></button></>}</footer>
    <ConfirmationDialog open={discardOpen} title="Discard unsaved schedule changes?" consequence="Your date, time, room and invigilator edits will be lost." confirmLabel="Discard changes" onConfirm={onClose} onCancel={() => setDiscardOpen(false)} />
  </section></div>
}

function ExamEditor({ accessToken, options, initial, source, defaults, busy, saveError, onClose, onSave }: { accessToken: string; options: ExamOptions; initial?: ExamDetail; source?: ExamDetail; defaults?: EditorValues; busy: boolean; saveError: string; onClose: () => void; onSave: (values: EditorValues) => void }) {
  const readOnly = Boolean(initial && !initial.actions?.edit)
  const [values, setValues] = useState<EditorValues>(() => initial ? valuesFromDetail(initial) : source ? { ...valuesFromDetail(source), name: `${source.name} copy`, coordinatorId: '', classSectionIds: [] } : defaults ?? emptyValues())
  const [choiceOptions, setChoiceOptions] = useState<ExamOptions>(options)
  const [loadedChoicesFor, setLoadedChoicesFor] = useState('')
  const [error, setError] = useState('')
  const [dirty, setDirty] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [advanced, setAdvanced] = useState(false)
  const [selectedGroup, setSelectedGroup] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const choicesKey = `${values.campusId}:${values.academicYearId}:${initial ? 'edit' : 'create'}`
  const choicesLoading = Boolean(values.academicYearId && loadedChoicesFor !== choicesKey)
  const selectedSections = useMemo(() => choiceOptions.sections.filter((section) => section.academicYearId === values.academicYearId && (!values.campusId || section.campusId === values.campusId)), [choiceOptions.sections, values.academicYearId, values.campusId])
  const grouped = useMemo(() => selectedSections.reduce<Record<string, ExamChoice[]>>((acc, item) => { const group = item.gradeName ?? 'Classes'; (acc[group] ??= []).push(item); return acc }, {}), [selectedSections])
  const selectedGradeId = selectedSections.find((section) => values.classSectionIds.includes(section.id))?.gradeId

  useEffect(() => {
    if (!values.academicYearId) return
    const controller = new AbortController()
    const requestKey = `${values.campusId}:${values.academicYearId}:${initial ? 'edit' : 'create'}`
    Promise.all([
      listAllExamSections(accessToken, { action: initial ? 'edit' : 'create', campusId: values.campusId || undefined, academicYearId: values.academicYearId, signal: controller.signal }),
      getExamOptions(accessToken, { kind: 'terms', action: initial ? 'edit' : 'create', campusId: values.campusId || undefined, academicYearId: values.academicYearId, signal: controller.signal }),
      getExamOptions(accessToken, { kind: 'coordinators', action: initial ? 'edit' : 'create', campusId: values.campusId || undefined, signal: controller.signal }),
    ]).then(([sections, terms, coordinators]) => {
      setChoiceOptions((current) => ({ ...current, sections: sections ?? [], terms: terms.terms ?? [], coordinators: coordinators.coordinators ?? [] }))
      setError('')
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(apiMessage(cause)) }).finally(() => { if (!controller.signal.aborted) setLoadedChoicesFor(requestKey) })
    return () => controller.abort()
  }, [accessToken, values.academicYearId, values.campusId, initial])

  const change = <K extends keyof EditorValues>(key: K, value: EditorValues[K]) => { setDirty(true); setValues((current) => ({ ...current, [key]: value })) }
  const toggleSection = (id: string) => {
    const section = selectedSections.find((item) => item.id === id)
    if (values.category === 'CLASS_TEST' && !values.classSectionIds.includes(id) && selectedGradeId && section?.gradeId !== selectedGradeId) {
      setSelectionError('A class test can include sections from only one grade.')
      return
    }
    setSelectionError('')
    change('classSectionIds', values.classSectionIds.includes(id) ? values.classSectionIds.filter((item) => item !== id) : [...values.classSectionIds, id])
  }
  const selectGroup = (group: string, checked: boolean) => {
    const sections = grouped[group] ?? []
    const ids = sections.map((item) => item.id)
    if (checked && values.category === 'CLASS_TEST') {
      const groupGradeIds = new Set(sections.map((item) => item.gradeId).filter(Boolean))
      if (groupGradeIds.size !== 1 || (selectedGradeId && !groupGradeIds.has(selectedGradeId))) {
        setSelectionError('A class test can include sections from only one grade.')
        return
      }
    }
    setSelectionError('')
    change('classSectionIds', checked ? [...new Set([...values.classSectionIds, ...ids])] : values.classSectionIds.filter((id) => !ids.includes(id)))
  }
  const visibleGroups = Object.entries(grouped).filter(([name]) => !selectedGroup || selectedGroup === name)
  const visibleSections = visibleGroups.flatMap(([, sections]) => sections)
  const classTestBulkReady = values.category !== 'CLASS_TEST' || Boolean(selectedGroup)
  const toggleVisibleSections = (selected: boolean) => {
    if (selected && values.category === 'CLASS_TEST') {
      const grades = new Set(visibleSections.map((section) => section.gradeId).filter(Boolean))
      if (grades.size !== 1 || (selectedGradeId && !grades.has(selectedGradeId))) {
        setSelectionError('Choose the same grade as your selected sections before selecting all.')
        return
      }
    }
    setSelectionError('')
    const visibleIds = new Set(visibleSections.map((section) => section.id))
    change('classSectionIds', selected
      ? [...new Set([...values.classSectionIds, ...visibleIds])]
      : values.classSectionIds.filter((id) => !visibleIds.has(id)))
  }
  const changeCategory = (nextCategory: ExamCategory) => {
    change('category', nextCategory)
    if (nextCategory === 'CLASS_TEST') {
      const selectedGradeIds = new Set(selectedSections.filter((section) => values.classSectionIds.includes(section.id)).map((section) => section.gradeId).filter(Boolean))
      setSelectionError(selectedGradeIds.size > 1 ? 'A class test can include sections from only one grade. Remove sections from other grades.' : '')
    } else setSelectionError('')
  }
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (readOnly) { closeEditor(); return }
    if (!values.name.trim() || !values.campusId || !values.academicYearId || !values.classSectionIds.length) { setError('Enter a name, choose a campus and year, and select at least one class section.'); return }
    if (values.category === 'CLASS_TEST' && new Set(selectedSections.filter((section) => values.classSectionIds.includes(section.id)).map((section) => section.gradeId).filter(Boolean)).size > 1) { setSelectionError('A class test can include sections from only one grade.'); return }
    if (values.startsOn && values.endsOn && values.endsOn < values.startsOn) { setError('End date must be on or after the start date.'); return }
    setError(''); onSave(values)
  }
  const year = options.academicYears.find((item) => item.id === values.academicYearId)
  const closeEditor = () => { if (dirty && !readOnly) setConfirmDiscard(true); else onClose() }
  return <div className="exam-modal-backdrop"><section className="exam-editor exam-create-dialog" role="dialog" aria-modal="true" aria-labelledby="exam-editor-title">
    <header className="exam-dialog-header"><div className="exam-dialog-titleblock"><span className="exam-eyebrow">{readOnly ? 'Exam details' : initial ? 'Edit setup' : source ? 'Duplicate setup' : 'Exam setup'}</span><h2 id="exam-editor-title">{readOnly ? 'Exam draft' : initial ? 'Edit exam draft' : source ? 'Duplicate exam' : 'Create exam draft'}</h2><p>{initial ? `Revision ${initial.revision} · ${year?.name ?? 'Academic year'}` : 'Choose the exact classes and sections included in this exam.'}</p>{initial && <div className="exam-dialog-context"><span>{categoryNames[initial.category]}</span><span>{initial.classSectionIds.length} target section{initial.classSectionIds.length === 1 ? '' : 's'}</span></div>}</div><button className="exam-secondary exam-icon-close" type="button" aria-label="Close exam editor" disabled={busy} onClick={closeEditor}><X aria-hidden="true" /></button></header>
    {error && <div className="exam-error" role="alert">{error}</div>}
    {saveError && <div className="exam-error" role="alert">{saveError}</div>}
    {initial && <p className="exam-history-note">Historical academic years remain editable when your role has edit access.</p>}
    <form onSubmit={submit}>
      <div className="exam-dialog-body exam-setup-fields">
      <div className="exam-form-grid">
        <label>Exam name<input autoFocus={!readOnly} maxLength={250} value={values.name} disabled={readOnly || busy} onChange={(event) => change('name', event.target.value)} /></label>
        <label>Category<select value={values.category} disabled={readOnly || busy} onChange={(event) => changeCategory(event.target.value as ExamCategory)}>{options.categories.length ? options.categories.map((item) => <option value={item.value} key={item.value}>{item.label}</option>) : Object.entries(categoryNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>Campus<select value={values.campusId} disabled={readOnly || busy || Boolean(initial)} onChange={(event) => { change('campusId', event.target.value); change('classSectionIds', []) }}><option value="">Choose campus</option>{options.campuses.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Academic year<select value={values.academicYearId} disabled={readOnly || busy || Boolean(initial)} onChange={(event) => { change('academicYearId', event.target.value); change('classSectionIds', []) }}><option value="">Choose academic year</option>{options.academicYears.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </div>
      <fieldset className="exam-section-picker" disabled={readOnly || busy || choicesLoading}><legend>Class sections <span>{values.classSectionIds.length} selected</span></legend>
        {values.category === 'CLASS_TEST' && <p>A class test can include multiple sections within one grade.</p>}
        {selectionError && <p className="exam-field-error" role="alert">{selectionError}</p>}
        {choicesLoading ? <ExamLoadingSkeleton label="Loading authorized sections" kind="sections" /> : selectedSections.length === 0 ? <p>No authorized sections exist for this campus and year. Choose another scope or ask your administrator to configure classes.</p> : <>
          <label className="exam-group-filter">Show grade<select value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}><option value="">All grades</option>{Object.keys(grouped).map((name) => <option key={name}>{name}</option>)}</select></label>
          <div className="exam-section-bulk" role="group" aria-label="Bulk class section selection">
            <span>{visibleSections.filter((section) => values.classSectionIds.includes(section.id)).length} of {visibleSections.length} visible sections selected</span>
            <button className="exam-secondary" type="button" disabled={!classTestBulkReady || !visibleSections.length || visibleSections.every((section) => values.classSectionIds.includes(section.id))} onClick={() => toggleVisibleSections(true)}>Select all sections</button>
            <button className="exam-secondary" type="button" disabled={!visibleSections.some((section) => values.classSectionIds.includes(section.id))} onClick={() => toggleVisibleSections(false)}>Deselect all</button>
          </div>
          {values.category === 'CLASS_TEST' && !selectedGroup && <p className="exam-selection-help">Choose one grade to select all its sections for a class test.</p>}
          <div className="exam-section-groups">{visibleGroups.map(([name, sections]) => <section key={name}><h3>{name}</h3><label className="exam-check exam-select-all"><input type="checkbox" checked={sections.length > 0 && sections.every((item) => values.classSectionIds.includes(item.id))} onChange={(event) => selectGroup(name, event.target.checked)} /><span>Select all in {name}</span></label>{sections.map((section) => <label className="exam-check" key={section.id}><input type="checkbox" checked={values.classSectionIds.includes(section.id)} onChange={() => toggleSection(section.id)} /><span>{section.gradeName ? `${section.gradeName} ` : ''}{section.sectionName ?? section.name}</span></label>)}</section>)}</div>
        </>}
      </fieldset>
      <button className="exam-expand" type="button" aria-expanded={advanced} onClick={() => setAdvanced((value) => !value)}>{advanced ? 'Hide' : 'Show'} optional schedule and instructions</button>
      {advanced && <section className="exam-optional-section" aria-label="Optional schedule and instructions"><h3>Optional setup</h3><div className="exam-form-grid exam-optional">
        <label>Term<select value={values.termId} disabled={readOnly || busy} onChange={(event) => change('termId', event.target.value)}><option value="">No term</option>{choiceOptions.terms.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Coordinator<select value={values.coordinatorId} disabled={readOnly || busy} onChange={(event) => change('coordinatorId', event.target.value)}><option value="">No coordinator</option>{choiceOptions.coordinators.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Start date<input type="date" value={values.startsOn} disabled={readOnly || busy} onChange={(event) => change('startsOn', event.target.value)} /></label>
        <label>End date<input type="date" value={values.endsOn} disabled={readOnly || busy} onChange={(event) => change('endsOn', event.target.value)} /></label>
        <label className="exam-wide">Instructions<textarea rows={4} maxLength={10000} value={values.instructions} disabled={readOnly || busy} onChange={(event) => change('instructions', event.target.value)} /><small>{values.instructions.length}/10000 characters</small></label>
      </div></section>}
      </div>
      <footer className="exam-dialog-footer">{dirty && !readOnly && <span>Unsaved changes</span>}{!readOnly && <button className="exam-secondary" type="button" disabled={busy} onClick={closeEditor}>Cancel</button>}{!readOnly && <button className="exam-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : source ? 'Create duplicate draft' : 'Save draft'}</button>}</footer>
    </form>
  </section><ConfirmationDialog open={confirmDiscard} title="Discard unsaved changes?" consequence="Your changes to this exam draft will be lost." confirmLabel="Discard changes" onConfirm={onClose} onCancel={() => setConfirmDiscard(false)} /></div>
}
