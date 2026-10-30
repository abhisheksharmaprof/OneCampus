import type { ElementV3, LayoutV3, ZoneV3 } from '@campusone/document-engine'
import { PAGE_SIZES_MM } from '../../engine/types'
import { PX_PER_MM } from '../constants'

/** Convert millimeter measurement to visual CSS screen pixels at given zoom */
export function mmToPx(mm: number, zoom = 1.0): number {
  return mm * PX_PER_MM * zoom
}

/** Convert visual CSS screen pixels back to physical millimeters at given zoom */
export function pxToMm(px: number, zoom = 1.0): number {
  return px / (PX_PER_MM * zoom)
}

/** Converts zone-relative Y coordinate into physical page Y coordinate */
export function zoneToPageY(
  zone: ZoneV3 | undefined,
  yMm: number,
  headerMm: number,
  footerMm: number,
  pageHeightMm: number,
): number {
  if (zone === 'header') return yMm
  if (zone === 'footer') return (pageHeightMm - footerMm) + yMm
  // default: body
  return headerMm + yMm
}

/** Converts physical page Y coordinate into zone-relative Y coordinate */
export function pageToZoneY(
  zone: ZoneV3 | undefined,
  pageYmm: number,
  headerMm: number,
  footerMm: number,
  pageHeightMm: number,
): number {
  if (zone === 'header') return pageYmm
  if (zone === 'footer') return pageYmm - (pageHeightMm - footerMm)
  // default: body
  return pageYmm - headerMm
}

/** Detects which zone a physical page Y coordinate falls into */
export function detectZoneAtPageY(
  pageYmm: number,
  headerMm: number,
  footerMm: number,
  pageHeightMm: number,
): ZoneV3 {
  if (headerMm > 0 && pageYmm < headerMm) return 'header'
  if (footerMm > 0 && pageYmm >= pageHeightMm - footerMm) return 'footer'
  return 'body'
}

/** Resolves an element's absolute page Y coordinate based on layout zones and page dimensions */
export function getElementAbsoluteYMm(element: ElementV3, layout: LayoutV3): number {
  const size = PAGE_SIZES_MM[layout.page.sizeId]
  const pageHeight = layout.page.orientation === 'LANDSCAPE' ? size.w : size.h
  return zoneToPageY(
    element.zone,
    element.yMm,
    layout.zones.headerMm,
    layout.zones.footerMm,
    pageHeight,
  )
}

/** Project client mouse pointer (e.g. from PointerEvent) onto page millimeter coordinates */
export function screenToPageMm(
  clientX: number,
  clientY: number,
  boundingRect: { left: number; top: number },
  zoom = 1.0,
): { xMm: number; yMm: number } {
  const scale = PX_PER_MM * zoom
  return {
    xMm: (clientX - boundingRect.left) / scale,
    yMm: (clientY - boundingRect.top) / scale,
  }
}
