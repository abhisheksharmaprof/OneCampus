/** Layout JSON v2 + document data types. Mirrors the backend validator's contract
 *  (services/api/modules/documents/validators.py). Coordinates are millimetres. */

export type DocumentCategory = 'FEE_INVOICE' | 'FEE_RECEIPT' | 'MARKSHEET' | 'ID_CARD' | 'CERTIFICATE'
export type PageSizeId = 'A4P' | 'A4L' | 'CR80' | 'A4P_HALF_TOP' | 'A4P_HALF_BOTTOM'

export const PAGE_SIZES_MM: Record<PageSizeId, { w: number; h: number }> = {
  A4P: { w: 210, h: 297 },
  A4L: { w: 297, h: 210 },
  CR80: { w: 86, h: 54 },
  A4P_HALF_TOP: { w: 210, h: 148.5 },
  A4P_HALF_BOTTOM: { w: 210, h: 148.5 },
}

export type ElementType = 'text' | 'image' | 'table' | 'totals' | 'shape' | 'divider' | 'signature' | 'qr'
export type TextAlign = 'left' | 'center' | 'right'

export interface BaseElement {
  id: string
  type: ElementType
  x: number
  y: number
  w: number
  h: number
  locked?: boolean
}

export interface TextStyle { fontSize: number; bold: boolean; italic: boolean; align: TextAlign; color: string }
export interface TextElement extends BaseElement { type: 'text'; content: string; style: TextStyle }
export interface ImageElement extends BaseElement { type: 'image'; src: string; fallbackInitials: string }

export interface TableColumn {
  id: string
  label: string
  type: 'data' | 'formula'
  dtype?: 'text' | 'number'
  formula?: string
  widthPct: number
  align: TextAlign
}
export interface TableStyle { headerBg: string; headerColor: string; fontSize: number }
export interface TableElement extends BaseElement { type: 'table'; datasetId: string; columns: TableColumn[]; style: TableStyle }

export interface TotalsRow { id: string; label: string; kind: 'value' | 'formula'; value?: number; formula?: string; emphasize?: boolean }
export interface TotalsElement extends BaseElement { type: 'totals'; datasetId: string; rows: TotalsRow[] }

export interface ShapeElement extends BaseElement { type: 'shape'; shape: 'rect'; fill: string }
export interface DividerElement extends BaseElement { type: 'divider'; stroke: string }
export interface SignatureElement extends BaseElement { type: 'signature'; label: string }
export interface QrElement extends BaseElement { type: 'qr'; encode: 'verify-url' | 'document-number' }

export type CanvasElement =
  | TextElement | ImageElement | TableElement | TotalsElement
  | ShapeElement | DividerElement | SignatureElement | QrElement

export interface LayoutZones {
  headerMm: number
  footerMm: number
  repeatHeader: boolean
  repeatFooter: boolean
  hideHeaderOnFirstPage: boolean
}
export interface LayoutWatermark { enabled: boolean; mode: 'text' | 'image'; text: string; imageUrl: string; opacity: number }

export interface LayoutV2 {
  version: 2
  page: { sizeId: PageSizeId; marginMm: number; background: string | { imageUrl: string } }
  zones: LayoutZones
  watermark: LayoutWatermark
  pages: { elements: CanvasElement[] }[]
}

/** Everything a renderer needs about ONE concrete document (real or sample). */
export interface DocumentData {
  category: DocumentCategory
  /** {{token}} → value; unresolved tokens render blank. */
  tokens: Record<string, string>
  /** Dataset rows for the table/totals elements, keyed by column id (c1, c2, …). */
  rows: Record<string, unknown>[]
  /** Image sources by symbolic id: 'institute-logo', 'student-photo', 'staff-photo'. */
  images: Record<string, string | null>
  /** Pre-generated QR data URLs keyed by element id (QR generation is async; render is sync). */
  qrDataUrls?: Record<string, string>
  status?: string
}

export function defaultLayout(sizeId: PageSizeId = 'A4P', pageCount: 1 | 2 = 1): LayoutV2 {
  return {
    version: 2,
    page: { sizeId, marginMm: sizeId === 'CR80' ? 2 : 10, background: '#FFFFFF' },
    zones: { headerMm: 0, footerMm: 0, repeatHeader: false, repeatFooter: false, hideHeaderOnFirstPage: false },
    watermark: { enabled: false, mode: 'text', text: 'SAMPLE', imageUrl: '', opacity: 0.07 },
    pages: Array.from({ length: pageCount }, () => ({ elements: [] })),
  }
}
