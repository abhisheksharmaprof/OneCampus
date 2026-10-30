import type { LayoutV3, PageSizeId, Orientation, ElementV3, ZoneV3 } from '@campusone/document-engine'
import { createDefaultStaticTable, createDefaultDynamicTable } from '@campusone/document-engine'
import { PAGE_SIZES_MM } from '../engine/types'

/** W3C standard: 1 inch = 96 CSS px = 25.4 mm */
export const PX_PER_MM = 96 / 25.4 // ~3.779527559055118

export const MIN_ELEMENT_WIDTH_MM = 2.0
export const MIN_ELEMENT_HEIGHT_MM = 1.0
export const MAX_GEOMETRY_MM = 1000.0
export const MIN_POSITION_MM = -500.0

export const SNAP_TOLERANCE_MM = 1.5

export const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0]

export function createDefaultLayoutV3(sizeId: PageSizeId = 'A4P', orientation: Orientation = 'PORTRAIT'): LayoutV3 {
  const isA4 = sizeId === 'A4P' || sizeId === 'A4L'
  const isCard = sizeId === 'CR80'

  return {
    version: 3,
    page: {
      sizeId,
      orientation,
      marginsMm: isCard
        ? { top: 3, right: 3, bottom: 3, left: 3 }
        : { top: 12, right: 12, bottom: 12, left: 12 },
      background: '#FFFFFF',
    },
    zones: {
      headerMm: isCard ? 0 : 36,
      footerMm: isCard ? 0 : 20,
      repeatHeader: !isCard,
      repeatFooter: !isCard,
      hideHeaderOnFirstPage: false,
    },
    watermark: {
      mode: 'none',
      opacity: 0.08,
      rotationDeg: -28,
      scalePercent: 100,
      placement: 'pageCenter',
    },
    pages: [
      {
        id: 'p1',
        elements: [],
      },
    ],
  }
}

/** Pre-configured templates for 12 element types */
export function createElementDefault(type: string, zone: ZoneV3 = 'body', nextId = crypto.randomUUID()): ElementV3 {
  switch (type) {
    case 'text':
      return {
        id: nextId,
        type: 'text',
        zone,
        xMm: 15,
        yMm: 10,
        widthMm: 80,
        heightMm: 14,
        rotationDeg: 0,
        runs: [
          {
            text: 'Text block',
            style: {
              fontSizePt: 11,
              fontFamily: 'Inter',
              color: '#16212E',
              bold: false,
              italic: false,
              align: 'left',
            },
          },
        ],
      }
    case 'image':
      return {
        id: nextId,
        type: 'image',
        zone,
        xMm: 15,
        yMm: 10,
        widthMm: 35,
        heightMm: 35,
        rotationDeg: 0,
        fit: 'contain',
        mask: 'square',
      }
    case 'photo':
      return {
        id: nextId,
        type: 'photo',
        zone,
        xMm: 15,
        yMm: 10,
        widthMm: 32,
        heightMm: 40,
        rotationDeg: 0,
        fieldId: 'student_photo',
        fallbackInitials: 'ST',
        mask: 'rounded',
      }
    case 'signature':
      return {
        id: nextId,
        type: 'signature',
        zone: 'footer',
        xMm: 130,
        yMm: 5,
        widthMm: 50,
        heightMm: 22,
        rotationDeg: 0,
        fieldId: 'authorised_signatory',
        label: 'Authorized Signatory',
        showLine: true,
      }
    case 'staticTable':
    case 'table':
      return {
        ...createDefaultStaticTable(nextId, 2, 3, 160, 35),
        zone,
        xMm: 15,
        yMm: 15,
      }
    case 'dynamicTable':
      return {
        ...createDefaultDynamicTable(nextId, 'finance.fee_items', 180, 45),
        zone,
        xMm: 15,
        yMm: 15,
      }
    case 'totals':
      return {
        id: nextId,
        type: 'totals',
        datasetId: 'fee_items',
        zone,
        xMm: 120,
        yMm: 65,
        widthMm: 75,
        heightMm: 28,
        rotationDeg: 0,
        rows: [
          { label: 'Subtotal', fieldId: 'subtotal' },
          { label: 'Discount', fieldId: 'discount' },
          { label: 'Tax (GST)', fieldId: 'tax' },
          { label: 'Grand Total', fieldId: 'grand_total' },
        ],
      }
    case 'shape':
      return {
        id: nextId,
        type: 'shape',
        zone,
        xMm: 15,
        yMm: 10,
        widthMm: 180,
        heightMm: 16,
        rotationDeg: 0,
        fillColor: '#F1F5F9',
        borderColor: '#CBD5E1',
        borderWidthMm: 0.5,
        borderRadiusMm: 2,
      }
    case 'divider':
      return {
        id: nextId,
        type: 'divider',
        zone,
        xMm: 15,
        yMm: 20,
        widthMm: 180,
        heightMm: 2,
        rotationDeg: 0,
        color: '#E2E8F0',
        thicknessMm: 0.5,
        lineStyle: 'solid',
      }
    case 'pageFrame':
      return {
        id: nextId,
        type: 'pageFrame',
        zone: 'body',
        xMm: 8,
        yMm: 8,
        widthMm: 194,
        heightMm: 281,
        rotationDeg: 0,
        strokeColor: '#173A5E',
        strokeWidthMm: 1.0,
        insetMm: 6,
        cornerStyle: 'ornate',
      }
    case 'qr':
      return {
        id: nextId,
        type: 'qr',
        zone: 'footer',
        xMm: 15,
        yMm: 2,
        widthMm: 24,
        heightMm: 24,
        rotationDeg: 0,
        fieldId: 'qr_verify_url',
        eccLevel: 'M',
      }
    case 'barcode':
      return {
        id: nextId,
        type: 'barcode',
        zone,
        xMm: 15,
        yMm: 10,
        widthMm: 50,
        heightMm: 18,
        rotationDeg: 0,
        fieldId: 'admission_no',
        showText: true,
        format: 'CODE128',
      }
    default:
      return {
        id: nextId,
        type: 'text',
        zone,
        xMm: 15,
        yMm: 10,
        widthMm: 60,
        heightMm: 12,
        rotationDeg: 0,
        runs: [{ text: 'New element' }],
      }
  }
}
