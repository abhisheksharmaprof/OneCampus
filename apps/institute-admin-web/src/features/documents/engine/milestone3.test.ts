import { describe, it, expect } from 'vitest'
import type {
  LayoutV3,
  StaticTableElementV3,
  DynamicTableElementV3,
  TableColumnV3,
} from '@campusone/document-engine'
import {
  normalizeLayout,
  buildRenderPlan,
  renderDocumentHtml,
  createDefaultStaticTable,
  createDefaultDynamicTable,
  canMergeCells,
  mergeCells,
  splitCell,
  insertRow,
  deleteRow,
  insertColumn,
  deleteColumn,
  resizeColumnDivider,
  updateCell,
  updateTableStyle,
  tokenizeFormula,
  parseFormula,
  evaluateTotalsFormula,
  CANONICAL_DATASETS,
  resolveDatasetName,
  getSampleDataset,
  computePageMetrics,
  estimateRowHeightMm,
  paginateDocument,
} from '@campusone/document-engine'
import {
  initialStudioNextState,
  studioNextReducer,
} from '../studio-next/state/studioNextReducer'

function makeTestLayout(overrides: {
  page?: Partial<LayoutV3['page']>
  zones?: LayoutV3['zones']
  watermark?: LayoutV3['watermark']
  masterLetterhead?: LayoutV3['masterLetterhead']
  pages?: LayoutV3['pages']
} = {}): LayoutV3 {
  return {
    version: 3,
    page: {
      sizeId: 'A4P',
      orientation: 'PORTRAIT',
      marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
      background: '#FFFFFF',
      ...(overrides.page || {}),
    },
    zones: overrides.zones ?? { headerMm: 30, footerMm: 20 },
    watermark: overrides.watermark ?? { mode: 'none' },
    pages: overrides.pages ?? [{ id: 'p1', elements: [] }],
    ...(overrides.masterLetterhead ? { masterLetterhead: overrides.masterLetterhead } : {}),
  }
}

