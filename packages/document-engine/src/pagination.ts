import type {
  LayoutV3,
  ElementV3,
  LayoutDiagnostic,
  DocumentDataV3,
  TextStyleV3,
} from './index'
import { PAGE_SIZES_MM } from './index'
import type { DynamicTableElementV3 } from './table'
import { resolveDatasetName, getSampleDataset } from './sampleData'

export interface PageMetricsMm {
  pageWidthMm: number
  pageHeightMm: number
  marginsMm: { top: number; right: number; bottom: number; left: number }
  headerHeightMm: number
  footerHeightMm: number
  usableBodyHeightMm: number
  bodyStartYMm: number
  bodyEndYMm: number
  bodyWidthMm: number
}

export function computePageMetrics(layout: LayoutV3): PageMetricsMm {
  const size = PAGE_SIZES_MM[layout.page.sizeId]
  if (!size) {
    throw new Error(`Unsupported page size: ${layout.page.sizeId}`)
  }
  const isLandscape = layout.page.orientation === 'LANDSCAPE'
  const pageWidthMm = isLandscape ? size.height : size.width
  const pageHeightMm = isLandscape ? size.width : size.height

  const margins = layout.page.marginsMm ?? { top: 10, right: 10, bottom: 10, left: 10 }
  const headerHeightMm = Math.max(0, layout.zones?.headerMm ?? 0)
  const footerHeightMm = Math.max(0, layout.zones?.footerMm ?? 0)

  // Usable body height calculation:
  // bodyHeightMm = pageHeightMm - headerHeightMm - footerHeightMm - margins.top - margins.bottom
  const usableBodyHeightMm = Math.max(
    0,
    pageHeightMm - headerHeightMm - footerHeightMm - margins.top - margins.bottom,
  )

  const bodyStartYMm = headerHeightMm + margins.top
  const bodyEndYMm = pageHeightMm - footerHeightMm - margins.bottom
  const bodyWidthMm = Math.max(0, pageWidthMm - margins.left - margins.right)

  return {
    pageWidthMm,
    pageHeightMm,
    marginsMm: margins,
    headerHeightMm,
    footerHeightMm,
    usableBodyHeightMm,
    bodyStartYMm,
    bodyEndYMm,
    bodyWidthMm,
  }
}

export interface EstimateRowHeightParams {
  row: Record<string, unknown>
  columns: Array<{
    id?: string
    fieldId?: string
    widthPct?: number
    widthPercent?: number
    style?: TextStyleV3
  }>
  tableWidthMm: number
  tableStyle?: {
    fontSizePt?: number
    lineHeight?: number
    fontFamily?: string
    paddingTopMm?: number
    paddingBottomMm?: number
    paddingLeftMm?: number
    paddingRightMm?: number
    defaultPaddingMm?: { topMm: number; rightMm: number; bottomMm: number; leftMm: number }
  }
}

