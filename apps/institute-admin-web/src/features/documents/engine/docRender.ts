/** Assembles full printable documents from layout JSON v2 + DocumentData.
 *  Deterministic mm geometry: pagination math is pure and unit-tested; the same
 *  numbers drive the editor preview, so what you see is what prints. */

import { ELEMENT_CSS, escapeHtml, renderElementInner, safeColor, type RenderContext } from './renderHtml'
import { PAGE_SIZES_MM, type CanvasElement, type DocumentData, type LayoutV2, type TableElement } from './types'

/** Coerce untrusted geometry to a finite number before interpolating into CSS. */
const mm = (n: unknown): number => (Number.isFinite(n) ? (n as number) : 0)

/** Deterministic per-row height estimate in mm (fontSize is px). */
export function tableRowMm(fontSizePx: number): number {
  const size = Number.isFinite(fontSizePx) ? fontSizePx : 10
  return size * 0.35 + 3.2
}

export function tableRowsPerPage(fontSizePx: number, availableMm: number): number {
  return Math.max(1, Math.floor((availableMm - tableRowMm(fontSizePx)) / tableRowMm(fontSizePx)))
}

export interface PlacedElement { element: CanvasElement; y: number }
export interface PagePlan { elements: PlacedElement[]; rowRange?: [number, number]; tableY?: number }

type Zone = 'header' | 'footer' | 'body'

