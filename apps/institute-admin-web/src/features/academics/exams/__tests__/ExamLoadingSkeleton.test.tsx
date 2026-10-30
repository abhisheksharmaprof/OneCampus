import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import '../../../../bones/exams/registry'
import { ExamLoadingSkeleton } from '../ExamLoadingSkeleton'

describe('exam loading skeletons', () => {
  it('renders registered Boneyard bones for each loading layout', () => {
    for (const kind of ['list', 'form', 'subjects', 'schedule', 'coverage', 'candidates'] as const) {
      const { container } = render(<ExamLoadingSkeleton kind={kind} label={`Loading ${kind}`} />)
      expect(screen.getByRole('status', { name: `Loading ${kind}` })).toBeInTheDocument()
      expect(container.querySelectorAll('[data-boneyard-bone]').length).toBeGreaterThan(0)
      cleanup()
    }
  })
})