export function estimateRowHeightMm(params: EstimateRowHeightParams): number {
  const { row, columns, tableWidthMm, tableStyle } = params
  const baseFontSizePt = tableStyle?.fontSizePt ?? 9.5
  const lineHeight = tableStyle?.lineHeight ?? 1.25
  const padTop = tableStyle?.paddingTopMm ?? tableStyle?.defaultPaddingMm?.topMm ?? 2
  const padBottom = tableStyle?.paddingBottomMm ?? tableStyle?.defaultPaddingMm?.bottomMm ?? 2
  const padLeft = tableStyle?.paddingLeftMm ?? tableStyle?.defaultPaddingMm?.leftMm ?? 2
  const padRight = tableStyle?.paddingRightMm ?? tableStyle?.defaultPaddingMm?.rightMm ?? 2

  const MIN_ROW_HEIGHT = Math.max(6, baseFontSizePt * (25.4 / 72) * lineHeight + padTop + padBottom)
  let maxCellHeight = MIN_ROW_HEIGHT

  for (const col of columns) {
    const colKey = col.fieldId || col.id || ''
    const val = row[colKey]
    const text = val !== undefined && val !== null ? String(val) : ''

    const pct = col.widthPercent ?? col.widthPct ?? (100 / Math.max(1, columns.length))
    const usableColWidthMm = (tableWidthMm * (pct / 100)) - padLeft - padRight
    if (usableColWidthMm <= 0 || !text) continue

    const charWidthMm = baseFontSizePt * (25.4 / 72) * 0.52
    const maxCharsPerLine = Math.max(1, Math.floor(usableColWidthMm / charWidthMm))

    const paragraphs = text.split('\n')
    let lineCount = 0
    for (const para of paragraphs) {
      if (para.length === 0) {
        lineCount += 1
        continue
      }
      const words = para.split(' ')
      let curLineChars = 0
      for (const w of words) {
        if (curLineChars === 0) {
          curLineChars = w.length
          lineCount += 1
        } else if (curLineChars + 1 + w.length <= maxCharsPerLine) {
          curLineChars += 1 + w.length
        } else {
          curLineChars = w.length
          lineCount += 1
        }
      }
    }

    const cellTextHeightMm = lineCount * (baseFontSizePt * (25.4 / 72) * lineHeight)
    const totalCellHeightMm = cellTextHeightMm + padTop + padBottom
    if (totalCellHeightMm > maxCellHeight) {
      maxCellHeight = totalCellHeightMm
    }
  }

  return Math.ceil(maxCellHeight * 10) / 10
}

export interface PaginatedPageV3 {
  pageNumber: number
  id: string
  elements: ElementV3[]
  isFirstPage: boolean
  isContinuationPage: boolean
  isLastPage: boolean
  hasTableHeader: boolean
  tableRowRange?: [number, number]
  availableBodyHeightMm: number
  usedBodyHeightMm: number
}

export interface PaginatedDocumentV3 {
  totalPages: number
  pages: PaginatedPageV3[]
  layout: LayoutV3
  diagnostics: LayoutDiagnostic[]
  metrics: PageMetricsMm
}

export interface PaginationOptions {
  maxPages?: number
  measuredRowHeightsMm?: number[]
  headerRowHeightMm?: number
  defaultRowHeightMm?: number
  gapBelowTableMm?: number
}

