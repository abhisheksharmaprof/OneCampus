import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StudioV5 } from './StudioV5'
import { evaluateExpression } from './studio/expression.js'
import { renderStudioImage } from './studio/render'
import reference from './studio/reference.html?raw'
import type { Section } from './results.api'
const { request } = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('./results.api', async () => {
  const actual = await vi.importActual<typeof import('./results.api')>('./results.api')
  return { ...actual, resultsRequest: request }
})
const section: Section = {
  id: 'section',
  name: '8 A',
  gradeId: 'grade',
  grade: '8',
  section: 'A',
  yearId: 'year',
  year: '2026-27',
  current: true,
  branchId: 'branch',
  branch: 'Main',
  subjects: [],
  terms: [],
}

describe('original v5 studio integration', () => {
  it('rejects oversized or invalid rendering requests before creating a document', async () => {
    for (const width of [0, 2500, NaN, Infinity])
      await expect(renderStudioImage('<div>Report</div>', '', width)).rejects.toThrow()
    await expect(renderStudioImage('x'.repeat(8000001), '', 820)).rejects.toThrow()
    expect(document.querySelector('iframe[title="Preparing marksheet export"]')).toBeNull()
  })
  it('evaluates arithmetic without executing workbook code', () => {
    expect(evaluateExpression('ROUND(SUM / MAX_SUM * 100, 2)', { SUM: 548, MAX_SUM: 600 })).toBe(
      91.33,
    )
    expect(
      evaluateExpression('((SUM-MIN)/(MAX_SUM-MAX_SUM/COUNT))*100', {
        SUM: 500,
        MIN: 50,
        MAX_SUM: 600,
        COUNT: 6,
      }),
    ).toBe(90)
    for (const source of [
      'window.localStorage',
      'alert(1)',
      'SUM.constructor',
      '2**100',
      '1/0',
      'ROUND(1,100)',
      '(()=>1)()',
    ])
      expect(() => evaluateExpression(source, {})).toThrow()
  })
  it('retains all layouts, paper modes, gazette and export implementations from the source', () => {
    for (const feature of [
      'buildStudentMarksheetHtml',
      'buildMeritCertificateBannerHtml',
      'buildGazetteHtml',
      'exportCurrentMarksheetImage',
      'exportCurrentStudentPdf',
      'exportBatchPdfZip',
      'exportCurrentStudentWord',
      'exportCurrentStudentHtml',
      'exportGazetteImage',
      'exportGazettePdf',
      'exportGazetteWord',
      'downloadGazetteHtml',
      'shareViaWhatsApp',
      'shareViaEmail',
      'moveStudentRowOrder',
      'moveSectionOrder',
      'moveSubjectOrder',
      'scanDataAnomalies',
      'autoFixDataAnomalies',
      'applySubjectModeration',
    ])
      expect(reference).toContain(`function ${feature}(`)
    for (const label of [
      'Classic Board',
      'Modern Executive',
      'University Transcript',
      'Royal Heritage',
      'Bilingual (English + हिन्दी)',
      'A5 Compact (148',
      'US Legal (8.5',
      'A3 (297',
      'B5 Academic (176',
    ])
      expect(reference).toContain(label)
  })
  it('isolates the original document and accepts readiness only from its own frame channel', async () => {
    request.mockImplementation((_: string, path: string) =>
      Promise.resolve(
        path.startsWith('studio/workspaces')
          ? []
          : { instName: 'Test School', instAddr: 'Campus', primaryColor: '#3456a6' },
      ),
    )
    const dirty = vi.fn()
    render(<StudioV5 token="token" section={section} examId="exam" onDirty={dirty} />)
    const iframe = screen.getByTitle('Marksheet Studio Pro v5 exact reference') as HTMLIFrameElement
    expect(iframe.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(screen.getByRole('button', { name: 'Load selected exam' })).toBeDisabled()
    const channel = new URLSearchParams(new URL(iframe.src).hash.slice(1)).get('channel')
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'null',
        source: iframe.contentWindow,
        data: { type: 'studio:ready', channel: 'wrong', students: 999 },
      }),
    )
    expect(screen.getByRole('button', { name: 'Load selected exam' })).toBeDisabled()
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'null',
        source: iframe.contentWindow,
        data: { type: 'studio:ready', channel, students: 12 },
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Load selected exam' })).toBeEnabled(),
    )
    fireEvent(
      window,
      new MessageEvent('message', {
        origin: 'null',
        source: iframe.contentWindow,
        data: { type: 'studio:dirty', channel },
      }),
    )
    expect(dirty).toHaveBeenCalledWith(true)
  })
})
