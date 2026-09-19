import { describe, expect, it } from 'vitest'
import { CATEGORY_CONFIG, FEE_ITEMS_DATASET, invoiceToDocumentData, sampleDocumentData } from './datasets'
import type { Invoice, Payment } from '../../finance/finance.api'

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
  const invoice = {
    id: 'i1', invoiceNumber: 'INV-2026-0042', studentId: 's1', studentName: 'Diya Sharma',
    admissionNumber: 'NSA-0042', className: 'Class 8 A', status: 'ISSUED',
    issueDate: '2026-08-13', dueDate: '2026-08-28',
    lineItems: [{ description: 'Tuition fee', period: 'Term 1', qty: 2, amount: '1500.50' }],
    subtotal: '3001.00', discountAmount: '0.00', taxAmount: '0.00', total: '3001.00',
    notes: '', templateId: null, totalPaid: '0.00',
  } as Invoice

  it('maps line items to fee_items rows and fills tokens', () => {
    const data = invoiceToDocumentData(invoice, { name: 'Northstar', logoUrl: null, brandColor: '#143f5c' })

    expect(data.tokens.invoice_no).toBe('INV-2026-0042')
    expect(data.tokens.student_name).toBe('Diya Sharma')
    expect(data.tokens.class_section).toBe('Class 8 A')
    expect(data.rows[0]).toMatchObject({ c1: 'Tuition fee', c2: 'Term 1', c3: 2, c4: 1500.5, c6: 3001 })
    expect(data.images['institute-logo']).toBeNull()
  })

  it('never fabricates sample values for tokens the invoice cannot supply', () => {
    const data = invoiceToDocumentData(invoice, { name: 'Northstar', logoUrl: null, brandColor: '#143f5c' })

    expect(data.tokens.guardian_name).toBe('')
    expect(data.tokens.roll_no).toBe('')
  })

  it('maps to a receipt when a payment is supplied', () => {
    const payment: Payment = {
      id: 'p1', receiptNumber: 'RCP-2026-0007', invoiceId: 'i1', invoiceNumber: 'INV-2026-0042',
      studentId: 's1', studentName: 'Diya Sharma', admissionNumber: 'NSA-0042',
      amount: '3001.00', method: 'UPI', reference: '', remarks: '', paidAt: '2026-08-14',
    }
    const data = invoiceToDocumentData(invoice, { name: 'Northstar', logoUrl: null, brandColor: '#143f5c' }, payment)

    expect(data.category).toBe('FEE_RECEIPT')
    expect(data.tokens.receipt_no).toBe('RCP-2026-0007')
    expect(data.tokens.payment_method).toBe('UPI')
    expect(data.rows).toHaveLength(1)
    expect(data.rows[0]).toMatchObject({ c1: 'Payment against INV-2026-0042', c6: 3001 })
  })

  it('maps institute identity fields needed by printed finance documents', () => {
    const data = invoiceToDocumentData(invoice, {
      name: 'Northstar', logoUrl: 'https://cdn.test/logo.png', brandColor: '#143f5c',
      addressLine1: '12 School Road', city: 'Jaipur', state: 'Rajasthan', postalCode: '302001',
      gstNo: '08AAAAA0000A1Z5', panNo: 'AAAAA0000A', primaryPhone: '+91 98765 43210',
      primaryEmail: 'office@northstar.test', contactName: 'Meera Iyer', contactDesignation: 'Principal',
    })

    expect(data.tokens.school_address).toContain('12 School Road')
    expect(data.tokens.school_gstin).toBe('08AAAAA0000A1Z5')
    expect(data.tokens.school_phone).toContain('98765')
    expect(data.tokens.authorised_signatory).toBe('Meera Iyer · Principal')
    expect(data.images['institute-logo']).toBe('https://cdn.test/logo.png')
    expect(data.financialTotals).toEqual({ discount: 0, tax: 0 })
  })
})

describe('FEE_ITEMS_DATASET', () => {
  it('keeps c6 as the precomputed line total for every sample row', () => {
    FEE_ITEMS_DATASET.sampleRows.forEach((row) => {
      expect(row.c6).toBe((row.c3 as number) * (row.c4 as number))
    })
  })
})
