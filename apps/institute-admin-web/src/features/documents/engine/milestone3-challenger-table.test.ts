import { describe, it, expect } from 'vitest'
import type {
  StaticTableElementV3,
  DynamicTableElementV3,
  TableColumnV3,
} from '@campusone/document-engine'
import {
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
  tokenizeFormula,
  parseFormula,
  evaluateTotalsFormula,
  extractNumericValue,
  compileTableHtml,
  FormulaError,
} from '@campusone/document-engine'

describe('Milestone 3 Challenger: Table & Formula Adversarial Stress Testing', () => {
  /* =========================================================================
   * Challenge 1: Cell Merging & Splitting Edge Cases
   * ========================================================================= */
  describe('Challenge 1: Cell Merging & Splitting Edge Cases', () => {
    it('handles inverted rectangle selections (bottom-right to top-left) correctly', () => {
      const table = createDefaultStaticTable('tbl_invert', 3, 3)

      // Inverted selection order: (1,1), (1,0), (0,1), (0,0)
      const invertedSelection = [
        { row: 1, column: 1 },
        { row: 1, column: 0 },
        { row: 0, column: 1 },
        { row: 0, column: 0 },
      ]

      expect(canMergeCells(table, invertedSelection)).toBe(true)

      const merged = mergeCells(table, invertedSelection)
      const anchor = merged.cells.find((c) => c.row === 0 && c.column === 0)
      expect(anchor?.rowSpan).toBe(2)
      expect(anchor?.colSpan).toBe(2)
      expect(anchor?.isMergedCovered).toBe(false)

      const covered = merged.cells.filter((c) => c.isMergedCovered)
      expect(covered.length).toBe(3)
      for (const cov of covered) {
        expect(cov.mergedIntoId).toBe(anchor?.id)
      }
    })

    it('rejects non-rectangular selections (L-shape, T-shape, diagonals)', () => {
      const table = createDefaultStaticTable('tbl_shapes', 4, 4)

      // L-shape: 3 cells of 2x2
      const lShape = [
        { row: 0, column: 0 },
        { row: 1, column: 0 },
        { row: 1, column: 1 },
      ]
      expect(canMergeCells(table, lShape)).toBe(false)
      expect(mergeCells(table, lShape)).toEqual(table) // Must be no-op

      // Diagonal 2 cells: (0,0) and (1,1)
      const diagonal = [
        { row: 0, column: 0 },
        { row: 1, column: 1 },
      ]
      expect(canMergeCells(table, diagonal)).toBe(false)
      expect(mergeCells(table, diagonal)).toEqual(table)

      // T-shape in 3x3: top row (0,0), (0,1), (0,2) + center (1,1)
      const tShape = [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 0, column: 2 },
        { row: 1, column: 1 },
      ]
      expect(canMergeCells(table, tShape)).toBe(false)
      expect(mergeCells(table, tShape)).toEqual(table)
    })

    it('rejects single cell merge attempts (1x1 selection)', () => {
      const table = createDefaultStaticTable('tbl_single_merge', 3, 3)

      expect(canMergeCells(table, [{ row: 0, column: 0 }])).toBe(false)
      expect(canMergeCells(table, [])).toBe(false)
      expect(canMergeCells(table, null as unknown as Array<{ row: number; column: number }>)).toBe(false)

      const unchanged1 = mergeCells(table, [{ row: 0, column: 0 }])
      expect(unchanged1).toEqual(table)

      const unchanged2 = mergeCells(table, [])
      expect(unchanged2).toEqual(table)
    })

    it('rejects selections with duplicate cell coordinates', () => {
      const table = createDefaultStaticTable('tbl_dup', 3, 3)
      const duplicates = [
        { row: 0, column: 0 },
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 0, column: 1 },
      ]
      // Duplicate entries violate expectedCount === selectedCells.length
      expect(canMergeCells(table, duplicates)).toBe(false)
    })

    it('rejects merge when attempting to merge a covered cell without its anchor', () => {
      const table = createDefaultStaticTable('tbl_partial_covered', 3, 3)
      // Merge (0,0) and (0,1)
      const mergedOnce = mergeCells(table, [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
      ])

      // Attempting to merge (0,1) [which is covered by (0,0)] with (1,1)
      // without including anchor (0,0) must return false
      const invalidOverlap = [
        { row: 0, column: 1 },
        { row: 1, column: 1 },
      ]
      expect(canMergeCells(mergedOnce, invalidOverlap)).toBe(false)
      expect(mergeCells(mergedOnce, invalidOverlap)).toEqual(mergedOnce)
    })

    it('safely handles splitCell on unmerged 1x1 cells as clean no-op', () => {
      const table = createDefaultStaticTable('tbl_split_noop', 3, 3)
      const snapshot = JSON.stringify(table)

      const afterSplit00 = splitCell(table, 0, 0)
      expect(JSON.stringify(afterSplit00)).toBe(snapshot)

      const afterSplit11 = splitCell(table, 1, 1)
      expect(JSON.stringify(afterSplit11)).toBe(snapshot)
    })

    it('safely handles splitCell on covered (non-anchor) cell coordinates without corruption', () => {
      const table = createDefaultStaticTable('tbl_split_cov', 3, 3)
      const merged = mergeCells(table, [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
      ])

      // (0, 1) is a covered cell, not the anchor
      const afterSplitCovered = splitCell(merged, 0, 1)
      // Must be a no-op because (0, 1) is not an anchor with rowSpan/colSpan > 1
      const anchor = afterSplitCovered.cells.find((c) => c.row === 0 && c.column === 0)
      const covered = afterSplitCovered.cells.find((c) => c.row === 0 && c.column === 1)

      expect(anchor?.colSpan).toBe(2)
      expect(covered?.isMergedCovered).toBe(true)
    })

    it('safely handles splitCell on out-of-bounds coordinates', () => {
      const table = createDefaultStaticTable('tbl_split_oob', 3, 3)
      expect(() => splitCell(table, -1, -1)).not.toThrow()
      expect(() => splitCell(table, 99, 99)).not.toThrow()
      expect(splitCell(table, -1, -1)).toEqual(table)
      expect(splitCell(table, 99, 99)).toEqual(table)
    })

    it('merges cell contents into anchor and restores 1x1 geometry on split', () => {
      const table = createDefaultStaticTable('tbl_content_merge', 3, 3)
      table.cells.find((c) => c.row === 1 && c.column === 1)!.content = 'Alpha'
      table.cells.find((c) => c.row === 1 && c.column === 2)!.content = 'Beta'

      const merged = mergeCells(table, [
        { row: 1, column: 1 },
        { row: 1, column: 2 },
      ])
      const anchor = merged.cells.find((c) => c.row === 1 && c.column === 1)
      expect(anchor?.content).toBe('Alpha Beta')

      const split = splitCell(merged, 1, 1)
      const splitAnchor = split.cells.find((c) => c.row === 1 && c.column === 1)
      const splitCovered = split.cells.find((c) => c.row === 1 && c.column === 2)

      expect(splitAnchor?.rowSpan).toBe(1)
      expect(splitAnchor?.colSpan).toBe(1)
      expect(splitAnchor?.isMergedCovered).toBe(false)
      expect(splitCovered?.rowSpan).toBe(1)
      expect(splitCovered?.colSpan).toBe(1)
      expect(splitCovered?.isMergedCovered).toBe(false)
      expect(splitCovered?.mergedIntoId).toBeUndefined()
    })

    it('promotes cell below when a row containing a vertically merged anchor is deleted', () => {
      const table = createDefaultStaticTable('tbl_del_merged_row', 3, 3)
      const merged = mergeCells(table, [
        { row: 0, column: 0 },
        { row: 1, column: 0 },
      ])

      const afterDelete = deleteRow(merged, 0)
      expect(afterDelete.rowCount).toBe(2)

      // The cell that was at (1,0) is now at (0,0) and should be promoted from covered to anchor with rowSpan 1
      const promoted = afterDelete.cells.find((c) => c.row === 0 && c.column === 0)
      expect(promoted).toBeDefined()
      expect(promoted?.isMergedCovered).toBe(false)
      expect(promoted?.mergedIntoId).toBeUndefined()
      expect(promoted?.rowSpan).toBe(1)
    })

    it('promotes cell to the right when a column containing a horizontally merged anchor is deleted', () => {
      const table = createDefaultStaticTable('tbl_del_merged_col', 3, 3)
      const merged = mergeCells(table, [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
      ])

      const afterDelete = deleteColumn(merged, 0)
      expect(afterDelete.colCount).toBe(2)

      // The cell that was at (0,1) is now at (0,0) and should be promoted
      const promoted = afterDelete.cells.find((c) => c.row === 0 && c.column === 0)
      expect(promoted).toBeDefined()
      expect(promoted?.isMergedCovered).toBe(false)
      expect(promoted?.mergedIntoId).toBeUndefined()
      expect(promoted?.colSpan).toBe(1)
    })
  })

  /* =========================================================================
   * Challenge 2: Column Resizing Math & Invariants
   * ========================================================================= */
  describe('Challenge 2: Column Resizing Math & Invariants', () => {
    it('strictly maintains 100% total sum invariant across extreme dragging', () => {
      const cols: TableColumnV3[] = [
        { id: 'c1', widthPercent: 50 },
        { id: 'c2', widthPercent: 50 },
      ]

      // Massive positive drag (+10,000 mm on 100mm table)
      const extremePos = resizeColumnDivider(cols, 0, 10000, 100)
      const sumPos = extremePos.reduce((acc, c) => acc + (c.widthPercent ?? 0), 0)
      expect(Math.abs(sumPos - 100)).toBeLessThan(1e-6)
      expect(extremePos[0].widthPercent).toBe(95) // clamped to max (100 - minPct)
      expect(extremePos[1].widthPercent).toBe(5)  // clamped to minPct (5%)

      // Massive negative drag (-10,000 mm on 100mm table)
      const extremeNeg = resizeColumnDivider(cols, 0, -10000, 100)
      const sumNeg = extremeNeg.reduce((acc, c) => acc + (c.widthPercent ?? 0), 0)
      expect(Math.abs(sumNeg - 100)).toBeLessThan(1e-6)
      expect(extremeNeg[0].widthPercent).toBe(5)
      expect(extremeNeg[1].widthPercent).toBe(95)
    })

    it('safely handles zero or negative tableWidthMm as clean no-op without NaN or Infinity', () => {
      const cols: TableColumnV3[] = [
        { id: 'c1', widthPercent: 40 },
        { id: 'c2', widthPercent: 60 },
      ]

      const resZero = resizeColumnDivider(cols, 0, 10, 0)
      expect(resZero).toEqual(cols)

      const resNeg = resizeColumnDivider(cols, 0, 10, -50)
      expect(resNeg).toEqual(cols)

      for (const col of resZero) {
        expect(Number.isFinite(col.widthPercent)).toBe(true)
        expect(Number.isNaN(col.widthPercent)).toBe(false)
      }
    })

    it('safely handles invalid divider column indices as clean no-op', () => {
      const cols: TableColumnV3[] = [
        { id: 'c1', widthPercent: 50 },
        { id: 'c2', widthPercent: 50 },
      ]

      expect(resizeColumnDivider(cols, -1, 10, 100)).toEqual(cols)
      expect(resizeColumnDivider(cols, 1, 10, 100)).toEqual(cols) // Last col has no right neighbor
      expect(resizeColumnDivider(cols, 99, 10, 100)).toEqual(cols)
    })

    it('handles 1-column table safely with no divider drag possible', () => {
      const singleCol: TableColumnV3[] = [{ id: 'c1', widthPercent: 100 }]
      const res = resizeColumnDivider(singleCol, 0, 10, 100)
      expect(res).toEqual(singleCol)
      expect(res[0].widthPercent).toBe(100)
    })

    it('handles 3-column table with floating point fractions and keeps total at 100%', () => {
      let cols: TableColumnV3[] = [
        { id: 'c1', widthPercent: 33.33 },
        { id: 'c2', widthPercent: 33.33 },
        { id: 'c3', widthPercent: 33.34 },
      ]

      // Drag divider 0 by +7.89mm on 175mm table
      cols = resizeColumnDivider(cols, 0, 7.89, 175)
      let sum = cols.reduce((acc, c) => acc + (c.widthPercent ?? 0), 0)
      expect(Math.abs(sum - 100)).toBeLessThan(0.02) // within float rounding precision

      // Drag divider 1 by -12.34mm on 175mm table
      cols = resizeColumnDivider(cols, 1, -12.34, 175)
      sum = cols.reduce((acc, c) => acc + (c.widthPercent ?? 0), 0)
      expect(Math.abs(sum - 100)).toBeLessThan(0.02)
    })

    it('fuzz stress test: executes 100 pseudo-random divider drags and maintains 100% total invariant', () => {
      let cols: TableColumnV3[] = [
        { id: 'c1', widthPercent: 25 },
        { id: 'c2', widthPercent: 25 },
        { id: 'c3', widthPercent: 25 },
        { id: 'c4', widthPercent: 25 },
      ]

      const tableWidthMm = 160

      for (let i = 0; i < 100; i++) {
        const colIdx = i % 3 // Choose divider 0, 1, or 2
        // Deterministic pseudo-random delta between -50mm and +50mm
        const pseudoDelta = ((Math.sin(i * 13.37) * 5000) % 50)
        cols = resizeColumnDivider(cols, colIdx, pseudoDelta, tableWidthMm)

        // Verify each column is at least minPct (5%)
        for (const c of cols) {
          expect(c.widthPercent).toBeGreaterThanOrEqual(4.99)
          expect(Number.isFinite(c.widthPercent)).toBe(true)
          expect(Number.isNaN(c.widthPercent)).toBe(false)
        }

        // Verify total sum invariant is preserved within rounding tolerance
        const total = cols.reduce((acc, c) => acc + (c.widthPercent ?? 0), 0)
        expect(Math.abs(total - 100)).toBeLessThan(0.05)
      }
    })

    it('maintains 100% column sum across repeated column insertions and deletions', () => {
      let table = createDefaultStaticTable('tbl_cascade', 2, 2)
      expect(table.columns.reduce((s, c) => s + (c.widthPercent ?? 0), 0)).toBe(100)

      // Insert 6 columns
      for (let i = 0; i < 6; i++) {
        table = insertColumn(table, table.colCount - 1, 'right')
        const sum = table.columns.reduce((s, c) => s + (c.widthPercent ?? 0), 0)
        expect(Math.abs(sum - 100)).toBeLessThan(1e-4)
      }
      expect(table.colCount).toBe(8)

      // Delete 4 columns
      for (let i = 0; i < 4; i++) {
        table = deleteColumn(table, 1)
        const sum = table.columns.reduce((s, c) => s + (c.widthPercent ?? 0), 0)
        expect(Math.abs(sum - 100)).toBeLessThan(1e-4)
      }
      expect(table.colCount).toBe(4)

      // Delete down to 1 column
      table = deleteColumn(table, 0)
      table = deleteColumn(table, 0)
      table = deleteColumn(table, 0)
      expect(table.colCount).toBe(1)
      expect(table.columns[0].widthPercent).toBe(100)

      // Guardrail: Attempting to delete the last column is a no-op
      const cannotDeleteLast = deleteColumn(table, 0)
      expect(cannotDeleteLast.colCount).toBe(1)
      expect(cannotDeleteLast.columns.length).toBe(1)
    })
  })

  /* =========================================================================
   * Challenge 3: Formula Parser & Evaluator Resilience
   * ========================================================================= */
  describe('Challenge 3: Formula Parser & Evaluator Resilience', () => {
    describe('AST Depth Guard & Stack Overflow Protection', () => {
      it('evaluates expression at maximum allowed depth (19 nested parens) successfully', () => {
        // 19 parens + 1 terminal number = depth 20 (MAX_DEPTH guard threshold)
        const formula19 = '('.repeat(19) + '42' + ')'.repeat(19)
        expect(evaluateTotalsFormula(formula19, [])).toBe(42)
      })

      it('safely rejects expressions exceeding depth limit (>= 20 nested parens) with #ERR instead of stack overflow', () => {
        // 20 parens + 1 terminal = depth 21 > 20
        const formula20 = '('.repeat(20) + '42' + ')'.repeat(20)
        expect(evaluateTotalsFormula(formula20, [])).toBe('#ERR')

        const formula25 = '('.repeat(25) + '42' + ')'.repeat(25)
        expect(evaluateTotalsFormula(formula25, [])).toBe('#ERR')
      })

      it('safely rejects deeply nested expressions (50 levels) with #ERR without crashing', () => {
        const formula50 = '('.repeat(50) + '999' + ')'.repeat(50)
        expect(() => evaluateTotalsFormula(formula50, [])).not.toThrow()
        expect(evaluateTotalsFormula(formula50, [])).toBe('#ERR')
      })

      it('safely parses long flat additive chains without stack overflow', () => {
        // 100 additions: 1 + 1 + 1 + ... + 1
        const longAddition = Array.from({ length: 100 }, () => '1').join(' + ')
        expect(evaluateTotalsFormula(longAddition, [])).toBe(100)
      })
    })

    describe('Division by Zero & Arithmetic Edge Cases', () => {
      it('returns 0 for direct division by zero (10 / 0) without throwing or NaN', () => {
        expect(evaluateTotalsFormula('10 / 0', [])).toBe(0)
        expect(evaluateTotalsFormula('0 / 0', [])).toBe(0)
        expect(evaluateTotalsFormula('-25 / 0', [])).toBe(0)
      })

      it('returns 0 when aggregate formula divides by zero', () => {
        const data = [{ marks: 100 }, { marks: 50 }]
        expect(evaluateTotalsFormula('SUM(marks) / 0', data)).toBe(0)
        expect(evaluateTotalsFormula('AVG(marks) / 0', data)).toBe(0)
      })

      it('returns 0 when denominator evaluates to 0 via subtraction', () => {
        const data = [{ marks: 50 }]
        // 50 - 50 = 0 in denominator
        expect(evaluateTotalsFormula('100 / (SUM(marks) - 50)', data)).toBe(0)
      })

      it('handles unary negation and operator precedence correctly', () => {
        expect(evaluateTotalsFormula('-5 + 10', [])).toBe(5)
        expect(evaluateTotalsFormula('10 - -5', [])).toBe(15)
        expect(evaluateTotalsFormula('2 + 3 * 4', [])).toBe(14)
        expect(evaluateTotalsFormula('(2 + 3) * 4', [])).toBe(20)
      })
    })

    describe('Empty Datasets & Missing Fields', () => {
      it('evaluates all aggregate functions on empty dataset ([]) to 0', () => {
        const empty: Array<Record<string, unknown>> = []
        expect(evaluateTotalsFormula('SUM(qty)', empty)).toBe(0)
        expect(evaluateTotalsFormula('COUNT(qty)', empty)).toBe(0)
        expect(evaluateTotalsFormula('AVERAGE(qty)', empty)).toBe(0)
        expect(evaluateTotalsFormula('AVG(qty)', empty)).toBe(0)
        expect(evaluateTotalsFormula('MIN(qty)', empty)).toBe(0)
        expect(evaluateTotalsFormula('MAX(qty)', empty)).toBe(0)
        expect(evaluateTotalsFormula('ROUND(qty)', empty)).toBe(0)
      })

      it('evaluates COUNT() with no arguments on empty and non-empty dataset', () => {
        expect(evaluateTotalsFormula('COUNT()', [])).toBe(0)
        expect(evaluateTotalsFormula('COUNT()', [{ a: 1 }, { a: 2 }, { a: 3 }])).toBe(3)
      })

      it('evaluates aggregate functions on non-existent fields to 0', () => {
        const data = [{ a: 10 }, { b: 20 }]
        expect(evaluateTotalsFormula('SUM(missing_col)', data)).toBe(0)
        expect(evaluateTotalsFormula('COUNT(missing_col)', data)).toBe(0)
        expect(evaluateTotalsFormula('AVG(missing_col)', data)).toBe(0)
      })

      it('safely handles non-numeric values in numeric aggregates (SUM, AVG, MIN, MAX)', () => {
        const mixedRows = [
          { marks: 50 },
          { marks: null },
          { marks: undefined },
          { marks: '' },
          { marks: 'N/A' },
          { marks: true },
          { marks: false },
          { marks: { nested: 100 } },
          { marks: [1, 2, 3] },
          { marks: 30 },
        ]

        // Numeric aggregates strictly filter via extractNumericValue (only 50 and 30 are extracted)
        expect(evaluateTotalsFormula('SUM(marks)', mixedRows)).toBe(80)
        expect(evaluateTotalsFormula('AVG(marks)', mixedRows)).toBe(40)
        expect(evaluateTotalsFormula('MIN(marks)', mixedRows)).toBe(30)
        expect(evaluateTotalsFormula('MAX(marks)', mixedRows)).toBe(50)

        // COUNT(field) follows SQL non-null / non-empty string semantics
        // (excludes null, undefined, '', and includes all other truthy/defined values: 50, 'N/A', true, false, object, array, 30 -> 7)
        expect(evaluateTotalsFormula('COUNT(marks)', mixedRows)).toBe(7)
      })
    })

    describe('Currency Strings & Numeric Sanitization', () => {
      it('extracts numbers from diverse currency and formatted string variants', () => {
        expect(extractNumericValue('₹1,50,000.50')).toBe(150000.5)
        expect(extractNumericValue('$2,500')).toBe(2500)
        expect(extractNumericValue('₹ 500')).toBe(500)
        expect(extractNumericValue('$ -100.25')).toBe(-100.25)
        expect(extractNumericValue('  42.50  ')).toBe(42.5)
        expect(extractNumericValue(123.45)).toBe(123.45)
      })

      it('evaluates SUM correctly across mixed currency and formatted values', () => {
        const fees = [
          { amount: '₹12,000.50' },
          { amount: '$3,000.00' },
          { amount: '500' },
          { amount: 1500 },
        ]
        expect(evaluateTotalsFormula('SUM(amount)', fees)).toBe(17000.5)
      })

      it('gracefully handles non-supported currency strings (EUR, GBP) without crashing', () => {
        // 'EUR 50' does not match the ₹/$ filter and yields null in extractNumericValue
        expect(extractNumericValue('EUR 50')).toBeNull()
        expect(extractNumericValue('50 GBP')).toBeNull()

        const mixed = [
          { amount: '₹100' },
          { amount: 'EUR 50' }, // skipped
          { amount: 200 },
        ]
        expect(evaluateTotalsFormula('SUM(amount)', mixed)).toBe(300)
      })

      it('returns null on non-finite, NaN, or non-numeric values in extractNumericValue', () => {
        expect(extractNumericValue('NaN')).toBeNull()
        expect(extractNumericValue('Infinity')).toBeNull()
        expect(extractNumericValue('-Infinity')).toBeNull()
        expect(extractNumericValue('')).toBeNull()
        expect(extractNumericValue('   ')).toBeNull()
        expect(extractNumericValue(null)).toBeNull()
        expect(extractNumericValue(undefined)).toBeNull()
        expect(extractNumericValue(true)).toBeNull()
        expect(extractNumericValue({})).toBeNull()
      })
    })

    describe('Security: Prototype Pollution & Hostile Identifiers', () => {
      it('prevents prototype pollution when accessing __proto__, constructor, and prototype', () => {
        const dataset = [
          { __proto__: { injected: 'malicious' } },
          { val: 10 },
        ]

        // Accessing __proto__ or constructor should not pollute global Object.prototype
        evaluateTotalsFormula('SUM(__proto__)', dataset)
        evaluateTotalsFormula('SUM(constructor)', dataset)
        evaluateTotalsFormula('SUM(prototype)', dataset)
        evaluateTotalsFormula('COUNT(__proto__)', dataset)

        // Empirical check: verify Object.prototype is clean
        const testObj: Record<string, unknown> = {}
        expect((testObj as Record<string, unknown>).injected).toBeUndefined()
        expect((Object.prototype as Record<string, unknown>).injected).toBeUndefined()
        expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined()
      })

      it('safely handles formula field names with dots and brackets', () => {
        const dataset = [
          { 'item.price': 100 },
          { 'item.price': 250 },
        ]
        expect(evaluateTotalsFormula('SUM([item.price])', dataset)).toBe(350)
      })
    })

    describe('Malformed Syntax, Unclosed Literals, & Fuzzing', () => {
      it('safely returns #ERR for mismatched parentheses', () => {
        expect(evaluateTotalsFormula('(1 + 2', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('1 + 2)', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('((())', [])).toBe('#ERR')
        expect(evaluateTotalsFormula(')(', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('SUM(marks', [])).toBe('#ERR')
      })

      it('safely returns #ERR for malformed operators and invalid grammar', () => {
        expect(evaluateTotalsFormula('1 + * 2', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('* 5', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('5 /', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('++', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('+', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('-', [])).toBe('#ERR')
      })

      it('safely returns #ERR for empty, whitespace, or equal-only formulas', () => {
        expect(evaluateTotalsFormula('', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('   ', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('=', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('===', [])).toBe('#ERR')
      })

      it('safely returns #ERR for unknown function calls', () => {
        expect(evaluateTotalsFormula('EVAL("2+2")', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('EXEC("ls")', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('UNKNOWN_FUNC(marks)', [])).toBe('#ERR')
      })

      it('safely returns #ERR for unclosed string literals and bracket references', () => {
        expect(evaluateTotalsFormula('"unclosed string', [])).toBe('#ERR')
        expect(evaluateTotalsFormula("'unclosed single", [])).toBe('#ERR')
        expect(evaluateTotalsFormula('[unclosed_bracket', [])).toBe('#ERR')
      })

      it('safely returns #ERR for illegal characters and injection attacks', () => {
        expect(evaluateTotalsFormula('<script>alert(1)</script>', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('1; DROP TABLE students;', [])).toBe('#ERR')
        expect(evaluateTotalsFormula('@#$%^&', [])).toBe('#ERR')
      })
    })
  })

  /* =========================================================================
   * Challenge 4: Table HTML Export Parity Under Adversarial Conditions
   * ========================================================================= */
  describe('Challenge 4: Table HTML Export Parity Under Adversarial Conditions', () => {
    it('never renders merged covered cells in compiled HTML table markup', () => {
      const table = createDefaultStaticTable('tbl_export_merge', 3, 3)
      const merged = mergeCells(table, [
        { row: 0, column: 0 },
        { row: 0, column: 1 },
        { row: 1, column: 0 },
        { row: 1, column: 1 },
      ])

      const html = compileTableHtml(merged)

      // Total 9 cells originally. 1 is anchor (2x2), 3 are covered, 5 are untouched.
      // Rendered HTML table must contain exactly 6 cells (1 + 5 = 6 cells rendered, 0 covered).
      const thMatch = html.match(/<th\b/g) || []
      const tdMatch = html.match(/<td\b/g) || []
      expect(thMatch.length + tdMatch.length).toBe(6)

      // The anchor cell must have rowspan="2" and colspan="2"
      expect(html).toContain('rowspan="2"')
      expect(html).toContain('colspan="2"')
    })

    it('exports dynamic table cleanly when totals formula results in division by zero', () => {
      const dynTable = createDefaultDynamicTable('tbl_export_div0', 'academics.exam_marks')
      dynTable.datasetBinding!.totalsRow = {
        enabled: true,
        label: 'Zero Test',
        cells: [
          { column: 0, content: 'Total' },
          { column: 1, formula: 'SUM(marks) / 0' },
        ],
      }

      const html = compileTableHtml(dynTable, {}, [])
      expect(html).toContain('<tfoot')
      expect(html).toContain('0</td>') // Safely evaluated to 0
      expect(html).not.toContain('NaN')
      expect(html).not.toContain('Infinity')
    })

    it('escapes hostile XSS payloads injected via data tokens and column headers in dynamic tables', () => {
      const dynTable = createDefaultDynamicTable('tbl_xss_dyn', 'academics.exam_marks')
      dynTable.columns[0].header = '<script>evilHeader()</script>'

      const maliciousRows = [
        { subject: '<img src=x onerror=alert("subject")>', max_marks: 100, marks: 95, grade: '<b onmouseover=evil()>A</b>' },
      ]

      const html = compileTableHtml(dynTable, {}, maliciousRows)
      // Headers must be HTML-escaped
      expect(html).not.toContain('<script>evilHeader()</script>')
      expect(html).toContain('&lt;script&gt;evilHeader()&lt;/script&gt;')

      // Data cell contents must be HTML-escaped
      expect(html).not.toContain('<img src=x onerror=alert("subject")>')
      expect(html).toContain('&lt;img src=x onerror=alert(&quot;subject&quot;)&gt;')
      expect(html).not.toContain('<b onmouseover=evil()>A</b>')
      expect(html).toContain('&lt;b onmouseover=evil()&gt;A&lt;/b&gt;')
    })

    it('escapes hostile XSS payloads injected via token interpolation in static tables', () => {
      const table = createDefaultStaticTable('tbl_xss_token', 2, 2)
      table.cells[0].content = 'Hello {{student.name}}'

      const maliciousData = {
        student: { name: '<script>alert("xss")</script>' },
      }

      const html = compileTableHtml(table, maliciousData)
      expect(html).not.toContain('<script>alert("xss")</script>')
      expect(html).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
    })
  })
})
