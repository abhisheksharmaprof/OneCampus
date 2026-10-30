export const PAGE_SIZES_MM = {
  A4P: { width: 210, height: 297 },
  A4L: { width: 297, height: 210 },
  CR80: { width: 86, height: 54 },
  A4P_HALF_TOP: { width: 210, height: 148.5 },
  A4P_HALF_BOTTOM: { width: 210, height: 148.5 },
} as const

export type PageSizeId = keyof typeof PAGE_SIZES_MM
export type Orientation = 'PORTRAIT' | 'LANDSCAPE'
export type WatermarkMode = 'none' | 'image' | 'text' | 'both'
export type ElementTypeV3 =
  | 'text' | 'image' | 'table' | 'totals' | 'shape' | 'divider'
  | 'signature' | 'qr' | 'barcode' | 'photo' | 'pageFrame'
export type ZoneV3 = 'header' | 'body' | 'footer'

export interface BaseElementV3 {
  id: string
  type: ElementTypeV3
  zone?: ZoneV3
  xMm: number
  yMm: number
  widthMm: number
  heightMm: number
  rotationDeg?: number
  zIndex?: number
  locked?: boolean
  visible?: boolean
  [key: string]: unknown
}

export * from './tokens'
export * from './autofit'
export * from './barcode'
export * from './qrcode'
export * from './table'
export * from './formula'
export * from './sampleData'
export * from './pagination'

import { interpolateTokens, escapeHtml } from './tokens'
import { computeAutoFitFontSize } from './autofit'
import { generateBarcodeSvg } from './barcode'
import { generateQrSvg } from './qrcode'
import { compileTableHtml, type TableElementV3, type StaticTableElementV3, type DynamicTableElementV3 } from './table'

export type TextAlign = 'left' | 'center' | 'right' | 'justify'
export type TextVerticalAlign = 'top' | 'middle' | 'bottom'
export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
export type TextDecoration = 'none' | 'underline' | 'line-through' | 'underline line-through'

export interface TextStyleV3 {
  fontFamily?: string
  fontSizePt?: number
  fontWeight?: number | string
  fontStyle?: 'normal' | 'italic'
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikethrough?: boolean
  textDecoration?: TextDecoration
  color?: string
  lineHeight?: number
  letterSpacingMm?: number
  paragraphSpacingMm?: number
  align?: TextAlign
  verticalAlign?: TextVerticalAlign
  textTransform?: TextTransform
  opacity?: number
  autoFit?: boolean
  minFontSizePt?: number
  [key: string]: unknown
}

export interface GradientStopV3 {
  color: string
  offset: number
}

export interface LinearGradientV3 {
  type: 'linear-gradient'
  angleDeg?: number
  stops: GradientStopV3[]
}

export interface RadialGradientV3 {
  type: 'radial-gradient'
  shape?: 'circle' | 'ellipse'
  stops: GradientStopV3[]
}

export interface SolidFillV3 {
  type: 'solid'
  color: string
}

export type FillV3 = string | SolidFillV3 | LinearGradientV3 | RadialGradientV3

export type BorderStyleV3 = 'none' | 'solid' | 'dashed' | 'dotted' | 'double'

export interface BorderEdgeV3 {
  style: BorderStyleV3
  widthMm: number
  color: string
}

export interface BorderV3 {
  unified?: boolean
  top?: BorderEdgeV3
  right?: BorderEdgeV3
  bottom?: BorderEdgeV3
  left?: BorderEdgeV3
}

export interface CornerRadiiV3 {
  unified?: boolean
  topLeftMm?: number
  topRightMm?: number
  bottomRightMm?: number
  bottomLeftMm?: number
}

export type ClippingMaskType = 'square' | 'rounded' | 'circle' | 'hexagon'

export interface ImageFiltersV3 {
  grayscale?: number
  brightness?: number
  contrast?: number
  opacity?: number
}

export type PhotoAspectRatioPreset =
  | 'CR80_25x30'
  | 'PASSPORT_35x45'
  | 'STAMP_20x25'
  | 'SQUARE_1x1'
  | 'CUSTOM'

export interface RichTextRunV3 {
  text?: string
  field?: { id: string; fallback?: string; prefix?: string; suffix?: string }
  style?: TextStyleV3 | Record<string, unknown>
}

export interface TextElementV3 extends BaseElementV3 {
  type: 'text'
  content?: string
  runs?: RichTextRunV3[]
  style?: TextStyleV3 | Record<string, unknown>
  fillColor?: string
  fill?: FillV3
  border?: BorderV3
  borderColor?: string
  borderWidthMm?: number
  borderRadiusMm?: number
  cornerRadii?: CornerRadiiV3
  opacity?: number
}

export interface ImageElementV3 extends BaseElementV3 {
  type: 'image' | 'photo' | 'signature'
  assetId?: string
  fieldId?: string
  src?: string
  fit?: 'contain' | 'cover' | 'stretch' | 'crop'
  mask?: ClippingMaskType
  maskRadiusMm?: number
  panOffset?: { xPercent: number; yPercent: number }
  zoomScale?: number
  filters?: ImageFiltersV3
  isStudentPhoto?: boolean
  style?: Record<string, unknown>
}

export interface PhotoElementV3 extends BaseElementV3 {
  type: 'photo'
  fieldId?: string
  dataKey?: string
  assetId?: string
  aspectRatioPreset?: PhotoAspectRatioPreset
  aspectRatioLocked?: boolean
  fit?: 'contain' | 'cover' | 'crop'
  mask?: ClippingMaskType
  maskRadiusMm?: number
  fallbackInitials?: string
  showBorder?: boolean
  borderColor?: string
  borderWidthMm?: number
  filters?: ImageFiltersV3
  style?: Record<string, unknown>
}

export type QrPayloadType = 'verify-url' | 'document-number' | 'custom-field' | 'static-text'
export type QrErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H'

