import { describe, expect, it } from 'vitest'
import { buildRenderPlan, convertLegacyLayout, normalizeLayout, renderDocumentHtml } from '@campusone/document-engine'

describe('normalizeLayout', () => {
  it('accepts a v3 layout with multiple tables and zero-height stationery zones', () => {
    const input = {
      version: 3,
      page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 0, right: 10, bottom: 0, left: 10 } },
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'page-1', elements: [
        { id: 'table-a', type: 'table', xMm: 10, yMm: 10, widthMm: 80, heightMm: 20, mode: 'static', cells: [] },
        { id: 'table-b', type: 'table', xMm: 10, yMm: 40, widthMm: 80, heightMm: 20, mode: 'dynamic', datasetId: 'marks', columns: [] },
      ] }],
      watermark: { mode: 'none' },
    }

    const result = normalizeLayout(input)

    expect(result.version).toBe(3)
    expect(result.pages[0].elements).toHaveLength(2)
    expect(result.zones).toEqual({ headerMm: 0, footerMm: 0 })
  })

  it('rejects non-finite geometry with an element-specific diagnostic', () => {
    const input = {
      version: 3,
      page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 0, right: 0, bottom: 0, left: 0 } },
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'p1', elements: [{ id: 'bad', type: 'text', xMm: Number.NaN, yMm: 0, widthMm: 10, heightMm: 5 }] }],
      watermark: { mode: 'none' },
    }

    expect(() => normalizeLayout(input)).toThrow(/bad.*xMm/i)
  })

  it('rejects a page size whose physical orientation disagrees with its page size ID', () => {
    const input = {
      version: 3,
      page: { sizeId: 'A4L', orientation: 'PORTRAIT', marginsMm: { top: 0, right: 0, bottom: 0, left: 0 } },
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'p1', elements: [] }],
      watermark: { mode: 'none' },
    }

    expect(() => normalizeLayout(input)).toThrow(/orientation.*size/i)
  })

  it('rejects element types that the renderer cannot produce', () => {
    const input = {
      version: 3,
      page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 0, right: 0, bottom: 0, left: 0 } },
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'p1', elements: [{ id: 'unknown', type: 'video', xMm: 0, yMm: 0, widthMm: 10, heightMm: 10 }] }],
      watermark: { mode: 'none' },
    }

    expect(() => normalizeLayout(input)).toThrow(/unknown.*type/i)
  })

  it('preserves the separate front and back pages of an ID card', () => {
    const input = {
      version: 3,
      page: { sizeId: 'CR80', orientation: 'PORTRAIT', marginsMm: { top: 0, right: 0, bottom: 0, left: 0 } },
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'front', elements: [] }, { id: 'back', elements: [] }],
      watermark: { mode: 'none' },
    }

    expect(normalizeLayout(input).pages.map(page => page.id)).toEqual(['front', 'back'])
  })

  it('rejects a malformed master binding before it can be saved', () => {
    const input = {
      version: 3,
      page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 0, right: 0, bottom: 0, left: 0 } },
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'p1', elements: [] }],
      watermark: { mode: 'none' },
      masterLetterhead: { templateId: 'bad-id', mode: 'latest' },
    }

    expect(() => normalizeLayout(input)).toThrow(/master letterhead/i)
  })

  it('converts legacy card sides without merging the front and back', () => {
    const legacy = {
      version: 2,
      page: { sizeId: 'CR80', marginMm: 2, background: '#FFFFFF' },
      zones: { headerMm: 0, footerMm: 0, repeatHeader: false, repeatFooter: false, hideHeaderOnFirstPage: false },
      watermark: { enabled: false, mode: 'text', text: 'SAMPLE', imageUrl: '', opacity: 0.07 },
      pages: [
        { elements: [{ id: 'front-name', type: 'text', x: 5, y: 6, w: 30, h: 5, content: '{{student_name}}', style: { fontSize: 12, bold: true, italic: false, align: 'left', color: '#000000' } }] },
        { elements: [{ id: 'back-code', type: 'qr', x: 10, y: 10, w: 20, h: 20, encode: 'document-number' }] },
      ],
    }

    const result = convertLegacyLayout(legacy)

    expect(result.layout.pages.map(page => page.id)).toEqual(['page-1', 'page-2'])
    expect(result.layout.pages[0].elements[0]).toMatchObject({ id: 'front-name', xMm: 5, yMm: 6 })
    expect(result.layout.pages[1].elements[0]).toMatchObject({ id: 'back-code', type: 'qr' })
    expect(result.diagnostics).toEqual([])
  })
})

describe('v3 safe HTML rendering', () => {
  it('renders authorized fields and geometry while escaping document text', () => {
    const layout = normalizeLayout({
      version: 3,
      page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 0, right: 0, bottom: 0, left: 0 } },
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'page-1', elements: [
        { id: 'name', type: 'text', xMm: 12, yMm: 20, widthMm: 80, heightMm: 10, content: 'Student: {{student_name}}' },
        { id: 'logo', type: 'image', xMm: 10, yMm: 5, widthMm: 20, heightMm: 20, assetId: 'school-logo' },
      ] }],
      watermark: { mode: 'none' },
    })
    const plan = buildRenderPlan(layout, { fields: { student_name: '<script>alert(1)</script>' } }, {
      'school-logo': 'data:image/png;base64,ZmFrZQ==',
    })
    const html = renderDocumentHtml(plan)

    expect(html).toContain('width:210mm;height:297mm')
    expect(html).toContain('left:12mm;top:20mm;width:80mm;height:10mm')
    expect(html).toContain('Student: &lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>')
    expect(html).toContain('data:image/png;base64,ZmFrZQ==')
  })
})
