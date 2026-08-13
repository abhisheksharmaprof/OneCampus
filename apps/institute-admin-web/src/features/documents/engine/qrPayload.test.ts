import { describe, expect, it } from 'vitest'
import { buildVerifyUrl, decodePayload, encodePayload, payloadFromDocumentData, type QrDocPayload } from './qrPayload'
import { sampleDocumentData } from './datasets'

const payload: QrDocPayload = {
  v: 1, cat: 'FEE_INVOICE', num: 'INV-2026-0001', date: '2026-08-13',
  inst: 'Step Next Academy', student: 'Aarav Sharma · Grade 8-A',
  items: [['Tuition fee', 15000], ['Transport fee', 3000]],
  totals: [['Grand total', 18000]], status: 'Pending',
}

describe('qrPayload', () => {
  it('round-trips through encode/decode including unicode', () => {
    const unicode = { ...payload, student: 'आरव शर्मा · कक्षा 8' }
    expect(decodePayload(encodePayload(unicode))).toEqual(unicode)
  })

  it('produces URL-safe output', () => {
    const encoded = encodePayload(payload)
    expect(encoded).not.toMatch(/[+/=#?]/)
  })

  it('degrades oversized payloads by dropping items, deterministically', () => {
    const huge = {
      ...payload,
      items: Array.from({ length: 400 }, (_, i) => [`Line item with a fairly long description ${i}`, i * 10] as [string, number]),
    }
    const url = buildVerifyUrl('https://app.example.com', huge)
    const fragment = url.split('#')[1]
    expect(fragment.length).toBeLessThanOrEqual(2500)
    const decoded = decodePayload(fragment)
    expect(decoded.items).toBeUndefined()
    expect(decoded.totals).toEqual(payload.totals)
  })

  it('builds a payload from DocumentData', () => {
    const data = sampleDocumentData('FEE_INVOICE')
    const built = payloadFromDocumentData(data)
    expect(built.v).toBe(1)
    expect(built.num).toBe(data.tokens.invoice_no)
    expect(built.inst).toBe(data.tokens.school_name)
    expect(built.items!.length).toBe(data.rows.length)
  })
})