export interface QrCodeElementV3 extends BaseElementV3 {
  type: 'qr'
  payloadType?: QrPayloadType
  fieldId?: string
  staticText?: string
  eccLevel?: QrErrorCorrectionLevel
  quietZone?: number
  darkColor?: string
  lightColor?: string
  style?: Record<string, unknown>
}

export type BarcodeSymbology = 'CODE128' | 'CODE39'

export interface BarcodeElementV3 extends BaseElementV3 {
  type: 'barcode'
  format?: BarcodeSymbology
  fieldId?: string
  staticValue?: string
  showText?: boolean
  textPosition?: 'bottom' | 'top'
  barHeightPercent?: number
  quietZoneMm?: number
  color?: string
  backgroundColor?: string
  style?: Record<string, unknown>
}

export interface ShapeElementV3 extends BaseElementV3 {
  type: 'shape'
  shapeType?: 'rectangle' | 'ellipse' | 'pill'
  fillColor?: string
  fill?: FillV3
  borderColor?: string
  borderWidthMm?: number
  borderStyle?: BorderStyleV3
  border?: BorderV3
  borderRadiusMm?: number
  cornerRadii?: CornerRadiiV3
  opacity?: number
  style?: Record<string, unknown>
}

export interface DividerElementV3 extends BaseElementV3 {
  type: 'divider'
  color?: string
  thicknessMm?: number
  lineStyle?: BorderStyleV3
  opacity?: number
  style?: Record<string, unknown>
}

export interface TotalsElementV3 extends BaseElementV3 {
  type: 'totals'
  datasetId: string
  rows: Array<{ label: string; fieldId: string; format?: string }>
}

export interface DecorativeElementV3 extends BaseElementV3 {
  type: 'shape' | 'divider' | 'qr' | 'barcode' | 'pageFrame'
  style?: Record<string, unknown>
  fieldId?: string
}

export type ElementV3 =
  | TextElementV3
  | ImageElementV3
  | PhotoElementV3
  | QrCodeElementV3
  | BarcodeElementV3
  | ShapeElementV3
  | DividerElementV3
  | StaticTableElementV3
  | DynamicTableElementV3
  | TotalsElementV3
  | DecorativeElementV3

export interface MasterLetterheadBindingV3 {
  templateId: string
  mode: 'followDraft' | 'pinned'
  publishedVersionId?: string
}

export interface WatermarkV3 {
  mode: WatermarkMode
  text?: string
  assetId?: string
  opacity?: number
  rotationDeg?: number
  scalePercent?: number
  placement?: 'pageCenter' | 'bodyCenter' | 'custom' | 'tile'
  xMm?: number
  yMm?: number
  gapXmm?: number
  gapYmm?: number
  [key: string]: unknown
}

export interface LayoutV3 {
  version: 3
  page: {
    sizeId: PageSizeId
    orientation: Orientation
    marginsMm: { top: number; right: number; bottom: number; left: number }
    background?: string | { assetId: string }
  }
  zones: {
    headerMm: number
    footerMm: number
    repeatHeader?: boolean
    repeatFooter?: boolean
    hideHeaderOnFirstPage?: boolean
  }
  pages: Array<{ id: string; elements: ElementV3[] }>
  watermark: WatermarkV3
  masterLetterhead?: MasterLetterheadBindingV3 | null
  assets?: Array<{ id: string; versionId: string }>
  [key: string]: unknown
}

export interface LayoutDiagnostic {
  code: string
  message: string
  elementId?: string
  property?: string
}

export class LayoutValidationError extends Error {
  constructor(readonly diagnostic: LayoutDiagnostic) {
    super(diagnostic.message)
    this.name = 'LayoutValidationError'
  }
}

/** Type guard verifying if an unknown object is a LayoutV3 document. */
export function isLayoutV3(layout: unknown): layout is LayoutV3 {
  return typeof layout === 'object' && layout !== null && (layout as Record<string, unknown>).version === 3
}

/** Type guard verifying if an unknown object is a legacy LayoutV2 document. */
export function isLayoutV2(layout: unknown): layout is { version: 2; [key: string]: unknown } {
  return typeof layout === 'object' && layout !== null && (layout as Record<string, unknown>).version === 2
}

const fail = (code: string, message: string, elementId?: string, property?: string): never => {
  throw new LayoutValidationError({ code, message, elementId, property })
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)
const isUuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
const ELEMENT_TYPES = new Set<ElementTypeV3>([
  'text', 'image', 'table', 'totals', 'shape', 'divider', 'signature', 'qr', 'barcode', 'photo', 'pageFrame',
])

function finite(value: unknown, path: string): number {
  if (!isFiniteNumber(value)) fail('LAYOUT_NUMBER_INVALID', `${path} must be a finite number.`, undefined, path)
  return value as number
}

