import { describe, expect, it } from 'vitest'
import { renderElementInner, resolveContent, type RenderContext } from './renderHtml'
import { FEE_ITEMS_DATASET, sampleDocumentData } from './datasets'
import type { TableElement, TextElement, TotalsElement } from './types'

function ctx(overrides: Partial<RenderContext> = {}): RenderContext {
  const data = sampleDocumentData('FEE_INVOICE')
  data.tokens.student_name = '<b>Diya</b> & Co'
  return { data, sampleMode: true, highlightTokens: false, table: { columns: FEE_ITEMS_DATASET.columns, rows: data.rows }, ...overrides }
}

const textEl = (content: string): TextElement => ({
  id: 'e1', type: 'text', x: 0, y: 0, w: 100, h: 10, content,
  style: { fontSize: 12, bold: false, italic: false, align: 'left', color: '#16212E' },
})

describe('resolveContent', () => {
  it('escapes literal text and token values', () => {
    const html = resolveContent('<script>x</script> {{student_name}}', ctx())
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Diya&lt;/b&gt; &amp; Co')
  })

  it('shows raw tokens when sampleMode is off and blanks unknown tokens when on', () => {
    expect(resolveContent('{{student_name}}', ctx({ sampleMode: false }))).toContain('{{student_name}}')
    expect(resolveContent('{{bogus}}', ctx())).not.toContain('{{')
  })
})

describe('renderElementInner', () => {
  it('rejects malicious style colors', () => {
    const el = textEl('hi')
    el.style.color = 'red;background:url(javascript:x)' as string
    const html = renderElementInner(el, ctx())
    expect(html).not.toContain('javascript:')
  })

  it('renders table with computed formula column and #ERR isolation', () => {
    const table: TableElement = {
      id: 't1', type: 'table', x: 0, y: 0, w: 190, h: 60, datasetId: 'fee_items',
      columns: [...FEE_ITEMS_DATASET.columns, { id: 'c9', label: 'Bad', type: 'formula', formula: '=[Nope]', widthPct: 10, align: 'left' }],
      style: { headerBg: '#173A5E', headerColor: '#FFFFFF', fontSize: 10 },
    }
    const html = renderElementInner(table, ctx())
    expect(html).toContain('15,000.00')  // 1 × 15000 computed Amount
    expect(html).toContain('#ERR')
  })

  it('renders totals with SUM_TABLE and row refs', () => {
    const totals: TotalsElement = {
      id: 'to1', type: 'totals', x: 0, y: 0, w: 70, h: 30, datasetId: 'fee_items',
      rows: [
        { id: 'r1', label: 'Subtotal', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
        { id: 'r2', label: 'Grand total', kind: 'formula', formula: '=[Subtotal]', emphasize: true },
      ],
    }
    const html = renderElementInner(totals, ctx())
    expect(html).toContain('18,000.00')
    expect(html).toContain('Grand total')
  })

  it('renders qr placeholder without a data url and img with one', () => {
    const qr = { id: 'q1', type: 'qr' as const, x: 0, y: 0, w: 22, h: 22, encode: 'verify-url' as const }
    expect(renderElementInner(qr, ctx())).toContain('doc-qr-placeholder')
    const withUrl = ctx()
    withUrl.data.qrDataUrls = { q1: 'data:image/png;base64,AAA' }
    expect(renderElementInner(qr, withUrl)).toContain('<img')
  })
})
