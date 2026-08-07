import type { ReactNode } from 'react'

export interface WizardStep {
  id: string
  label: string
  description?: string
}

export interface WizardStepperProps {
  steps: readonly WizardStep[]
  currentStep: number
  onStepChange?: (index: number) => void
  allowCompletedNavigation?: boolean
  label?: string
}

export function WizardStepper({ steps, currentStep, onStepChange, allowCompletedNavigation = true, label = 'Progress' }: WizardStepperProps) {
  return (
    <nav className="admin-wizard-stepper" aria-label={label}>
      <ol>
        {steps.map((step, index) => {
          const isCurrent = index === currentStep
          const isComplete = index < currentStep
          const canNavigate = Boolean(onStepChange && (isCurrent || (isComplete && allowCompletedNavigation)))
          const content = <><span className="admin-wizard-stepper__number" aria-hidden="true">{isComplete ? '✓' : index + 1}</span><span><strong>{step.label}</strong>{step.description ? <small>{step.description}</small> : null}</span></>
          return (
            <li className={`${isCurrent ? 'is-current' : ''} ${isComplete ? 'is-complete' : ''}`.trim()} key={step.id}>
              {canNavigate ? <button type="button" aria-current={isCurrent ? 'step' : undefined} onClick={() => onStepChange?.(index)}>{content}</button> : <div aria-current={isCurrent ? 'step' : undefined}>{content}</div>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function WizardActions({ children, sticky = true, status }: { children: ReactNode; sticky?: boolean; status?: ReactNode }) {
  return <footer className={`admin-wizard-actions ${sticky ? 'admin-wizard-actions--sticky' : ''}`.trim()}>{status ? <div className="admin-wizard-actions__status" role="status">{status}</div> : null}<div className="admin-wizard-actions__buttons">{children}</div></footer>
}
