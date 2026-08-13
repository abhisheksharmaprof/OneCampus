import { CATEGORY_CONFIG } from '../engine/datasets'
import type { CanvasElement, DocumentCategory, ElementType } from '../engine/types'

export function makeElementId(): string {
  return `el-${Math.random().toString(36).slice(2, 10)}`
}

export function defaultElement(type: ElementType, category: DocumentCategory): CanvasElement {
  const id = makeElementId()
  const base = { id, x: 20, y: 30, locked: false }
  switch (type) {
    case 'text':
      return { ...base, type, w: 70, h: 10, content: 'New text — {{student_name}}', style: { fontSize: 12, bold: false, italic: false, align: 'left', color: '#16212E' } }
    case 'image':
      return { ...base, type, w: 24, h: 24, src: 'institute-logo', fallbackInitials: 'SC' }
    case 'table': {
      const dataset = CATEGORY_CONFIG[category].datasets[0]
      return {
        ...base, type, w: 170, h: 45,
        datasetId: dataset?.id ?? 'fee_items',
        columns: (dataset?.columns ?? []).map((column) => ({ ...column })),
        style: { headerBg: '#173A5E', headerColor: '#FFFFFF', fontSize: 10 },
      }
    }
    case 'totals':
      return {
        ...base, type, w: 70, h: 26, datasetId: CATEGORY_CONFIG[category].datasets[0]?.id ?? 'fee_items',
        rows: [
          { id: 'r1', label: 'Subtotal', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
          { id: 'r2', label: 'Grand total', kind: 'formula', formula: '=[Subtotal]', emphasize: true },
        ],
      }
    case 'shape': return { ...base, type, w: 60, h: 12, shape: 'rect', fill: '#E8EEF5' }
    case 'divider': return { ...base, type, w: 80, h: 1, stroke: '#5B6675' }
    case 'signature': return { ...base, type, w: 48, h: 12, label: 'Authorised signature' }
    case 'qr': return { ...base, type, w: 22, h: 22, encode: 'verify-url' }
  }
}