/** Validate the public v3 shape and return it unchanged for lossless round-tripping. */
export function normalizeLayout(input: unknown): LayoutV3 {
  if (!isRecord(input) || input.version !== 3) {
    fail('LAYOUT_VERSION_INVALID', 'Layout version must be 3.')
  }
  const layout = input as Record<string, unknown>
  const page = layout.page as Record<string, unknown>
  if (typeof page.sizeId !== 'string' || !Object.hasOwn(PAGE_SIZES_MM, page.sizeId)) {
    fail('PAGE_SIZE_INVALID', 'Page size is missing or unsupported.', undefined, 'page.sizeId')
  }
  const sizeId = page.sizeId as PageSizeId
  const orientation = page.orientation
  if (orientation !== 'PORTRAIT' && orientation !== 'LANDSCAPE') {
    fail('PAGE_ORIENTATION_INVALID', 'Page orientation must be PORTRAIT or LANDSCAPE.', undefined, 'page.orientation')
  }
  if ((sizeId === 'A4L') !== (orientation === 'LANDSCAPE')) {
    fail('PAGE_ORIENTATION_MISMATCH', 'Page orientation must match the selected page size.', undefined, 'page.orientation')
  }
  if (!isRecord(page.marginsMm)) {
    fail('PAGE_MARGINS_INVALID', 'Page margins must define top, right, bottom and left in millimeters.')
  }
  const margins = ['top', 'right', 'bottom', 'left'] as const
  const marginsMm = page.marginsMm as Record<string, unknown>
  for (const side of margins) {
    const value = finite(marginsMm[side], `page.marginsMm.${side}`)
    if (value < 0) fail('PAGE_MARGIN_NEGATIVE', `page.marginsMm.${side} cannot be negative.`, undefined, `page.marginsMm.${side}`)
  }

  if (!isRecord(layout.zones)) fail('ZONES_INVALID', 'Zones must be an object.')
  const zones = layout.zones as Record<string, unknown>
  const headerMm = finite(zones.headerMm, 'zones.headerMm')
  const footerMm = finite(zones.footerMm, 'zones.footerMm')
  if (headerMm < 0 || footerMm < 0) fail('ZONE_HEIGHT_NEGATIVE', 'Header and footer heights cannot be negative.')

  if (!Array.isArray(layout.pages) || layout.pages.length < 1 || layout.pages.length > 100) {
    fail('PAGES_INVALID', 'A layout must contain between 1 and 100 pages.')
  }
  const pageIds = new Set<string>()
  const ids = new Set<string>()
  let elementCount = 0
  for (const pageCandidate of layout.pages as unknown[]) {
    if (!isRecord(pageCandidate) || typeof pageCandidate.id !== 'string' || !Array.isArray(pageCandidate.elements)) {
      fail('PAGE_INVALID', 'Every page needs a string ID and an elements array.')
    }
    const pageEntry = pageCandidate as Record<string, unknown>
    const pageId = pageEntry.id as string
    if (!pageId.trim() || pageIds.has(pageId)) fail('PAGE_ID_INVALID', `Page ID ${pageId} is empty or repeated.`)
    pageIds.add(pageId)
    for (const candidate of pageEntry.elements as unknown[]) {
      elementCount += 1
      if (elementCount > 500) fail('ELEMENT_LIMIT_EXCEEDED', 'A layout may contain at most 500 elements.')
      if (!isRecord(candidate) || typeof candidate.id !== 'string' || !candidate.id.trim()) {
        fail('ELEMENT_ID_INVALID', 'Every element must have a non-empty string ID.')
      }
      const element = candidate as Record<string, unknown>
      const id = element.id as string
      if (ids.has(id)) fail('ELEMENT_ID_DUPLICATE', `Element ID ${id} is repeated.`, id, 'id')
      ids.add(id)
      if (typeof element.type !== 'string' || !ELEMENT_TYPES.has(element.type as ElementTypeV3)) {
        fail('ELEMENT_TYPE_INVALID', `Element ${id} has an unsupported type.`, id, 'type')
      }
      for (const property of ['xMm', 'yMm', 'widthMm', 'heightMm'] as const) {
        const value = finite(element[property], `${id}.${property}`)
        if ((property === 'widthMm' || property === 'heightMm') && !(value > 0 && value <= 1000)) {
          fail('ELEMENT_SIZE_INVALID', `Element ${id} ${property} must be between 0 and 1000 mm.`, id, property)
        }
        if ((property === 'xMm' || property === 'yMm') && !(value >= -500 && value <= 1000)) {
          fail('ELEMENT_POSITION_INVALID', `Element ${id} ${property} is outside the supported range.`, id, property)
        }
      }
      if (element.type === 'table') {
        if (element.mode !== 'static' && element.mode !== 'dynamic') {
          fail('TABLE_MODE_INVALID', `Table ${id} mode must be static or dynamic.`, id, 'mode')
        }
        if (element.mode === 'dynamic' && (typeof element.datasetId !== 'string' || !element.datasetId)) {
          fail('TABLE_DATASET_REQUIRED', `Dynamic table ${id} requires a dataset ID.`, id, 'datasetId')
        }
      }
    }
  }

  const watermark = layout.watermark as Record<string, unknown> | undefined
  if (!watermark || !['none', 'image', 'text', 'both'].includes(String(watermark.mode))) {
    fail('WATERMARK_MODE_INVALID', 'Watermark mode must be none, image, text or both.', undefined, 'watermark.mode')
  }
  if (layout.masterLetterhead !== undefined && layout.masterLetterhead !== null) {
    const master = layout.masterLetterhead as Record<string, unknown>
    if (!isRecord(master) || !isUuid(master.templateId)) {
      fail('MASTER_LETTERHEAD_INVALID', 'Master letterhead requires a valid template ID.', undefined, 'masterLetterhead')
    }
    if (master.mode !== 'followDraft' && master.mode !== 'pinned') {
      fail('MASTER_LETTERHEAD_INVALID', 'Master letterhead mode must be followDraft or pinned.', undefined, 'masterLetterhead.mode')
    }
    if (master.mode === 'pinned' && !isUuid(master.publishedVersionId)) {
      fail('MASTER_LETTERHEAD_INVALID', 'Pinned master letterhead requires a published version ID.', undefined, 'masterLetterhead.publishedVersionId')
    }
  }

  const pageSize = PAGE_SIZES_MM[sizeId]
  const pageWidth = pageSize.width
  const pageHeight = pageSize.height
  if (Number(marginsMm.right) + Number(marginsMm.left) >= pageWidth) {
    fail('PAGE_MARGINS_EXCEED_PAGE', 'Horizontal margins must leave printable page width.')
  }
  if (Number(marginsMm.top) + Number(marginsMm.bottom) + headerMm + footerMm > pageHeight) {
    fail('ZONES_EXCEED_PAGE', 'Margins and header/footer zones exceed page height.')
  }

  return layout as unknown as LayoutV3
}

