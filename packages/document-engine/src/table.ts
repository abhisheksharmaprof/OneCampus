import type { BaseElementV3, BorderStyleV3, TextStyleV3, TextAlign, TextVerticalAlign } from './index'
import { interpolateTokens, escapeHtml } from './tokens'
import { evaluateTotalsFormula } from './formula'
import { resolveDatasetName, getSampleDataset } from './sampleData'

export interface TableCellPaddingV3 {
  topMm: number
  rightMm: number
  bottomMm: number
  leftMm: number
}

export interface TableCellBorderEdgeV3 {
  style: BorderStyleV3
  widthMm: number
  color: string
}

export interface TableCellBorderV3 {
  unified?: boolean
  top?: TableCellBorderEdgeV3
  right?: TableCellBorderEdgeV3
  bottom?: TableCellBorderEdgeV3
  left?: TableCellBorderEdgeV3
}

export interface TableCellV3 {
  id?: string
  row: number
  column: number
  rowSpan?: number
  colSpan?: number
  isMergedCovered?: boolean
  mergedIntoId?: string
  content?: string | unknown
  style?: TextStyleV3
  backgroundColor?: string
  paddingMm?: TableCellPaddingV3
  border?: TableCellBorderV3
  align?: TextAlign
  verticalAlign?: TextVerticalAlign
}

export interface TableColumnV3 {
  id: string
  header?: string
  fieldId?: string
  widthMm?: number
  widthPercent?: number // Sum of all column widthPercent = 100
  widthPct?: number     // Backward-compatible alias
  minWidthMm?: number
  align?: TextAlign
  verticalAlign?: TextVerticalAlign
  cellStyle?: TextStyleV3
}

export interface TableRowV3 {
  id: string
  heightMm?: number
  isHeader?: boolean
  cells?: TableCellV3[]
}

export interface TableRowTemplateV3 {
  heightMm?: number
  style?: TextStyleV3
  backgroundColor?: string
  alternateBackgroundColor?: string
  cells: Array<{
    column: number
    content: string
    align?: TextAlign
    verticalAlign?: TextVerticalAlign
    style?: TextStyleV3
  }>
}

export type AggregateFunctionType = 'SUM' | 'COUNT' | 'AVERAGE' | 'AVG' | 'MIN' | 'MAX'

export interface TableTotalsCellV3 {
  column: number
  colSpan?: number
  content?: string
  formula?: string
  format?: 'currency' | 'number' | 'percentage' | 'none'
  style?: TextStyleV3
  align?: TextAlign
}

export interface TableTotalsRowV3 {
  enabled: boolean
  label?: string
  heightMm?: number
  style?: TextStyleV3
  backgroundColor?: string
  cells?: TableTotalsCellV3[]
}

export interface TableDatasetBindingV3 {
  datasetName: string
  rowTemplate?: TableRowTemplateV3
  totalsRow?: TableTotalsRowV3
  fieldMappings?: Record<string, string>
  emptyMessage?: string
  maxRowsPerPage?: number
}

export interface TableStyleV3 {
  striped?: boolean
  stripeEvenColor?: string
  stripeOddColor?: string
  hasHeader?: boolean
  headerBackground?: string
  headerTextColor?: string
  headerFontSizePt?: number
  headerFontFamily?: string
  headerHeightMm?: number
  rowHeightMm?: number
  totalsHeightMm?: number
  defaultTextStyle?: TextStyleV3
  defaultPaddingMm?: TableCellPaddingV3
  borderPreset?: 'grid' | 'horizontal-only' | 'outer-only' | 'none' | 'custom'
  borderColor?: string
  borderWidthMm?: number
  borderStyle?: BorderStyleV3
}

export interface StaticTableElementV3 extends BaseElementV3 {
  type: 'table'
  mode: 'static'
  rowCount: number
  colCount: number
  rows: TableRowV3[]
  columns: TableColumnV3[]
  cells: TableCellV3[]
  tableStyle?: TableStyleV3
  style?: Record<string, unknown>
}

export interface DynamicTableElementV3 extends BaseElementV3 {
  type: 'table'
  mode: 'dynamic'
  datasetId: string
  columns: Array<TableColumnV3 & { widthPct?: number }>
  rows?: TableRowV3[]
  cells?: TableCellV3[]
  tableStyle?: TableStyleV3
  datasetBinding?: TableDatasetBindingV3
  style?: Record<string, unknown>
}

