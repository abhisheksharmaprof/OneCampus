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
    expect(decodePayload(encodePayload(unicode))).toEqual({ ok: true, payload: unicode })
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
    expect(decoded.ok).toBe(true)
    if (!decoded.ok) return
    expect(decoded.payload.items).toBeUndefined()
    expect(decoded.payload.totals).toEqual(payload.totals)
  })

  it('rejects oversized encoded payloads', () => {
    // Poorly compressible content so the encoded form blows past the ceiling.
    const bomb = {
      ...payload,
      items: Array.from({ length: 5000 }, (_, i) => [`item-${i}-${Math.sqrt(i + 2)}`, i] as [string, number]),
    }
    const encoded = encodePayload(bomb)
    expect(encoded.length).toBeGreaterThan(10000)
    expect(decodePayload(encoded)).toEqual({ ok: false })
  })

  it('rejects malformed and wrong-shape payloads', () => {
    expect(decodePayload('%%%not-base64url%%%')).toEqual({ ok: false })
    expect(decodePayload('')).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ v: 999 } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, items: 'not-an-array' } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, cat: 'EVIL' } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, num: 42 } as unknown as QrDocPayload))).toEqual({ ok: false })
    expect(decodePayload(encodePayload({ ...payload, items: [['only-one-element']] } as unknown as QrDocPayload))).toEqual({ ok: false })
  })

  it('builds a payload from DocumentData with c6 line totals', () => {
    const data = sampleDocumentData('FEE_INVOICE')
    const built = payloadFromDocumentData(data)
    expect(built.v).toBe(1)
    expect(built.num).toBe(data.tokens.invoice_no)
    expect(built.inst).toBe(data.tokens.school_name)
    expect(built.items!.length).toBe(data.rows.length)
    expect(built.items).toEqual(data.rows.map((row) => [String(row.c1), Number(row.c6)]))
  })

  it('omits items for non-fee categories', () => {
    const built = payloadFromDocumentData(sampleDocumentData('MARKSHEET'))
    expect(built.items).toBeUndefined()
  })
})