export function convertLegacyLayout(input: unknown): {
  layout: LayoutV3
  diagnostics: LayoutDiagnostic[]
} {
  if (!isRecord(input) || input.version !== 2) {
    fail('LEGACY_LAYOUT_VERSION_INVALID', 'Only version 2 layouts can be converted.')
  }
  const legacy = input as Record<string, unknown>
  const diagnostics: LayoutDiagnostic[] = []
  const legacyPage = isRecord(legacy.page) ? legacy.page : {}
  const sizeId = typeof legacyPage.sizeId === 'string' && Object.hasOwn(PAGE_SIZES_MM, legacyPage.sizeId)
    ? legacyPage.sizeId as PageSizeId
    : 'A4P'
  if (legacyPage.sizeId !== sizeId) {
    diagnostics.push({ code: 'PAGE_SIZE_DEFAULTED', message: 'Unsupported page size was converted to A4 portrait.' })
  }
  const oldZones = isRecord(legacy.zones) ? legacy.zones : {}
  const numberOr = (value: unknown, fallback: number, property: string): number => {
    if (isFiniteNumber(value)) return value
    diagnostics.push({ code: 'ZONE_DEFAULTED', message: `${property} was reset to ${fallback} mm.` })
    return fallback
  }
  const headerMm = Math.max(0, numberOr(oldZones.headerMm, 0, 'Header height'))
  const footerMm = Math.max(0, numberOr(oldZones.footerMm, 0, 'Footer height'))
  const oldPages = Array.isArray(legacy.pages) ? legacy.pages : []
  const pageEntries = oldPages.length ? [...oldPages] : [{ elements: [] }]
  const legacyLetterheadElements = isRecord(legacy.letterhead) && Array.isArray(legacy.letterhead.elements)
    ? legacy.letterhead.elements
    : []
  if (legacyLetterheadElements.length) {
    const firstPage = isRecord(pageEntries[0]) ? pageEntries[0] : {}
    pageEntries[0] = {
      ...firstPage,
      elements: [
        ...legacyLetterheadElements,
        ...(Array.isArray(firstPage.elements) ? firstPage.elements : []),
      ],
    }
    diagnostics.push({
      code: 'LETTERHEAD_COPIED_AS_LOCAL_CONTENT',
      message: 'The embedded legacy letterhead was copied into page one; link a published master for inheritance.',
    })
  }
  const geometry = PAGE_SIZES_MM[sizeId]
  const legacyWatermark = isRecord(legacy.watermark) ? legacy.watermark : {}
  const oldWatermarkMode = String(legacyWatermark.mode ?? 'none').toLowerCase()
  const watermarkMode: WatermarkMode = legacyWatermark.enabled === false
    ? 'none'
    : oldWatermarkMode === 'image' || oldWatermarkMode === 'text' || oldWatermarkMode === 'both'
      ? oldWatermarkMode
      : 'none'
  const watermark: WatermarkV3 = {
    mode: watermarkMode,
    text: typeof legacyWatermark.text === 'string' ? legacyWatermark.text : undefined,
    opacity: isFiniteNumber(legacyWatermark.opacity) ? legacyWatermark.opacity * 100 : undefined,
  }
  if (typeof legacyWatermark.imageUrl === 'string' && legacyWatermark.imageUrl) {
    diagnostics.push({
      code: 'WATERMARK_ASSET_RELINK_REQUIRED',
      message: 'The legacy watermark image must be relinked to an institute asset before printing.',
    })
  }
  let background: string | { assetId: string } =
    typeof legacyPage.background === 'string' ? legacyPage.background : '#FFFFFF'
  if (isRecord(legacyPage.background) && typeof legacyPage.background.imageUrl === 'string') {
    diagnostics.push({
      code: 'BACKGROUND_ASSET_RELINK_REQUIRED',
      message: 'The legacy page background image must be relinked to an institute asset before printing.',
    })
    background = '#FFFFFF'
  }
  const margin = isFiniteNumber(legacyPage.marginMm) && legacyPage.marginMm >= 0 ? legacyPage.marginMm : 10
  const pageHeight = geometry.height
  const ids = new Set<string>()
  const pages = pageEntries.map((entry, pageIndex) => {
    const oldElements = isRecord(entry) && Array.isArray(entry.elements) ? entry.elements : []
    const elements: ElementV3[] = []
    for (const oldElement of oldElements) {
      if (!isRecord(oldElement) || typeof oldElement.id !== 'string' || typeof oldElement.type !== 'string') {
        diagnostics.push({ code: 'ELEMENT_SKIPPED', message: `An invalid element on page ${pageIndex + 1} was skipped.` })
        continue
      }
      let type = oldElement.type
      if (!ELEMENT_TYPES.has(type as ElementTypeV3)) {
        diagnostics.push({ code: 'ELEMENT_SKIPPED', message: `Unsupported element ${oldElement.id} was skipped.`, elementId: oldElement.id })
        continue
      }
      const xMm = oldElement.x
      const y = oldElement.y
      const widthMm = oldElement.w
      const heightMm = oldElement.h
      if (![xMm, y, widthMm, heightMm].every(isFiniteNumber) || Number(widthMm) <= 0 || Number(heightMm) <= 0) {
        diagnostics.push({ code: 'ELEMENT_SKIPPED', message: `Element ${oldElement.id} has invalid geometry and was skipped.`, elementId: oldElement.id })
        continue
      }
      let zone: ZoneV3
      if (oldElement.zone === 'HEADER' || Number(y) < headerMm) zone = 'header'
      else if (oldElement.zone === 'FOOTER' || Number(y) >= pageHeight - footerMm) zone = 'footer'
      else zone = 'body'
      const id = ids.has(oldElement.id) ? `page-${pageIndex + 1}-${oldElement.id}` : oldElement.id
      if (id !== oldElement.id) {
        diagnostics.push({ code: 'ELEMENT_ID_RENAMED', message: `Duplicate element ID was renamed to ${id}.`, elementId: oldElement.id })
      }
      ids.add(id)
      const yMm = zone === 'header'
        ? Number(y)
        : zone === 'footer'
          ? Number(y) - (pageHeight - footerMm)
          : Number(y) - headerMm
      const converted: Record<string, unknown> = {
        ...oldElement,
        id,
        type,
        zone,
        xMm: Number(xMm),
        yMm,
        widthMm: Number(widthMm),
        heightMm: Number(heightMm),
        rotationDeg: isFiniteNumber(oldElement.rotationDeg) ? oldElement.rotationDeg : 0,
      }
      delete converted.x
      delete converted.y
      delete converted.w
      delete converted.h
      if (type === 'table') {
        const columns = Array.isArray(oldElement.columns) ? oldElement.columns : []
        converted.mode = 'dynamic'
        converted.columns = columns.filter(isRecord).map(column => ({
          ...column,
          header: String(column.label ?? ''),
          fieldId: String(column.id ?? ''),
        }))
      }
      elements.push(converted as unknown as ElementV3)
    }
    return { id: `page-${pageIndex + 1}`, elements }
  })

  const layout = normalizeLayout({
    version: 3,
    page: {
      sizeId,
      orientation: sizeId === 'A4L' ? 'LANDSCAPE' : 'PORTRAIT',
      marginsMm: { top: margin, right: margin, bottom: margin, left: margin },
      background,
    },
    zones: {
      headerMm,
      footerMm,
      repeatHeader: oldZones.repeatHeader === true,
      repeatFooter: oldZones.repeatFooter === true,
      hideHeaderOnFirstPage: oldZones.hideHeaderOnFirstPage === true,
    },
    pages,
    watermark,
  })
  return { layout, diagnostics }
}

