import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmationDialog, Modal } from '../Modal'
import { Tabs, type TabItem } from '../Tabs'

function ModalHarness() {
  const [open, setOpen] = useState(false)
  return <><button type="button" onClick={() => setOpen(true)}>Open editor</button><Modal open={open} title="Edit student" description="Update the student record." onClose={() => setOpen(false)} footer={<button type="button">Save</button>}><label>Name<input /></label></Modal></>
}

describe('Modal and ConfirmationDialog', () => {
  it('moves focus inside, closes on Escape, and restores trigger focus', async () => {
    const user = userEvent.setup()
    render(<ModalHarness />)
    const trigger = screen.getByRole('button', { name: 'Open editor' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Edit student' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    expect(document.body).toHaveStyle({ overflow: 'hidden' })
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
    expect(document.body.style.overflow).toBe('')
  })

  it('traps Tab focus and presents the concrete consequence before destructive confirmation', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onConfirm = vi.fn()
    render(<ConfirmationDialog open title="Deactivate branch?" consequence="This removes staff access to Jaipur immediately." confirmLabel="Deactivate branch" onCancel={onCancel} onConfirm={onConfirm} />)
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(cancel).toHaveFocus()
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('This removes staff access to Jaipur immediately.')
    await user.tab({ shift: true })
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'Deactivate branch' }))
    expect(onConfirm).toHaveBeenCalledOnce()
  })
})

const tabs: TabItem[] = [
  { id: 'overview', label: 'Overview', panel: <p>Overview panel</p> },
  { id: 'documents', label: 'Documents', panel: <p>Documents panel</p>, href: '/students/1/documents' },
  { id: 'billing', label: 'Billing', panel: <p>Billing panel</p>, disabled: true },
]

function TabsHarness() {
  const [activeId, setActiveId] = useState('overview')
  return <Tabs label="Student details" tabs={tabs} activeId={activeId} onChange={setActiveId} />
}

describe('Tabs', () => {
  it('exposes tab semantics and supports arrow-key navigation', async () => {
    const user = userEvent.setup()
    render(<TabsHarness />)
    const overview = screen.getByRole('tab', { name: 'Overview' })
    overview.focus()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveFocus()
    expect(screen.getByRole('tab', { name: 'Documents' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Documents panel')
    expect(screen.getByRole('tab', { name: 'Billing' })).toBeDisabled()
  })
})
