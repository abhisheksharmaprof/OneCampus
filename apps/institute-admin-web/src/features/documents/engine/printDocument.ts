import type { Invoice, InstituteBranding, Payment } from '../../finance/finance.api'
import type { DocumentTemplateRecord } from '../documents.api'
import { invoiceToDocumentData } from './datasets'
import { openPrintWindow, renderDocumentHtml } from './docRender'
import { prepareQrDataUrls } from './qrPayload'
import type { CanvasElement, LayoutV2, TableColumn, TotalsRow } from './types'

const INK = '#16212E'
const SOFT = '#5B6675'
const DEFAULT_BRAND = '#173A5E'

function safeBrandColor(value: string | null): string {
  return value && /^#[0-9A-Fa-f]{3,8}$/.test(value) ? value : DEFAULT_BRAND
}

function style(fontSize: number, bold = false, align: 'left' | 'center' | 'right' = 'left', color = INK) {
  return { fontSize, bold, italic: false, align, color }
}

function text(id: string, x: number, y: number, w: number, h: number, content: string, fontSize: number, options: Partial<ReturnType<typeof style>> = {}): CanvasElement {
  return { id, type: 'text', x, y, w, h, content, style: { ...style(fontSize), ...options } }
}

function column(id: string, label: string, widthPct: number, align: 'left' | 'center' | 'right' = 'left', dtype: 'text' | 'number' = 'text', type: 'data' | 'formula' = 'data', formula?: string): TableColumn {
  return { id, label, widthPct, align, dtype, type, ...(formula ? { formula } : {}) }
}

function financeFallbackLayout(category: 'FEE_INVOICE' | 'FEE_RECEIPT', brandColor: string | null): LayoutV2 {
  const brand = safeBrandColor(brandColor)
  const columns = category === 'FEE_RECEIPT'
    ? [column('c1', 'Description', 56), column('c2', 'Reference', 20), column('c6', 'Amount', 24, 'right', 'number')]
    : [column('c1', 'Description', 38), column('c2', 'Period', 16), column('c3', 'Qty', 10, 'center', 'number'), column('c4', 'Rate', 16, 'right', 'number'), column('c5', 'Amount', 20, 'right', 'number', 'formula', '=[Qty]*[Rate]')]
  const totals: TotalsRow[] = category === 'FEE_RECEIPT'
    ? [{ id: 'r1', label: 'Amount received', kind: 'formula', formula: '=SUM_TABLE("Amount")', emphasize: true }]
    : [
        { id: 'r1', label: 'Subtotal', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
        { id: 'r2', label: 'Discount', kind: 'value', value: 0 },
        { id: 'r3', label: 'Tax', kind: 'value', value: 0 },
        { id: 'r4', label: 'Grand total', kind: 'formula', formula: '=[Subtotal]-[Discount]+[Tax]', emphasize: true },
      ]
  const elements: CanvasElement[] = [
    { id: 'accent', type: 'shape', x: 0, y: 0, w: 210, h: 3, shape: 'rect', fill: brand },
    { id: 'logo', type: 'image', x: 12, y: 9, w: 22, h: 22, src: 'institute-logo', fallbackInitials: 'IN' },
    text('school', 39, 11, 88, 9, '{{school_name}}', 16, { bold: true, color: brand }),
    text('school-detail', 39, 21, 100, 11, '{{school_address}}\n{{school_phone}} · {{school_email}}\nGSTIN {{school_gstin}} · PAN {{school_pan}}', 7.5, { color: SOFT }),
    text('document-title', 140, 11, 58, 18, category === 'FEE_RECEIPT' ? 'FEE RECEIPT\n#{{receipt_no}}\n{{invoice_date}}' : 'FEE INVOICE\n#{{invoice_no}}\n{{invoice_date}}', 11, { bold: true, align: 'right', color: brand }),
    text('student', 12, 47, 95, 20, category === 'FEE_RECEIPT' ? 'RECEIVED FROM\n{{student_name}}\n{{student_id}} · {{class_section}}' : 'BILL TO\n{{student_name}}\n{{student_id}} · {{class_section}}', 10),
    text('status', 140, 47, 58, 17, category === 'FEE_RECEIPT' ? 'Payment method: {{payment_method}}' : 'Due date: {{due_date}}\nStatus: {{payment_status}}', 9.5, { align: 'right' }),
    { id: 'items', type: 'table', x: 12, y: 76, w: 186, h: 58, datasetId: 'fee_items', columns, style: { headerBg: brand, headerColor: '#FFFFFF', fontSize: 9 } },
    { id: 'totals', type: 'totals', x: 128, y: category === 'FEE_RECEIPT' ? 142 : 146, w: 70, h: category === 'FEE_RECEIPT' ? 16 : 34, datasetId: 'fee_items', rows: totals },
    { id: 'qr', type: 'qr', x: 12, y: 142, w: 22, h: 22, encode: 'verify-url' },
    { id: 'signature', type: 'signature', x: 150, y: 253, w: 48, h: 12, label: '{{authorised_signatory}}' },
    text('footer', 12, 286, 186, 7, '{{school_name}} · {{school_phone}} · {{school_email}} · {{school_website}}', 7.5, { align: 'center', color: SOFT }),
  ]
  return {
    version: 2,
    page: { sizeId: 'A4P', marginMm: 10, background: '#FFFFFF' },
    zones: { headerMm: 36, footerMm: 14, repeatHeader: false, repeatFooter: false, hideHeaderOnFirstPage: false },
    watermark: { enabled: false, mode: 'text', text: '', imageUrl: '', opacity: 0.07 },
    pages: [{ elements }],
  }
}

function hasRenderableElements(layout: LayoutV2 | null | undefined): layout is LayoutV2 {
  return Boolean(layout?.pages?.some((page) => page.elements.length > 0))
}

export async function buildFinanceDocumentHtml(options: {
  invoice: Invoice
  branding: InstituteBranding
  template: DocumentTemplateRecord | null
  payment?: Payment
}): Promise<string> {
  const { invoice, branding, template, payment } = options
  const category = payment ? 'FEE_RECEIPT' : 'FEE_INVOICE'
  const layout = hasRenderableElements(template?.layout)
    ? template.layout
    : financeFallbackLayout(category, branding.brandColor)
  const data = invoiceToDocumentData(invoice, branding, payment)
  data.qrDataUrls = await prepareQrDataUrls(layout, data)
  return renderDocumentHtml({ layout, data, mode: 'print' })
}

/** Print a real invoice/receipt through a document template. Returns false if the popup was blocked. */
export async function printFinanceDocument(options: {
  invoice: Invoice
  branding: InstituteBranding
  template: DocumentTemplateRecord | null
  payment?: Payment
}): Promise<boolean> {
  // Reserve the popup in the user gesture before QR generation/template work awaits.
  // Opening only after the await is treated as an unsolicited popup by several browsers.
  const popup = window.open('', '_blank', 'width=900,height=900')
  if (!popup) return false
  try {
    return openPrintWindow(await buildFinanceDocumentHtml(options), popup)
  } catch (error) {
    popup.close()
    throw error
  }
}

export { financeFallbackLayout }
