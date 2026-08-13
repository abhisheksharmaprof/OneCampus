import { describe, expect, it } from 'vitest'
import { CATEGORY_CONFIG, invoiceToDocumentData, sampleDocumentData } from './datasets'
import type { Invoice } from '../../finance/finance.api'

describe('sampleDocumentData', () => {
  it('provides tokens and rows for every category', () => {
    for (const category of ['FEE_INVOICE', 'FEE_RECEIPT', 'MARKSHEET', 'ID_CARD', 'CERTIFICATE'] as const) {
      const data = sampleDocumentData(category)
      expect(data.tokens.school_name).toBeTruthy()
      expect(data.tokens.student_name).toBeTruthy()
      expect(Array.isArray(data.rows)).toBe(true)
      expect(CATEGORY_CONFIG[category].tokenGroups.length).toBeGreaterThan(0)
    }
    expect(sampleDocumentData('FEE_INVOICE').rows.length).toBeGreaterThan(0)
    expect(sampleDocumentData('MARKSHEET').rows.length).toBeGreaterThan(3)
  })
})

describe('invoiceToDocumentData', () => {
  it('maps line items to fee_items rows and fills tokens', () => {
    const invoice = {
      id: 'i1', invoiceNumber: 'INV-2026-0042', studentId: 's1', studentName: 'Diya Sharma',
      admissionNumber: 'NSA-0042', className: 'Class 8 A', status: 'ISSUED',
      issueDate: '2026-08-13', dueDate: '2026-08-28',
      lineItems: [{ description: 'Tuition fee', period: 'Term 1', qty: 2, amount: '1500.50' }],
      subtotal: '3001.00', discountAmount: '0.00', taxAmount: '0.00', total: '3001.00',
      notes: '', templateId: null, totalPaid: '0.00',
    } as Invoice
    const data = invoiceToDocumentData(invoice, { name: 'Northstar', logoUrl: null, brandColor: '#143f5c' })

    expect(data.tokens.invoice_no).toBe('INV-2026-0042')
    expect(data.tokens.student_name).toBe('Diya Sharma')
    expect(data.tokens.class_section).toBe('Class 8 A')
    expect(data.rows[0]).toMatchObject({ c1: 'Tuition fee', c2: 'Term 1', c3: 2, c4: 1500.5 })
    expect(data.images['institute-logo']).toBeNull()
  })
})
