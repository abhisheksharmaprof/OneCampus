import { describe, expect, it } from 'vitest'
import { cardSlot, renderCardCalibration, renderIdCardBatch } from './idCardBatchRender'
import { defaultLayout, type DocumentData } from './types'

const data = (id: string): DocumentData => ({
  category: 'ID_CARD', tokens: { student_id: id, student_name: `Student ${id}` }, rows: [],
  images: { 'student-photo': null },
})

const layout = () => {
  const value = defaultLayout('CR80', 2)
  value.pages[0].elements = [{
    id: 'front', type: 'text', x: 2, y: 3, w: 80, h: 8, content: '{{student_name}}',
    style: { fontSize: 10, bold: false, italic: false, align: 'left', color: '#16212E' },
  }]
  value.pages[1].elements = [{
    id: 'photo', type: 'image', x: 2, y: 3, w: 20, h: 20, src: 'student-photo', fallbackInitials: 'ST',
  }]
  return value
}

describe('ID-card sheet imposition', () => {
  it('lays out eight front and mirrored back cards on A4 sheets', () => {
    const html = renderIdCardBatch(layout(), Array.from({ length: 8 }, (_, index) => data(String(index))))
    expect(html).toContain('@page{size:210mm 297mm')
    expect(html.match(/class="id-sheet"/g)).toHaveLength(2)
    expect(html).toContain('left:19mm;top:40.5mm')
    expect(html).toContain('left:105mm;top:40.5mm')
    expect(cardSlot(0, false)).toEqual({ x: 19, y: 40.5 })
    expect(cardSlot(0, true)).toEqual({ x: 105, y: 40.5 })
  })

  it('starts the ninth card on a second front/back sheet pair', () => {
    const html = renderIdCardBatch(layout(), Array.from({ length: 9 }, (_, index) => data(String(index))))
    expect(html.match(/class="id-sheet"/g)).toHaveLength(4)
    expect(html.match(/class="id-card"/g)).toHaveLength(18)
  })

  it('uses the designed initials fallback and escapes live text', () => {
    const input = data('<script>')
    const html = renderIdCardBatch(layout(), [input])
    expect(html).toContain('ST')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<script></script>')
  })

  it('keeps a card QR as an internal identifier, never a verification URL', () => {
    const cardLayout = layout()
    cardLayout.pages[0].elements.push({ id: 'code', type: 'qr', x: 2, y: 20, w: 10, h: 10, encode: 'document-number' })
    const html = renderIdCardBatch(cardLayout, [data('NS-01')])
    expect(html).not.toContain('/verify')
    expect(html).toContain('data-student="NS-01"')
  })

  it('builds a separate physical calibration sheet', () => {
    const html = renderCardCalibration()
    expect(html).toContain('size:210mm 297mm')
    expect(html).toContain('86mm;height:54mm')
    expect(html.match(/Slot [1-8] · 86/g)).toHaveLength(8)
  })
})
