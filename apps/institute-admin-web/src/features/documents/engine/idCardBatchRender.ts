import QRCode from 'qrcode'
import type { IdCardPreflight } from '../documents.api'
import { ELEMENT_CSS, escapeHtml, renderElementInner, safeColor } from './renderHtml'
import type { DocumentData, LayoutV2 } from './types'

const CARD_WIDTH = 86
const CARD_HEIGHT = 54
const LEFT = 19
const TOP = 40.5

export function cardSlot(index: number, back: boolean) {
  const column = index % 2
  return { x: LEFT + (back ? 1 - column : column) * CARD_WIDTH, y: TOP + Math.floor(index / 2) * CARD_HEIGHT }
}

export function renderIdCardBatch(layout: LayoutV2, students: DocumentData[], mode: 'preview' | 'print' = 'preview'): string {
  const background = safeColor(layout.page.background as string, '#FFFFFF')
  const sheets: string[] = []
  for (let first = 0; first < students.length; first += 8) {
    const group = students.slice(first, first + 8)
    for (const back of [false, true]) {
      const cards = group.map((data, index) => {
        const slot = cardSlot(index, back)
        const inner = layout.pages[back ? 1 : 0].elements.map((element) => (
          `<div class="doc-el" style="left:${element.x}mm;top:${element.y}mm;width:${element.w}mm;height:${element.h}mm">${renderElementInner(element, { data, sampleMode: true, highlightTokens: false, table: null })}</div>`
        )).join('')
        const watermark = layout.watermark.enabled && layout.watermark.mode === 'text'
          ? `<div class="doc-watermark">${escapeHtml(layout.watermark.text)}</div>` : ''
        return `<div class="id-card" data-student="${escapeHtml(data.tokens.student_id)}" data-side="${back ? 'back' : 'front'}" style="left:${slot.x}mm;top:${slot.y}mm;background:${background}">${watermark}${inner}</div>`
      }).join('')
      sheets.push(`<div class="id-sheet" data-side="${back ? 'back' : 'front'}">${cards}</div>`)
    }
  }
  return `<!doctype html><html><head><meta charset="utf-8"><title>Student ID cards</title><style>
@page{size:210mm 297mm;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#16212E}
.id-sheet{position:relative;width:210mm;height:297mm;page-break-after:always;overflow:hidden;background:#fff}
.id-sheet:last-child{page-break-after:auto}
.id-card{position:absolute;width:${CARD_WIDTH}mm;height:${CARD_HEIGHT}mm;overflow:hidden}
.doc-el{position:absolute}.doc-watermark{position:absolute;inset:0;opacity:.08;display:grid;place-items:center;transform:rotate(-25deg);font-weight:800}
${ELEMENT_CSS}
${mode === 'preview' ? 'body{background:#EDF1F6}.id-sheet{margin:12px auto;box-shadow:0 2px 12px #0002}' : ''}
</style></head><body>${sheets.join('')}</body></html>`
}

export function renderCardCalibration(): string {
  const slots = Array.from({ length: 8 }, (_, index) => {
    const { x, y } = cardSlot(index, false)
    return `<div style="position:absolute;left:${x}mm;top:${y}mm;width:86mm;height:54mm;border:.25mm solid #111;font:12px Arial;padding:4mm">Slot ${index + 1} · 86 × 54 mm</div>`
  }).join('')
  return `<!doctype html><html><head><meta charset="utf-8"><title>ID card calibration</title><style>@page{size:210mm 297mm;margin:0}body{margin:0}.page{position:relative;width:210mm;height:297mm}</style></head><body><div class="page">${slots}</div></body></html>`
}

export async function prepareCardBatch(preflight: IdCardPreflight): Promise<string> {
  if (!preflight.ready || !preflight.layout) throw new Error('The batch is not ready for printing.')
  const layout = preflight.layout
  const qrElements = layout.pages.flatMap((page) => page.elements).filter((el) => el.type === 'qr')
  const students = await Promise.all(preflight.students.map(async (student) => {
    if (!student.tokens || !student.images || student.issues.length) throw new Error('A student did not pass preflight.')
    const qrDataUrls: Record<string, string> = {}
    for (const element of qrElements) {
      qrDataUrls[element.id] = await QRCode.toDataURL(student.tokens.student_id, { margin: 0, width: 256 })
    }
    return {
      category: 'ID_CARD' as const, tokens: student.tokens, rows: [],
      images: student.images, qrDataUrls,
    }
  }))
  return renderIdCardBatch(layout, students, 'print')
}