describe('Milestone 3: Static Tables & Cell Formatting (TS-14, TS-16)', () => {
  it('creates default static table with valid grid and 100% column widths', () => {
    const table = createDefaultStaticTable('tbl_1', 3, 3, 150, 45)
    expect(table.type).toBe('table')
    expect(table.mode).toBe('static')
    expect(table.rowCount).toBe(3)
    expect(table.colCount).toBe(3)
    expect(table.rows.length).toBe(3)
    expect(table.columns.length).toBe(3)
    expect(table.cells.length).toBe(9)

    const totalWidthPct = table.columns.reduce((sum, col) => sum + (col.widthPercent ?? 0), 0)
    expect(Math.round(totalWidthPct)).toBe(100)
  })

  it('validates and normalizes static table in LayoutV3 without diagnostics', () => {
    const table = createDefaultStaticTable('tbl_norm', 2, 2, 100, 30)
    const layout = makeTestLayout({
      zones: { headerMm: 0, footerMm: 0 },
      pages: [{ id: 'page-1', elements: [table] }],
    })
    const normalized = normalizeLayout(layout)
    expect(normalized.version).toBe(3)
    expect(normalized.pages[0].elements[0].id).toBe('tbl_norm')
  })

  describe('Grid Mathematics: Cell Merge and Split', () => {
    it('accurately checks rectangular merge validity with canMergeCells', () => {
      const table = createDefaultStaticTable('tbl_merge_check', 3, 3)

      // Valid 2x2 selection: (0,0), (0,1), (1,0), (1,1)
      const valid2x2 = [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 0 },
        { row: 1, column: 1 },
      ]
      expect(canMergeCells(table, valid2x2)).toBe(true)

      // Non-rectangular L-shape: (0,0), (0,1), (1,0) (missing (1,1))
      const invalidL = [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 0 },
      ]
      expect(canMergeCells(table, invalidL)).toBe(false)

      // Single cell cannot be merged
      expect(canMergeCells(table, [{ row: 0, column: 0 }])).toBe(false)
    })

    it('merges 2x2 cells into anchor cell with rowSpan 2 and colSpan 2, marking covered cells', () => {
      const table = createDefaultStaticTable('tbl_m2', 3, 3)
      const selection = [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 0 },
        { row: 1, column: 1 },
      ]

      const merged = mergeCells(table, selection)
      const anchor = merged.cells.find((c) => c.row === 0 && c.column === 0)
      expect(anchor?.rowSpan).toBe(2)
      expect(anchor?.colSpan).toBe(2)
      expect(anchor?.isMergedCovered).toBe(false)

      const covered1 = merged.cells.find((c) => c.row === 0 && c.column === 1)
      const covered2 = merged.cells.find((c) => c.row === 1 && c.column === 0)
      const covered3 = merged.cells.find((c) => c.row === 1 && c.column === 1)

      expect(covered1?.isMergedCovered).toBe(true)
      expect(covered1?.mergedIntoId).toBe(anchor?.id)
      expect(covered2?.isMergedCovered).toBe(true)
      expect(covered3?.isMergedCovered).toBe(true)
    })

    it('splits a merged anchor cell back into individual 1x1 cells', () => {
      const table = createDefaultStaticTable('tbl_split', 3, 3)
      const merged = mergeCells(table, [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 0 },
        { row: 1, column: 1 },
      ])

      const split = splitCell(merged, 0, 0)
      const anchor = split.cells.find((c) => c.row === 0 && c.column === 0)
      expect(anchor?.rowSpan).toBe(1)
      expect(anchor?.colSpan).toBe(1)
      expect(anchor?.isMergedCovered).toBe(false)

      const previouslyCovered = split.cells.find((c) => c.row === 0 && c.column === 1)
      expect(previouslyCovered?.rowSpan).toBe(1)
      expect(previouslyCovered?.colSpan).toBe(1)
      expect(previouslyCovered?.isMergedCovered).toBe(false)
      expect(previouslyCovered?.mergedIntoId).toBeUndefined()
    })
  })

  describe('Row and Column Mutations', () => {
    it('inserts row above and shifts subsequent row indices', () => {
      const table = createDefaultStaticTable('tbl_ins_row', 2, 2)
      const withNewRow = insertRow(table, 1, 'above')

      expect(withNewRow.rowCount).toBe(3)
      expect(withNewRow.rows.length).toBe(3)
      expect(withNewRow.cells.length).toBe(6)

      const row1Cells = withNewRow.cells.filter((c) => c.row === 1)
      expect(row1Cells.length).toBe(2)
      expect(row1Cells[0].content).toBe('')

      const row2Cells = withNewRow.cells.filter((c) => c.row === 2)
      expect(row2Cells[0].content).toContain('Data 1')
    })

    it('deletes row and decrements row indices, preventing deletion of last row', () => {
      const table = createDefaultStaticTable('tbl_del_row', 3, 2)
      const withDeleted = deleteRow(table, 1)

      expect(withDeleted.rowCount).toBe(2)
      expect(withDeleted.cells.length).toBe(4)

      // Guardrail: cannot delete down to 0 rows
      const singleRowTable = createDefaultStaticTable('tbl_single', 1, 2)
      const cannotDelete = deleteRow(singleRowTable, 0)
      expect(cannotDelete.rowCount).toBe(1)
    })

    it('inserts column and rebalances widths maintaining 100% total', () => {
      const table = createDefaultStaticTable('tbl_ins_col', 2, 2)
      const withNewCol = insertColumn(table, 1, 'right')

      expect(withNewCol.colCount).toBe(3)
      expect(withNewCol.columns.length).toBe(3)
      expect(withNewCol.cells.length).toBe(6)

      const totalPct = withNewCol.columns.reduce((sum, c) => sum + (c.widthPercent ?? 0), 0)
      expect(Math.round(totalPct)).toBe(100)
    })

    it('deletes column and rebalances remaining column width percentages to 100%', () => {
      const table = createDefaultStaticTable('tbl_del_col', 2, 3)
      const withDelCol = deleteColumn(table, 1)

      expect(withDelCol.colCount).toBe(2)
      expect(withDelCol.columns.length).toBe(2)
      expect(withDelCol.cells.length).toBe(4)

      const totalPct = withDelCol.columns.reduce((sum, c) => sum + (c.widthPercent ?? 0), 0)
      expect(Math.round(totalPct)).toBe(100)

      // Guardrail: cannot delete down to 0 columns
      const singleColTable = createDefaultStaticTable('tbl_single_c', 2, 1)
      const cannotDelete = deleteColumn(singleColTable, 0)
      expect(cannotDelete.colCount).toBe(1)
    })
  })

  describe('Column Divider Dragging (100% Invariant)', () => {
    it('adjusts adjacent column widths while keeping total sum invariant at 100.0%', () => {
      const cols: TableColumnV3[] = [
        { id: 'c1', widthPercent: 50 },
        { id: 'c2', widthPercent: 50 },
      ]
      // Drag divider between col 0 and 1 by +10mm with table width 100mm -> +10%
      const resized = resizeColumnDivider(cols, 0, 10, 100)

      expect(resized[0].widthPercent).toBe(60)
      expect(resized[1].widthPercent).toBe(40)
      expect(resized[0].widthPercent! + resized[1].widthPercent!).toBe(100)
    })

    it('clamps divider dragging to minimum 5% / 5mm threshold', () => {
      const cols: TableColumnV3[] = [
        { id: 'c1', widthPercent: 10 },
        { id: 'c2', widthPercent: 90 },
      ]
      // Dragging left by -20mm on 100mm table would reduce col 0 to -10%, clamped to min 5%
      const clamped = resizeColumnDivider(cols, 0, -20, 100)
      expect(clamped[0].widthPercent).toBe(5)
      expect(clamped[1].widthPercent).toBe(95)
    })
  })

  describe('Cell Typography, Padding, and Borders', () => {
    it('updates individual cell styling and content', () => {
      const table = createDefaultStaticTable('tbl_style', 2, 2)
      const updated = updateCell(table, 0, 0, {
        content: 'Custom Title',
        backgroundColor: '#FEF3C7',
        align: 'center',
        style: { fontSizePt: 12, bold: true, color: '#B45309' },
      })

      const cell = updated.cells.find((c) => c.row === 0 && c.column === 0)
      expect(cell?.content).toBe('Custom Title')
      expect(cell?.backgroundColor).toBe('#FEF3C7')
      expect(cell?.align).toBe('center')
      expect(cell?.style?.bold).toBe(true)
    })

    it('updates global table styles including zebra striping and border presets', () => {
      const table = createDefaultStaticTable('tbl_g_style', 3, 3)
      const styled = updateTableStyle(table, {
        striped: true,
        stripeOddColor: '#F0FDF4',
        borderPreset: 'horizontal-only',
        borderColor: '#22C55E',
      })

      expect(styled.tableStyle?.stripeOddColor).toBe('#F0FDF4')
      expect(styled.tableStyle?.borderPreset).toBe('horizontal-only')
      expect(styled.tableStyle?.borderColor).toBe('#22C55E')
    })
  })
})