export function paginateDocument(
  template: LayoutV3,
  data: DocumentDataV3,
  options: PaginationOptions = {},
): PaginatedDocumentV3 {
  const metrics = computePageMetrics(template)
  const diagnostics: LayoutDiagnostic[] = []
  const maxPages = options.maxPages ?? 100

  if (!template.pages || template.pages.length === 0) {
    throw new Error('Template must have at least one page.')
  }

  const designPage = template.pages[0]
  const elements = designPage.elements.filter((el) => el.visible !== false)

  // Locate dynamic table
  const dynamicTable = elements.find(
    (el): el is DynamicTableElementV3 => el.type === 'table' && (el as { mode?: string }).mode === 'dynamic',
  )

  // If no dynamic table exists, document does not paginate dynamically across rows
  if (!dynamicTable) {
    return {
      totalPages: template.pages.length,
      pages: template.pages.map((p, idx) => ({
        pageNumber: idx + 1,
        id: p.id,
        elements: p.elements,
        isFirstPage: idx === 0,
        isContinuationPage: idx > 0,
        isLastPage: idx === template.pages.length - 1,
        hasTableHeader: false,
        availableBodyHeightMm: metrics.usableBodyHeightMm,
        usedBodyHeightMm: metrics.usableBodyHeightMm,
      })),
      layout: template,
      diagnostics,
      metrics,
    }
  }

  // Extract dataset rows
  const rawDatasetName = dynamicTable.datasetBinding?.datasetName || dynamicTable.datasetId || ''
  const resolvedDatasetName = resolveDatasetName(rawDatasetName)

  let rows: Record<string, unknown>[] =
    (data.datasets && (data.datasets[resolvedDatasetName] || data.datasets[rawDatasetName])) ||
    (data.tables && (data.tables[resolvedDatasetName] || data.tables[rawDatasetName])) ||
    ((data as Record<string, unknown>).rows as Record<string, unknown>[]) ||
    []

  // If no rows supplied in data, use sample rows
  if (rows.length === 0) {
    const samples = getSampleDataset(resolvedDatasetName)
    if (samples.length > 0) {
      rows = samples
    }
  }

  const rowCount = rows.length

  // Partition elements into Zones
  const headerElements = elements.filter((el) => el.zone === 'header')
  const footerElements = elements.filter((el) => el.zone === 'footer')
  const bodyElements = elements.filter((el) => el.zone !== 'header' && el.zone !== 'footer')

  const tableDesignBottom = dynamicTable.yMm + dynamicTable.heightMm
  const aboveOrBeside = bodyElements.filter(
    (el) => el.id !== dynamicTable.id && el.yMm < tableDesignBottom,
  )
  const trailingElements = bodyElements.filter(
    (el) => el.id !== dynamicTable.id && el.yMm >= tableDesignBottom,
  )

  // Compute trailing elements bounding span
  let minTrailingY = Number.POSITIVE_INFINITY
  let maxTrailingY = Number.NEGATIVE_INFINITY
  for (const el of trailingElements) {
    if (el.yMm < minTrailingY) minTrailingY = el.yMm
    if (el.yMm + el.heightMm > maxTrailingY) maxTrailingY = el.yMm + el.heightMm
  }
  const trailingSpanHeightMm = trailingElements.length > 0 ? maxTrailingY - minTrailingY : 0

  // Calculate Row Heights
  const headerRowHeightMm = options.headerRowHeightMm ?? (dynamicTable.tableStyle?.headerHeightMm ?? 9.0)
  const rowHeights: number[] = []
  for (let i = 0; i < rowCount; i++) {
    if (options.measuredRowHeightsMm && options.measuredRowHeightsMm[i] !== undefined) {
      rowHeights.push(options.measuredRowHeightsMm[i])
    } else {
      rowHeights.push(
        estimateRowHeightMm({
          row: rows[i],
          columns: dynamicTable.columns,
          tableWidthMm: dynamicTable.widthMm,
          tableStyle: dynamicTable.tableStyle as any,
        }),
      )
    }
  }

  // Slicing Loop
  const pages: Array<{
    pageNumber: number
    id: string
    elements: ElementV3[]
    tableRowRange?: [number, number]
  }> = []

  let consumed = 0
  let pageIndex = 0

  while ((consumed < rowCount || (rowCount === 0 && pageIndex === 0)) && pageIndex < maxPages) {
    const isFirst = pageIndex === 0

    // Available height calculation
    let tableStartY = 0
    let bottomLimitY = 0

    if (isFirst) {
      tableStartY = metrics.headerHeightMm + dynamicTable.yMm
      bottomLimitY = metrics.bodyEndYMm
    } else {
      const topOffset = template.zones?.repeatHeader !== false ? metrics.headerHeightMm : 0
      tableStartY = topOffset + metrics.marginsMm.top
      bottomLimitY =
        template.zones?.repeatFooter !== false
          ? metrics.pageHeightMm - metrics.footerHeightMm - metrics.marginsMm.bottom
          : metrics.pageHeightMm - metrics.marginsMm.bottom
    }

    const availHeight = Math.max(0, bottomLimitY - tableStartY)
    const availForRows = Math.max(0, availHeight - headerRowHeightMm)

    let take = 0
    let usedRowsHeight = 0

    // Check if remaining rows + trailing elements fit on this page completely
    let remainingHeight = 0
    for (let r = consumed; r < rowCount; r++) remainingHeight += rowHeights[r]

    const gapBelowTable = options.gapBelowTableMm ?? 4.0
    if (
      rowCount > 0 &&
      headerRowHeightMm + remainingHeight + gapBelowTable + trailingSpanHeightMm <= availHeight
    ) {
      take = rowCount - consumed
      usedRowsHeight = remainingHeight
    } else if (rowCount > 0) {
      // Slicing row by row
      while (consumed + take < rowCount) {
        const nextH = rowHeights[consumed + take]

        if (nextH > metrics.usableBodyHeightMm) {
          diagnostics.push({
            code: 'UNSPLITTABLE_ROW',
            message: `Row ${consumed + take + 1} height (${Math.round(nextH)}mm) exceeds usable page body height (${Math.round(metrics.usableBodyHeightMm)}mm).`,
            elementId: dynamicTable.id,
          })
        }

        if (take > 0 && usedRowsHeight + nextH > availForRows) {
          break
        }

        if (take === 0 && usedRowsHeight + nextH > availForRows) {
          if (!isFirst) {
            // Force 1 row on empty continuation page to avoid infinite loop
            take = 1
            usedRowsHeight += nextH
            break
          } else {
            // On page 1, if even 1 row cannot fit below top elements, spill entire table to page 2
            break
          }
        }

        usedRowsHeight += nextH
        take += 1
      }
    }

    // Build page table element
    const pageTableHeight = headerRowHeightMm + usedRowsHeight
    const pageTableElement: DynamicTableElementV3 = {
      ...dynamicTable,
      id: `${dynamicTable.id}__p${pageIndex + 1}`,
      yMm: isFirst ? dynamicTable.yMm : metrics.marginsMm.top,
      heightMm: pageTableHeight,
    }

    const pageElements: ElementV3[] = []
    if (isFirst) {
      pageElements.push(...aboveOrBeside)
    }
    if (take > 0 || rowCount === 0) {
      pageElements.push(pageTableElement)
    }

    pages.push({
      pageNumber: pageIndex + 1,
      id: `page-${pageIndex + 1}`,
      elements: pageElements,
      tableRowRange: [consumed, consumed + take],
    })

    consumed += take
    pageIndex += 1

    if (rowCount === 0) break
  }

  // Check 100-page loop guard
  if (consumed < rowCount) {
    diagnostics.push({
      code: 'TABLE_OVERFLOW',
      message: `Document exceeded maximum allowed page count of ${maxPages} pages. Truncated remaining rows.`,
      elementId: dynamicTable.id,
    })
  }

  // Trailing Elements Placement & Spillover Check
  const lastPageIndex = pages.length - 1
  const lastPage = pages[lastPageIndex]

  const isFirstOfDoc = lastPageIndex === 0
  const lastTableStartY = isFirstOfDoc
    ? metrics.headerHeightMm + dynamicTable.yMm
    : (template.zones?.repeatHeader !== false ? metrics.headerHeightMm : 0) + metrics.marginsMm.top

  const lastTableSlice = lastPage.tableRowRange ?? [0, 0]
  let lastRowsHeight = 0
  for (let r = lastTableSlice[0]; r < lastTableSlice[1]; r++) {
    lastRowsHeight += rowHeights[r] ?? 8
  }
  const lastTableEndAbsY = lastTableStartY + headerRowHeightMm + lastRowsHeight
  const gap = options.gapBelowTableMm ?? 4.0

  const candidateTrailingEndY = lastTableEndAbsY + gap + trailingSpanHeightMm
  const lastPageBottomLimit =
    template.zones?.repeatFooter !== false
      ? metrics.pageHeightMm - metrics.footerHeightMm - metrics.marginsMm.bottom
      : metrics.pageHeightMm - metrics.marginsMm.bottom

  if (candidateTrailingEndY <= lastPageBottomLimit || trailingElements.length === 0) {
    // Fits on last table page
    for (const el of trailingElements) {
      const relY = el.yMm - minTrailingY
      const newYMm = isFirstOfDoc
        ? (lastTableEndAbsY - metrics.headerHeightMm) + gap + relY
        : lastTableEndAbsY + gap + relY - (template.zones?.repeatHeader !== false ? metrics.headerHeightMm : 0)

      lastPage.elements.push({
        ...el,
        id: `${el.id}__p${lastPageIndex + 1}`,
        yMm: newYMm,
      })
    }
  } else {
    // SPILL TO ADDITIONAL PAGE
    const overflowPageIndex = pages.length
    const overflowStartYMm = metrics.marginsMm.top

    if (trailingSpanHeightMm > metrics.usableBodyHeightMm) {
      diagnostics.push({
        code: 'TABLE_OVERFLOW',
        message: 'Trailing attached elements exceed usable body height on spillover page.',
        elementId: trailingElements[0]?.id,
      })
    }

    const overflowElements: ElementV3[] = trailingElements.map((el) => {
      const relY = el.yMm - minTrailingY
      return {
        ...el,
        id: `${el.id}__p${overflowPageIndex + 1}`,
        yMm: overflowStartYMm + relY,
      }
    })

    pages.push({
      pageNumber: overflowPageIndex + 1,
      id: `page-${overflowPageIndex + 1}`,
      elements: overflowElements,
    })
  }

  // Stationery Repetition Pass & Page Counters
  const totalPages = pages.length

  const finalPages: PaginatedPageV3[] = pages.map((p, idx) => {
    const pageNum = idx + 1
    const isFirst = idx === 0
    const isContinuation = idx > 0
    const isLast = idx === totalPages - 1

    const pageElements: ElementV3[] = []

    // Header Zone Elements
    const includeHeader = isFirst
      ? !template.zones?.hideHeaderOnFirstPage
      : template.zones?.repeatHeader !== false

    if (includeHeader) {
      for (const el of headerElements) {
        pageElements.push({
          ...el,
          id: isFirst ? el.id : `${el.id}__p${pageNum}`,
        })
      }
    }

    // Body Elements
    pageElements.push(...p.elements)

    // Footer Zone Elements
    const includeFooter = isFirst ? true : template.zones?.repeatFooter !== false
    if (includeFooter) {
      for (const el of footerElements) {
        pageElements.push({
          ...el,
          id: isFirst ? el.id : `${el.id}__p${pageNum}`,
        })
      }
    }

    // Token Interpolation for Page Counters
    const interpolatedElements = pageElements.map((el) => {
      if (el.type === 'text' && typeof (el as { content?: string }).content === 'string') {
        let content = (el as { content: string }).content
        content = content
          .replace(/\{\{\s*pageNumber\s*\}\}/g, String(pageNum))
          .replace(/\{\{\s*totalPages\s*\}\}/g, String(totalPages))
          .replace(/\{\{\s*page\s*\}\}/g, String(pageNum))
          .replace(/\{\{\s*pages\s*\}\}/g, String(totalPages))
        return { ...el, content }
      }
      return el
    })

    return {
      pageNumber: pageNum,
      id: p.id,
      elements: interpolatedElements,
      isFirstPage: isFirst,
      isContinuationPage: isContinuation,
      isLastPage: isLast,
      hasTableHeader: Boolean(p.tableRowRange),
      tableRowRange: p.tableRowRange,
      availableBodyHeightMm: metrics.usableBodyHeightMm,
      usedBodyHeightMm: metrics.usableBodyHeightMm,
    }
  })

  // Synthesize Multi-Page LayoutV3
  const synthesizedLayout: LayoutV3 = {
    ...template,
    pages: finalPages.map((fp) => ({
      id: fp.id,
      elements: fp.elements,
    })),
  }

  return {
    totalPages,
    pages: finalPages,
    layout: synthesizedLayout,
    diagnostics,
    metrics,
  }
}
