/** Per-element HTML renderers. THE single escape boundary for the whole Studio:
 *  every dynamic value passes through escapeHtml / safe* helpers here.
 *  Used identically by the editor canvas (via dangerouslySetInnerHTML inside the
 *  positioned wrapper) and by docRender's print assembly — guaranteeing WYSIWYG. */

import { computeTableRows, computeTotals } from './formula'
import type { CanvasElement, TableColumn, TextAlign } from './types'
import type { DocumentData } from './types'

export interface RenderContext {
  data: DocumentData
  /** true → tokens resolve to values; false → show raw {{token}} (editor "sample data" off). */
  sampleMode: boolean
  /** editor: wrap resolved tokens in a highlight span; print: plain text. */
  highlightTokens: boolean
  /** The template's table (if any) — needed by totals SUM_TABLE. */
  table: { columns: TableColumn[]; rows: Record<string, unknown>[] } | null
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character
  ))
}

export const safeAlign = (value: string): TextAlign =>
  (['left', 'center', 'right'].includes(value) ? value as TextAlign : 'left')
export const safeColor = (value: string, fallback = '#16212E'): string =>
  (/^#[0-9A-Fa-f]{3,8}$/.test(value) ? value : fallback)
export const safePct = (value: number): number =>
  (Number.isFinite(value) ? Math.min(Math.max(value, 1), 100) : 20)

const formatNumber = (value: unknown): string => {
  const num = Number(value)
  if (!Number.isFinite(num)) return String(value ?? '')
  return num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Escape everything, then substitute {{tokens}} (tokens survive escaping — no {} in the escape set). */
export function resolveContent(content: string, ctx: RenderContext): string {
  return escapeHtml(content).replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_match, token: string) => {
    if (!ctx.sampleMode) return `<span class="doc-tk">{{${escapeHtml(token)}}}</span>`
    const value = escapeHtml(ctx.data.tokens[token] ?? '')
    return ctx.highlightTokens ? `<span class="doc-tk">${value}</span>` : value
  })
}

export function renderElementInner(el: CanvasElement, ctx: RenderContext): string {
  switch (el.type) {
    case 'text': {
      const s = el.style
      return `<div class="doc-text" style="font-size:${safePct(s.fontSize)}px;font-weight:${s.bold ? 700 : 400};font-style:${s.italic ? 'italic' : 'normal'};text-align:${safeAlign(s.align)};color:${safeColor(s.color)}">${resolveContent(el.content, ctx).replace(/\n/g, '<br>')}</div>`
    }
    case 'image': {
      const src = ctx.data.images[el.src] ?? (el.src.startsWith('http') || el.src.startsWith('data:') ? el.src : null)
      if (src) return `<img class="doc-img" src="${escapeHtml(src)}" alt="" />`
      return `<div class="doc-img-fallback">${escapeHtml(el.fallbackInitials || '?')}</div>`
    }
    case 'table': {
      const rows = computeTableRows(el.columns, ctx.data.rows)
      const header = el.columns.map((column) =>
        `<th style="width:${safePct(column.widthPct)}%;text-align:${safeAlign(column.align)}">${escapeHtml(column.label)}</th>`,
      ).join('')
      const body = rows.map((row) => `<tr>${el.columns.map((column) => {
        const raw = row[column.id]
        const value = (column.dtype === 'number' || column.type === 'formula') && raw !== '#ERR'
          ? formatNumber(raw)
          : escapeHtml(String(raw ?? ''))
        return `<td style="text-align:${safeAlign(column.align)}">${value === '#ERR' ? '#ERR' : value}</td>`
      }).join('')}</tr>`).join('')
      return `<table class="doc-table" style="font-size:${safePct(el.style.fontSize)}px"><thead><tr style="background:${safeColor(el.style.headerBg)};color:${safeColor(el.style.headerColor, '#FFFFFF')}">${header}</tr></thead><tbody>${body}</tbody></table>`
    }
    case 'totals': {
      const results = computeTotals(el.rows, ctx.table)
      return `<div class="doc-totals">${el.rows.map((row) => {
        const value = results[row.id]
        const display = value === '#ERR' ? '#ERR' : formatNumber(value)
        return `<div class="doc-totals-row${row.emphasize ? ' is-grand' : ''}"><span>${escapeHtml(row.label)}</span><span>${display}</span></div>`
      }).join('')}</div>`
    }
    case 'shape':
      return `<div class="doc-shape" style="background:${safeColor(el.fill, '#E8EEF5')}"></div>`
    case 'divider':
      return `<div class="doc-divider" style="border-top-color:${safeColor(el.stroke)}"></div>`
    case 'signature':
      return `<div class="doc-signature">${escapeHtml(el.label)}</div>`
    case 'qr': {
      const dataUrl = ctx.data.qrDataUrls?.[el.id]
      if (dataUrl) return `<img class="doc-qr" src="${escapeHtml(dataUrl)}" alt="QR code" />`
      return `<div class="doc-qr-placeholder"></div>`
    }
  }
}

/** Shared element CSS injected by both the stage (editor) and docRender (print). */
export const ELEMENT_CSS = `
.doc-text{line-height:1.35;overflow:hidden;width:100%;height:100%}
.doc-tk{background:#FDF1E1;color:#9A5B12;border-radius:2px;padding:0 1px}
.doc-img{width:100%;height:100%;object-fit:contain}
.doc-img-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#173A5E;color:#fff;font-weight:800;border-radius:4px}
.doc-table{width:100%;border-collapse:collapse}
.doc-table th{padding:4px 5px;font-weight:700;text-align:left}
.doc-table td{padding:3.5px 5px;border-bottom:0.3mm solid #EEF0F4}
.doc-totals{width:100%;font-size:11px}
.doc-totals-row{display:flex;justify-content:space-between;padding:1px 0}
.doc-totals-row.is-grand{font-weight:800;border-top:0.4mm solid #16212E;margin-top:1mm;padding-top:1mm}
.doc-shape{width:100%;height:100%}
.doc-divider{width:100%;border-top:0.5mm solid #5B6675}
.doc-signature{width:100%;height:100%;border-top:0.3mm solid #5B6675;display:flex;align-items:flex-end;justify-content:center;font-size:9px;color:#5B6675;padding-top:1mm}
.doc-qr,.doc-qr-placeholder{width:100%;height:100%}
.doc-qr-placeholder{background:repeating-conic-gradient(#16212E 0% 25%, #fff 0% 50%) 0 0/22% 22%;border-radius:2px}
`
