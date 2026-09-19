import { describe, expect, it, vi } from 'vitest'
import type { Invoice } from '../../finance/finance.api'
import { buildFinanceDocumentHtml, financeFallbackLayout } from './printDocument'

const invoice: Invoice = {
  id: 'invoice-1', invoiceNumber: 'INV-2026-0042', studentId: 'student-1', studentName: 'Diya Sharma',
  admissionNumber: 'NSA-0042', className: 'Class 8 A', status: 'ISSUED', issueDate: '2026-08-13', dueDate: '2026-08-28',
  lineItems: [{ description: 'Tuition fee', period: 'Term 1', qty: 1, amount: '15000.00' }],
  subtotal: '15000.00', discountAmount: '500.00', taxAmount: '100.00', total: '14600.00', notes: 'Pay before the due date.',
  templateId: null, totalPaid: '0.00',
}

const branding = {
  name: 'Northstar Academy', logoUrl: 'https://cdn.test/northstar.png', brandColor: '#143f5c',
  addressLine1: '12 School Road', city: 'Jaipur', state: 'Rajasthan', postalCode: '302001',
  gstNo: '08AAAAA0000A1Z5', primaryPhone: '+91 98765 43210', primaryEmail: 'office@northstar.test',
  contactName: 'Meera Iyer', contactDesignation: 'Principal',
}

describe('finance document printing', () => {
  it('builds a branded invoice when no server template is available', async () => {
    const html = await buildFinanceDocumentHtml({ invoice, branding, template: null })

    expect(html).toContain('https://cdn.test/northstar.png')
    expect(html).toContain('Northstar Academy')
    expect(html).toContain('12 School Road')
    expect(html).toContain('08AAAAA0000A1Z5')
    expect(html).toContain('INV-2026-0042')
    expect(html).toContain('15,000.00')
    expect(html).toContain('14,600.00')
    expect(html).not.toContain('NaN')
  })

  it('prints the actual payment amount on a receipt, not the invoice total', async () => {
    const html = await buildFinanceDocumentHtml({
      invoice,
      branding,
      template: { id: 'template-1', name: 'Fallback', category: 'FEE_RECEIPT', layout: financeFallbackLayout('FEE_RECEIPT', branding.brandColor), isDefault: true, createdAt: '' },
      payment: {
        id: 'payment-1', receiptNumber: 'RCP-2026-0007', invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber,
        studentId: invoice.studentId, studentName: invoice.studentName, admissionNumber: invoice.admissionNumber,
        amount: '3000.00', method: 'UPI', reference: 'upi-123', remarks: '', paidAt: '2026-08-14',
      },
    })

    expect(html).toContain('RCP-2026-0007')
    expect(html).toContain('3,000.00')
    expect(html).not.toContain('14,600.00')
  })

  it('does not open a print window when the browser blocks popups', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    const { printFinanceDocument } = await import('./printDocument')
    await expect(printFinanceDocument({ invoice, branding, template: null })).resolves.toBe(false)
  })
})
