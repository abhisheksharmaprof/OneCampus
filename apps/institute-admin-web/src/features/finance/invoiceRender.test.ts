import { describe, expect, it } from 'vitest'
import { buildDocumentModel, renderDocumentHtml, resolveLayout } from './invoiceRender'
import type { Invoice } from './finance.api'

const invoice: Invoice = {
  id: 'inv-1',
  invoiceNumber: 'INV-2026-0001',
  studentId: 's-1',
  studentName: '<b>Diya</b> & Co',
  admissionNumber: 'NSA-0001',
  className: 'Class 8 A',
  status: 'ISSUED',
  issueDate: '2026-08-12',
  dueDate: '2026-08-27',
  lineItems: [
    { description: 'Tuition <script>alert(1)</script>', period: 'Term 1', qty: 2, amount: '2500.00' },
    { description: 'Library fee', period: '', qty: 1, amount: '300.00' },
  ],
  subtotal: '5300.00',
  discountAmount: '300.00',
  taxAmount: '100.00',
  total: '5100.00',
  notes: '',
  templateId: null,
  totalPaid: '0.00',
}

const branding = { name: 'Northstar Academy', logoUrl: null, brandColor: '#143f5c' }

describe('invoiceRender', () => {
  it('escapes every interpolated value', () => {
    const layout = resolveLayout({})
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('&lt;b&gt;Diya&lt;/b&gt; &amp; Co')
  })

  it('resolves placeholders from the document model', () => {
    const layout = resolveLayout({ header: { title: 'FEE INVOICE', fields: ['{{invoice_no}}', '{{student_name}}'] } })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).toContain('INV-2026-0001')
    expect(html).toContain('Northstar Academy')
  })

  it('renders computed rows with correct math', () => {
    const layout = resolveLayout({})
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).toContain('5,300.00') // subtotal
    expect(html).toContain('5,100.00') // grand total
  })

  it('uses institute branding when mode is institute', () => {
    const layout = resolveLayout({ branding: { mode: 'institute' } })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).toContain('#143f5c')
    expect(html).toContain('Northstar Academy')
  })

  it('leaves unknown placeholders blank instead of leaking the token', () => {
    const layout = resolveLayout({ header: { title: 'X', fields: ['{{bogus_token}}'] } })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).not.toContain('{{bogus_token}}')
  })

  it('escapes literal text around placeholder tokens', () => {
    const layout = resolveLayout({ header: { title: '<img src=x onerror=alert(1)> {{invoice_no}}', fields: [] } })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;img src=x')
    expect(html).toContain('INV-2026-0001')
  })

  it('sanitizes column align and width from stored layout', () => {
    const layout = resolveLayout({
      columns: [{ id: 'description', label: 'Desc', width: 9999, align: 'left" onmouseover="alert(1)' as never, enabled: true }],
    })
    const html = renderDocumentHtml(buildDocumentModel({ invoice, branding }), layout)
    expect(html).not.toContain('onmouseover')
    expect(html).toContain('width:100%')
  })
})
