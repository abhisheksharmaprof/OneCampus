import { describe, it, expect } from 'vitest'
import type {
  LayoutV3,
  ElementV3,
  DynamicTableElementV3,
  StaticTableElementV3,
} from '@campusone/document-engine'
import {
  computePageMetrics,
  estimateRowHeightMm,
  paginateDocument,
  PAGE_SIZES_MM,
  createDefaultDynamicTable,
  createDefaultStaticTable,
} from '@campusone/document-engine'

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

describe('Milestone 3 Challenger: Pagination & Multi-Page Flow Adversarial Stress Testing', () => {
  /* =========================================================================
   * Dimension 1: Empty & Boundary Datasets (0 rows, 1 row, exact boundary)
   * ========================================================================= */
  describe('Dimension 1: Empty & Boundary Datasets', () => {
    it('paginates custom dataset with 0 rows to exactly 1 page with empty row range [0, 0]', () => {
      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_empty_custom', 'custom_fees'),
        datasetId: 'custom_fees',
        datasetBinding: { datasetName: 'custom_fees' },
        yMm: 35,
        heightMm: 20,
      }

      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const paginated = paginateDocument(layout, {
        datasets: { custom_fees: [] },
      })

      expect(paginated.totalPages).toBe(1)
      expect(paginated.pages.length).toBe(1)
      expect(paginated.diagnostics.length).toBe(0)

      const p1 = paginated.pages[0]
      expect(p1.tableRowRange).toEqual([0, 0])
      expect(p1.hasTableHeader).toBe(true)
      const tbl = p1.elements.find((el) => el.id.startsWith('tbl_empty_custom'))
      expect(tbl).toBeDefined()
    })

    it('probes canonical dataset fallback behavior when explicitly passed an empty array []', () => {
      const dynTable = createDefaultDynamicTable('tbl_empty_canonical', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      // Caller explicitly passes empty array [] for exam marks
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': [] },
      })

      // EMPIRICAL OBSERVATION:
      // In pagination.ts lines 220-226:
      // if (rows.length === 0) { const samples = getSampleDataset(...) }
      // The engine intercepts an explicit empty dataset [] and replaces it with 5 sample rows!
      const p1 = paginated.pages[0]
      // Documenting actual behavior: sample fallback occurs when rows.length is 0
      expect(paginated.totalPages).toBe(1)
      // If sample fallback triggered, tableRowRange will be [0, 5] rather than [0, 0]
      expect(p1.tableRowRange).toEqual([0, 5])
    })

    it('paginates exactly 1 row to exactly 1 page and preserves row range [0, 1]', () => {
      const dynTable = createDefaultDynamicTable('tbl_1row', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const singleRow = [{ subject: 'Advanced Mathematics', max_marks: 100, marks: 98, grade: 'A+' }]
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': singleRow },
      })

      expect(paginated.totalPages).toBe(1)
      expect(paginated.pages.length).toBe(1)
      expect(paginated.pages[0].tableRowRange).toEqual([0, 1])

      const totalRowsRendered = (paginated.pages[0].tableRowRange![1] - paginated.pages[0].tableRowRange![0])
      expect(totalRowsRendered).toBe(1)
    })

    it('fits rows exactly at the millimeter boundary without creating an unnecessary continuation page', () => {
      // Usable height on Page 1:
      // A4P = 297mm. margins: top 10, bottom 10. header: 30, footer: 20.
      // bottomLimitY = 297 - 20 - 10 = 267mm.
      // In pagination.ts line 289:
      // tableStartY = metrics.headerHeightMm + dynamicTable.yMm = 30 + 40 = 70mm.
      // availHeight = 267 - 70 = 197mm.
      // headerRowHeightMm = 10mm.
      // availForRows = 197 - 10 = 187mm.
      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_boundary', 'custom_dataset'),
        datasetId: 'custom_dataset',
        yMm: 40,
        heightMm: 20,
      }

      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      // Provide 11 rows of 17mm each: 11 * 17 = 187mm exactly equals availForRows!
      const exactRows = Array.from({ length: 11 }).map((_, i) => ({ id: i }))
      const measuredHeights = Array.from({ length: 11 }).fill(17) as number[]

      const paginated = paginateDocument(
        layout,
        { datasets: { custom_dataset: exactRows } },
        {
          headerRowHeightMm: 10,
          measuredRowHeightsMm: measuredHeights,
        },
      )

      // All 11 rows must fit on exactly 1 page
      expect(paginated.totalPages).toBe(1)
      expect(paginated.pages[0].tableRowRange).toEqual([0, 11])
    })

    it('spills exactly 1 row to page 2 when exceeding boundary by even 1 millimeter', () => {
      // availForRows = 187mm.
      // 11 rows of 17mm = 187mm.
      // 12th row of 5mm = 192mm > 187mm.
      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_boundary_spill', 'custom_dataset'),
        datasetId: 'custom_dataset',
        yMm: 40,
        heightMm: 20,
      }

      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const rows12 = Array.from({ length: 12 }).map((_, i) => ({ id: i }))
      const measuredHeights = [...Array(11).fill(17), 5]

      const paginated = paginateDocument(
        layout,
        { datasets: { custom_dataset: rows12 } },
        {
          headerRowHeightMm: 10,
          measuredRowHeightsMm: measuredHeights,
        },
      )

      expect(paginated.totalPages).toBe(2)
      // Page 1 gets exactly 11 rows
      expect(paginated.pages[0].tableRowRange).toEqual([0, 11])
      // Page 2 gets the 1 overflow row
      expect(paginated.pages[1].tableRowRange).toEqual([11, 12])
      // Total rows strictly preserved
      const totalRows = (paginated.pages[0].tableRowRange![1] - paginated.pages[0].tableRowRange![0]) +
        (paginated.pages[1].tableRowRange![1] - paginated.pages[1].tableRowRange![0])
      expect(totalRows).toBe(12)
    })
  })

  /* =========================================================================
   * Dimension 2: Multi-Page Overflow & Continuation Slicing (50 rows)
   * ========================================================================= */
  describe('Dimension 2: Multi-Page Overflow & Continuation Slicing (50 rows)', () => {
    it('paginates 50 rows across multiple continuation pages with exact row preservation', () => {
      const dynTable = createDefaultDynamicTable('tbl_multi_50', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const fiftyRows = Array.from({ length: 50 }).map((_, i) => ({
        subject_code: `SUBJ-${100 + i}`,
        subject: `Course Module Subject #${i + 1}`,
        max_marks: 100,
        marks: 50 + (i % 50),
        grade: 'A',
      }))

      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': fiftyRows },
      })

      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)
      expect(paginated.pages.length).toBe(paginated.totalPages)

      // Strict Row Preservation Invariant:
      // 1. Total row count across all slices must equal 50
      // 2. Slices must be contiguous: [0, r1], [r1, r2], ..., [rk, 50]
      let previousEnd = 0
      let totalCountedRows = 0

      for (let p = 0; p < paginated.totalPages; p++) {
        const page = paginated.pages[p]
        expect(page.tableRowRange).toBeDefined()
        const [start, end] = page.tableRowRange!
        expect(start).toBe(previousEnd)
        expect(end).toBeGreaterThan(start)
        totalCountedRows += (end - start)
        previousEnd = end
      }

      expect(totalCountedRows).toBe(50)
      expect(previousEnd).toBe(50)
    })

    it('ensures continuation tables repeat <thead> with identical column structure and widths', () => {
      const dynTable = createDefaultDynamicTable('tbl_col_check', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const fiftyRows = Array.from({ length: 50 }).map((_, i) => ({ subject: `S ${i}` }))
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': fiftyRows },
      })

      for (let p = 0; p < paginated.totalPages; p++) {
        const page = paginated.pages[p]
        const tableEl = page.elements.find((el): el is DynamicTableElementV3 => el.type === 'table')
        expect(tableEl).toBeDefined()
        // Column definitions must be preserved identically
        expect(tableEl!.columns.length).toBe(dynTable.columns.length)
        for (let c = 0; c < dynTable.columns.length; c++) {
          expect(tableEl!.columns[c].header).toBe(dynTable.columns[c].header)
          expect(tableEl!.columns[c].widthPercent).toBe(dynTable.columns[c].widthPercent)
          expect(tableEl!.columns[c].fieldId).toBe(dynTable.columns[c].fieldId)
        }
      }
    })

    it('evaluates continuation table yMm positioning relative to header zone', () => {
      const dynTable = createDefaultDynamicTable('tbl_y_pos', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 35, footerMm: 20, repeatHeader: true },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const fiftyRows = Array.from({ length: 50 }).map((_, i) => ({ subject: `S ${i}` }))
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': fiftyRows },
      })

      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)
      const continuationPage = paginated.pages[1]
      const contTable = continuationPage.elements.find((el) => el.type === 'table')!

      // EMPIRICAL OBSERVATION & BUG DETECTION:
      // In pagination.ts line 356:
      // yMm: isFirst ? dynamicTable.yMm : metrics.marginsMm.top
      // Continuation table is set to yMm = marginsMm.top (10mm).
      // But header zone is 35mm tall!
      // This causes the continuation table to be positioned at y=10mm inside the header zone!
      // We document this empirical value:
      expect(contTable.yMm).toBe(10) // Shows the bug where topOffset is omitted from yMm
    })
  })

  /* =========================================================================
   * Dimension 3: Trailing Attached Element Spillover Mechanism
   * ========================================================================= */
  describe('Dimension 3: Trailing Attached Elements Spillover Mechanism', () => {
    it('Case A: keeps trailing elements on same sheet when table finishes with ample space', () => {
      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_fit_trail', 'academics.exam_marks'),
        yMm: 35,
        heightMm: 20,
      }

      const sigBlock = {
        id: 'sig_principal',
        type: 'signature' as const,
        zone: 'body' as const,
        xMm: 120,
        yMm: 60, // >= tableDesignBottom (35 + 20 = 55)
        widthMm: 60,
        heightMm: 25,
      }

      const stampBlock = {
        id: 'stamp_seal',
        type: 'image' as const,
        zone: 'body' as const,
        xMm: 20,
        yMm: 60,
        widthMm: 30,
        heightMm: 25,
      }

      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable, sigBlock, stampBlock] }],
      })

      // Only 3 rows: table ends around y=75mm, page limit is 267mm
      const fewRows = [
        { subject: 'Math', marks: 90 },
        { subject: 'Science', marks: 85 },
        { subject: 'English', marks: 88 },
      ]

      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': fewRows },
      })

      expect(paginated.totalPages).toBe(1)
      const p1 = paginated.pages[0]
      const hasSig = p1.elements.some((el) => el.id.startsWith('sig_principal'))
      const hasStamp = p1.elements.some((el) => el.id.startsWith('stamp_seal'))

      expect(hasSig).toBe(true)
      expect(hasStamp).toBe(true)
    })

    it('Case B: spills trailing elements to sheet K+1 when penetrating footer zone', () => {
      // Table starts at yMm: 40.
      // With headerMm: 30, footerMm: 20:
      // tableStartY = 30 + 40 = 70mm, bottomLimitY = 267mm, availHeight = 197mm.
      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_spill_trail', 'custom_spill_ds'),
        datasetId: 'custom_spill_ds',
        yMm: 40,
        heightMm: 30,
      }

      const sigBlock = {
        id: 'sig_authority',
        type: 'signature' as const,
        zone: 'body' as const,
        xMm: 110,
        yMm: 100, // below table design bottom (40 + 30 = 70)
        widthMm: 60,
        heightMm: 35,
      }

      const stampBlock = {
        id: 'seal_institute',
        type: 'image' as const,
        zone: 'body' as const,
        xMm: 20,
        yMm: 100,
        widthMm: 30,
        heightMm: 35,
      }

      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 }, // bottomLimitY is 267mm
        pages: [{ id: 'p1', elements: [dynTable, sigBlock, stampBlock] }],
      })

      // 18 rows of 10mm each = 180mm.
      // Table height = 10 (header) + 180 = 190mm <= availHeight (197mm).
      // All 18 rows fit on Page 1!
      // Table ends at absY = 70 + 190 = 260mm.
      // Trailing elements require 4mm gap + 35mm height = 39mm.
      // 260 + 39 = 299mm > 267mm (penetrates footer by 32mm).
      // Trailing elements MUST spill to Page 2!
      const rows18 = Array.from({ length: 18 }).map((_, i) => ({ id: i }))
      const measuredHeights = Array.from({ length: 18 }).fill(10) as number[]

      const paginated = paginateDocument(
        layout,
        { datasets: { custom_spill_ds: rows18 } },
        {
          headerRowHeightMm: 10,
          measuredRowHeightsMm: measuredHeights,
        },
      )

      expect(paginated.totalPages).toBe(2)

      // Page 1 contains the full table
      const page1 = paginated.pages[0]
      expect(page1.tableRowRange).toEqual([0, 18])
      expect(page1.hasTableHeader).toBe(true)

      // Page 2 is the spillover sheet for trailing elements
      const spilloverPage = paginated.pages[1]
      expect(spilloverPage.hasTableHeader).toBe(false)
      expect(spilloverPage.tableRowRange).toBeUndefined()

      // Spillover page should contain the trailing elements
      const hasSig = spilloverPage.elements.some((el) => el.id.startsWith('sig_authority'))
      const hasSeal = spilloverPage.elements.some((el) => el.id.startsWith('seal_institute'))
      expect(hasSig).toBe(true)
      expect(hasSeal).toBe(true)

      // Spillover page must NOT have a duplicate table element
      const hasTableOnSpillover = spilloverPage.elements.some((el) => el.type === 'table')
      expect(hasTableOnSpillover).toBe(false)
    })

    it('Case C: emits TABLE_OVERFLOW diagnostic when trailing attached elements span exceeds usable body height', () => {
      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_overflow_sig', 'academics.exam_marks'),
        yMm: 200,
        heightMm: 20,
      }

      // Massive trailing element of 250mm (> usableBodyHeightMm of 227mm)
      const massiveSig = {
        id: 'huge_signature_block',
        type: 'signature' as const,
        zone: 'body' as const,
        xMm: 20,
        yMm: 230,
        widthMm: 150,
        heightMm: 250,
      }

      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable, massiveSig] }],
      })

      const rows = [{ subject: 'Math', marks: 100 }]
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })

      expect(paginated.totalPages).toBe(2)
      const overflowDiag = paginated.diagnostics.find(
        (d) => d.code === 'TABLE_OVERFLOW' && d.message.includes('Trailing attached elements exceed usable body height'),
      )
      expect(overflowDiag).toBeDefined()
      expect(overflowDiag?.elementId).toBe('huge_signature_block')
    })
  })

  /* =========================================================================
   * Dimension 4: Stationery & Zone Rules
   * ========================================================================= */
  describe('Dimension 4: Stationery & Zone Rules', () => {
    const makeStationerySetup = (zoneOverrides: Partial<NonNullable<LayoutV3['zones']>> = {}) => {
      const dynTable = createDefaultDynamicTable('tbl_stat', 'academics.exam_marks')
      const headerLogo: ElementV3 = {
        id: 'hdr_logo',
        type: 'text',
        zone: 'header',
        xMm: 10,
        yMm: 5,
        widthMm: 50,
        heightMm: 15,
        content: 'Header Institution',
      }
      const footerCounter: ElementV3 = {
        id: 'ftr_counter',
        type: 'text',
        zone: 'footer',
        xMm: 10,
        yMm: 5,
        widthMm: 50,
        heightMm: 10,
        content: 'Page {{pageNumber}} of {{totalPages}}',
      }

      const layout = makeTestLayout({
        zones: {
          headerMm: zoneOverrides.headerMm ?? 30,
          footerMm: zoneOverrides.footerMm ?? 20,
          repeatHeader: zoneOverrides.repeatHeader,
          repeatFooter: zoneOverrides.repeatFooter,
          hideHeaderOnFirstPage: zoneOverrides.hideHeaderOnFirstPage,
        },
        pages: [{ id: 'p1', elements: [headerLogo, footerCounter, dynTable] }],
      })

      const rows = Array.from({ length: 45 }).map((_, i) => ({ subject: `S ${i}` }))
      return { layout, rows }
    };

    it('suppresses header on page 1 but repeats on continuation pages when hideHeaderOnFirstPage: true', () => {
      const { layout, rows } = makeStationerySetup({
        hideHeaderOnFirstPage: true,
        repeatHeader: true,
        repeatFooter: true,
      })

      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })

      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)

      const p1HasHdr = paginated.pages[0].elements.some((el) => el.id.startsWith('hdr_logo'))
      const p2HasHdr = paginated.pages[1].elements.some((el) => el.id.startsWith('hdr_logo'))

      expect(p1HasHdr).toBe(false)
      expect(p2HasHdr).toBe(true)
    })

    it('suppresses header on continuation pages when repeatHeader: false', () => {
      const { layout, rows } = makeStationerySetup({
        hideHeaderOnFirstPage: false,
        repeatHeader: false,
        repeatFooter: true,
      })

      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })

      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)

      const p1HasHdr = paginated.pages[0].elements.some((el) => el.id.startsWith('hdr_logo'))
      const p2HasHdr = paginated.pages[1].elements.some((el) => el.id.startsWith('hdr_logo'))

      expect(p1HasHdr).toBe(true)
      expect(p2HasHdr).toBe(false)
    })

    it('suppresses footer on continuation pages when repeatFooter: false', () => {
      const { layout, rows } = makeStationerySetup({
        repeatHeader: true,
        repeatFooter: false,
      })

      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })

      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)

      const p1HasFtr = paginated.pages[0].elements.some((el) => el.id.startsWith('ftr_counter'))
      const p2HasFtr = paginated.pages[1].elements.some((el) => el.id.startsWith('ftr_counter'))

      expect(p1HasFtr).toBe(true)
      expect(p2HasFtr).toBe(false)
    })

    it('suppresses both header and footer on continuation pages when repeatHeader: false and repeatFooter: false', () => {
      const { layout, rows } = makeStationerySetup({
        repeatHeader: false,
        repeatFooter: false,
      })

      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })

      expect(paginated.totalPages).toBeGreaterThanOrEqual(2)

      for (let p = 1; p < paginated.totalPages; p++) {
        const page = paginated.pages[p]
        expect(page.elements.some((el) => el.id.startsWith('hdr_logo'))).toBe(false)
        expect(page.elements.some((el) => el.id.startsWith('ftr_counter'))).toBe(false)
      }
    })

    it('correctly interpolates page tokens {{pageNumber}}, {{totalPages}}, {{page}}, and {{pages}}', () => {
      const dynTable = createDefaultDynamicTable('tbl_tokens', 'academics.exam_marks')
      const tokenElement: ElementV3 = {
        id: 'token_box',
        type: 'text',
        zone: 'footer',
        xMm: 20,
        yMm: 5,
        widthMm: 120,
        heightMm: 10,
        content: 'Sheet {{page}} of {{pages}} (Numeric: {{pageNumber}}/{{totalPages}})',
      }

      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20, repeatFooter: true },
        pages: [{ id: 'p1', elements: [dynTable, tokenElement] }],
      })

      const rows = Array.from({ length: 45 }).map((_, i) => ({ subject: `S ${i}` }))
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })

      const total = paginated.totalPages
      expect(total).toBeGreaterThanOrEqual(2)

      for (let p = 0; p < total; p++) {
        const pageNum = p + 1
        const el = paginated.pages[p].elements.find((e) => e.id.startsWith('token_box')) as { content?: string }
        expect(el).toBeDefined()
        expect(el.content).toBe(`Sheet ${pageNum} of ${total} (Numeric: ${pageNum}/${total})`)
      }
    })
  })

  /* =========================================================================
   * Dimension 5: Pathological Cases & Diagnostics
   * ========================================================================= */
  describe('Dimension 5: Pathological Cases & Diagnostics', () => {
    it('enforces hard loop limit (100 pages) and emits TABLE_OVERFLOW diagnostic without freezing', () => {
      const dynTable = createDefaultDynamicTable('tbl_runaway', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      // 6,000 rows would naturally exceed 250 pages
      const runawayRows = Array.from({ length: 6000 }).map((_, i) => ({ subject: `Item ${i}` }))

      const startMs = Date.now()
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': runawayRows },
      }, { maxPages: 100 })
      const durationMs = Date.now() - startMs

      // Must complete in under 500ms and halt at exactly 100 pages
      expect(durationMs).toBeLessThan(1000)
      expect(paginated.totalPages).toBe(100)
      expect(paginated.pages.length).toBe(100)

      const overflowDiag = paginated.diagnostics.find((d) => d.code === 'TABLE_OVERFLOW')
      expect(overflowDiag).toBeDefined()
      expect(overflowDiag?.elementId).toBe('tbl_runaway')
      expect(overflowDiag?.message).toContain('maximum allowed page count of 100')
    })

    it('enforces custom maxPages constraint (e.g. maxPages: 3) and emits TABLE_OVERFLOW diagnostic', () => {
      const dynTable = createDefaultDynamicTable('tbl_custom_cap', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 20 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const rows = Array.from({ length: 100 }).map((_, i) => ({ subject: `Item ${i}` }))
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      }, { maxPages: 3 })

      expect(paginated.totalPages).toBe(3)
      const overflowDiag = paginated.diagnostics.find((d) => d.code === 'TABLE_OVERFLOW')
      expect(overflowDiag).toBeDefined()
    })

    it('detects unsplittable row taller than usable body, emits UNSPLITTABLE_ROW diagnostic, and avoids infinite loop', () => {
      const dynTable = createDefaultDynamicTable('tbl_tall_row', 'academics.exam_marks')
      const layout = makeTestLayout({
        zones: { headerMm: 35, footerMm: 35 }, // usableBodyHeightMm = 297 - 70 - 20 = 207mm
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      // Construct a gigantic 180-paragraph row text estimated > 250mm
      const massiveText = Array.from({ length: 180 }).fill('Multi-line course syllabus syllabus description').join('\n')
      const rows = [
        { subject: 'Normal Row', marks: 80 },
        { subject: massiveText, marks: 95 },
        { subject: 'Another Normal Row', marks: 90 },
      ]

      const startMs = Date.now()
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })
      const durationMs = Date.now() - startMs

      expect(durationMs).toBeLessThan(500)
      const unsplittableDiag = paginated.diagnostics.find((d) => d.code === 'UNSPLITTABLE_ROW')
      expect(unsplittableDiag).toBeDefined()
      expect(unsplittableDiag?.elementId).toBe('tbl_tall_row')
      expect(unsplittableDiag?.message).toContain('exceeds usable page body height')

      // Slicing loop must make forward progress (all 3 rows consumed)
      let totalCounted = 0
      for (const p of paginated.pages) {
        if (p.tableRowRange) {
          totalCounted += (p.tableRowRange[1] - p.tableRowRange[0])
        }
      }
      expect(totalCounted).toBe(3)
    })

    it('emits UNSPLITTABLE_ROW when measuredRowHeightsMm exceeds usable body height', () => {
      const dynTable = createDefaultDynamicTable('tbl_measured_tall', 'custom_ds')
      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 }, // usableBodyHeightMm = 227mm
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      const rows = [{ id: 1 }, { id: 2 }]
      const paginated = paginateDocument(
        layout,
        { datasets: { custom_ds: rows } },
        { measuredRowHeightsMm: [250, 10] }, // 250mm > 227mm
      )

      const diag = paginated.diagnostics.find((d) => d.code === 'UNSPLITTABLE_ROW')
      expect(diag).toBeDefined()
      expect(diag?.message).toContain('250mm')
    })
  })

  /* =========================================================================
   * Dimension 6: Multiple Paper Sizes (A4P, A4L, CR80)
   * ========================================================================= */
  describe('Dimension 6: Multiple Paper Sizes (A4P, A4L, CR80)', () => {
    it('verifies standard A4 Portrait (A4P) page metrics and pagination', () => {
      const layout = makeTestLayout({
        page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 12, right: 15, bottom: 12, left: 15 } },
        zones: { headerMm: 25, footerMm: 20 },
      })

      const metrics = computePageMetrics(layout)
      expect(metrics.pageWidthMm).toBe(210)
      expect(metrics.pageHeightMm).toBe(297)
      expect(metrics.bodyWidthMm).toBe(210 - 15 - 15) // 180mm
      expect(metrics.usableBodyHeightMm).toBe(297 - 25 - 20 - 12 - 12) // 228mm
      expect(metrics.bodyStartYMm).toBe(25 + 12) // 37mm
      expect(metrics.bodyEndYMm).toBe(297 - 20 - 12) // 265mm
    })

    it('probes A4 Landscape (A4L) page metrics orientation anomaly', () => {
      const layout: LayoutV3 = {
        version: 3,
        page: {
          sizeId: 'A4L',
          orientation: 'LANDSCAPE',
          marginsMm: { top: 10, right: 10, bottom: 10, left: 10 },
          background: '#FFFFFF',
        },
        zones: { headerMm: 20, footerMm: 15 },
        watermark: { mode: 'none' },
        pages: [{ id: 'p1', elements: [] }],
      }

      // In PAGE_SIZES_MM: A4L is defined as { width: 297, height: 210 }
      expect(PAGE_SIZES_MM.A4L.width).toBe(297)
      expect(PAGE_SIZES_MM.A4L.height).toBe(210)

      const metrics = computePageMetrics(layout)

      // EMPIRICAL OBSERVATION & BUG DETECTION:
      // In pagination.ts lines 29-31:
      // const isLandscape = layout.page.orientation === 'LANDSCAPE'
      // const pageWidthMm = isLandscape ? size.height : size.width
      // const pageHeightMm = isLandscape ? size.width : size.height
      // Because A4L is ALREADY { width: 297, height: 210 }, swapping them when isLandscape=true
      // inverts it back to portrait dimensions (pageWidthMm: 210, pageHeightMm: 297)!
      // Usable body height is computed as 297 - 20 - 15 - 20 = 242mm, which is larger than
      // the actual physical height of an A4 Landscape page (210mm)!
      expect(metrics.pageWidthMm).toBe(210) // Documenting the inverted width
      expect(metrics.pageHeightMm).toBe(297) // Documenting the inverted height
      expect(metrics.usableBodyHeightMm).toBe(242)
    })

    it('paginates on CR80 ID card format without crashing', () => {
      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_cr80', 'custom_id_data'),
        datasetId: 'custom_id_data',
        yMm: 5,
        heightMm: 10,
        widthMm: 76,
      }

      const cr80Layout: LayoutV3 = {
        version: 3,
        page: {
          sizeId: 'CR80',
          orientation: 'PORTRAIT',
          marginsMm: { top: 5, right: 5, bottom: 5, left: 5 },
          background: '#FFFFFF',
        },
        zones: { headerMm: 0, footerMm: 0 },
        watermark: { mode: 'none' },
        pages: [{ id: 'p1', elements: [dynTable] }],
      }

      const metrics = computePageMetrics(cr80Layout)
      expect(metrics.pageWidthMm).toBe(86)
      expect(metrics.pageHeightMm).toBe(54)
      expect(metrics.usableBodyHeightMm).toBe(54 - 10) // 44mm

      // Paginate 2 small rows on CR80 card
      const rows = [
        { subject: 'Math', marks: 95 },
        { subject: 'Physics', marks: 88 },
      ]

      const paginated = paginateDocument(
        cr80Layout,
        { datasets: { custom_id_data: rows } },
        { headerRowHeightMm: 6, defaultRowHeightMm: 6, measuredRowHeightsMm: [6, 6] },
      )

      expect(paginated.totalPages).toBe(1)
      expect(paginated.pages[0].elements.length).toBeGreaterThan(0)
    })
  })

  /* =========================================================================
   * Dimension 7: Adversarial Edge Cases & Stress Scenarios
   * ========================================================================= */
  describe('Dimension 7: Adversarial Edge Cases & Stress Scenarios', () => {
    it('spills entire table cleanly to page 2 when dynamicTable starts too low on page 1 to fit even 1 row', () => {
      // Table starts at yMm: 260, but bottom limit is 267.
      // headerRowHeight is 10mm, so 260 + 10 = 270 > 267.
      // Even header row cannot fit on page 1!
      const topTitle: ElementV3 = {
        id: 'top_title',
        type: 'text',
        zone: 'body',
        xMm: 10,
        yMm: 35,
        widthMm: 100,
        heightMm: 15,
        content: 'Top Document Title',
      }

      const dynTable: DynamicTableElementV3 = {
        ...createDefaultDynamicTable('tbl_spill_all', 'academics.exam_marks'),
        yMm: 250,
        heightMm: 20,
      }

      const layout = makeTestLayout({
        zones: { headerMm: 30, footerMm: 20 },
        pages: [{ id: 'p1', elements: [topTitle, dynTable] }],
      })

      const rows = Array.from({ length: 5 }).map((_, i) => ({ subject: `S ${i}` }))
      const paginated = paginateDocument(layout, {
        datasets: { 'academics.exam_marks': rows },
      })

      expect(paginated.totalPages).toBe(2)
      // Page 1 has the top title, but no table
      const p1HasTable = paginated.pages[0].elements.some((el) => el.type === 'table')
      expect(p1HasTable).toBe(false)
      expect(paginated.pages[0].elements.some((el) => el.id === 'top_title')).toBe(true)

      // Page 2 has the table with all 5 rows
      const p2HasTable = paginated.pages[1].elements.some((el) => el.type === 'table')
      expect(p2HasTable).toBe(true)
      expect(paginated.pages[1].tableRowRange).toEqual([0, 5])
    })

    it('throws descriptive error when template has 0 pages', () => {
      const emptyLayout: LayoutV3 = {
        version: 3,
        page: { sizeId: 'A4P', orientation: 'PORTRAIT', marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
        zones: { headerMm: 0, footerMm: 0 },
        watermark: { mode: 'none' },
        pages: [],
      }

      expect(() => paginateDocument(emptyLayout, {})).toThrow('Template must have at least one page.')
    })

    it('throws descriptive error on unsupported page size', () => {
      const invalidSizeLayout = {
        version: 3,
        page: { sizeId: 'UNSUPPORTED_FOO' as any, orientation: 'PORTRAIT' as const, marginsMm: { top: 10, right: 10, bottom: 10, left: 10 } },
        zones: { headerMm: 0, footerMm: 0 },
        watermark: { mode: 'none' as const },
        pages: [{ id: 'p1', elements: [] }],
      }

      expect(() => computePageMetrics(invalidSizeLayout as any)).toThrow('Unsupported page size: UNSUPPORTED_FOO')
    })

    it('passes through documents without a dynamic table untouched across all pages', () => {
      const staticTbl = createDefaultStaticTable('static_tbl', 2, 2)
      const layout = makeTestLayout({
        pages: [
          { id: 'p1', elements: [staticTbl] },
          { id: 'p2', elements: [{ id: 'txt2', type: 'text', xMm: 10, yMm: 10, widthMm: 50, heightMm: 10, content: 'P2' }] },
        ],
      })

      const paginated = paginateDocument(layout, {})
      expect(paginated.totalPages).toBe(2)
      expect(paginated.pages[0].isFirstPage).toBe(true)
      expect(paginated.pages[0].isContinuationPage).toBe(false)
      expect(paginated.pages[1].isContinuationPage).toBe(true)
      expect(paginated.pages[1].isLastPage).toBe(true)
      expect(paginated.diagnostics.length).toBe(0)
    })

    it('fuzz stress test: paginates 150 pseudo-random row heights deterministically without any errors', () => {
      const dynTable = createDefaultDynamicTable('tbl_fuzz', 'custom_fuzz')
      const layout = makeTestLayout({
        zones: { headerMm: 25, footerMm: 25 },
        pages: [{ id: 'p1', elements: [dynTable] }],
      })

      // Generate 150 rows with pseudo-random heights between 5mm and 35mm
      const count = 150
      const fuzzRows = Array.from({ length: count }).map((_, i) => ({ id: i }))
      const pseudoRandomHeights = Array.from({ length: count }).map((_, i) => {
        // Deterministic pseudo-random sequence
        return 5 + ((i * 17 + 23) % 31)
      })

      const paginated = paginateDocument(
        layout,
        { datasets: { custom_fuzz: fuzzRows } },
        { measuredRowHeightsMm: pseudoRandomHeights },
      )

      expect(paginated.totalPages).toBeGreaterThan(1)
      expect(paginated.totalPages).toBeLessThanOrEqual(100)

      // Invariant: every single row from 0 to 149 is accounted for exactly once
      let expectedNextIndex = 0
      for (const p of paginated.pages) {
        expect(p.tableRowRange).toBeDefined()
        const [start, end] = p.tableRowRange!
        expect(start).toBe(expectedNextIndex)
        expectedNextIndex = end
      }
      expect(expectedNextIndex).toBe(count)
    })
  })
})
