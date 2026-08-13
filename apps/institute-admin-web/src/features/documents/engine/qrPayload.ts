/** Self-contained document payloads for QR codes.
 *  The payload rides in a URL #fragment (never sent to any server); the verify page
 *  renders it with zero database dependency. QR capacity is ~2.9KB — buildVerifyUrl
 *  deterministically degrades to a summary (no line items) when over budget.
 *
 *  SECURITY: the fragment is attacker-forgeable (anyone can print their own QR
 *  pointing at /verify), so decodePayload is a trust boundary: it caps input size
 *  before inflating, never throws, and validates the decoded shape before
 *  returning ok. */

import { deflate, inflate } from 'pako'
import QRCode from 'qrcode'
import type { DocumentCategory, DocumentData, LayoutV2 } from './types'

export interface QrDocPayload {
  v: 1
  cat: DocumentCategory
  num: string
  date: string
  inst: string
  student?: string
  items?: [string, number][]
  totals?: [string, number][]
  status?: string
}

export type QrDecodeResult = { ok: true; payload: QrDocPayload } | { ok: false }

const FRAGMENT_BUDGET = 2500
/** Hard ceiling on encoded input length, enforced before inflate (zip-bomb guard). */
const MAX_ENCODED_LENGTH = FRAGMENT_BUDGET * 4
/** Hard ceiling on items/totals row counts. The encoded-length cap does NOT bound
 *  the decompressed row count — repetitive rows compress ~1000:1, so a tiny
 *  fragment can inflate to hundreds of thousands of valid-shape rows and hang the
 *  verify page (client-side DoS). Real documents stay far below this. */
const MAX_PAIR_ENTRIES = 200

const CATEGORIES: readonly DocumentCategory[] = ['FEE_INVOICE', 'FEE_RECEIPT', 'MARKSHEET', 'ID_CARD', 'CERTIFICATE']

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((byte) => { binary += String.fromCharCode(byte) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(encoded: string): Uint8Array {
  const padded = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function isPairArray(value: unknown): value is [string, number][] {
  return Array.isArray(value) && value.length <= MAX_PAIR_ENTRIES && value.every((entry) =>
    Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'number')
}

function isQrDocPayload(value: unknown): value is QrDocPayload {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  if (candidate.v !== 1) return false
  if (typeof candidate.cat !== 'string' || !CATEGORIES.includes(candidate.cat as DocumentCategory)) return false
  for (const key of ['num', 'date', 'inst'] as const) {
    if (typeof candidate[key] !== 'string') return false
  }
  for (const key of ['student', 'status'] as const) {
    if (candidate[key] !== undefined && typeof candidate[key] !== 'string') return false
  }
  for (const key of ['items', 'totals'] as const) {
    if (candidate[key] !== undefined && !isPairArray(candidate[key])) return false
  }
  return true
}

export function encodePayload(payload: QrDocPayload): string {
  return toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(payload))))
}

export function decodePayload(encoded: string): QrDecodeResult {
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > MAX_ENCODED_LENGTH) return { ok: false }
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(inflate(fromBase64Url(encoded))))
    return isQrDocPayload(parsed) ? { ok: true, payload: parsed } : { ok: false }
  } catch {
    return { ok: false }
  }
}

export function buildVerifyUrl(baseUrl: string, payload: QrDocPayload): string {
  let encoded = encodePayload(payload)
  if (encoded.length > FRAGMENT_BUDGET) {
    const { items: _items, ...summary } = payload
    encoded = encodePayload(summary as QrDocPayload)
  }
  return `${baseUrl.replace(/\/$/, '')}/verify#${encoded}`
}

export function payloadFromDocumentData(data: DocumentData): QrDocPayload {
  const isReceipt = data.category === 'FEE_RECEIPT'
  const isFeeDocument = data.category === 'FEE_INVOICE' || isReceipt
  return {
    v: 1,
    cat: data.category,
    num: (isReceipt ? data.tokens.receipt_no : data.tokens.invoice_no) || data.tokens.student_id || '',
    date: data.tokens.invoice_date || data.tokens.issue_date || '',
    inst: data.tokens.school_name || '',
    student: [data.tokens.student_name, data.tokens.class_section].filter(Boolean).join(' · ') || undefined,
    // c6 is the precomputed line total (see datasets.ts data contract). Non-fee
    // categories carry marks/attributes in these columns, so they get no items.
    items: isFeeDocument && data.rows.length
      ? data.rows.map((row) => [String(row.c1 ?? ''), Number(row.c6 ?? 0)] as [string, number])
      : undefined,
    status: data.status,
  }
}

/** Pre-generate QR data URLs for every qr element (async; docRender is sync). */
export async function prepareQrDataUrls(
  layout: LayoutV2,
  data: DocumentData,
  verifyBaseUrl: string = window.location.origin,
): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  const payload = payloadFromDocumentData(data)
  for (const page of layout.pages) {
    for (const element of page.elements) {
      if (element.type !== 'qr') continue
      const content = element.encode === 'document-number'
        ? (payload.num || 'UNASSIGNED')
        : buildVerifyUrl(verifyBaseUrl, payload)
      result[element.id] = await QRCode.toDataURL(content, { margin: 0, width: 256 })
    }
  }
  return result
}