describe('Milestone 3: Dynamic Tables & Safe Formula Engine (TS-15, TS-16)', () => {
  describe('Safe Formula Engine (Zero eval, Zero Function)', () => {
    it('tokenizes arithmetic expressions and aggregate functions', () => {
      const tokens = tokenizeFormula('=SUM(marks) + 50')
      expect(tokens.map((t) => t.type)).toEqual(['FUNC', 'LPAREN', 'IDENT', 'RPAREN', 'OP', 'NUM'])
      expect(tokens[0].value).toBe('SUM')
      expect(tokens[2].value).toBe('marks')
    })

    it('parses expressions into deterministic AST with depth guard', () => {
      const tokens = tokenizeFormula('=SUM(marks) * 1.05')
      const ast = parseFormula(tokens)
      expect(ast.kind).toBe('binary')
      if (ast.kind === 'binary') {
        expect(ast.op).toBe('*')
        expect(ast.left.kind).toBe('call')
        expect(ast.right.kind).toBe('number')
      }
    })

    it('evaluates SUM, COUNT, AVERAGE, MIN, MAX over dataset array', () => {
      const mockMarks = [
        { subject: 'Math', marks: 95 },
        { subject: 'Physics', marks: 85 },
        { subject: 'Chemistry', marks: 90 },
      ]

      expect(evaluateTotalsFormula('SUM(marks)', mockMarks)).toBe(270)
      expect(evaluateTotalsFormula('COUNT(subject)', mockMarks)).toBe(3)
      expect(evaluateTotalsFormula('AVERAGE(marks)', mockMarks)).toBe(90)
      expect(evaluateTotalsFormula('AVG(marks)', mockMarks)).toBe(90)
      expect(evaluateTotalsFormula('MIN(marks)', mockMarks)).toBe(85)
      expect(evaluateTotalsFormula('MAX(marks)', mockMarks)).toBe(95)
    })

    it('strips currency symbols (₹, $) and handles string numbers safely', () => {
      const mockFees = [
        { desc: 'Tuition', amount: '₹15,000' },
        { desc: 'Lab', amount: '$3,500' },
      ]
      expect(evaluateTotalsFormula('SUM(amount)', mockFees)).toBe(18500)
    })

    it('safely returns 0 or #ERR on division by zero without NaN or throwing', () => {
      const emptyData: Array<Record<string, unknown>> = []
      expect(evaluateTotalsFormula('SUM(marks) / 0', emptyData)).toBe(0)
      expect(evaluateTotalsFormula('AVERAGE(marks)', emptyData)).toBe(0)
      expect(evaluateTotalsFormula('INVALID_SYNTAX((', emptyData)).toBe('#ERR')
    })

    it('rejects nested formula exceeding depth guard (> 20)', () => {
      const deeplyNested = '(((((((((((((((((((((1)))))))))))))))))))))'
      expect(evaluateTotalsFormula(deeplyNested, [])).toBe('#ERR')
    })
  })

  describe('Canonical Datasets & Row Expansion', () => {
    it('contains all 5 canonical datasets with schema definitions and sample rows', () => {
      expect(CANONICAL_DATASETS['academics.exam_marks']).toBeDefined()
      expect(CANONICAL_DATASETS['finance.fee_items']).toBeDefined()
      expect(CANONICAL_DATASETS['student.exam_schedule']).toBeDefined()
      expect(CANONICAL_DATASETS['student.attendance_summary']).toBeDefined()
      expect(CANONICAL_DATASETS['finance.fee_installments']).toBeDefined()

      expect(getSampleDataset('academics.exam_marks').length).toBeGreaterThanOrEqual(5)
      expect(getSampleDataset('finance.fee_items').length).toBeGreaterThanOrEqual(5)
    })

    it('resolves backwards-compatible legacy dataset aliases', () => {
      expect(resolveDatasetName('marks')).toBe('academics.exam_marks')
      expect(resolveDatasetName('fee_items')).toBe('finance.fee_items')
      expect(resolveDatasetName('exam_schedule')).toBe('student.exam_schedule')
    })
  })
})

