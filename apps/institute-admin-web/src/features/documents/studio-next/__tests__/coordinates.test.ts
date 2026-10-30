import { describe, expect, it } from 'vitest'
import { PX_PER_MM } from '../constants'
import {
  detectZoneAtPageY,
  getElementAbsoluteYMm,
  mmToPx,
  pageToZoneY,
  pxToMm,
  screenToPageMm,
  zoneToPageY,
} from '../math/coordinates'
import type { ElementV3, LayoutV3 } from '@campusone/document-engine'

describe('Studio Next Coordinate Mathematics', () => {
  it('converts mm to px matching standard W3C 96/25.4 ratio', () => {
    expect(PX_PER_MM).toBeCloseTo(3.779527559, 6)
    expect(mmToPx(25.4, 1.0)).toBeCloseTo(96, 4)
    expect(mmToPx(25.4, 2.0)).toBeCloseTo(192, 4)
    expect(mmToPx(25.4, 0.5)).toBeCloseTo(48, 4)
  })

  it('converts px to mm matching standard ratio', () => {
    expect(pxToMm(96, 1.0)).toBeCloseTo(25.4, 4)
    expect(pxToMm(192, 2.0)).toBeCloseTo(25.4, 4)
    expect(pxToMm(48, 0.5)).toBeCloseTo(25.4, 4)
  })

  it('projects screen coordinates onto page millimeter space invariant of zoom', () => {
    const rect = { left: 100, top: 200 }
    // Pointer at (196, 296) with zoom 1.0 -> 96px offset -> 25.4 mm
    const at1x = screenToPageMm(196, 296, rect, 1.0)
    expect(at1x.xMm).toBeCloseTo(25.4, 2)
    expect(at1x.yMm).toBeCloseTo(25.4, 2)

    // With zoom 2.0 -> 192px offset -> 25.4 mm
    const at2x = screenToPageMm(292, 392, rect, 2.0)
    expect(at2x.xMm).toBeCloseTo(25.4, 2)
    expect(at2x.yMm).toBeCloseTo(25.4, 2)
  })

  it('computes zoneToPageY correctly for all three stationery zones', () => {
    const headerMm = 30
    const footerMm = 20
    const pageHeight = 297

    // Header zone: origin is at 0
    expect(zoneToPageY('header', 10, headerMm, footerMm, pageHeight)).toBe(10)

    // Body zone: origin is at headerMm
    expect(zoneToPageY('body', 15, headerMm, footerMm, pageHeight)).toBe(45)

    // Default (undefined zone): treated as body
    expect(zoneToPageY(undefined, 15, headerMm, footerMm, pageHeight)).toBe(45)

    // Footer zone: origin is at pageHeight - footerMm (277)
    expect(zoneToPageY('footer', 5, headerMm, footerMm, pageHeight)).toBe(282)
  })

  it('performs identity round-trip between zone and page coordinates', () => {
    const headerMm = 35
    const footerMm = 25
    const pageHeight = 297

    const testCases: Array<{ zone: 'header' | 'body' | 'footer'; y: number }> = [
      { zone: 'header', y: 12.5 },
      { zone: 'body', y: 80.0 },
      { zone: 'footer', y: 18.0 },
    ]

    for (const { zone, y } of testCases) {
      const pageY = zoneToPageY(zone, y, headerMm, footerMm, pageHeight)
      const restored = pageToZoneY(zone, pageY, headerMm, footerMm, pageHeight)
      expect(restored).toBeCloseTo(y, 4)
    }
  })

  it('detects stationery zone from physical page Y coordinate', () => {
    const headerMm = 30
    const footerMm = 20
    const pageHeight = 297

    expect(detectZoneAtPageY(15, headerMm, footerMm, pageHeight)).toBe('header')
    expect(detectZoneAtPageY(30, headerMm, footerMm, pageHeight)).toBe('body')
    expect(detectZoneAtPageY(150, headerMm, footerMm, pageHeight)).toBe('body')
    expect(detectZoneAtPageY(277, headerMm, footerMm, pageHeight)).toBe('footer')
    expect(detectZoneAtPageY(290, headerMm, footerMm, pageHeight)).toBe('footer')
  })

  it('computes element absolute Y in full layout context', () => {
    const layout: LayoutV3 = {
      version: 3,
      page: {
        sizeId: 'A4P',
        orientation: 'PORTRAIT',
        marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      },
      zones: { headerMm: 36, footerMm: 20 },
      watermark: { mode: 'none' },
      pages: [],
    }

    const headerEl: ElementV3 = { id: '1', type: 'text', zone: 'header', xMm: 10, yMm: 5, widthMm: 50, heightMm: 10 }
    const bodyEl: ElementV3 = { id: '2', type: 'text', zone: 'body', xMm: 10, yMm: 10, widthMm: 50, heightMm: 10 }
    const footerEl: ElementV3 = { id: '3', type: 'text', zone: 'footer', xMm: 10, yMm: 4, widthMm: 50, heightMm: 10 }

    expect(getElementAbsoluteYMm(headerEl, layout)).toBe(5)
    expect(getElementAbsoluteYMm(bodyEl, layout)).toBe(46) // 36 + 10
    expect(getElementAbsoluteYMm(footerEl, layout)).toBe(281) // (297 - 20) + 4
  })
})
