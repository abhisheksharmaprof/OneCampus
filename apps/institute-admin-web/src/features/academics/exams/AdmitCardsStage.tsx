import type { LayoutV3 } from '@campusone/document-engine'
import { useEffect, useMemo, useState } from 'react'
import { getExamAdmitCardCandidates, type ExamAdmitCardRoster, type ExamAdmitCardStudent } from './exams.api'
import { listDocumentTemplates, type DocumentTemplateRecord } from '../../documents/documents.api'
import { renderDocumentHtml } from '../../documents/engine/docRender'
import { prepareQrDataUrls } from '../../documents/engine/qrPayload'
import { PAGE_SIZES_MM, type DocumentData, type LayoutV2, type PageSizeId } from '../../documents/engine/types'
import { fetchInstituteBranding, type InstituteBranding } from '../../finance/finance.api'
import './admit-cards.css'

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
const time = (value: string) => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''

export function AdmitCardsStage({ accessToken, examId, examName, onBack }: { accessToken: string; examId: string; examName: string; onBack: () => void }) {
  const [roster, setRoster] = useState<ExamAdmitCardRoster | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [className, setClassName] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [preview, setPreview] = useState<ExamAdmitCardStudent | null>(null)
  const [showPrintPreview, setShowPrintPreview] = useState(false)
  const [title, setTitle] = useState('EXAMINATION ADMIT CARD')
  const [reportingTime, setReportingTime] = useState('08:15')
  const [centre, setCentre] = useState('')
  const [instructions, setInstructions] = useState('Candidates must bring this admit card to every examination. Reach the centre before the reporting time.')
  const [perSheet, setPerSheet] = useState<1 | 2 | 4>(1)
  const [templates, setTemplates] = useState<DocumentTemplateRecord[]>([])
  const [templateId, setTemplateId] = useState('')
  const [templatePreview, setTemplatePreview] = useState('')
  const [batchTemplatePreview, setBatchTemplatePreview] = useState('')
  const [templateError, setTemplateError] = useState('')
  const [branding, setBranding] = useState<InstituteBranding | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError('')
    getExamAdmitCardCandidates(accessToken, examId, controller.signal).then((data) => {
      setRoster(data); setSelected(data.students.map((student) => student.id))
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Could not load exam candidates.') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [accessToken, examId])

  useEffect(() => {
    const controller = new AbortController()
    listDocumentTemplates(accessToken, 'ADMIT_CARD', controller.signal).then((data) => setTemplates(data.items.filter((template) => template.publishedVersion)))
      .catch((cause: unknown) => { if (!controller.signal.aborted) setTemplateError(cause instanceof Error ? cause.message : 'Could not load published admit-card templates.') })
    return () => controller.abort()
  }, [accessToken])

  useEffect(() => {
    const controller = new AbortController()
    fetchInstituteBranding(accessToken, controller.signal).then(setBranding).catch(() => setBranding(null))
    return () => controller.abort()
  }, [accessToken])


  const orderedStudents = useMemo(() => [...(roster?.students ?? [])].sort((left, right) => {
    const grade = (value: string) => value.match(/^(Nursery|LKG|UKG|Class\s+\d+)/i)?.[1] ?? value
    return grade(left.className).localeCompare(grade(right.className), undefined, { numeric: true }) || left.className.localeCompare(right.className) || left.rollNumber.localeCompare(right.rollNumber, undefined, { numeric: true })
  }), [roster])
  const classes = useMemo(() => [...new Set(orderedStudents.map((student) => student.className))], [orderedStudents])
  const visible = useMemo(() => orderedStudents.filter((student) => (!className || student.className === className) && (!search || `${student.name} ${student.admissionNumber} ${student.rollNumber}`.toLowerCase().includes(search.toLowerCase()))), [orderedStudents, className, search])
  const selectedTemplate = templates.find((template) => template.id === templateId)?.publishedVersion ?? null
  const activePreviewStudent = preview ?? roster?.students.find((student) => selected.includes(student.id)) ?? roster?.students[0] ?? null
  const selectedCandidates = orderedStudents.filter((student) => selected.includes(student.id))
  const previewSheetCandidates = selectedCandidates.slice(0, perSheet)
  // shortcut: 8 subjects is a conservative readability warning threshold; replace with measured layout bounds when the PDF renderer exposes overflow diagnostics.
  const crowdedFourUpCandidates = perSheet === 4 ? selectedCandidates.filter((student) => student.subjects.length > 8) : []
  const crowdedFourUpCount = crowdedFourUpCandidates.length
  useEffect(() => {
    let current = true
    if (!selectedTemplate || !activePreviewStudent || !roster) { setTemplatePreview(''); return }
    const data = admitCardData(activePreviewStudent, roster, { centre, reportingTime, instructions, title }, branding)
    void prepareQrDataUrls(selectedTemplate.layout, data).catch(() => ({})).then((qrDataUrls) => {
      if (current) setTemplatePreview(renderDocumentHtml({ layout: selectedTemplate.layout, data: { ...data, qrDataUrls }, mode: 'preview' }))
    })
    return () => { current = false }
  }, [selectedTemplate, activePreviewStudent, roster, centre, reportingTime, instructions, title, branding])
  useEffect(() => {
    let current = true
    if (!showPrintPreview || !selectedTemplate || !roster) { setBatchTemplatePreview(''); return }
    const students = selectedCandidates.slice(0, perSheet)
    void buildTemplateSheetPreview(selectedTemplate.layout, students.map((student) => admitCardData(student, roster, { centre, reportingTime, instructions, title }, branding)), perSheet)
      .then((html) => { if (current) setBatchTemplatePreview(html) })
      .catch((cause: unknown) => { if (current) setBatchTemplatePreview(`<div class="batch-error">${esc(cause instanceof Error ? cause.message : 'This schedule does not fit on one card. Reduce cards per page or adjust the design.')}</div>`) })
    return () => { current = false }
  }, [showPrintPreview, selectedTemplate, roster, selectedCandidates, perSheet, centre, reportingTime, instructions, title, branding])
  const toggle = (id: string, checked: boolean) => setSelected((current) => checked ? [...new Set([...current, id])] : current.filter((item) => item !== id))
  const selectVisible = (checked: boolean) => setSelected((current) => checked ? [...new Set([...current, ...visible.map((student) => student.id)])] : current.filter((id) => !visible.some((student) => student.id === id)))

  const print = () => {
    if (!roster || selected.length === 0) return
    if (selected.length > 300) { setError('Print at most 300 cards per batch to keep the browser responsive. Filter or select a smaller group.'); return }
    setError('')
  const candidates = orderedStudents.filter((student) => selected.includes(student.id))
    if (selectedTemplate) {
      const popup = window.open('', '_blank', 'width=900,height=900')
      if (!popup) { setError('The print window was blocked. Allow popups and try again.'); return }
      const build = async () => {
        const cards: string[] = []
        let styles = ''
        for (const student of candidates) {
          const data = admitCardData(student, roster, { centre, reportingTime, instructions, title }, branding)
          const qrDataUrls = await prepareQrDataUrls(selectedTemplate.layout, data)
          const html = renderDocumentHtml({ layout: selectedTemplate.layout, data: { ...data, qrDataUrls }, mode: 'print' })
          const parsed = new DOMParser().parseFromString(html, 'text/html')
          styles ||= parsed.head.querySelector('style')?.textContent ?? ''
          const sheets = Array.from(parsed.querySelectorAll('.doc-sheet'))
          if (sheets.length !== 1) throw new Error(`${student.name}'s schedule does not fit on one card. Reduce the cards per page or adjust the template.`)
          cards.push(sheets[0].outerHTML)
        }
        const html = composeTemplateSheet(cards, styles, selectedTemplate.layout.page.sizeId, perSheet)
        popup.onload = () => { const images = Array.from(popup.document.images); void Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => popup.print()) }
        popup.document.write(html.replace('<title>Admit card preview</title>', `<title>${esc(roster.examName)} admit cards</title>`))
        popup.document.close(); popup.focus()
      }
      void build().catch((cause: unknown) => { popup.close(); setError(cause instanceof Error ? cause.message : 'Could not prepare admit cards from this template.') })
      return
    }
    const pages: string[] = []
    const groupSize = perSheet
    const cardClass = perSheet === 1 ? 'one-up' : perSheet === 2 ? 'two-up' : 'four-up'
    for (let index = 0; index < candidates.length; index += groupSize) {
      pages.push(`<section class="sheet ${cardClass}">${candidates.slice(index, index + groupSize).map((student) => cardHtml(student, roster, { title, reportingTime, centre, instructions })).join('')}</section>`)
    }
    const popup = window.open('', '_blank', 'width=900,height=900')
    if (!popup) { setError('The print window was blocked. Allow popups and try again.'); return }
    popup.onload = () => { const images = Array.from(popup.document.images); void Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => popup.print()) }
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(roster.examName)} admit cards</title><style>
      @page{size:A4 portrait;margin:8mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#142d44}.sheet{height:281mm;break-after:page;display:grid;gap:5mm}.sheet:last-child{break-after:auto}.one-up{grid-template-columns:1fr;grid-template-rows:1fr}.two-up{grid-template-columns:1fr;grid-template-rows:1fr 1fr}.four-up{grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr}.admit-card{border:1px solid #234a6a;padding:7mm;overflow:hidden;display:flex;flex-direction:column;gap:4mm}.admit-brand{text-align:center;background:#173a5e;color:white;padding:4mm;font-size:16pt;font-weight:700}.admit-title{text-align:center;font-size:12pt;font-weight:bold;color:#173a5e}.admit-photo{float:right;width:23mm;height:29mm;object-fit:cover;border:1px solid #b6c4d0}.candidate{display:grid;grid-template-columns:1fr 1fr;gap:2mm 4mm;padding:3mm;background:#f3f7fa}.papers{width:100%;border-collapse:collapse;font-size:9pt}.papers th,.papers td{border:1px solid #cbd5df;padding:2mm;text-align:left}.papers th{background:#eaf0f5}.instructions{font-size:9pt;line-height:1.35}.signature{margin-top:auto;text-align:right;border-top:1px solid #8293a2;padding-top:2mm;font-size:9pt}@media print{.admit-card{break-inside:avoid}}\n+      </style></head><body>${pages.join('')}</body></html>`)
    popup.document.close(); popup.focus()
  }

  const allVisibleSelected = visible.length > 0 && visible.every((student) => selected.includes(student.id))
  return <section className="exam-card admit-stage" aria-labelledby="admit-stage-title" aria-busy={loading}>
    <header className="admit-stage-head"><div><span className="exam-eyebrow">POST-PUBLISH · REVISION {roster?.revision ?? '—'}</span><h2 id="admit-stage-title">Admit cards · {examName}</h2><p>Cards use each student’s assigned papers from the published timetable. Select candidates, review the print settings, then print or save as PDF.</p></div><button type="button" className="exam-secondary" onClick={onBack}>Back to exam</button></header>
    {error && <div className="exam-error" role="alert">{error}<button type="button" onClick={() => { setRoster(null); setLoading(true); setError(''); getExamAdmitCardCandidates(accessToken, examId).then(setRoster).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : 'Could not load exam candidates.')).finally(() => setLoading(false)) }}>Retry</button></div>}
    {loading && <p role="status">Loading eligible candidates…</p>}
    {!loading && roster && <>
      <div className="admit-summary"><strong>{roster.students.length}</strong><span>eligible candidates</span><strong>{selected.length}</strong><span>selected</span><strong>{classes.length}</strong><span>classes</span></div>
      {error && <div className="exam-error admit-stage-error" role="alert">{error}</div>}
      <div className="admit-columns"><div className="admit-roster">
        <div className="admit-filters"><label>Class/section<select value={className} onChange={(event) => setClassName(event.target.value)}><option value="">All classes</option>{classes.map((item) => <option key={item}>{item}</option>)}</select></label><label>Search candidates<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, admission or roll number" /></label></div>
        <label className="admit-select-all"><input type="checkbox" checked={allVisibleSelected} onChange={(event) => selectVisible(event.target.checked)} /> Select visible ({visible.length})</label>
        <div className="admit-student-list">{visible.map((student) => <div className="admit-student-row" key={student.id}><input aria-label={`Select ${student.name}`} type="checkbox" checked={selected.includes(student.id)} onChange={(event) => toggle(student.id, event.target.checked)} /><span><strong>{student.name}</strong><small>{student.className} · Roll {student.rollNumber || 'Not assigned'} · {student.subjects.length} papers</small></span><button type="button" className="admit-preview-link" onClick={() => setPreview(student)}>Preview</button></div>)}{visible.length === 0 && <p className="admit-empty">No candidates match these filters.</p>}</div>
      </div><aside className="admit-settings"><h3>Card & print setup</h3>{templates.length > 0 && <label>Published card design<select value={templateId} onChange={(event) => { setTemplateId(event.target.value) }}><option value="">CampusOne standard card</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.publishedVersion!.name} · v{template.publishedVersion!.version}</option>)}</select></label>}<a className="admit-template-link" href="/template-studio">Manage admit-card designs in Template Studio</a>{templateError && <p className="admit-settings-note" role="status">{templateError}</p>}<label>Card title<input value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Reporting time<input type="time" value={reportingTime} onChange={(event) => setReportingTime(event.target.value)} /></label><label>Examination centre<input value={centre} onChange={(event) => setCentre(event.target.value)} placeholder="Enter centre name" /></label><label>Instructions<textarea rows={4} value={instructions} onChange={(event) => setInstructions(event.target.value)} /></label><label>Cards per A4 sheet<select value={perSheet} onChange={(event) => setPerSheet(Number(event.target.value) as 1 | 2 | 4)}><option value={1}>1 · Full page</option><option value={2}>2 · Half page</option><option value={4}>4 · Quarter page</option></select></label><p className="admit-settings-note">Four cards per sheet may make long schedules small. Print in batches of 300 or fewer cards.</p><button type="button" className="exam-primary" disabled={!selected.length || selected.length > 300} onClick={() => { setPreview(null); setShowPrintPreview(true) }}>Preview before printing · {selected.length}</button></aside></div>
    </>}
    {(preview || showPrintPreview) && roster && <div className="admit-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) { setPreview(null); setShowPrintPreview(false) } }}><section className="admit-preview-dialog" role="dialog" aria-modal="true" aria-label={showPrintPreview ? 'Print preview' : `Admit card preview for ${preview?.name ?? ''}`}><div className="admit-preview-toolbar"><strong>{showPrintPreview ? `Print preview · ${selected.length} cards` : `Candidate preview · ${preview?.name}`}</strong>{showPrintPreview && <span>{perSheet} card{perSheet === 1 ? '' : 's'} per A4 sheet · first sheet of {Math.ceil(selected.length / perSheet)}</span>}<button className="exam-secondary" type="button" onClick={() => { setPreview(null); setShowPrintPreview(false) }}>Close</button></div>{showPrintPreview && crowdedFourUpCount > 0 && <div className="admit-overflow-warning" role="alert"><strong>Some cards may be difficult to read at four per page.</strong><span>{crowdedFourUpCandidates.slice(0, 5).map((student) => `${student.name} (${student.className})`).join(' · ')}{crowdedFourUpCount > 5 ? ` · and ${crowdedFourUpCount - 5} more` : ''} have more than 8 exam papers. Review the sheet below, change the number of cards per page if needed, or continue with four per page.</span></div>}{selectedTemplate && showPrintPreview && batchTemplatePreview ? <iframe className="admit-template-preview" title="Published admit-card batch preview" srcDoc={batchTemplatePreview} sandbox="" /> : showPrintPreview && selectedTemplate ? <p role="status">Preparing sheet preview…</p> : selectedTemplate && templatePreview ? <iframe className="admit-template-preview" title="Published admit-card design preview" srcDoc={templatePreview} sandbox="" /> : showPrintPreview ? <div className={`admit-preview-sheet preview-${perSheet}`}>{previewSheetCandidates.map((student) => <PreviewCard key={student.id} student={student} roster={roster} title={title} reportingTime={reportingTime} centre={centre} instructions={instructions} />)}</div> : preview ? <div className="admit-preview-sheet preview-1"><PreviewCard student={preview} roster={roster} title={title} reportingTime={reportingTime} centre={centre} instructions={instructions} /></div> : null}{showPrintPreview && <div className="admit-preview-actions"><button className="exam-secondary" type="button" onClick={() => { setShowPrintPreview(false); setPreview(null) }}>Back to setup</button><button className="exam-primary" type="button" onClick={print}>{crowdedFourUpCount > 0 ? 'Continue with four per page' : `Print / Save ${selected.length} cards`}</button></div>}{preview && <div className="admit-preview-actions"><button className="exam-secondary" type="button" onClick={() => { setSelected([preview.id]); setPreview(null) }}>Select this candidate</button><button className="exam-primary" type="button" onClick={() => { setShowPrintPreview(true); setPreview(null) }}>Review print batch</button></div>}</section></div>}
  </section>
}

