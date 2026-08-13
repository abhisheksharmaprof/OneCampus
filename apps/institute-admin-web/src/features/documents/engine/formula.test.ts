import { describe, expect, it } from 'vitest'
import { computeTableRows, computeTotals, evaluateFormula } from './formula'
import type { TableColumn, TotalsRow } from './types'

const col = (id: string, label: string, extra: Partial<TableColumn> = {}): TableColumn => ({
  id, label, type: 'data', dtype: 'number', widthPct: 20, align: 'left', ...extra,
})

const FEE_COLUMNS: TableColumn[] = [
  col('c1', 'Description', { dtype: 'text' }),
  col('c3', 'Qty'),
  col('c4', 'Rate'),
  col('c5', 'Amount', { type: 'formula', formula: '=[Qty]*[Rate]' }),
]
const FEE_ROWS = [
  { c1: 'Tuition', c3: 2, c4: 1500.5 },
  { c1: 'Transport', c3: 1, c4: 3000 },
]

describe('evaluateFormula', () => {
  const env = { ref: (name: string) => ({ Qty: 2, Rate: 1500.5, Name: 'Aarav' } as Record<string, number | string>)[name] ?? (() => { throw new Error(`unknown ref ${name}`) })() }

  it('handles arithmetic with precedence and parens', () => {
    expect(evaluateFormula('=1+2*3', env)).toBe(7)
    expect(evaluateFormula('=(1+2)*3', env)).toBe(9)
    expect(evaluateFormula('=-4+10/2', env)).toBe(1)
  })

  it('resolves refs and functions', () => {
    expect(evaluateFormula('=[Qty]*[Rate]', env)).toBe(3001)
    expect(evaluateFormula('=ROUND([Rate],0)', env)).toBe(1501)
    expect(evaluateFormula('=SUM(1,2,3)+MAX(4,9)', env)).toBe(15)
    expect(evaluateFormula('=AVG(2,4)', env)).toBe(3)
    expect(evaluateFormula('=MIN(5,2,8)', env)).toBe(2)
  })

  it('handles IF with comparisons and strings', () => {
    expect(evaluateFormula('=IF([Qty]>=2,"bulk","single")', env)).toBe('bulk')
    expect(evaluateFormula('=IF([Name]=="Aarav",1,0)', env)).toBe(1)
    expect(evaluateFormula('=IF(1>2,"a",IF(3!=3,"b","c"))', env)).toBe('c')
  })

  it('throws (not evaluates) on unknown identifiers and injection-shaped input', () => {
    expect(() => evaluateFormula('=constructor("alert(1)")', env)).toThrow()
    expect(() => evaluateFormula('=__proto__', env)).toThrow()
    expect(() => evaluateFormula('=[Nope]', env)).toThrow()
    expect(() => evaluateFormula('=1+*2', env)).toThrow()
  })
})

describe('computeTableRows', () => {
  it('computes formula columns per row', () => {
    const rows = computeTableRows(FEE_COLUMNS, FEE_ROWS)
    expect(rows[0].c5).toBe(3001)
    expect(rows[1].c5).toBe(3000)
  })

  it('renders #ERR for a broken formula without affecting other cells', () => {
    const columns = [...FEE_COLUMNS, col('c6', 'Bad', { type: 'formula', formula: '=[Missing]+1' })]
    const rows = computeTableRows(columns, FEE_ROWS)
    expect(rows[0].c6).toBe('#ERR')
    expect(rows[0].c5).toBe(3001)
  })

  it('supports RANK and PERCENTILE over a column', () => {
    const columns = [
      col('c1', 'Subject', { dtype: 'text' }),
      col('c3', 'Marks'),
      col('c7', 'Rank', { type: 'formula', formula: '=RANK([Marks])' }),
      col('c8', 'Pct', { type: 'formula', formula: '=PERCENTILE([Marks])' }),
    ]
    const rows = computeTableRows(columns, [
      { c1: 'Eng', c3: 88 }, { c1: 'Math', c3: 95 }, { c1: 'Sci', c3: 88 },
    ])
    expect(rows[1].c7).toBe(1)
    expect(rows[0].c7).toBe(2)
    expect(rows[2].c7).toBe(2)
    expect(rows[1].c8).toBe(100)
  })
})

describe('computeTotals', () => {
  const TOTALS: TotalsRow[] = [
    { id: 'r1', label: 'Subtotal', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
    { id: 'r2', label: 'Discount', kind: 'value', value: 500 },
    { id: 'r3', label: 'Grand total', kind: 'formula', formula: '=[Subtotal]-[Discount]', emphasize: true },
  ]

  it('chains SUM_TABLE and row references', () => {
    const results = computeTotals(TOTALS, { columns: FEE_COLUMNS, rows: FEE_ROWS })
    expect(results.r1).toBe(6001)
    expect(results.r2).toBe(500)
    expect(results.r3).toBe(5501)
  })

  it('forward references and missing tables yield #ERR', () => {
    const forward: TotalsRow[] = [
      { id: 'r1', label: 'A', kind: 'formula', formula: '=[B]+1' },
      { id: 'r2', label: 'B', kind: 'value', value: 1 },
    ]
    expect(computeTotals(forward, { columns: FEE_COLUMNS, rows: FEE_ROWS }).r1).toBe('#ERR')
    expect(computeTotals(TOTALS, null).r1).toBe('#ERR')
  })

  it('division by zero and NaN-producing chains yield #ERR, not "NaN"', () => {
    const rows: TotalsRow[] = [
      { id: 'r1', label: 'Total', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
      { id: 'r2', label: 'Out of', kind: 'formula', formula: '=SUM_TABLE("Amount")' },
      { id: 'r3', label: 'Pct', kind: 'formula', formula: '=ROUND([Total]/[Out of]*100,2)' },
    ]
    const results = computeTotals(rows, { columns: FEE_COLUMNS, rows: [] })
    expect(results.r1).toBe(0)
    expect(results.r3).toBe('#ERR')  // 0/0 → NaN → asNumber throws → #ERR
  })
})