export type TableElementV3 = StaticTableElementV3 | DynamicTableElementV3

/** Create a default static table (e.g. 3x3) */
export function createDefaultStaticTable(
  id: string,
  rowCount = 3,
  colCount = 3,
  widthMm = 160,
  heightMm = 45,
): StaticTableElementV3 {
  const rows: TableRowV3[] = []
  const columns: TableColumnV3[] = []
  const cells: TableCellV3[] = []

  const colWidthPct = Math.round((100 / colCount) * 100) / 100
  let allocatedPct = 0
  for (let c = 0; c < colCount; c++) {
    const isLast = c === colCount - 1
    const pct = isLast ? Math.round((100 - allocatedPct) * 100) / 100 : colWidthPct
    allocatedPct += pct
    columns.push({
      id: `col_${c + 1}`,
      header: `Column ${c + 1}`,
      widthPercent: pct,
    })
  }

  const rowHeightMm = heightMm / rowCount
  for (let r = 0; r < rowCount; r++) {
    rows.push({
      id: `row_${r + 1}`,
      heightMm: rowHeightMm,
      isHeader: r === 0,
    })
    for (let c = 0; c < colCount; c++) {
      cells.push({
        id: `cell_${r}_${c}`,
        row: r,
        column: c,
        rowSpan: 1,
        colSpan: 1,
        content: r === 0 ? `Header ${c + 1}` : `Data ${r},${c + 1}`,
        align: 'left',
        verticalAlign: 'middle',
      })
    }
  }

  return {
    id,
    type: 'table',
    mode: 'static',
    xMm: 25,
    yMm: 30,
    widthMm,
    heightMm,
    rowCount,
    colCount,
    rows,
    columns,
    cells,
    tableStyle: {
      hasHeader: true,
      striped: true,
      stripeEvenColor: '#FFFFFF',
      stripeOddColor: '#F8FAFC',
      headerBackground: '#173A5E',
      headerTextColor: '#FFFFFF',
      borderPreset: 'grid',
      borderColor: '#CBD5E1',
      borderWidthMm: 0.25,
      defaultPaddingMm: { topMm: 2, rightMm: 2.5, bottomMm: 2, leftMm: 2.5 },
    },
  }
}

/** Create a default dynamic table bound to a dataset */
export function createDefaultDynamicTable(
  id: string,
  datasetName = 'academics.exam_marks',
  widthMm = 160,
  heightMm = 50,
): DynamicTableElementV3 {
  const defaultCols: Array<TableColumnV3 & { widthPct?: number }> = [
    { id: 'c1', header: 'Subject', fieldId: 'subject', widthPercent: 40, widthPct: 40, align: 'left' },
    { id: 'c2', header: 'Max Marks', fieldId: 'max_marks', widthPercent: 20, widthPct: 20, align: 'right' },
    { id: 'c3', header: 'Obtained', fieldId: 'marks', widthPercent: 25, widthPct: 25, align: 'right' },
    { id: 'c4', header: 'Grade', fieldId: 'grade', widthPercent: 15, widthPct: 15, align: 'center' },
  ]

  return {
    id,
    type: 'table',
    mode: 'dynamic',
    datasetId: datasetName,
    xMm: 25,
    yMm: 40,
    widthMm,
    heightMm,
    columns: defaultCols,
    datasetBinding: {
      datasetName,
      rowTemplate: {
        heightMm: 7,
        cells: [
          { column: 0, content: '{{item.subject}}', align: 'left' },
          { column: 1, content: '{{item.max_marks}}', align: 'right' },
          { column: 2, content: '{{item.marks}}', align: 'right' },
          { column: 3, content: '{{item.grade}}', align: 'center' },
        ],
      },
      totalsRow: {
        enabled: true,
        label: 'Total',
        heightMm: 8,
        cells: [
          { column: 0, content: 'Total', colSpan: 2, align: 'left' },
          { column: 2, content: '{{SUM(marks)}}', formula: 'SUM(marks)', align: 'right' },
          { column: 3, content: '', align: 'center' },
        ],
      },
    },
    tableStyle: {
      hasHeader: true,
      striped: true,
      stripeEvenColor: '#FFFFFF',
      stripeOddColor: '#F8FAFC',
      headerBackground: '#173A5E',
      headerTextColor: '#FFFFFF',
      borderPreset: 'grid',
      borderColor: '#CBD5E1',
      borderWidthMm: 0.25,
      defaultPaddingMm: { topMm: 2, rightMm: 2.5, bottomMm: 2, leftMm: 2.5 },
    },
  }
}

