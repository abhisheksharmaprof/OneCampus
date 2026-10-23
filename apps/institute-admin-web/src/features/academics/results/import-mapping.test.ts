import { describe, expect, it } from 'vitest'
import { initialMapping, mapImportRows } from './import-mapping'
import type { Sheet } from './results.api'
const sheets: Sheet[] = [
  {
    id: 'sheet',
    subjectId: 'math',
    name: 'Mathematics',
    state: 'DRAFT',
    revision: 0,
    reviewNote: '',
    components: [{ id: 'score', name: 'Total', maximum: '100', passMarks: '40' }],
  },
]
describe('marks spreadsheet mapping', () => {
  it('maps wide subject columns and preserves a zero score', () => {
    const mapping = initialMapping(['Roll number', 'Student name', 'Mathematics'], sheets)
    const rows = mapImportRows(
      [{ 'Roll number': '01', 'Student name': 'Ada', Mathematics: '0' }],
      mapping,
      sheets,
    )
    expect(rows).toEqual([
      {
        profile: {},
        identifier: '01',
        name: 'Ada',
        componentId: 'score',
        score: '0',
        status: 'PRESENT',
        maximum: '',
      },
    ])
  })
  it('keeps blanks missing and resolves absent shorthand without a numeric score', () => {
    const mapping = initialMapping(['Roll', 'Marks'], sheets)
    const rows = mapImportRows(
      [
        { Roll: '01', Marks: '' },
        { Roll: '02', Marks: 'AB' },
      ],
      mapping,
      sheets,
    )
    expect(rows[0].score).toBe('')
    expect(rows[1]).toMatchObject({ score: null, status: 'ABSENT' })
  })
  it('does not guess a component for an unknown subject', () => {
    const mapping = initialMapping(['Roll', 'Marks', 'Subject'], sheets)
    const rows = mapImportRows([{ Roll: '01', Marks: '40', Subject: 'Unknown' }], mapping, sheets)
    expect(rows[0].componentId).toBe('')
  })
})