describe('Milestone 3: Measured Multi-Page Pagination Engine (TS-17)', () => {
  it('computes exact printable body metrics based on zones and margins', () => {
    const layout = makeTestLayout({
      zones: {
        headerMm: 35,
        footerMm: 20,
      },
      pages: [{ id: 'p1', elements: [] }],
    })

    const metrics = computePageMetrics(layout)
    expect(metrics.pageWidthMm).toBe(210)
    expect(metrics.pageHeightMm).toBe(297)
    expect(metrics.headerHeightMm).toBe(35)
    expect(metrics.footerHeightMm).toBe(20)

    // usableBodyHeightMm = 297 - 35 - 20 - 10 - 10 = 222 mm
    expect(metrics.usableBodyHeightMm).toBe(222)
    expect(metrics.bodyStartYMm).toBe(45) // 35 + 10
    expect(metrics.bodyEndYMm).toBe(267) // 297 - 20 - 10
  })

  it('deterministically estimates row height with word-wrapping', () => {
    const singleLineRow = { subject: 'Math', marks: 95 }
    const multiLineRow = {
      subject: 'Advanced Structural Engineering and Computational Mechanics with Laboratory Practical Demonstrations',
      marks: 90,
    }

    const cols: TableColumnV3[] = [
      { id: 'c1', fieldId: 'subject', widthPercent: 30 },
      { id: 'c2', fieldId: 'marks', widthPercent: 70 },
    ]

    const hSingle = estimateRowHeightMm({
      row: singleLineRow,
      columns: cols,
      tableWidthMm: 150,
    })

    const hMulti = estimateRowHeightMm({
      row: multiLineRow,
      columns: cols,
      tableWidthMm: 150,
    })

    expect(hSingle).toBeGreaterThanOrEqual(6)
    expect(hMulti).toBeGreaterThan(hSingle)
  })

  it('paginates empty dataset (0 rows) to exactly 1 page without errors', () => {
    const dynTable = createDefaultDynamicTable('tbl_empty', 'academics.exam_marks')
    const layout = makeTestLayout({
      zones: { headerMm: 30, footerMm: 20 },
      pages: [{ id: 'p1', elements: [dynTable] }],
    })

    const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': [] } })
    expect(paginated.totalPages).toBe(1)
    expect(paginated.pages.length).toBe(1)
    expect(paginated.diagnostics.length).toBe(0)
  })

  it('paginates single row to exactly 1 page', () => {
    const dynTable = createDefaultDynamicTable('tbl_1row', 'academics.exam_marks')
    const layout = makeTestLayout({
      zones: { headerMm: 30, footerMm: 20 },
      pages: [{ id: 'p1', elements: [dynTable] }],
    })

    const singleRow = [{ subject: 'Math', max_marks: 100, marks: 95, grade: 'A1' }]
    const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': singleRow } })
    expect(paginated.totalPages).toBe(1)
    expect(paginated.pages[0].elements.some((el) => el.type === 'table')).toBe(true)
  })

  it('paginates large dataset (50 rows) cleanly across multiple continuation pages with repeated headers', () => {
    const dynTable = createDefaultDynamicTable('tbl_50', 'academics.exam_marks')
    const layout = makeTestLayout({
      zones: { headerMm: 30, footerMm: 20 },
      pages: [{ id: 'p1', elements: [dynTable] }],
    })

    const fiftyRows = Array.from({ length: 50 }).map((_, i) => ({
      subject: `Course Module Subject #${i + 1}`,
      max_marks: 100,
      marks: 70 + (i % 30),
      grade: 'A',
    }))

    const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': fiftyRows } })
    expect(paginated.totalPages).toBeGreaterThanOrEqual(3)

    // Check that every continuation page contains a sliced table with header
    for (let p = 0; p < paginated.totalPages; p++) {
      const page = paginated.pages[p]
      const tbl = page.elements.find((el) => el.type === 'table')
      expect(tbl).toBeDefined()
    }
  })

  it('spills trailing signature blocks to extra page when table ends near page bottom limit', () => {
    // Dynamic table placed near bottom of page
    const dynTable: DynamicTableElementV3 = {
      ...createDefaultDynamicTable('tbl_spill', 'academics.exam_marks'),
      yMm: 160,
      heightMm: 40,
    }

    // Trailing signature block located below the table in design
    const sigBlock = {
      id: 'sig_principal',
      type: 'signature' as const,
      zone: 'body' as const,
      xMm: 120,
      yMm: 210, // Below table bottom (160 + 40 = 200)
      widthMm: 60,
      heightMm: 40,
    }

    const layout = makeTestLayout({
      zones: { headerMm: 30, footerMm: 20 }, // bodyEndY is 297 - 20 - 10 = 267mm
      pages: [{ id: 'p1', elements: [dynTable, sigBlock] }],
    })

    // 15 rows table expands and finishes around 250mm, leaving < 20mm for 40mm signature
    const rows = Array.from({ length: 15 }).map((_, i) => ({
      subject: `Subject ${i + 1}`,
      max_marks: 100,
      marks: 80,
      grade: 'A',
    }))

    const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': rows } })
    expect(paginated.totalPages).toBeGreaterThanOrEqual(2)

    // Signature spilled to the final page
    const finalPage = paginated.pages[paginated.totalPages - 1]
    const hasSig = finalPage.elements.some((el) => el.id.startsWith('sig_principal'))
    expect(hasSig).toBe(true)
  })

  describe('Stationery Repetition Rules', () => {
    it('respects hideHeaderOnFirstPage: suppresses header on page 1, preserves on continuation pages', () => {
      const dynTable = createDefaultDynamicTable('tbl_stat', 'academics.exam_marks')
      const headerLogo = {
        id: 'header_logo',
        type: 'text' as const,
        zone: 'header' as const,
        xMm: 15,
        yMm: 5,
        widthMm: 50,
        heightMm: 15,
        content: 'CampusOne Institute',
      }

      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20, hideHeaderOnFirstPage: true, repeatHeader: true },
        pages: [{ id: 'p1', elements: [headerLogo, dynTable] }],
      })

      const rows = Array.from({ length: 40 }).map((_, i) => ({
        subject: `Subject ${i + 1}`,
        max_marks: 100,
        marks: 80,
      }))

      const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': rows } })
      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)

      const page1HasHeader = paginated.pages[0].elements.some((el) => el.id.startsWith('header_logo'))
      const page2HasHeader = paginated.pages[1].elements.some((el) => el.id.startsWith('header_logo'))

      expect(page1HasHeader).toBe(false)
      expect(page2HasHeader).toBe(true)
    })

    it('respects repeatHeader: false and repeatFooter: false on continuation pages', () => {
      const dynTable = createDefaultDynamicTable('tbl_stat2', 'academics.exam_marks')
      const headerText = {
        id: 'hdr_el',
        type: 'text' as const,
        zone: 'header' as const,
        xMm: 10,
        yMm: 5,
        widthMm: 40,
        heightMm: 10,
        content: 'Header Text',
      }
      const footerText = {
        id: 'ftr_el',
        type: 'text' as const,
        zone: 'footer' as const,
        xMm: 10,
        yMm: 5,
        widthMm: 40,
        heightMm: 10,
        content: 'Footer Text',
      }

      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20, repeatHeader: false, repeatFooter: false },
        pages: [{ id: 'p1', elements: [headerText, footerText, dynTable] }],
      })

      const rows = Array.from({ length: 40 }).map((_, i) => ({ subject: `S ${i}` }))
      const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': rows } })
      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)

      const page1HasHeader = paginated.pages[0].elements.some((el) => el.id.startsWith('hdr_el'))
      const page2HasHeader = paginated.pages[1].elements.some((el) => el.id.startsWith('hdr_el'))

      expect(page1HasHeader).toBe(true)
      expect(page2HasHeader).toBe(false)
    })
  })

  describe('Bounded Loop Guards & Diagnostics', () => {
    it('caps pagination at 100 pages and emits TABLE_OVERFLOW diagnostic for runaway datasets', () => {
      const dynTable = createDefaultDynamicTable('tbl_huge', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      // 5,000 rows would otherwise generate 200+ pages
      const hugeRows = Array.from({ length: 5000 }).map((_, i) => ({ subject: `Row ${i}` }))
      const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': hugeRows } }, { maxPages: 100 })

      expect(paginated.totalPages).toBe(100)
      const overflowDiag = paginated.diagnostics.find((d) => d.code === 'TABLE_OVERFLOW')
      expect(overflowDiag).toBeDefined()
    })

    it('emits UNSPLITTABLE_ROW diagnostic when an estimated row height exceeds usable body height', () => {
      const dynTable = createDefaultDynamicTable('tbl_unsplittable', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 40, footerMm: 40 }, // body height is 297 - 80 - 20 = 197mm
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      // Massive 100-paragraph text row estimated at > 250mm
      const massiveText = Array.from({ length: 150 }).fill('Long descriptive academic transcript syllabus detail text.').join('\n')
      const rows = [{ subject: massiveText, marks: 99 }]

      const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': rows } })
      const diag = paginated.diagnostics.find((d) => d.code === 'UNSPLITTABLE_ROW')
      expect(diag).toBeDefined()
    })
  })

  describe('Page Counter Tokens', () => {
    it('replaces {{pageNumber}} and {{totalPages}} across all pages', () => {
      const dynTable = createDefaultDynamicTable('tbl_counter', 'academics.exam_marks')
      const footerCounter = {
        id: 'footer_page_counter',
        type: 'text' as const,
        zone: 'footer' as const,
        xMm: 80,
        yMm: 5,
        widthMm: 50,
        heightMm: 10,
        content: 'Page {{pageNumber}} of {{totalPages}}',
      }

      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable, footerCounter] }],
      })

      const rows = Array.from({ length: 50 }).map((_, i) => ({ subject: `Subj ${i}` }))
      const paginated = paginateDocument(layout, { datasets: { 'academics.exam_marks': rows } })

      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)
      const p1Text = paginated.pages[0].elements.find((el) => el.id.startsWith('footer_page_counter'))
      const p2Text = paginated.pages[1].elements.find((el) => el.id.startsWith('footer_page_counter'))

      expect((p1Text as any).content).toBe(`Page 1 of ${paginated.totalPages}`)
      expect((p2Text as any).content).toBe(`Page 2 of ${paginated.totalPages}`)
    })
  })
})

