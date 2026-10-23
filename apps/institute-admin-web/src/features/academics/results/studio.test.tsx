import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { EngineSettings } from './EngineSettings'
import { TemplateAppearance } from './TemplateAppearance'
import { ResultAnalytics } from './ResultAnalytics'
import { safeSpreadsheetValue } from './results.api'
import type { Appearance, ExamDetail, Rules } from './results.api'

function Settings() {
  const [rules, setRules] = useState<Rules>({
    decimals: 2,
    grades: [{ label: 'Pass', minimum: 0 }],
  })
  return (
    <>
      <EngineSettings token="test" rules={rules} onChange={setRules} subjects={[]} />
      <output data-testid="rules">{JSON.stringify(rules)}</output>
    </>
  )
}
function Designer() {
  const [appearance, setAppearance] = useState<Appearance>({})
  return (
    <>
      <TemplateAppearance
        value={appearance}
        onChange={setAppearance}
        detail={null}
        onError={vi.fn()}
      />
      <output data-testid="appearance">{JSON.stringify(appearance)}</output>
    </>
  )
}

describe('reference marksheet studio', () => {
  it('stores grade presets, best-of-N, and numeric precision in exam rules', async () => {
    const user = userEvent.setup()
    render(<Settings />)
    await user.selectOptions(screen.getByLabelText('Aggregate rule'), 'best_n')
    expect(screen.getByLabelText('Best subject count')).toHaveValue(5)
    await user.selectOptions(screen.getByLabelText('Decimal precision'), '1')
    await user.click(screen.getByRole('button', { name: 'CBSE preset' }))
    const rules = JSON.parse(screen.getByTestId('rules').textContent || '{}')
    expect(rules.decimals).toBe(1)
    expect(rules.grades[0]).toMatchObject({ label: 'A1', points: 10 })
  })
  it('builds a transcript variation and toggles PDF sections', async () => {
    const user = userEvent.setup()
    render(<Designer />)
    await user.click(screen.getByRole('button', { name: /University Transcript/ }))
    expect(screen.getByLabelText('GPA / SGPA')).toBeChecked()
    await user.click(screen.getByLabelText('Document reference QR'))
    const appearance = JSON.parse(screen.getByTestId('appearance').textContent || '{}')
    expect(appearance.design).toBe('university')
    expect(appearance.columns).toContain('credits')
    expect(appearance.sections).toContain('qr')
  })
  it('filters complete merit results without recalculating class ranks', async () => {
    const user = userEvent.setup()
    const prepare = vi.fn()
    const detail: ExamDetail = {
      exam: {
        id: 'exam',
        name: 'Annual',
        sectionId: 's',
        examType: 'ANNUAL',
        rules: { decimals: 2, grades: [{ minimum: 0, label: 'A' }] },
        archived: false,
        subjects: [],
        candidateCount: 1,
      },
      subjects: [],
      marks: [],
      candidates: [
        {
          id: 'c',
          enrollmentId: 'e',
          name: 'Test Student',
          roll: '01',
          admission: 'A01',
          remark: '',
          excludedSubjectIds: [],
        },
      ],
      results: [
        {
          candidateId: 'c',
          examId: 'exam',
          exam: 'Annual',
          rows: [],
          total: '90',
          maximum: '100',
          percentage: '90',
          grade: 'A',
          result: 'Pass',
          missing: 0,
          remark: '',
          gpa: '9',
          division: 'Distinction',
          rank: { position: 2, cohort: 10, display: '2 of 10', policy: 'dense' },
        },
      ],
    }
    render(<ResultAnalytics detail={detail} onReport={prepare} />)
    await user.selectOptions(screen.getByLabelText('Filter results'), 'top')
    expect(screen.getByText('2 of 10')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Prepare marksheet' }))
    expect(prepare).toHaveBeenCalledWith('e')
    await user.selectOptions(screen.getByLabelText('Filter results'), 'failed')
    expect(screen.getByText('No students match these filters.')).toBeInTheDocument()
  })
})

it('protects exported spreadsheet strings from formula injection', () => {
  for (const value of ['=1+1', '+cmd', '@SUM(A1)', '  =HYPERLINK(1)', '\t=1'])
    expect(safeSpreadsheetValue(value)).toBe("'" + value)
  expect(safeSpreadsheetValue('Student')).toBe('Student')
  expect(safeSpreadsheetValue(0)).toBe(0)
})