export interface DocumentDataV3 {
  fields?: Record<string, string | number | null | undefined>
  datasets?: Record<string, Array<Record<string, unknown>>>
  tables?: Record<string, Array<Record<string, unknown>>>
}

export interface RenderPlan {
  pageSizeMm: { width: number; height: number }
  background: string
  pages: Array<{ id: string; elements: ElementV3[] }>
  data: DocumentDataV3
  assets: Record<string, string>
  diagnostics: LayoutDiagnostic[]
}

// CSS Compiler Helpers for Styling & Typography
export function compileFillCss(fill: FillV3 | string | undefined, fallback = 'transparent'): string {
  if (!fill) return fallback
  if (typeof fill === 'string') return fill
  if (fill.type === 'solid') return fill.color || fallback
  if (fill.type === 'linear-gradient') {
    const stopsStr = (fill.stops || []).map((s) => `${s.color} ${s.offset}%`).join(', ')
    return `linear-gradient(${fill.angleDeg ?? 0}deg, ${stopsStr})`
  }
  if (fill.type === 'radial-gradient') {
    const stopsStr = (fill.stops || []).map((s) => `${s.color} ${s.offset}%`).join(', ')
    return `radial-gradient(${fill.shape || 'circle'}, ${stopsStr})`
  }
  return fallback
}

export function compileBorderCss(
  border: BorderV3 | undefined,
  flatWidthMm?: number,
  flatColor?: string,
  flatStyle?: BorderStyleV3,
  unit: 'px' | 'mm' = 'mm',
): string {
  if (border && border.unified === false) {
    const parts: string[] = []
    if (border.top && border.top.style !== 'none' && border.top.widthMm > 0) {
      parts.push(`border-top:${border.top.widthMm}${unit} ${border.top.style} ${border.top.color}`)
    } else {
      parts.push('border-top:none')
    }
    if (border.right && border.right.style !== 'none' && border.right.widthMm > 0) {
      parts.push(`border-right:${border.right.widthMm}${unit} ${border.right.style} ${border.right.color}`)
    } else {
      parts.push('border-right:none')
    }
    if (border.bottom && border.bottom.style !== 'none' && border.bottom.widthMm > 0) {
      parts.push(`border-bottom:${border.bottom.widthMm}${unit} ${border.bottom.style} ${border.bottom.color}`)
    } else {
      parts.push('border-bottom:none')
    }
    if (border.left && border.left.style !== 'none' && border.left.widthMm > 0) {
      parts.push(`border-left:${border.left.widthMm}${unit} ${border.left.style} ${border.left.color}`)
    } else {
      parts.push('border-left:none')
    }
    return parts.join(';') + ';'
  }

  const width = border?.top?.widthMm ?? flatWidthMm ?? 0
  const color = border?.top?.color ?? flatColor ?? '#000000'
  const style = border?.top?.style ?? flatStyle ?? (width > 0 ? 'solid' : 'none')

  if (width <= 0 || style === 'none') return 'border:none;'
  return `border:${width}${unit} ${style} ${color};`
}

export function compileCornerRadiiCss(
  radii: CornerRadiiV3 | undefined,
  flatRadiusMm?: number,
  unit: 'px' | 'mm' = 'mm',
): string {
  if (radii && radii.unified === false) {
    const tl = radii.topLeftMm ?? 0
    const tr = radii.topRightMm ?? 0
    const br = radii.bottomRightMm ?? 0
    const bl = radii.bottomLeftMm ?? 0
    return `border-radius:${tl}${unit} ${tr}${unit} ${br}${unit} ${bl}${unit};`
  }
  const r = radii?.topLeftMm ?? flatRadiusMm ?? 0
  if (r <= 0) return ''
  return `border-radius:${r}${unit};`
}

export function compileMaskCss(mask?: ClippingMaskType, maskRadiusMm?: number, unit: 'px' | 'mm' = 'mm'): string {
  if (mask === 'circle') {
    return `border-radius:50%;clip-path:circle(50% at 50% 50%);overflow:hidden;`
  }
  if (mask === 'rounded') {
    const r = maskRadiusMm ?? 3
    return `border-radius:${r}${unit};overflow:hidden;`
  }
  if (mask === 'hexagon') {
    return `clip-path:polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);overflow:hidden;`
  }
  return ''
}

