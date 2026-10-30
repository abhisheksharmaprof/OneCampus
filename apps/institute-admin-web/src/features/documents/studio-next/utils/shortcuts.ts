import type { Dispatch } from 'react'
import type { StudioNextAction, StudioNextState } from '../types'

/** Returns true if the event originates inside an editable form element or contentEditable */
export function isInputFocused(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement | null
  if (!target) return false
  const tagName = target.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  )
}

/** Global keyboard shortcut handler for Studio Next */
export function handleStudioShortcuts(
  event: KeyboardEvent,
  state: StudioNextState,
  dispatch: Dispatch<StudioNextAction>,
  onSave?: () => void,
): void {
  const hasMeta = event.metaKey || event.ctrlKey
  const isShift = event.shiftKey

  // Handle Save (Cmd+S / Ctrl+S) even in inputs
  if (hasMeta && event.key.toLowerCase() === 's') {
    event.preventDefault()
    onSave?.()
    return
  }

  // Handle Undo / Redo
  if (hasMeta && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (isShift) {
      dispatch({ type: 'REDO' })
    } else {
      dispatch({ type: 'UNDO' })
    }
    return
  }

  if (hasMeta && event.key.toLowerCase() === 'y') {
    event.preventDefault()
    dispatch({ type: 'REDO' })
    return
  }

  // For remaining shortcuts, guard against active input fields
  if (isInputFocused(event)) return

  // Select All (Cmd+A / Ctrl+A)
  if (hasMeta && event.key.toLowerCase() === 'a') {
    event.preventDefault()
    dispatch({ type: 'SELECT_ALL' })
    return
  }

  // Copy (Cmd+C / Ctrl+C)
  if (hasMeta && event.key.toLowerCase() === 'c') {
    event.preventDefault()
    dispatch({ type: 'COPY_SELECTED' })
    return
  }

  // Paste (Cmd+V / Ctrl+V)
  if (hasMeta && event.key.toLowerCase() === 'v') {
    event.preventDefault()
    dispatch({ type: 'PASTE' })
    return
  }

  // Duplicate (Cmd+D / Ctrl+D)
  if (hasMeta && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    dispatch({ type: 'DUPLICATE_SELECTED' })
    return
  }

  // Delete / Backspace
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (state.selectedElementIds.length > 0) {
      event.preventDefault()
      dispatch({ type: 'DELETE_SELECTED' })
      return
    }
  }

  // Escape to clear selection
  if (event.key === 'Escape') {
    event.preventDefault()
    dispatch({ type: 'CLEAR_SELECTION' })
    return
  }

  // Arrow nudging
  if (
    event.key === 'ArrowUp' ||
    event.key === 'ArrowDown' ||
    event.key === 'ArrowLeft' ||
    event.key === 'ArrowRight'
  ) {
    if (state.selectedElementIds.length > 0) {
      event.preventDefault()
      const step = isShift ? 5 : 1
      let dx = 0
      let dy = 0
      if (event.key === 'ArrowLeft') dx = -step
      if (event.key === 'ArrowRight') dx = step
      if (event.key === 'ArrowUp') dy = -step
      if (event.key === 'ArrowDown') dy = step

      dispatch({ type: 'NUDGE_SELECTED', dxMm: dx, dyMm: dy })
    }
  }
}