function zoneOf(element: CanvasElement, layout: LayoutV2): Zone {
  const { h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  if (layout.zones.headerMm > 0 && element.y < layout.zones.headerMm) return 'header'
  if (layout.zones.footerMm > 0 && element.y + element.h > pageH - layout.zones.footerMm) return 'footer'
  return 'body'
}

/** Plan the physical pages for ONE layout page (grow-and-push around its table). */
export function paginateLayout(layout: LayoutV2, pageIndex: number, rowCount: number): PagePlan[] {
  const elements = layout.pages[pageIndex].elements
  const { h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  const table = elements.find((element): element is TableElement => element.type === 'table')
  const headerEls = elements.filter((element) => zoneOf(element, layout) === 'header')
  const footerEls = elements.filter((element) => zoneOf(element, layout) === 'footer')
  const place = (list: CanvasElement[]): PlacedElement[] => list.map((element) => ({ element, y: element.y }))
  const firstPageHeader = layout.zones.hideHeaderOnFirstPage ? [] : headerEls

  if (!table) {
    return [{ elements: place(elements.filter((element) => layout.zones.hideHeaderOnFirstPage ? zoneOf(element, layout) !== 'header' : true)) }]
  }

  const bodyEls = elements.filter((element) => element !== table && zoneOf(element, layout) === 'body')
  const aboveOrBeside = bodyEls.filter((element) => element.y < table.y + table.h)
  const below = bodyEls.filter((element) => element.y >= table.y + table.h)

  const rowMm = tableRowMm(table.style.fontSize)
  const headerRowMm = rowMm
  const bottomLimit = pageH - Math.max(layout.zones.footerMm, layout.page.marginMm)
  const firstAvail = bottomLimit - table.y - headerRowMm
  const firstCapacity = Math.max(1, Math.floor(firstAvail / rowMm))

  if (rowCount <= firstCapacity) {
    // Single page: grow-and-push within the page.
    const naturalMm = headerRowMm + rowCount * rowMm
    const delta = Math.max(0, naturalMm - table.h)
    return [{
      elements: [
        ...place(firstPageHeader), ...place(footerEls), ...place(aboveOrBeside),
        { element: table, y: table.y },
        ...below.map((element) => ({ element, y: element.y + delta })),
      ],
      rowRange: [0, rowCount],
      tableY: table.y,
    }]
  }

  const plans: PagePlan[] = []
  const contTableY = Math.max(layout.zones.headerMm, layout.page.marginMm) + 4
  const contCapacity = Math.max(1, Math.floor((bottomLimit - contTableY - headerRowMm) / rowMm))
  let consumed = 0
  let pageNo = 0
  while (consumed < rowCount) {
    const isFirst = pageNo === 0
    const capacity = isFirst ? firstCapacity : contCapacity
    const take = Math.min(capacity, rowCount - consumed)
    const tableY = isFirst ? table.y : contTableY
    const isLast = consumed + take >= rowCount
    const repeatedHeader = isFirst ? firstPageHeader : (layout.zones.repeatHeader ? headerEls : [])
    const repeatedFooter = isFirst ? footerEls : (layout.zones.repeatFooter ? footerEls : [])
    const pageElements: PlacedElement[] = [
      ...place(repeatedHeader), ...place(repeatedFooter),
      ...(isFirst ? place(aboveOrBeside) : []),
      { element: table, y: tableY },
    ]
    if (isLast) {
      const tableEnd = tableY + tableRowMm(table.style.fontSize) + take * rowMm
      const designBottom = table.y + table.h
      pageElements.push(...below.map((element) => ({ element, y: tableEnd + (element.y - designBottom) })))
    }
    plans.push({ elements: pageElements, rowRange: [consumed, consumed + take], tableY })
    consumed += take
    pageNo += 1
  }
  return plans
}

export interface RenderDocumentOptions {
  layout: LayoutV2
  data: DocumentData
  mode: 'print' | 'preview'
  sampleMode?: boolean
}

export function renderDocumentHtml({ layout, data, mode, sampleMode = true }: RenderDocumentOptions): string {
  const { w: pageW, h: pageH } = PAGE_SIZES_MM[layout.page.sizeId]
  const table = layout.pages.flatMap((page) => page.elements).find((element): element is TableElement => element.type === 'table')
  const ctx: RenderContext = {
    data, sampleMode, highlightTokens: false,
    table: table ? { columns: table.columns, rows: data.rows } : null,
  }
  const background = typeof layout.page.background === 'string'
    ? `background:${safeColor(layout.page.background, '#FFFFFF')}`
    : `background-image:url('${escapeHtml(layout.page.background.imageUrl)}');background-size:cover`
  const watermark = layout.watermark.enabled
    ? (layout.watermark.mode === 'text'
      ? `<div class="doc-watermark"><span style="opacity:${Math.min(Math.max(mm(layout.watermark.opacity), 0.02), 0.4)}">${escapeHtml(layout.watermark.text)}</span></div>`
      : `<div class="doc-watermark"><img src="${escapeHtml(layout.watermark.imageUrl)}" style="opacity:${Math.min(Math.max(mm(layout.watermark.opacity) * 4, 0.05), 0.6)}" alt="" /></div>`)
    : ''

  const sheets: string[] = []
  layout.pages.forEach((_page, pageIndex) => {
    const plans = paginateLayout(layout, pageIndex, data.rows.length)
    plans.forEach((plan) => {
      const inner = plan.elements.map(({ element, y }) => {
        const content = element.type === 'table' && plan.rowRange
          ? renderElementInner(element, { ...ctx, data: { ...data, rows: data.rows.slice(plan.rowRange[0], plan.rowRange[1]) } })
          : renderElementInner(element, ctx)
        return `<div class="doc-el" style="left:${mm(element.x)}mm;top:${mm(y)}mm;width:${mm(element.w)}mm;${element.type === 'table' || element.type === 'totals' ? '' : `height:${mm(element.h)}mm;`}">${content}</div>`
      }).join('')
      sheets.push(`<div class="doc-sheet" style="${background}">${watermark}${inner}</div>`)
    })
  })

  const previewCss = mode === 'preview'
    ? 'body{background:#F3F5F8;padding:12px}.doc-sheet{box-shadow:0 2px 14px rgba(22,33,46,.18);margin:0 auto 12px}'
    : 'body{margin:0}.doc-sheet{page-break-after:always}.doc-sheet:last-child{page-break-after:auto}'

  return `<!doctype html><html><head><meta charset="utf-8" /><title>Document</title><style>
@page{size:${pageW}mm ${pageH}mm;margin:0}
*{box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,sans-serif;color:#16212E}
.doc-sheet{width:${pageW}mm;height:${pageH}mm;position:relative;overflow:hidden}
.doc-el{position:absolute}
.doc-watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;overflow:hidden}
.doc-watermark span{font-size:64px;font-weight:800;color:#173A5E;transform:rotate(-28deg);white-space:nowrap}
.doc-watermark img{max-width:60%;max-height:60%;transform:rotate(-20deg);object-fit:contain}
${ELEMENT_CSS}
${previewCss}
</style></head><body>${sheets.join('')}</body></html>`
}

/** Popup + print — same pattern as the finance renderer it replaces. */
export function openPrintWindow(html: string): boolean {
  const popup = window.open('', '_blank', 'width=900,height=900')
  if (!popup) return false
  popup.opener = null
  popup.document.write(html.replace('</body>', "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body>"))
  popup.document.close()
  return true
}