/** Check if selection forms a valid rectangular block that can be merged */
export function canMergeCells(
  table: StaticTableElementV3,
  selectedCells: Array<{ row: number; column: number }>,
): boolean {
  if (!selectedCells || selectedCells.length < 2) return false

  let minR = Number.POSITIVE_INFINITY
  let maxR = Number.NEGATIVE_INFINITY
  let minC = Number.POSITIVE_INFINITY
  let maxC = Number.NEGATIVE_INFINITY

  for (const cell of selectedCells) {
    if (cell.row < minR) minR = cell.row
    if (cell.row > maxR) maxR = cell.row
    if (cell.column < minC) minC = cell.column
    if (cell.column > maxC) maxC = cell.column
  }

  const expectedCount = (maxR - minR + 1) * (maxC - minC + 1)
  if (selectedCells.length !== expectedCount) return false

  // Check that every cell in the bounding box is present in selectedCells and not merged outside
  const selectedKeySet = new Set(selectedCells.map((c) => `${c.row}:${c.column}`))
  for (let r = minR; r <= maxR; r++) {
    for (let c = minC; c <= maxC; c++) {
      if (!selectedKeySet.has(`${r}:${c}`)) return false
      const existing = table.cells.find((cell) => cell.row === r && cell.column === c)
      if (existing?.isMergedCovered && existing.mergedIntoId) {
        // If covered, the anchor must also be inside the selection
        const anchor = table.cells.find((cell) => cell.id === existing.mergedIntoId)
        if (anchor && !selectedKeySet.has(`${anchor.row}:${anchor.column}`)) return false
      }
    }
  }

  return true
}

/** Merge selected cells into an anchor cell */
export function mergeCells(
  table: StaticTableElementV3,
  selectedCells: Array<{ row: number; column: number }>,
): StaticTableElementV3 {
  if (!canMergeCells(table, selectedCells)) return table

  let minR = Number.POSITIVE_INFINITY
  let maxR = Number.NEGATIVE_INFINITY
  let minC = Number.POSITIVE_INFINITY
  let maxC = Number.NEGATIVE_INFINITY

  for (const cell of selectedCells) {
    if (cell.row < minR) minR = cell.row
    if (cell.row > maxR) maxR = cell.row
    if (cell.column < minC) minC = cell.column
    if (cell.column > maxC) maxC = cell.column
  }

  const anchorRow = minR
  const anchorCol = minC
  const rowSpan = maxR - minR + 1
  const colSpan = maxC - minC + 1

  // Collect text contents to join into anchor if anchor is empty
  const collectedContents: string[] = []
  let anchorId = ''

  for (const c of table.cells) {
    if (c.row === anchorRow && c.column === anchorCol) {
      anchorId = c.id || ''
      const txt = typeof c.content === 'string' ? c.content.trim() : ''
      if (txt) collectedContents.push(txt)
    }
  }

  for (const c of table.cells) {
    if (
      c.row >= minR &&
      c.row <= maxR &&
      c.column >= minC &&
      c.column <= maxC &&
      !(c.row === anchorRow && c.column === anchorCol)
    ) {
      const txt = typeof c.content === 'string' ? c.content.trim() : ''
      if (txt) collectedContents.push(txt)
    }
  }

  const newCells = table.cells.map((cell) => {
    if (cell.row === anchorRow && cell.column === anchorCol) {
      return {
        ...cell,
        rowSpan,
        colSpan,
        isMergedCovered: false,
        mergedIntoId: undefined,
        content: collectedContents.join(' ') || cell.content || '',
      }
    }
    if (cell.row >= minR && cell.row <= maxR && cell.column >= minC && cell.column <= maxC) {
      return {
        ...cell,
        rowSpan: 1,
        colSpan: 1,
        isMergedCovered: true,
        mergedIntoId: anchorId,
      }
    }
    return cell
  })

  return {
    ...table,
    cells: newCells,
  }
}