function admitCardData(student: ExamAdmitCardStudent, roster: ExamAdmitCardRoster, config: { centre: string; reportingTime: string; instructions: string; title: string }, branding: InstituteBranding | null): DocumentData {
  const format = (date: string) => date ? new Date(`${date}T00:00:00`).toLocaleDateString() : ''
  return {
    category: 'ADMIT_CARD',
    tokens: { student_name: student.name, student_id: student.admissionNumber, class_section: student.className, roll_no: student.rollNumber, guardian_name: student.fatherName, admit_card_title: config.title, exam_name: roster.examName, academic_year: roster.academicYear, exam_instructions: config.instructions, exam_center: config.centre, reporting_time: time(config.reportingTime), exam_window: '', school_name: branding?.name ?? 'CampusOne', school_address: [branding?.addressLine1, branding?.addressLine2, branding?.city, branding?.state, branding?.postalCode, branding?.country].filter(Boolean).join(', '), school_phone: branding?.primaryPhone ?? '', school_email: branding?.primaryEmail ?? '', school_website: branding?.websiteUrl ?? '' },
    rows: student.subjects.map((paper) => ({ c1: paper.subject, c2: format(paper.date), c3: `${time(paper.start)}–${time(paper.end)}`, c4: paper.room || '' })),
    images: { 'institute-logo': branding?.logoUrl ?? null, 'student-photo': student.photoUrl ?? null, 'staff-photo': null },
  }
}