export function compileFilterCss(filters?: ImageFiltersV3): string {
  if (!filters) return ''
  const parts: string[] = []
  if (filters.grayscale !== undefined && filters.grayscale > 0) {
    parts.push(`grayscale(${filters.grayscale}%)`)
  }
  if (filters.brightness !== undefined && filters.brightness !== 100) {
    parts.push(`brightness(${filters.brightness}%)`)
  }
  if (filters.contrast !== undefined && filters.contrast !== 100) {
    parts.push(`contrast(${filters.contrast}%)`)
  }
  if (filters.opacity !== undefined && filters.opacity < 100) {
    parts.push(`opacity(${filters.opacity}%)`)
  }
  return parts.length > 0 ? `filter:${parts.join(' ')};` : ''
}

const GOOGLE_FONT_QUERIES: Record<string, string> = {
  Inter: 'family=Inter:wght@300;400;500;600;700',
  Roboto: 'family=Roboto:ital,wght@0,300;0,400;0,500;0,700;1,400',
  'Open Sans': 'family=Open+Sans:ital,wght@0,400;0,600;0,700;1,400',
  Poppins: 'family=Poppins:wght@400;500;600;700',
  Lato: 'family=Lato:ital,wght@0,400;0,700;1,400',
  Merriweather: 'family=Merriweather:ital,wght@0,300;0,400;0,700;1,400',
  'Playfair Display': 'family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400',
  Lora: 'family=Lora:ital,wght@0,400;0,600;1,400',
  'JetBrains Mono': 'family=JetBrains+Mono:wght@400;500;600;700',
  Cinzel: 'family=Cinzel:wght@400;600;700',
}

const FONT_FALLBACK_STACKS: Record<string, string> = {
  Inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  Roboto: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  'Open Sans': "'Open Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  Poppins: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
  Lato: "'Lato', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Merriweather: "'Merriweather', Georgia, 'Times New Roman', serif",
  'Playfair Display': "'Playfair Display', Georgia, 'Times New Roman', serif",
  Lora: "'Lora', Georgia, serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  Georgia: 'Georgia, serif',
  'JetBrains Mono': "'JetBrains Mono', 'Courier New', Consolas, monospace",
  'Courier New': "'Courier New', Courier, monospace",
  Cinzel: "'Cinzel', Georgia, serif",
}

export function compileTypographyCss(style: TextStyleV3 | undefined): string {
  if (!style) return ''
  const parts: string[] = []

  const family = style.fontFamily || 'Inter'
  const stack = FONT_FALLBACK_STACKS[family] || `'${family}', sans-serif`
  parts.push(`font-family:${stack}`)

  if (isFiniteNumber(style.fontSizePt) && style.fontSizePt > 0 && style.fontSizePt <= 300) {
    parts.push(`font-size:${style.fontSizePt}pt`)
  }

  const weight = style.bold ? 700 : style.fontWeight
  if (weight) parts.push(`font-weight:${weight}`)

  const fontStyle = style.italic ? 'italic' : style.fontStyle
  if (fontStyle) parts.push(`font-style:${fontStyle}`)

  if (style.underline && style.strikethrough) parts.push('text-decoration:underline line-through')
  else if (style.underline) parts.push('text-decoration:underline')
  else if (style.strikethrough) parts.push('text-decoration:line-through')
  else if (style.textDecoration) parts.push(`text-decoration:${style.textDecoration}`)

  if (typeof style.color === 'string' && style.color) {
    parts.push(`color:${style.color}`)
  }

  if (isFiniteNumber(style.lineHeight) && style.lineHeight > 0) {
    parts.push(`line-height:${style.lineHeight}`)
  }

  if (isFiniteNumber(style.letterSpacingMm)) {
    parts.push(`letter-spacing:${style.letterSpacingMm}mm`)
  }

  if (style.align) {
    parts.push(`text-align:${style.align}`)
  }

  if (style.textTransform && style.textTransform !== 'none') {
    parts.push(`text-transform:${style.textTransform}`)
  }

  if (isFiniteNumber(style.opacity) && style.opacity < 1) {
    parts.push(`opacity:${style.opacity}`)
  }

  return parts.length > 0 ? parts.join(';') + ';' : ''
}

