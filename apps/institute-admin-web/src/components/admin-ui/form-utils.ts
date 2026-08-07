import type { FormEvent } from 'react'

export function focusErrorSummary(event: FormEvent<HTMLFormElement>) {
  const summary = event.currentTarget.querySelector<HTMLElement>('.admin-error-summary')
  requestAnimationFrame(() => summary?.focus())
}
