import { cloneElement, type HTMLAttributes, type ReactElement, type ReactNode } from 'react'

export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
  'aria-required'?: true
}

export interface FormFieldProps {
  id: string
  label: ReactNode
  children: ReactElement<HTMLAttributes<HTMLElement>> | ((props: FieldControlProps) => ReactNode)
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  className?: string
}

export function FormField({ id, label, children, hint, error, required, className = '' }: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  const controlProps: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required ? true : undefined,
  }
  return (
    <div className={`admin-form-field ${error ? 'admin-form-field--invalid' : ''} ${className}`.trim()}>
      <label htmlFor={id}>{label}{required ? <span className="admin-required" aria-hidden="true"> *</span> : null}</label>
      {typeof children === 'function' ? children(controlProps) : cloneElement(children, controlProps)}
      {hint ? <div className="admin-form-field__hint" id={hintId}>{hint}</div> : null}
      {error ? <div className="admin-form-field__error" id={errorId}>{error}</div> : null}
    </div>
  )
}

export interface FormError {
  fieldId: string
  message: string
  label?: string
}

export function ErrorSummary({ errors, title = 'Please fix the following errors' }: { errors: readonly FormError[]; title?: string }) {
  if (!errors.length) return null
  const focusField = (fieldId: string) => {
    document.getElementById(fieldId)?.focus()
  }
  return (
    <div className="admin-error-summary" role="alert" tabIndex={-1}>
      <h2>{title}</h2>
      <ul>
        {errors.map((error) => (
          <li key={`${error.fieldId}-${error.message}`}>
            <a href={`#${error.fieldId}`} onClick={(event) => { event.preventDefault(); focusField(error.fieldId) }}>
              {error.label ? `${error.label}: ` : ''}{error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