/** Build a deterministic, data-bound plan. Asset inputs must be authorized data URLs. */
export function buildRenderPlan(
  template: LayoutV3,
  data: DocumentDataV3,
  assets: Record<string, string> = {},
): RenderPlan {
  const layout = normalizeLayout(template)
  const diagnostics: LayoutDiagnostic[] = []
  const safeAssets: Record<string, string> = {}
  for (const [id, src] of Object.entries(assets)) {
    if (/^data:image\/(?:png|jpeg|webp|gif|svg\+xml);base64,[a-z0-9+/]+=*$/i.test(src)) {
      safeAssets[id] = src
    } else {
      diagnostics.push({ code: 'ASSET_SOURCE_REJECTED', message: `Asset ${id} is unavailable or has an unsupported source.` })
    }
  }

  const normalizedPages = layout.pages.map((page) => {
    const elements = page.elements.map((element) => {
      const elCopy = { ...element }

      if (elCopy.type === 'text') {
        const style = (elCopy.style || {}) as TextStyleV3
        const content = typeof elCopy.content === 'string' ? elCopy.content : ''
        const interpolated = interpolateTokens(content, data.fields, { sampleMode: true })

        if (style.autoFit) {
          const minPt = style.minFontSizePt ?? 6
          const basePt = (style.fontSizePt as number) ?? 14
          const fitResult = computeAutoFitFontSize({
            text: interpolated,
            widthMm: elCopy.widthMm,
            heightMm: elCopy.heightMm,
            baseFontSizePt: basePt,
            minFontSizePt: minPt,
            lineHeight: style.lineHeight ?? 1.25,
            fontFamily: style.fontFamily,
          })

          if (fitResult.isOverflow) {
            diagnostics.push({
              code: 'TEXT_OVERFLOW',
              message: `Text in element ${elCopy.id} overflows bounding box at minimum font size (${minPt}pt).`,
              elementId: elCopy.id,
              property: 'content',
            })
          }
          elCopy.style = { ...style, fontSizePt: fitResult.fittedFontSizePt }
        }
      } else if (elCopy.type === 'image' || elCopy.type === 'signature') {
        if (!elCopy.assetId || !safeAssets[elCopy.assetId]) {
          diagnostics.push({ code: 'ASSET_MISSING', message: `Image asset is missing for element ${elCopy.id}.`, elementId: elCopy.id })
        }
      } else if (elCopy.type === 'photo') {
        const hasAsset = Boolean(elCopy.assetId && safeAssets[elCopy.assetId])
        const dataKey = (elCopy as PhotoElementV3).dataKey || 'student.photo_url'
        const hasDataPhoto = Boolean(data.fields?.[dataKey] || data.fields?.['student.photo_url'] || data.fields?.student_photo)
        if (!hasAsset && !hasDataPhoto) {
          diagnostics.push({
            code: 'MISSING_STUDENT_PHOTO',
            message: `Template expects student photo for element ${elCopy.id}, but no photo was provided in document data.`,
            elementId: elCopy.id,
            property: 'fieldId',
          })
        }
      } else if (elCopy.type === 'totals' || elCopy.type === 'pageFrame') {
        diagnostics.push({
          code: 'ELEMENT_RENDER_UNAVAILABLE',
          message: `Element type ${elCopy.type} is not implemented by this renderer slice.`,
          elementId: elCopy.id,
        })
      }

      return elCopy
    })

    return { ...page, elements }
  })

  const background = typeof layout.page.background === 'string' && /^(#[0-9a-f]{3,8}|transparent|white|black)$/i.test(layout.page.background)
    ? layout.page.background
    : '#FFFFFF'

  return {
    pageSizeMm: PAGE_SIZES_MM[layout.page.sizeId],
    background,
    pages: normalizedPages,
    data: { fields: { ...data.fields } },
    assets: safeAssets,
    diagnostics,
  }
}

/** Vector SVG Silhouette for fallback student photo */
function renderFallbackPhotoAvatar(initials?: string): string {
  const label = escapeHtml(initials?.trim() || 'STUDENT')
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet"><rect width="100" height="120" fill="#F1F5F9"/><circle cx="50" cy="40" r="20" fill="#94A3B8"/><path d="M18 108 C18 80, 34 74, 50 74 C66 74, 82 80, 82 108 Z" fill="#94A3B8"/><rect x="20" y="96" width="60" height="18" rx="4" fill="#334155" opacity="0.9"/><text x="50" y="109" text-anchor="middle" font-size="10" font-weight="700" fill="#FFFFFF" font-family="'Inter', sans-serif">${label}</text></svg>`
}

/** Produce script-free print markup; CSS positioning remains in stored millimeters. */
export function renderDocumentHtml(plan: RenderPlan): string {
  // Collect font families across text elements
  const usedFonts = new Set<string>()
  for (const page of plan.pages) {
    for (const el of page.elements) {
      if (el.type === 'text') {
        const style = isRecord(el.style) ? (el.style as TextStyleV3) : {}
        if (style.fontFamily) usedFonts.add(style.fontFamily)
      }
    }
  }

  const fontQueries = Array.from(usedFonts)
    .map((f) => GOOGLE_FONT_QUERIES[f])
    .filter(Boolean)

  const googleFontLink = fontQueries.length > 0
    ? `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?${fontQueries.join('&')}&display=swap">`
    : ''

  const pages = plan.pages.map((page) => {
    const elements = page.elements
      .filter((element) => element.visible !== false)
      .map((element) => {
        const position = `position:absolute;left:${element.xMm}mm;top:${element.yMm}mm;width:${element.widthMm}mm;height:${element.heightMm}mm;`
        const rotation = element.rotationDeg ? `transform:rotate(${element.rotationDeg}deg);` : ''
        const elOpacity = isFiniteNumber(element.opacity) && element.opacity < 1 ? `opacity:${element.opacity};` : ''

        // 1. Text Element
        if (element.type === 'text') {
          const textEl = element as TextElementV3
          const style = isRecord(textEl.style) ? (textEl.style as TextStyleV3) : {}
          const typoCss = compileTypographyCss(style)
          const fillCss = compileFillCss(textEl.fill || textEl.fillColor)
          const borderCss = compileBorderCss(textEl.border, textEl.borderWidthMm, textEl.borderColor, undefined, 'mm')
          const cornerCss = compileCornerRadiiCss(textEl.cornerRadii, textEl.borderRadiusMm, 'mm')
          const content = typeof textEl.content === 'string' ? textEl.content : ''
          const interpolated = interpolateTokens(content, plan.data.fields, { escapeHtml: true })

          let vAlignCss = 'justify-content:flex-start;'
          if (style.verticalAlign === 'middle') vAlignCss = 'justify-content:center;'
          else if (style.verticalAlign === 'bottom') vAlignCss = 'justify-content:flex-end;'

          return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}background:${fillCss};${borderCss}${cornerCss}display:flex;flex-direction:column;${vAlignCss}overflow-wrap:anywhere;white-space:pre-wrap;box-sizing:border-box;"><div style="${typoCss}width:100%;">${interpolated}</div></div>`
        }

        // 2. Shape Element
        if (element.type === 'shape') {
          const shapeEl = element as ShapeElementV3
          const fillCss = compileFillCss(shapeEl.fill || shapeEl.fillColor, '#E2E8F0')
          const borderCss = compileBorderCss(shapeEl.border, shapeEl.borderWidthMm, shapeEl.borderColor, shapeEl.borderStyle, 'mm')
          let cornerCss = compileCornerRadiiCss(shapeEl.cornerRadii, shapeEl.borderRadiusMm, 'mm')

          if (shapeEl.shapeType === 'ellipse') {
            cornerCss = 'border-radius:50%;'
          } else if (shapeEl.shapeType === 'pill') {
            cornerCss = 'border-radius:9999px;'
          }

          return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}background:${fillCss};${borderCss}${cornerCss}box-sizing:border-box;overflow:hidden;"></div>`
        }

        // 3. Divider Element
        if (element.type === 'divider') {
          const divEl = element as DividerElementV3
          const color = divEl.color || '#CBD5E1'
          const thicknessMm = divEl.thicknessMm ?? 1
          const lineStyle = divEl.lineStyle || 'solid'
          const isHorizontal = element.widthMm >= element.heightMm

          const dividerCss = isHorizontal
            ? `border-top:${thicknessMm}mm ${lineStyle} ${color};height:0;margin:auto 0;`
            : `border-left:${thicknessMm}mm ${lineStyle} ${color};width:0;margin:0 auto;`

          return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}display:flex;align-items:center;justify-content:center;box-sizing:border-box;"><div style="width:100%;height:100%;${dividerCss}"></div></div>`
        }

        // 4. Image Element / Signature
        if (element.type === 'image' || element.type === 'signature') {
          const imgEl = element as ImageElementV3
          const src = (imgEl.assetId && plan.assets[imgEl.assetId]) || imgEl.src || ''
          const maskCss = compileMaskCss(imgEl.mask, imgEl.maskRadiusMm, 'mm')
          const filterCss = compileFilterCss(imgEl.filters)
          const fit = imgEl.fit === 'cover' ? 'cover' : imgEl.fit === 'stretch' ? 'fill' : 'contain'
          const zoom = imgEl.zoomScale ?? 1
          const panX = imgEl.panOffset?.xPercent ?? 0
          const panY = imgEl.panOffset?.yPercent ?? 0
          const innerTransform = zoom !== 1 || panX !== 0 || panY !== 0
            ? `transform:scale(${zoom}) translate(${panX}%, ${panY}%);transform-origin:center center;`
            : ''

          if (src) {
            return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}${maskCss}box-sizing:border-box;overflow:hidden;"><img alt="" src="${src}" style="width:100%;height:100%;object-fit:${fit};${filterCss}${innerTransform}"/></div>`
          }
          return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}background:#F8FAFC;border:1px dashed #CBD5E1;box-sizing:border-box;"></div>`
        }

        // 5. Photo Element
        if (element.type === 'photo') {
          const photoEl = element as PhotoElementV3
          const dataKey = photoEl.dataKey || 'student.photo_url'
          const rawSrc = (plan.data.fields?.[dataKey] as string)
            || (plan.data.fields?.['student.photo_url'] as string)
            || (plan.data.fields?.student_photo as string)
            || (photoEl.assetId ? plan.assets[photoEl.assetId] : '')

          const maskCss = compileMaskCss(photoEl.mask, photoEl.maskRadiusMm, 'mm')
          const filterCss = compileFilterCss(photoEl.filters)
          const borderCss = photoEl.showBorder && photoEl.borderWidthMm
            ? `border:${photoEl.borderWidthMm}mm solid ${photoEl.borderColor || '#CBD5E1'};`
            : ''
          const fit = photoEl.fit === 'contain' ? 'contain' : 'cover'

          if (rawSrc) {
            return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}${borderCss}${maskCss}box-sizing:border-box;overflow:hidden;"><img alt="Student" src="${rawSrc}" style="width:100%;height:100%;object-fit:${fit};${filterCss}"/></div>`
          }
          const initials = photoEl.fallbackInitials || (plan.data.fields?.['student.first_name'] as string)?.slice(0, 2)?.toUpperCase() || 'ST'
          return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}${borderCss}${maskCss}box-sizing:border-box;overflow:hidden;">${renderFallbackPhotoAvatar(initials)}</div>`
        }

        // 6. QR Code Element
        if (element.type === 'qr') {
          const qrEl = element as QrCodeElementV3
          const payload = (qrEl.fieldId && plan.data.fields?.[qrEl.fieldId])
            || qrEl.staticText
            || (plan.data.fields?.['certificate.verification_url'] as string)
            || (plan.data.fields?.['certificate.qr_code'] as string)
            || 'https://campusone.in/verify'

          const svg = generateQrSvg(String(payload), {
            errorCorrectionLevel: qrEl.eccLevel ?? 'M',
            margin: qrEl.quietZone ?? 1,
            darkColor: qrEl.darkColor ?? '#000000',
            lightColor: qrEl.lightColor ?? '#FFFFFF',
          })

          return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}box-sizing:border-box;overflow:hidden;">${svg}</div>`
        }

        // 7. Barcode Element
        if (element.type === 'barcode') {
          const barEl = element as BarcodeElementV3
          const payload = (barEl.fieldId && plan.data.fields?.[barEl.fieldId])
            || barEl.staticValue
            || (plan.data.fields?.['student.admission_no'] as string)
            || (plan.data.fields?.['receipt.number'] as string)
            || '12345678'

          const svg = generateBarcodeSvg(String(payload), {
            format: barEl.format ?? 'CODE128',
            showText: barEl.showText !== false,
            textPosition: barEl.textPosition ?? 'bottom',
            barHeightPercent: barEl.barHeightPercent ?? 80,
            quietZoneMm: barEl.quietZoneMm ?? 2,
            color: barEl.color ?? '#000000',
            backgroundColor: barEl.backgroundColor ?? 'transparent',
          })

          return `<div data-element-id="${escapeHtml(element.id)}" style="${position}${rotation}${elOpacity}box-sizing:border-box;overflow:hidden;">${svg}</div>`
        }

        // 8. Table Element
        if (element.type === 'table') {
          return compileTableHtml(element as TableElementV3, plan.data.fields)
        }

        return ''
      })
      .join('')

    return `<section class="document-page" data-page-id="${escapeHtml(page.id)}" style="position:relative;width:${plan.pageSizeMm.width}mm;height:${plan.pageSizeMm.height}mm;background:${plan.background};overflow:hidden;">${elements}</section>`
  }).join('')

  return `<!doctype html><html><head><meta charset="utf-8">${googleFontLink}<style>@page{size:${plan.pageSizeMm.width}mm ${plan.pageSizeMm.height}mm;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}.document-page{break-after:page;page-break-after:always}.document-page:last-child{break-after:auto;page-break-after:auto}</style></head><body>${pages}</body></html>`
}