/** Split a merged anchor cell back into individual 1x1 cells */
export function splitCell(
  table: StaticTableElementV3,
  row: number,
  column: number,
): StaticTableElementV3 {
  const anchor = table.cells.find((c) => c.row === row && c.column === column)
  if (!anchor || (!anchor.rowSpan || anchor.rowSpan <= 1) && (!anchor.colSpan || anchor.colSpan <= 1)) {
    return table
  }

  const rSpan = anchor.rowSpan || 1
  const cSpan = anchor.colSpan || 1
  const anchorId = anchor.id

  const newCells = table.cells.map((cell) => {
    if (cell.id === anchorId) {
      return {
        ...cell,
        rowSpan: 1,
        colSpan: 1,
        isMergedCovered: false,
        mergedIntoId: undefined,
      }
    }
    if (cell.mergedIntoId === anchorId) {
      return {
        ...cell,
        rowSpan: 1,
        colSpan: 1,
        isMergedCovered: false,
        mergedIntoId: undefined,
        content: '',
      }
    }
    return cell
  })

  return {
    ...table,
    cells: newCells,
  }
}

/** Insert a row above or below atIndex */
export function insertRow(
  table: StaticTableElementV3,
  atIndex: number,
  position: 'above' | 'below',
): StaticTableElementV3 {
  const targetIndex = position === 'above' ? atIndex : atIndex + 1
  const newRowCount = table.rowCount + 1
  const newHeightMm = table.heightMm + (table.heightMm / table.rowCount)

  const newRows: TableRowV3[] = []
  for (let r = 0; r < table.rows.length; r++) {
    if (r === targetIndex) {
      newRows.push({
        id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        heightMm: table.rows[atIndex]?.heightMm ?? (table.heightMm / table.rowCount),
      })
    }
    newRows.push(table.rows[r])
  }
  if (targetIndex >= table.rows.length) {
    newRows.push({
      id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      heightMm: table.rows[atIndex]?.heightMm ?? (table.heightMm / table.rowCount),
    })
  }

  const updatedCells: TableCellV3[] = []
  for (const cell of table.cells) {
    if (cell.row >= targetIndex) {
      updatedCells.push({
        ...cell,
        row: cell.row + 1,
      })
    } else {
      updatedCells.push(cell)
    }
  }

  // Create new cells for targetIndex
  for (let c = 0; c < table.colCount; c++) {
    updatedCells.push({
      id: `cell_${targetIndex}_${c}_${Date.now()}`,
      row: targetIndex,
      column: c,
      rowSpan: 1,
      colSpan: 1,
      content: '',
      align: 'left',
      verticalAlign: 'middle',
    })
  }

  return {
    ...table,
    rowCount: newRowCount,
    heightMm: newHeightMm,
    rows: newRows,
    cells: updatedCells,
  }
}

/** Delete a row at rowIndex */
export function deleteRow(
  table: StaticTableElementV3,
  rowIndex: number,
): StaticTableElementV3 {
  if (table.rowCount <= 1) return table // Guardrail: keep at least 1 row

  const newRowCount = table.rowCount - 1
  const rowToRemove = table.rows[rowIndex]
  const removedHeight = rowToRemove?.heightMm ?? (table.heightMm / table.rowCount)
  const newHeightMm = Math.max(10, table.heightMm - removedHeight)

  const newRows = table.rows.filter((_, idx) => idx !== rowIndex)

  // Cells filtering and index shift
  const remainingCells: TableCellV3[] = []
  for (const cell of table.cells) {
    if (cell.row === rowIndex) {
      // If cell was an anchor with rowSpan > 1, promote cell below if exists
      if (cell.rowSpan && cell.rowSpan > 1) {
        const belowCell = table.cells.find((c) => c.row === rowIndex + 1 && c.column === cell.column)
        if (belowCell) {
          belowCell.isMergedCovered = false
          belowCell.mergedIntoId = undefined
          belowCell.rowSpan = cell.rowSpan - 1
          belowCell.colSpan = cell.colSpan
          belowCell.content = cell.content
        }
      }
      continue
    }
    if (cell.row > rowIndex) {
      remainingCells.push({
        ...cell,
        row: cell.row - 1,
      })
    } else {
      remainingCells.push(cell)
    }
  }

  return {
    ...table,
    rowCount: newRowCount,
    heightMm: newHeightMm,
    rows: newRows,
    cells: remainingCells,
  }
}

