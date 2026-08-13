import { describe, expect, it } from 'vitest'
import { paginateLayout, renderDocumentHtml, tableRowsPerPage } from './docRender'
import { sampleDocumentData } from './datasets'
import { defaultLayout, type LayoutV2, type TableElement, type TextElement } from './types'
import { FEE_ITEMS_DATASET } from './datasets'

const text = (id: string, y: number, content = 'x'): TextElement => ({
  id, type: 'text', x: 10, y, w: 100, h: 8, content,
  style: { fontSize: 10, bold: false, italic: false, align: 'left', color: '#16212E' },
})
const table = (y = 80, h = 40): TableElement => ({
  id: 'tbl', type: 'table', x: 10, y, w: 190, h, datasetId: 'fee_items',
  columns: FEE_ITEMS_DATASET.columns,
  style: { headerBg: '#173A5E', headerColor: '#FFFFFF', fontSize: 10 },
})

function layoutWith(elements: LayoutV2['pages'][0]['elements'], zones?: Partial<LayoutV2['zones']>): LayoutV2 {
  const layout = defaultLayout('A4P')
  layout.pages[0].elements = elements
  layout.zones = { ...layout.zones, headerMm: 30, footerMm: 15, repeatHeader: true, repeatFooter: true, ...zones }
  return layout
}

describe('paginateLayout', () => {
  it('keeps everything on one page when the table fits', () => {
    const layout = layoutWith([text('h1', 5), table(), text('below', 130)])
    const data = sampleDocumentData('FEE_INVOICE') // 2 rows
    const plans = paginateLayout(layout, 0, data.rows.length)
    expect(plans).toHaveLength(1)
    expect(plans[0].rowRange).toEqual([0, 2])
  })

  it('splits rows across pages and pushes below-band elements to the last page', () => {
    const layout = layoutWith([text('h1', 5), table(80, 40), text('below', 130)])
    const plans = paginateLayout(layout, 0, 200)
    expect(plans.length).toBeGreaterThan(1)
    const last = plans[plans.length - 1]
    expect(last.elements.some((placed) => placed.element.id === 'below')).toBe(true)
    expect(plans[0].elements.some((placed) => placed.element.id === 'below')).toBe(false)
    const covered = plans.reduce((sum, plan) => sum + (plan.rowRange ? plan.rowRange[1] - plan.rowRange[0] : 0), 0)
    expect(covered).toBe(200)
  })

  it('repeats header elements on continuation pages unless hidden on first', () => {
    const layout = layoutWith([text('h1', 5), table(80, 40)], { hideHeaderOnFirstPage: true })
    const plans = paginateLayout(layout, 0, 200)
    expect(plans[0].elements.some((placed) => placed.element.id === 'h1')).toBe(false)
    expect(plans[1].elements.some((placed) => placed.element.id === 'h1')).toBe(true)
  })

  it('grow-and-push shifts a below element down when the table grows within one page', () => {
    const layout = layoutWith([table(80, 20), text('below', 105)])
    const plans = paginateLayout(layout, 0, 8) // 8 rows won't fit 20mm design height but fit the page
    const below = plans[0].elements.find((placed) => placed.element.id === 'below')!
    expect(below.y).toBeGreaterThan(105)
  })
})

describe('renderDocumentHtml', () => {
  it('emits mm-positioned sheets with @page sizing and escaped tokens', () => {
    const layout = layoutWith([text('t', 40, 'Hello {{student_name}}')])
    const data = sampleDocumentData('FEE_INVOICE')
    data.tokens.student_name = '<script>alert(1)</script>'
    const html = renderDocumentHtml({ layout, data, mode: 'print' })
    expect(html).toContain('@page{size:210mm 297mm')
    expect(html).toContain('left:10mm')
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
  })

  it('coerces non-finite geometry to safe numbers', () => {
    const attacker = text('t', 40, 'hi')
    attacker.x = '0mm" onmouseover="alert(1)' as unknown as number
    const layout = layoutWith([attacker])
    const html = renderDocumentHtml({ layout, data: sampleDocumentData('FEE_INVOICE'), mode: 'print' })
    expect(html).not.toContain('onmouseover')
    expect(html).toContain('left:0mm')
  })

  it('renders all table rows when fontSize is non-finite', () => {
    const tbl = table()
    tbl.style.fontSize = NaN
    const layout = layoutWith([tbl])
    const data = sampleDocumentData('FEE_INVOICE')
    const html = renderDocumentHtml({ layout, data, mode: 'print' })
    for (const row of data.rows) {
      expect(html).toContain(String(row.c1))
    }
  })

  it('renders two sheets for a CR80 two-page layout and a watermark when enabled', () => {
    const layout = defaultLayout('CR80', 2)
    layout.pages[0].elements = [text('f', 10, 'front')]
    layout.pages[1].elements = [text('b', 10, 'back')]
    layout.watermark = { enabled: true, mode: 'text', text: 'SAMPLE', imageUrl: '', opacity: 0.1 }
    const html = renderDocumentHtml({ layout, data: sampleDocumentData('ID_CARD'), mode: 'print' })
    expect(html.match(/class="doc-sheet"/g)).toHaveLength(2)
    expect(html).toContain('@page{size:86mm 54mm')
    expect(html).toContain('doc-watermark')
  })
})

describe('tableRowsPerPage', () => {
  it('is deterministic and positive', () => {
    expect(tableRowsPerPage(10, 100)).toBeGreaterThan(0)
    expect(tableRowsPerPage(10, 100)).toBe(tableRowsPerPage(10, 100))
  })
})
