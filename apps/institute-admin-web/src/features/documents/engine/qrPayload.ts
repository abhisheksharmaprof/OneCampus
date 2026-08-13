/** Self-contained document payloads for QR codes.
 *  The payload rides in a URL #fragment (never sent to any server); the verify page
 *  renders it with zero database dependency. QR capacity is ~2.9KB — buildVerifyUrl
 *  deterministically degrades to a summary (no line items) when over budget. */

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

const FRAGMENT_BUDGET = 2500

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

export function encodePayload(payload: QrDocPayload): string {
  return toBase64Url(deflate(new TextEncoder().encode(JSON.stringify(payload))))
}

export function decodePayload(encoded: string): QrDocPayload {
  return JSON.parse(new TextDecoder().decode(inflate(fromBase64Url(encoded)))) as QrDocPayload
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
  return {
    v: 1,
    cat: data.category,
    num: (isReceipt ? data.tokens.receipt_no : data.tokens.invoice_no) || data.tokens.student_id || '',
    date: data.tokens.invoice_date || data.tokens.issue_date || '',
    inst: data.tokens.school_name || '',
    student: [data.tokens.student_name, data.tokens.class_section].filter(Boolean).join(' · ') || undefined,
    items: data.rows.length
      ? data.rows.map((row) => [String(row.c1 ?? ''), Number(row.c4 ?? row.c3 ?? 0) * (Number(row.c3) || 1)] as [string, number])
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