async function buildTemplateSheetPreview(layout: LayoutV2 | LayoutV3, data: DocumentData[], perSheet: 1 | 2 | 4) {
  const cards: string[] = []
  let styles = ''
  for (const item of data) {
    const qrDataUrls = await prepareQrDataUrls(layout, item)
    const parsed = new DOMParser().parseFromString(renderDocumentHtml({ layout, data: { ...item, qrDataUrls }, mode: 'print' }), 'text/html')
    styles ||= parsed.head.querySelector('style')?.textContent ?? ''
    const sheets = Array.from(parsed.querySelectorAll('.doc-sheet'))
    if (sheets.length !== 1) throw new Error('An exam schedule exceeds one card. Change to fewer cards per sheet or edit the template.')
    cards.push(sheets[0].outerHTML)
  }
  return composeTemplateSheet(cards, styles, layout.page.sizeId, perSheet)
}

function composeTemplateSheet(cards: string[], styles: string, sizeId: PageSizeId, perSheet: 1 | 2 | 4) {
  const { w: docW, h: docH } = PAGE_SIZES_MM[sizeId]
  const columns = perSheet === 4 ? 2 : 1
  const rows = perSheet === 1 ? 1 : 2
  const gap = perSheet === 1 ? 0 : 2
  const slotW = (194 - gap * (columns - 1)) / columns
  const slotH = (281 - gap * (rows - 1)) / rows
  const scale = Math.min(slotW / docW, slotH / docH)
  const left = (slotW - docW * scale) / 2
  const top = (slotH - docH * scale) / 2
  const slots = cards.map((card) => `<div class="card-slot"><div class="scaled-card" style="width:${slotW}mm;height:${slotH}mm"><div class="doc-card" style="width:${docW}mm;height:${docH}mm;transform:scale(${scale});left:${left}mm;top:${top}mm">${card.replace('class="doc-sheet"', 'class="doc-card-content"')}</div></div></div>`).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>Admit card preview</title><style>${styles}
    @page{size:A4 portrait;margin:8mm}.doc-sheet{box-shadow:none!important;margin:0!important;page-break-after:auto!important}.doc-card{position:absolute;transform-origin:top left!important;overflow:hidden}
    body{margin:0;padding:8mm;background:#eef2f6}.sheet{width:194mm;height:281mm;margin:0 auto;display:grid;grid-template-columns:repeat(${columns},minmax(0,1fr));grid-template-rows:repeat(${rows},minmax(0,1fr));gap:${gap}mm;break-after:page;background:white;overflow:hidden}.sheet:last-child{break-after:auto}.card-slot{position:relative;overflow:hidden}.scaled-card{position:absolute;inset:0;overflow:hidden}.doc-card-content{position:relative!important;left:0!important;top:0!important;transform:none!important;width:100%!important;height:100%!important;box-shadow:none!important;margin:0!important}.batch-error{margin:2rem;padding:1.25rem;border:1px solid #d08b21;background:#fff8e8;color:#533900;font:16px sans-serif}@media print{body{padding:0;background:white}.sheet{margin:0}.batch-error{display:none}}
  </style></head><body><section class="sheet">${slots}</section></body></html>`
}

function cardHtml(student: ExamAdmitCardStudent, roster: ExamAdmitCardRoster, setup: { title: string; reportingTime: string; centre: string; instructions: string }) {
  const rows = student.subjects.map((paper) => `<tr><td>${esc(paper.subject)}</td><td>${esc(paper.date)}</td><td>${esc(time(paper.start))}–${esc(time(paper.end))}</td><td>${esc(paper.room || '')}</td></tr>`).join('')
  return `<article class="admit-card"><div class="admit-brand">CampusOne · ${esc(roster.academicYear)}</div><div class="admit-title">${esc(setup.title)}<br>${esc(roster.examName)}</div>${student.photoUrl ? `<img class="admit-photo" src="${esc(student.photoUrl)}" alt="Candidate photo">` : ''}<div class="candidate"><span><b>Candidate</b>: ${esc(student.name)}</span><span><b>Class</b>: ${esc(student.className)}</span><span><b>Admission no.</b>: ${esc(student.admissionNumber)}</span><span><b>Roll no.</b>: ${esc(student.rollNumber || '—')}</span><span><b>Father/Guardian</b>: ${esc(student.fatherName || '—')}</span><span><b>Reporting</b>: ${esc(time(setup.reportingTime))}</span><span><b>Centre</b>: ${esc(setup.centre || '—')}</span></div><table class="papers"><thead><tr><th>Subject</th><th>Date</th><th>Time</th><th>Room</th></tr></thead><tbody>${rows}</tbody></table><div class="instructions"><b>Instructions:</b> ${esc(setup.instructions)}</div><div class="signature">Principal / Examination authority</div></article>`
}

function PreviewCard({ student, roster, title, reportingTime, centre, instructions }: { student: ExamAdmitCardStudent; roster: ExamAdmitCardRoster; title: string; reportingTime: string; centre: string; instructions: string }) {
  return <article className="admit-preview-card"><header><strong>CampusOne</strong><span>{roster.academicYear}</span></header><h3>{title}</h3><h4>{roster.examName}</h4><dl><div><dt>Candidate</dt><dd>{student.name}</dd></div><div><dt>Class</dt><dd>{student.className}</dd></div><div><dt>Admission no.</dt><dd>{student.admissionNumber}</dd></div><div><dt>Roll no.</dt><dd>{student.rollNumber || 'Not assigned'}</dd></div><div><dt>Reporting</dt><dd>{time(reportingTime)}</dd></div><div><dt>Centre</dt><dd>{centre || 'Not specified'}</dd></div></dl><table><thead><tr><th>Subject</th><th>Date</th><th>Time</th><th>Room</th></tr></thead><tbody>{student.subjects.map((paper, index) => <tr key={`${paper.subject}-${index}`}><td>{paper.subject}</td><td>{paper.date}</td><td>{time(paper.start)}–{time(paper.end)}</td><td>{paper.room || '—'}</td></tr>)}</tbody></table><p>{instructions}</p><footer>Principal / Examination authority</footer></article>
}
