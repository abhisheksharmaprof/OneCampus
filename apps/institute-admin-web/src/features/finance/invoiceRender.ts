import type { Invoice, InstituteBranding, Payment, TemplateLayout } from './finance.api'

/** Single escape point — every dynamic value passes through here before hitting HTML. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character
  ))
}

const money = (value: string | number) =>
  new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .format(typeof value === 'number' ? value : Number(value || 0))

export const DEFAULT_LAYOUT: TemplateLayout = {
  branding: { mode: 'institute', name: '', address: '', phone: '', email: '', logoUrl: '', primary: '#143f5c', accent: '#16a085' },
  font: 'Inter',
  density: 'comfortable',
  header: { title: 'FEE INVOICE', fields: ['{{invoice_no}}', '{{issue_date}}', '{{due_date}}'] },
  columns: [
    { id: 'description', label: 'Fee description', width: 44, align: 'left', enabled: true },
    { id: 'period', label: 'Period', width: 18, align: 'left', enabled: true },
    { id: 'qty', label: 'Qty', width: 10, align: 'center', enabled: true },
    { id: 'amount', label: 'Amount', width: 28, align: 'right', enabled: true },
  ],
  computed: { showSubtotal: true, showDiscount: true, showTax: true, showGrandTotal: true },
  footer: { note: '', showSignature: true },
  showStudentDetails: true,
}

type StoredLayout = Partial<Omit<TemplateLayout, 'branding' | 'header' | 'computed' | 'footer'>> & {
  branding?: Partial<TemplateLayout['branding']>
  header?: Partial<TemplateLayout['header']>
  computed?: Partial<TemplateLayout['computed']>
  footer?: Partial<TemplateLayout['footer']>
}

/** Merge a stored (possibly partial/legacy) layout JSON over the defaults. */
export function resolveLayout(layout: StoredLayout | null | undefined): TemplateLayout {
  const stored = layout ?? {}
  return {
    ...DEFAULT_LAYOUT,
    ...stored,
    branding: { ...DEFAULT_LAYOUT.branding, ...stored.branding },
    header: { ...DEFAULT_LAYOUT.header, ...stored.header },
    computed: { ...DEFAULT_LAYOUT.computed, ...stored.computed },
    footer: { ...DEFAULT_LAYOUT.footer, ...stored.footer },
    columns: stored.columns?.length ? stored.columns : DEFAULT_LAYOUT.columns,
  }
}

export type DocumentModel = {
  kind: 'invoice' | 'receipt'
  placeholders: Record<string, string>
  lineItems: { description: string; period: string; qty: number; amount: string }[]
  subtotal: string
  discountAmount: string
  taxAmount: string
  total: string
  totalPaid: string
  status: string
  institute: { name: string; logoUrl: string; brandColor: string }
  student: { name: string; admissionNumber: string; className: string }
  receipt?: { number: string; amount: string; method: string; reference: string; paidAt: string }
}

export function buildDocumentModel(options: {
  invoice: Invoice
  branding: InstituteBranding
  payment?: Payment
  academicYear?: string
}): DocumentModel {
  const { invoice, branding, payment, academicYear } = options
  return {
    kind: payment ? 'receipt' : 'invoice',
    placeholders: {
      student_name: invoice.studentName,
      admission_no: invoice.admissionNumber,
      class_section: invoice.className,
      invoice_no: invoice.invoiceNumber,
      receipt_no: payment?.receiptNumber ?? '',
      issue_date: invoice.issueDate ?? '',
      due_date: invoice.dueDate,
      academic_year: academicYear ?? '',
      institute_name: branding.name,
      institute_address: '',
    },
    lineItems: invoice.lineItems,
    subtotal: invoice.subtotal,
    discountAmount: invoice.discountAmount,
    taxAmount: invoice.taxAmount,
    total: invoice.total,
    totalPaid: invoice.totalPaid,
    status: invoice.status,
    institute: {
      name: branding.name,
      logoUrl: branding.logoUrl ?? '',
      brandColor: branding.brandColor ?? '',
    },
    student: {
      name: invoice.studentName,
      admissionNumber: invoice.admissionNumber,
      className: invoice.className,
    },
    receipt: payment
      ? {
          number: payment.receiptNumber,
          amount: payment.amount,
          method: payment.method,
          reference: payment.reference,
          paidAt: payment.paidAt.slice(0, 10),
        }
      : undefined,
  }
}

