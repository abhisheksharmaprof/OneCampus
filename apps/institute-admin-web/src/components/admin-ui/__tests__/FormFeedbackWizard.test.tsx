import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorState, LoadingState, ToastProvider } from '../Feedback'
import { ErrorSummary, FormField } from '../Form'
import { useToast } from '../toast-context'
import { WizardActions, WizardStepper } from '../WizardStepper'

function ToastTrigger() {
  const { addToast } = useToast()
  return <button type="button" onClick={() => addToast({ title: 'Saved', message: 'Student changes saved.', duration: 1000 })}>Save</button>
}

describe('forms and feedback', () => {
  it('associates field errors and lets the error summary focus the invalid control', async () => {
    const user = userEvent.setup()
    render(<><ErrorSummary errors={[{ fieldId: 'email', label: 'Email', message: 'Enter a valid address' }]} /><FormField id="email" label="Email" hint="Use a work address" error="Enter a valid address" required><input type="email" /></FormField></>)
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Use a work address Enter a valid address')
    await user.click(screen.getByRole('link', { name: /email: enter a valid address/i }))
    expect(input).toHaveFocus()
  })

  it('announces and auto-dismisses toasts, while keeping state feedback accessible', () => {
    vi.useFakeTimers()
    render(<ToastProvider><ToastTrigger /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('status')).toHaveTextContent('SavedStudent changes saved.')
    act(() => vi.advanceTimersByTime(1000))
    expect(screen.queryByText('Student changes saved.')).not.toBeInTheDocument()
    vi.useRealTimers()

    const retry = vi.fn()
    render(<><LoadingState label="Loading branches" /><ErrorState message="Could not load branches" onRetry={retry} /></>)
    expect(screen.getByRole('status', { name: 'Loading branches' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledOnce()
  })
})

describe('WizardStepper', () => {
  it('marks progress semantically, allows completed-step navigation, and exposes sticky actions', async () => {
    const user = userEvent.setup()
    const changeStep = vi.fn()
    render(<><WizardStepper steps={[{ id: 'details', label: 'Details' }, { id: 'review', label: 'Review' }, { id: 'submit', label: 'Submit' }]} currentStep={1} onStepChange={changeStep} /><WizardActions status="Draft saved"><button type="button">Back</button><button type="button">Next</button></WizardActions></>)
    expect(screen.getByText('Review').closest('[aria-current="step"]')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /details/i }))
    expect(changeStep).toHaveBeenCalledWith(0)
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Draft saved')
    expect(screen.getByText('Draft saved').closest('footer')).toHaveClass('admin-wizard-actions--sticky')
  })
})