/** Insert a column left or right of atIndex */
export function insertColumn(
  table: StaticTableElementV3,
  atIndex: number,
  position: 'left' | 'right',
): StaticTableElementV3 {
  const targetIndex = position === 'left' ? atIndex : atIndex + 1
  const newColCount = table.colCount + 1

  // Scale existing width percentages so new column gets 100 / newColCount %
  const newColPct = Math.round((100 / newColCount) * 100) / 100
  const scale = (100 - newColPct) / 100

  const newCols: TableColumnV3[] = []
  let sumPct = 0

  for (let c = 0; c < table.columns.length; c++) {
    if (c === targetIndex) {
      newCols.push({
        id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        header: `Column ${targetIndex + 1}`,
        widthPercent: newColPct,
      })
      sumPct += newColPct
    }
    const curW = table.columns[c]?.widthPercent ?? table.columns[c]?.widthPct ?? 0
    const scaledPct = Math.round(curW * scale * 100) / 100
    newCols.push({
      ...table.columns[c],
      widthPercent: scaledPct,
    })
    sumPct += scaledPct
  }

  if (targetIndex >= table.columns.length) {
    newCols.push({
      id: `col_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      header: `Column ${targetIndex + 1}`,
      widthPercent: newColPct,
    })
    sumPct += newColPct
  }

  // Normalize last col so total is exactly 100.0
  const diff = Math.round((100 - sumPct) * 100) / 100
  const lastCol = newCols[newCols.length - 1]
  if (lastCol && Math.abs(diff) > 0.0001) {
    lastCol.widthPercent = Math.round(((lastCol.widthPercent ?? 0) + diff) * 100) / 100
  }

  const updatedCells: TableCellV3[] = []
  for (const cell of table.cells) {
    if (cell.column >= targetIndex) {
      updatedCells.push({
        ...cell,
        column: cell.column + 1,
      })
    } else {
      updatedCells.push(cell)
    }
  }

  // Create new cells for targetIndex across all rows
  for (let r = 0; r < table.rowCount; r++) {
    updatedCells.push({
      id: `cell_${r}_${targetIndex}_${Date.now()}`,
      row: r,
      column: targetIndex,
      rowSpan: 1,
      colSpan: 1,
      content: '',
      align: 'left',
      verticalAlign: 'middle',
    })
  }

  return {
    ...table,
    colCount: newColCount,
    columns: newCols,
    cells: updatedCells,
  }
}

/** Delete a column at colIndex */
export function deleteColumn(
  table: StaticTableElementV3,
  colIndex: number,
): StaticTableElementV3 {
  if (table.colCount <= 1) return table // Guardrail: keep at least 1 column

  const newColCount = table.colCount - 1
  const remainingCols = table.columns.filter((_, idx) => idx !== colIndex)

  // Rebalance remaining column percentages so total is 100%
  const totalRemainingPct = remainingCols.reduce((sum, c) => sum + (c.widthPercent ?? c.widthPct ?? 0), 0)
  let allocatedPct = 0
  const rebalancedCols = remainingCols.map((col, idx) => {
    if (idx === remainingCols.length - 1) {
      const lastPct = Math.round((100 - allocatedPct) * 100) / 100
      return { ...col, widthPercent: lastPct }
    }
    const curW = col.widthPercent ?? col.widthPct ?? 0
    const scaled = Math.round(((curW / (totalRemainingPct || 1)) * 100) * 100) / 100
    allocatedPct += scaled
    return { ...col, widthPercent: scaled }
  })

  // Cells filtering and index shift
  const remainingCells: TableCellV3[] = []
  for (const cell of table.cells) {
    if (cell.column === colIndex) {
      if (cell.colSpan && cell.colSpan > 1) {
        const rightCell = table.cells.find((c) => c.row === cell.row && c.column === colIndex + 1)
        if (rightCell) {
          rightCell.isMergedCovered = false
          rightCell.mergedIntoId = undefined
          rightCell.colSpan = cell.colSpan - 1
          rightCell.rowSpan = cell.rowSpan
          rightCell.content = cell.content
        }
      }
      continue
    }
    if (cell.column > colIndex) {
      remainingCells.push({
        ...cell,
        column: cell.column - 1,
      })
    } else {
      remainingCells.push(cell)
    }
  }

  return {
    ...table,
    colCount: newColCount,
    columns: rebalancedCols,
    cells: remainingCells,
  }
}

/** Proportional drag of divider between colIndex and colIndex + 1 with 100% width invariant */
export function resizeColumnDivider(
  columns: TableColumnV3[],
  colIndex: number,
  deltaMm: number,
  tableWidthMm: number,
): TableColumnV3[] {
  if (colIndex < 0 || colIndex >= columns.length - 1 || tableWidthMm <= 0) {
    return columns
  }

  const deltaPct = (deltaMm / tableWidthMm) * 100
  const minPct = Math.max(5.0, (5.0 / tableWidthMm) * 100) // Minimum 5mm or 5% clamp

  const curLeft = columns[colIndex]?.widthPercent ?? columns[colIndex]?.widthPct ?? 0
  const curRight = columns[colIndex + 1]?.widthPercent ?? columns[colIndex + 1]?.widthPct ?? 0

  const maxLeftDelta = curRight - minPct
  const maxRightDelta = -(curLeft - minPct)

  const clampedDelta = Math.max(maxRightDelta, Math.min(maxLeftDelta, deltaPct))

  const newLeft = Math.round((curLeft + clampedDelta) * 100) / 100
  const newRight = Math.round((curRight - clampedDelta) * 100) / 100

  return columns.map((col, idx) => {
    if (idx === colIndex) return { ...col, widthPercent: newLeft }
    if (idx === colIndex + 1) return { ...col, widthPercent: newRight }
    return col
  })
}

/** Update individual cell properties */
export function updateCell(
  table: StaticTableElementV3,
  row: number,
  column: number,
  patch: Partial<TableCellV3>,
): StaticTableElementV3 {
  const newCells = table.cells.map((cell) => {
    if (cell.row === row && cell.column === column) {
      return { ...cell, ...patch }
    }
    return cell
  })
  return {
    ...table,
    cells: newCells,
  }
}

/** Update table global styling */
export function updateTableStyle(
  table: TableElementV3,
  patch: Partial<TableStyleV3>,
): TableElementV3 {
  return {
    ...table,
    tableStyle: {
      ...table.tableStyle,
      ...patch,
    },
  }
}

/** Compile CSS border string for a table cell */
export function compileCellBorderCss(
  cellBorder?: TableCellBorderV3,
  preset: TableStyleV3['borderPreset'] = 'grid',
  defaultBorderColor = '#CBD5E1',
  defaultBorderWidthMm = 0.25,
): string {
  if (cellBorder?.top || cellBorder?.bottom || cellBorder?.left || cellBorder?.right) {
    const t = cellBorder.top ? `${cellBorder.top.widthMm}mm ${cellBorder.top.style} ${cellBorder.top.color}` : 'none'
    const r = cellBorder.right ? `${cellBorder.right.widthMm}mm ${cellBorder.right.style} ${cellBorder.right.color}` : 'none'
    const b = cellBorder.bottom ? `${cellBorder.bottom.widthMm}mm ${cellBorder.bottom.style} ${cellBorder.bottom.color}` : 'none'
    const l = cellBorder.left ? `${cellBorder.left.widthMm}mm ${cellBorder.left.style} ${cellBorder.left.color}` : 'none'
    return `border-top:${t};border-right:${r};border-bottom:${b};border-left:${l};`
  }

  const def = `${defaultBorderWidthMm}mm solid ${defaultBorderColor}`
  switch (preset) {
    case 'grid':
      return `border:${def};`
    case 'horizontal-only':
      return `border-top:${def};border-bottom:${def};border-left:none;border-right:none;`
    case 'outer-only':
      return 'border:none;'
    case 'none':
      return 'border:none;'
    default:
      return `border:${def};`
  }
}

/** Pure semantic HTML compiler for static and dynamic tables */
export function compileTableHtml(
  tableEl: TableElementV3,
  dataFields: Record<string, unknown> = {},
  customRows?: Array<Record<string, unknown>>,
): string {
  if (tableEl.mode === 'static') {
    const staticEl = tableEl as StaticTableElementV3
    const style = staticEl.tableStyle || {}
    const colgroup = staticEl.columns.map((col) => {
      const w = col.widthPercent ? `width:${col.widthPercent}%;` : col.widthMm ? `width:${col.widthMm}mm;` : ''
      return `<col style="${w}"/>`
    }).join('')

    const rowGroups: string[] = []
    const cells = staticEl.cells || []

    for (let r = 0; r < staticEl.rowCount; r++) {
      const isHeaderRow = staticEl.rows[r]?.isHeader || (r === 0 && style.hasHeader)
      const cellHtmls: string[] = []

      for (let c = 0; c < staticEl.colCount; c++) {
        const cell = cells.find((item) => item.row === r && item.column === c)
        if (!cell || cell.isMergedCovered) continue

        const rowSpanAttr = cell.rowSpan && cell.rowSpan > 1 ? ` rowspan="${cell.rowSpan}"` : ''
        const colSpanAttr = cell.colSpan && cell.colSpan > 1 ? ` colspan="${cell.colSpan}"` : ''

        let bg = cell.backgroundColor
        if (!bg) {
          if (isHeaderRow) {
            bg = style.headerBackground || '#173A5E'
          } else if (style.striped !== false) {
            bg = r % 2 === 1 ? (style.stripeOddColor || '#F8FAFC') : (style.stripeEvenColor || '#FFFFFF')
          } else {
            bg = '#FFFFFF'
          }
        }

        let textColor = cell.style?.color
        if (!textColor) {
          if (isHeaderRow) {
            textColor = style.headerTextColor || '#FFFFFF'
          } else {
            textColor = '#1E293B'
          }
        }

        const pad = cell.paddingMm || style.defaultPaddingMm || { topMm: 2, rightMm: 2.5, bottomMm: 2, leftMm: 2.5 }
        const padCss = `padding:${pad.topMm}mm ${pad.rightMm}mm ${pad.bottomMm}mm ${pad.leftMm}mm;`
        const borderCss = compileCellBorderCss(cell.border, style.borderPreset, style.borderColor, style.borderWidthMm)
        const alignCss = `text-align:${cell.align || 'left'};vertical-align:${cell.verticalAlign || 'middle'};`
        const fontSize = cell.style?.fontSizePt ? `font-size:${cell.style.fontSizePt}pt;` : isHeaderRow ? `font-size:${style.headerFontSizePt ?? 9.5}pt;` : 'font-size:9pt;'
        const fontWeight = cell.style?.bold || isHeaderRow ? 'font-weight:600;' : ''
        const fontStyle = cell.style?.italic ? 'font-style:italic;' : ''

        const rawContent = typeof cell.content === 'string' ? cell.content : ''
        const content = interpolateTokens(rawContent, dataFields as Record<string, unknown>, { escapeHtml: true })
        const tag = isHeaderRow ? 'th' : 'td'

        cellHtmls.push(`<${tag}${rowSpanAttr}${colSpanAttr} style="${borderCss}${padCss}background:${bg};color:${textColor};${alignCss}${fontSize}${fontWeight}${fontStyle}word-break:break-word;overflow-wrap:anywhere;">${content}</${tag}>`)
      }

      const rowH = staticEl.rows[r]?.heightMm ? `height:${staticEl.rows[r].heightMm}mm;` : ''
      rowGroups.push(`<tr style="${rowH}break-inside:avoid;page-break-inside:avoid;">${cellHtmls.join('')}</tr>`)
    }

    const pos = `position:absolute;left:${staticEl.xMm}mm;top:${staticEl.yMm}mm;width:${staticEl.widthMm}mm;height:${staticEl.heightMm}mm;`
    return `<div data-element-id="${escapeHtml(staticEl.id)}" style="${pos}box-sizing:border-box;"><table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;">${colgroup ? `<colgroup>${colgroup}</colgroup>` : ''}<tbody>${rowGroups.join('')}</tbody></table></div>`
  }

  const dynamicEl = tableEl as DynamicTableElementV3
  const style = dynamicEl.tableStyle || {}
  const headerBg = style.headerBackground || '#173A5E'
  const headerColor = style.headerTextColor || '#FFFFFF'
  const zebraColor = style.stripeOddColor || '#F8FAFC'
  const zebra = style.striped !== false
  const defaultPad = style.defaultPaddingMm || { topMm: 2, rightMm: 2.5, bottomMm: 2, leftMm: 2.5 }
  const padCss = `padding:${defaultPad.topMm}mm ${defaultPad.rightMm}mm ${defaultPad.bottomMm}mm ${defaultPad.leftMm}mm;`
  const borderCss = compileCellBorderCss(undefined, style.borderPreset, style.borderColor, style.borderWidthMm)

  // 1. Column allocations
  const colgroup = (dynamicEl.columns || []).map((col) => {
    const pct = col.widthPercent ?? col.widthPct
    const w = pct ? `width:${pct}%;` : col.widthMm ? `width:${col.widthMm}mm;` : ''
    return `<col style="${w}"/>`
  }).join('')

  // 2. Thead
  const thCells = (dynamicEl.columns || []).map((col) => {
    const align = col.align || 'left'
    return `<th style="${borderCss}${padCss}background:${headerBg};color:${headerColor};text-align:${align};font-weight:600;font-size:${style.headerFontSizePt ?? 9.5}pt;">${escapeHtml(col.header || '')}</th>`
  }).join('')
  const thead = `<thead style="display:table-header-group;"><tr style="height:${style.headerHeightMm ?? 8}mm;break-inside:avoid;page-break-inside:avoid;">${thCells}</tr></thead>`

  // 3. Tbody
  const rawDatasetName = dynamicEl.datasetBinding?.datasetName || dynamicEl.datasetId || ''
  const resolvedDatasetName = resolveDatasetName(rawDatasetName)
  const rows = customRows || getSampleDataset(resolvedDatasetName)
  const rowTemplate = dynamicEl.datasetBinding?.rowTemplate

  const tbRows = rows.map((row, idx) => {
    const bg = zebra && idx % 2 === 1 ? zebraColor : (style.stripeEvenColor || '#FFFFFF')
    const tdCells = (dynamicEl.columns || []).map((col, colIdx) => {
      const align = col.align || 'left'
      const vAlign = col.verticalAlign || 'middle'
      let cellText = ''
      if (rowTemplate && rowTemplate.cells && rowTemplate.cells[colIdx]) {
        const tpl = rowTemplate.cells[colIdx].content || ''
        cellText = interpolateTokens(tpl, { ...dataFields, item: row, ...row, index: idx + 1 }, { escapeHtml: true })
      } else {
        const raw = row[col.fieldId || col.id]
        cellText = raw !== undefined && raw !== null ? escapeHtml(String(raw)) : '—'
      }
      return `<td style="${borderCss}${padCss}text-align:${align};vertical-align:${vAlign};font-size:9pt;color:#1E293B;word-break:break-word;overflow-wrap:anywhere;">${cellText}</td>`
    }).join('')
    return `<tr style="background:${bg};height:${style.rowHeightMm ?? 7}mm;break-inside:avoid;page-break-inside:avoid;">${tdCells}</tr>`
  }).join('')
  const tbody = `<tbody>${tbRows}</tbody>`

  // 4. Tfoot (Totals)
  let tfoot = ''
  const totalsRow = dynamicEl.datasetBinding?.totalsRow
  if (totalsRow && totalsRow.enabled) {
    const totalsCells = (totalsRow.cells && totalsRow.cells.length > 0)
      ? totalsRow.cells
      : [{ column: 0, content: totalsRow.label || 'Total', colSpan: 1 }]

    const tfCells = totalsCells.map((tc) => {
      const align = tc.align || (dynamicEl.columns[tc.column]?.align) || 'left'
      const colSpanAttr = tc.colSpan && tc.colSpan > 1 ? ` colspan="${tc.colSpan}"` : ''
      let content = tc.content || ''
      if (tc.formula) {
        const evaluated = evaluateTotalsFormula(tc.formula, rows)
        if (typeof evaluated === 'number') {
          content = tc.format === 'currency' ? `₹${evaluated.toLocaleString('en-IN')}` : String(evaluated)
        } else {
          content = String(evaluated)
        }
      } else if (content) {
        content = interpolateTokens(content, dataFields, { escapeHtml: true })
      }
      return `<td${colSpanAttr} style="${borderCss}${padCss}font-weight:700;text-align:${align};font-size:9pt;color:#1E293B;">${content}</td>`
    }).join('')
    tfoot = `<tfoot style="display:table-footer-group;"><tr style="background:${totalsRow.backgroundColor || '#F1F5F9'};height:${totalsRow.heightMm ?? style.totalsHeightMm ?? 8}mm;break-inside:avoid;page-break-inside:avoid;">${tfCells}</tr></tfoot>`
  }

  const pos = `position:absolute;left:${dynamicEl.xMm}mm;top:${dynamicEl.yMm}mm;width:${dynamicEl.widthMm}mm;box-sizing:border-box;`
  return `<div data-element-id="${escapeHtml(dynamicEl.id)}" style="${pos}"><table style="width:100%;border-collapse:collapse;table-layout:fixed;">${colgroup ? `<colgroup>${colgroup}</colgroup>` : ''}${thead}${tbody}${tfoot}</table></div>`
}