/** Replace {{token}} placeholders with escaped values; unknown tokens become ''. */
function substitute(text: string, placeholders: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, token: string) =>
    escapeHtml(placeholders[token] ?? ''),
  )
}

function cellValue(columnId: string, item: DocumentModel['lineItems'][number]): string {
  switch (columnId) {
    case 'description': return escapeHtml(item.description)
    case 'period': return escapeHtml(item.period)
    case 'qty': return String(item.qty)
    case 'amount': return money(Number(item.amount) * item.qty)
    default: return '—'
  }
}

export function renderDocumentHtml(model: DocumentModel, layout: TemplateLayout): string {
  const useInstitute = layout.branding.mode === 'institute'
  const primary = (useInstitute && model.institute.brandColor) || layout.branding.primary
  const accent = layout.branding.accent
  const brandName = useInstitute ? model.institute.name : layout.branding.name || model.institute.name
  const logoUrl = useInstitute ? model.institute.logoUrl : layout.branding.logoUrl
  const columns = layout.columns.filter((column) => column.enabled)
  const isReceipt = model.kind === 'receipt' && model.receipt

  const logo = logoUrl
    ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Institute logo" />`
    : `<div class="logo fallback">${escapeHtml(brandName.slice(0, 2).toUpperCase())}</div>`

  const headerMeta = layout.header.fields
    .map((field) => `<p>${substitute(field, model.placeholders)}</p>`)
    .join('')

  const rows = model.lineItems
    .map((item) => `<tr>${columns
      .map((column) => `<td style="text-align:${column.align}">${cellValue(column.id, item)}</td>`)
      .join('')}</tr>`)
    .join('')

  const computedRows: string[] = []
  if (layout.computed.showSubtotal) computedRows.push(`<div><span>Subtotal</span><b>${money(model.subtotal)}</b></div>`)
  if (layout.computed.showDiscount && Number(model.discountAmount) > 0)
    computedRows.push(`<div><span>Discount</span><b>−${money(model.discountAmount)}</b></div>`)
  if (layout.computed.showTax && Number(model.taxAmount) > 0)
    computedRows.push(`<div><span>Tax</span><b>${money(model.taxAmount)}</b></div>`)
  if (layout.computed.showGrandTotal)
    computedRows.push(`<div class="total"><span>Grand total</span><span>${money(model.total)}</span></div>`)
  if (isReceipt && model.receipt)
    computedRows.push(`<div><span>Amount received (${escapeHtml(model.receipt.method)})</span><b>${money(model.receipt.amount)}</b></div>`)
  else if (Number(model.totalPaid) > 0)
    computedRows.push(
      `<div><span>Paid to date</span><b>${money(model.totalPaid)}</b></div>`,
      `<div><span>Balance due</span><b>${money(Math.max(Number(model.total) - Number(model.totalPaid), 0))}</b></div>`,
    )

  const documentNumber = isReceipt && model.receipt ? model.receipt.number : model.placeholders.invoice_no
  const documentDate = isReceipt && model.receipt ? model.receipt.paidAt : model.placeholders.issue_date

  return `<!doctype html><html><head><meta charset="utf-8" /><title>${substitute(layout.header.title, model.placeholders)} ${escapeHtml(documentNumber)}</title><style>
@page{size:A4;margin:14mm}*{box-sizing:border-box}
body{margin:0;color:#1d2939;font-family:${escapeHtml(layout.font)},sans-serif;background:#eef2f6}
.sheet{width:210mm;min-height:267mm;margin:18px auto;padding:${layout.density === 'compact' ? '13mm' : '18mm'};background:#fff;box-shadow:0 8px 32px #0002;position:relative}
.band{height:8px;margin:-18mm -18mm 14mm;background:${escapeHtml(primary)}}
header{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding-bottom:18px;border-bottom:2px solid ${escapeHtml(accent)}}
.brand{display:flex;gap:14px}
.logo{width:58px;height:58px;object-fit:contain;border-radius:8px}
.fallback{display:grid;place-items:center;color:white;background:${escapeHtml(primary)};font-weight:800}
.brand h1{margin:2px 0 5px;color:${escapeHtml(primary)};font-size:21px}
.brand p,.doc p{margin:2px 0;color:#667085;font-size:11px}
.doc{text-align:right}
.doc h2{margin:0 0 8px;color:${escapeHtml(primary)};font-size:18px;letter-spacing:.08em}
.doc strong{font-size:13px}
.details{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0;padding:14px;background:#f8fafc;border-radius:8px}
.details span{display:block;margin:5px 0;font-size:12px}
.details b{color:#475467;font-size:10px;text-transform:uppercase;letter-spacing:.06em}
table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px}
th{padding:11px 9px;color:white;background:${escapeHtml(primary)};text-align:left}
td{padding:13px 9px;border-bottom:1px solid #e4e7ec}
.summary{width:46%;margin:22px 0 0 auto}
.summary div{display:flex;justify-content:space-between;padding:7px 0;font-size:12px}
.summary .total{margin-top:5px;padding-top:11px;border-top:2px solid ${escapeHtml(accent)};color:${escapeHtml(primary)};font-size:15px;font-weight:800}
.status{display:inline-block;margin-top:12px;padding:6px 10px;border-radius:99px;color:${escapeHtml(primary)};background:#e7f8f3;font-size:11px;font-weight:800}
.signature{width:180px;margin:58px 0 0 auto;border-top:1px solid #98a2b3;padding-top:8px;text-align:center;font-size:11px}
footer{position:absolute;bottom:17mm;left:18mm;right:18mm;padding-top:12px;border-top:1px solid #e4e7ec;color:#667085;text-align:center;font-size:10px}
@media print{body{background:#fff}.sheet{width:auto;min-height:0;margin:0;padding:0;box-shadow:none}.band{margin:-14mm -14mm 12mm}footer{position:fixed;bottom:0;left:0;right:0}}
</style></head><body><main class="sheet"><div class="band"></div>
<header><div class="brand">${logo}<div><h1>${escapeHtml(brandName)}</h1>${
    !useInstitute && layout.branding.address ? `<p>${escapeHtml(layout.branding.address)}</p>` : ''
  }${
    !useInstitute && (layout.branding.phone || layout.branding.email)
      ? `<p>${escapeHtml(layout.branding.phone)}${layout.branding.phone && layout.branding.email ? ' · ' : ''}${escapeHtml(layout.branding.email)}</p>`
      : ''
  }</div></div>
<div class="doc"><h2>${substitute(layout.header.title, model.placeholders)}</h2><strong>#${escapeHtml(documentNumber)}</strong>${headerMeta}<p>${escapeHtml(documentDate)}</p></div></header>
${layout.showStudentDetails ? `<section class="details"><div><b>Bill to</b><span><strong>${escapeHtml(model.student.name)}</strong></span><span>${escapeHtml(model.student.admissionNumber)}${model.student.className ? ` · ${escapeHtml(model.student.className)}` : ''}</span></div><div><b>Payment details</b><span>Due date: ${escapeHtml(model.placeholders.due_date)}</span><span class="status">${escapeHtml(model.status.replace('_', ' '))}</span></div></section>` : ''}
<table><thead><tr>${columns.map((column) => `<th style="width:${column.width}%;text-align:${column.align}">${escapeHtml(column.label)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
<section class="summary">${computedRows.join('')}</section>
${layout.footer.showSignature ? '<div class="signature">Authorised signature</div>' : ''}
<footer>${escapeHtml(layout.footer.note)}</footer>
</main></body></html>`
}

/** Popup + print, same pattern as StaffPage ID cards. Returns false if the popup was blocked. */
export function openPrintWindow(html: string): boolean {
  const popup = window.open('', '_blank', 'width=900,height=900')
  if (!popup) return false
  popup.opener = null
  popup.document.write(html.replace('</body>', "<script>window.addEventListener('load',()=>setTimeout(()=>window.print(),250))</script></body>"))
  popup.document.close()
  return true
}
