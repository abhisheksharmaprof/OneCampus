import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, type MouseEvent, type ReactNode, type RefObject } from 'react'

export type ModalCloseReason = 'escape' | 'backdrop' | 'close-button' | 'cancel' | 'confirm'

export interface ModalProps {
  open: boolean
  title: ReactNode
  children: ReactNode
  onClose: (reason: ModalCloseReason) => void
  description?: ReactNode
  footer?: ReactNode
  closeLabel?: string
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  initialFocusRef?: RefObject<HTMLElement | null>
  size?: 'small' | 'medium' | 'large'
}

const focusableSelector = [
  'a[href]', 'button:not([disabled])', 'input:not([disabled])', 'select:not([disabled])',
  'textarea:not([disabled])', '[tabindex]:not([tabindex="-1"])',
].join(',')

export function Modal({ open, title, children, onClose, description, footer, closeLabel = 'Close dialog', closeOnBackdrop = true, closeOnEscape = true, initialFocusRef, size = 'medium' }: ModalProps) {
  const titleId = useId()
  const descriptionId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose }, [onClose])

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const dialog = dialogRef.current
    const focusTarget = initialFocusRef?.current ?? dialog?.querySelector<HTMLElement>(focusableSelector) ?? dialog
    focusTarget?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        onCloseRef.current('escape')
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [closeOnEscape, initialFocusRef, open])

  if (!open) return null
  const handleBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose('backdrop')
  }
  return createPortal(
    <div className="admin-modal-backdrop" onMouseDown={handleBackdrop}>
      <div className={`admin-modal admin-modal--${size}`} ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} tabIndex={-1}>
        <header className="admin-modal__header">
          <div><h2 id={titleId}>{title}</h2>{description ? <div className="admin-modal__description" id={descriptionId}>{description}</div> : null}</div>
          <button className="admin-icon-button" type="button" aria-label={closeLabel} onClick={() => onClose('close-button')}><X aria-hidden="true" /></button>
        </header>
        <div className="admin-modal__body">{children}</div>
        {footer ? <footer className="admin-modal__footer">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export interface ConfirmationDialogProps {
  open: boolean
  title: string
  consequence: ReactNode
  confirmLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  destructive?: boolean
  cancelLabel?: string
}

export function ConfirmationDialog({ open, title, consequence, confirmLabel, onConfirm, onCancel, busy = false, destructive = true, cancelLabel = 'Cancel' }: ConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Modal
      open={open}
      title={title}
      description={consequence}
      size="small"
      initialFocusRef={cancelRef}
      closeOnBackdrop={!busy}
      closeOnEscape={!busy}
      onClose={(reason) => { if (!busy && reason !== 'confirm') onCancel() }}
      footer={<><button ref={cancelRef} className="admin-button admin-button--secondary" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button><button className={`admin-button ${destructive ? 'admin-button--danger' : 'admin-button--primary'}`} type="button" disabled={busy} onClick={onConfirm}>{busy ? 'Working…' : confirmLabel}</button></>}
    >
      <p className="admin-confirmation-copy">Review the consequence above before continuing.</p>
    </Modal>
  )
}