describe('Milestone 3: HTML / CSS Export Parity (TS-14, TS-15, TS-17)', () => {
  it('compiles multi-page HTML with @page breaks, CSS table markup, and zero covered cells', () => {
    const table = createDefaultStaticTable('tbl_export', 2, 2, 140, 30)
    // Merge row 0 cells
    const merged = mergeCells(table, [{ row: 0, column: 0 }, { row: 0, column: 1 }])

    const layout: LayoutV3 = {
      version: 3,
      page: {
        sizeId: 'A4P',
        orientation: 'PORTRAIT',
        marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
        background: '#FFFFFF',
      },
      zones: { headerMm: 0, footerMm: 0 },
      watermark: { mode: 'none' },
      pages: [
        { id: 'page-1', elements: [merged] },
        { id: 'page-2', elements: [{ id: 't2', type: 'text', xMm: 10, yMm: 10, widthMm: 50, heightMm: 10, content: 'Page 2 Content' }] },
      ],
    }

    const plan = buildRenderPlan(layout, { fields: { 'student.name': 'Aarav Patel' } }, {})
    expect(plan.diagnostics.length).toBe(0)

    const html = renderDocumentHtml(plan)

    // Multi-page CSS print rules
    expect(html).toContain('@page{size:210mm 297mm;margin:0}')
    expect(html).toContain('break-after:page;page-break-after:always')

    // Semantic table structure
    expect(html).toContain('<table style="width:100%;height:100%;border-collapse:collapse;table-layout:fixed;">')
    expect(html).toContain('colspan="2"')

    // Covered cell should NOT be rendered
    const tdCount = (html.match(/<t[dh]/g) || []).length
    // Row 0 has 1 merged cell (colspan 2), Row 1 has 2 individual cells -> total 3 cells
    expect(tdCount).toBe(3)
  })

  it('escapes hostile XSS tokens in cell contents during HTML export', () => {
    const table = createDefaultStaticTable('tbl_xss', 1, 1)
    const tableWithToken = updateCell(table, 0, 0, { content: '{{malicious}}' })

    const layout: LayoutV3 = {
      version: 3,
      page: {
        sizeId: 'A4P',
        orientation: 'PORTRAIT',
        marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
        background: '#FFFFFF',
      },
      zones: { headerMm: 0, footerMm: 0 },
      watermark: { mode: 'none' },
      pages: [{ id: 'page-1', elements: [tableWithToken] }],
    }

    const plan = buildRenderPlan(layout, { fields: { malicious: '<script>alert("xss")</script>' } }, {})
    const html = renderDocumentHtml(plan)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
  })
})

