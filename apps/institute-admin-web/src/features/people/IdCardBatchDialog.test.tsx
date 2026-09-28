import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IdCardBatchDialog } from './IdCardBatchDialog'
import { defaultLayout } from '../documents/engine/types'

const mocks = vi.hoisted(() => ({
  listDocumentTemplates: vi.fn(),
  preflightIdCards: vi.fn(),
  prepareCardBatch: vi.fn(),
  openPrintWindow: vi.fn(),
  renderCardCalibration: vi.fn(),
}))

vi.mock('../documents/documents.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../documents/documents.api')>()),
  listDocumentTemplates: mocks.listDocumentTemplates,
  preflightIdCards: mocks.preflightIdCards,
}))
vi.mock('../documents/engine/idCardBatchRender', () => ({
  prepareCardBatch: mocks.prepareCardBatch,
  renderCardCalibration: mocks.renderCardCalibration,
}))
vi.mock('../documents/engine/docRender', () => ({ openPrintWindow: mocks.openPrintWindow }))

const template = {
  id: 'template-1', name: 'Student card', category: 'ID_CARD' as const, layout: defaultLayout('CR80', 2), isDefault: false, createdAt: '2026-09-23T00:00:00Z',
  publishedVersion: { id: 'version-1', name: 'Term 1 cards', version: 3 },
}
const html = '<!doctype html><html><body><main>Current card batch</main></body></html>'
const ready = (fingerprint = 'fingerprint-a') => ({
  ready: true, fingerprint, templateVersionId: 'version-1', templateName: 'Term 1 cards', version: 3, layout: defaultLayout('CR80', 2),
  students: [{ studentId: 'student-1', name: 'Aarav Shah', admissionNumber: 'A-001', issues: [], missingPhoto: false, tokens: { student_id: 'student-1' }, images: {} }],
})
const failed = () => ({
  ready: false, fingerprint: 'failure', templateVersionId: 'version-1', templateName: 'Term 1 cards', version: 3, layout: null,
  students: [{ studentId: 'student-1', name: 'Aarav Shah', admissionNumber: 'A-001', issues: ['Student photograph is required.'], missingPhoto: true }],
})

function renderDialog(props: Partial<Parameters<typeof IdCardBatchDialog>[0]> = {}) {
  const onClose = vi.fn()
  const onRemove = vi.fn()
  const rendered = render(<IdCardBatchDialog open onClose={onClose} accessToken="token" studentIds={['student-1']} onRemove={onRemove} {...props} />)
  return { ...rendered, onClose, onRemove }
}

async function choosePublishedVersion(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByRole('combobox', { name: /published id-card version/i }), 'version-1')
}

async function preflightReady(user: ReturnType<typeof userEvent.setup>) {
  await choosePublishedVersion(user)
  await user.click(screen.getByRole('button', { name: /check selected students/i }))
  await screen.findByRole('heading', { name: /preview ready/i })
}

describe('IdCardBatchDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.listDocumentTemplates.mockResolvedValue({ items: [template] })
    mocks.preflightIdCards.mockResolvedValue(ready())
    mocks.prepareCardBatch.mockResolvedValue(html)
    mocks.openPrintWindow.mockReturnValue(true)
    mocks.renderCardCalibration.mockReturnValue('<html></html>')
    vi.spyOn(window, 'open').mockReturnValue({ opener: null, close: vi.fn() } as unknown as Window)
  })

  it('requires an explicit published version before preflight', async () => {
    const user = userEvent.setup()
    renderDialog()
    const check = await screen.findByRole('button', { name: /check selected students/i })
    expect(check).toBeDisabled()
    await choosePublishedVersion(user)
    expect(check).toBeEnabled()
  })

  it('invalidates preflight when the photo-placeholder acknowledgement changes', async () => {
    const user = userEvent.setup()
    renderDialog()
    await preflightReady(user)
    expect(screen.getByRole('button', { name: /print front and back sheets/i })).toBeEnabled()
    await user.click(screen.getByRole('checkbox', { name: /initials placeholder/i }))
    expect(screen.queryByRole('heading', { name: /preview ready/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print front and back sheets/i })).toBeDisabled()
  })

  it('shows preflight failures per student and removes a failed student', async () => {
    const user = userEvent.setup()
    mocks.preflightIdCards.mockResolvedValueOnce(failed())
    const { onRemove } = renderDialog()
    await choosePublishedVersion(user)
    await user.click(screen.getByRole('button', { name: /check selected students/i }))
    const results = await screen.findByRole('region', { name: /student preflight results/i })
    expect(within(results).getByText('Student photograph is required.')).toBeInTheDocument()
    await user.click(within(results).getByRole('button', { name: /remove aarav shah from batch/i }))
    expect(onRemove).toHaveBeenCalledWith('student-1')
    expect(screen.queryByRole('region', { name: /student preflight results/i })).not.toBeInTheDocument()
  })

  it('renders a sandboxed A4 front and back preview after successful preflight', async () => {
    const user = userEvent.setup()
    renderDialog()
    await preflightReady(user)
    const preview = screen.getByTitle('A4 front and back ID card sheets preview')
    expect(preview).toHaveAttribute('sandbox', '')
    expect(preview).toHaveAttribute('srcdoc', html)
    expect(screen.getByText(/review this exact batch before printing/i)).toBeInTheDocument()
  })

  it('refreshes the preview and requires another explicit review if the server fingerprint changes', async () => {
    const user = userEvent.setup()
    mocks.preflightIdCards.mockResolvedValueOnce(ready('first')).mockResolvedValueOnce(ready('changed')).mockResolvedValueOnce(ready('changed'))
    renderDialog()
    await preflightReady(user)
    await user.click(screen.getByRole('button', { name: /print front and back sheets/i }))
    await screen.findByRole('status')
    expect(mocks.openPrintWindow).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent(/batch changed/i)
    await user.click(screen.getByRole('button', { name: /print front and back sheets/i }))
    expect(screen.getByRole('status')).toHaveTextContent(/refreshed preview reviewed/i)
    await user.click(screen.getByRole('button', { name: /print front and back sheets/i }))
    await waitFor(() => expect(mocks.openPrintWindow).toHaveBeenCalledWith(html, expect.anything()))
  })

  it('ignores a stale preflight response after the dialog closes', async () => {
    const user = userEvent.setup()
    let resolvePreflight!: (value: ReturnType<typeof ready>) => void
    mocks.preflightIdCards.mockReturnValueOnce(new Promise((resolve) => { resolvePreflight = resolve }))
    const { onClose } = renderDialog()
    await choosePublishedVersion(user)
    await user.click(screen.getByRole('button', { name: /check selected students/i }))
    await user.click(screen.getByRole('button', { name: /close dialog/i }))
    resolvePreflight(ready())
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(screen.queryByTitle('A4 front and back ID card sheets preview')).not.toBeInTheDocument()
  })
})