describe('Milestone 3: Studio Next Reducer Table Actions & History Invariants', () => {
  it('handles TABLE_INSERT_ROW and commits to history', () => {
    const table = createDefaultStaticTable('tbl_red_1', 2, 2)
    const layout = makeTestLayout({
      pages: [{ id: 'p1', elements: [table] }],
    })

    const state = initialStudioNextState(undefined, layout)
    expect(state.historyIndex).toBe(0)

    const nextState = studioNextReducer(state, {
      type: 'TABLE_INSERT_ROW',
      elementId: 'tbl_red_1',
      atIndex: 0,
      position: 'below',
    })

    expect(nextState.historyIndex).toBe(1)
    const tbl = nextState.layout.pages[0].elements[0] as StaticTableElementV3
    expect(tbl.rowCount).toBe(3)

    // Undo reverts back to 2 rows
    const undone = studioNextReducer(nextState, { type: 'UNDO' })
    const undoneTbl = undone.layout.pages[0].elements[0] as StaticTableElementV3
    expect(undoneTbl.rowCount).toBe(2)
  })

  it('handles TABLE_RESIZE_COLUMN_TRANSIENT without advancing history until COMMIT_HISTORY', () => {
    const table = createDefaultStaticTable('tbl_drag', 2, 2, 100, 30)
    const layout = makeTestLayout({
      pages: [{ id: 'p1', elements: [table] }],
    })

    const state = initialStudioNextState(undefined, layout)
    const historyBefore = state.historyIndex

    // Drag column divider
    const draggedState = studioNextReducer(state, {
      type: 'TABLE_RESIZE_COLUMN_TRANSIENT',
      elementId: 'tbl_drag',
      colIndex: 0,
      deltaMm: 10,
    })

    // Transient change should NOT push history snapshot
    expect(draggedState.historyIndex).toBe(historyBefore)
    expect(draggedState.dirty).toBe(true)

    // On commit, push snapshot exactly once
    const committed = studioNextReducer(draggedState, { type: 'COMMIT_HISTORY' })
    expect(committed.historyIndex).toBe(historyBefore + 1)
  })
})
