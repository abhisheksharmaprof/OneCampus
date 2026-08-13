import {
  useEffect, useRef, useState,
  type Dispatch, type DragEvent, type KeyboardEvent, type PointerEvent as ReactPointerEvent,
} from 'react'
import { renderElementInner, type RenderContext } from '../engine/renderHtml'
import { PAGE_SIZES_MM, type CanvasElement, type DocumentData } from '../engine/types'
import { defaultElement } from './elementDefaults'
import { computeSnap, type SnapGuide } from './snap'
import type { EditorAction, EditorState } from './useEditorState'

export const PX_PER_MM = 3.7795

const TYPE_LABELS: Record<CanvasElement['type'], string> = {
  text: 'Text', image: 'Image', table: 'Table', totals: 'Totals',
  shape: 'Shape', divider: 'Divider', signature: 'Signature', qr: 'QR code',
}

interface CanvasStageProps {
  state: EditorState
  dispatch: Dispatch<EditorAction>
  data: DocumentData
}

export function CanvasStage({ state, dispatch, data }: CanvasStageProps) {
  const pageRef = useRef<HTMLDivElement>(null)
  const dragCleanupRef = useRef<(() => void) | null>(null)
  const nudgeTimerRef = useRef<number | null>(null)
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)

  // Unmounting mid-drag (or mid-nudge) must not leak window listeners / timers.
  useEffect(() => () => {
    dragCleanupRef.current?.()
    if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current)
  }, [])
  const { layout, activePage, selectedId, zoom, sampleMode } = state
  const size = PAGE_SIZES_MM[layout.page.sizeId]
  const scale = PX_PER_MM * zoom
  const elements = layout.pages[activePage].elements
  const table = layout.pages.flatMap((page) => page.elements).find((element) => element.type === 'table')
  const ctx: RenderContext = {
    data, sampleMode, highlightTokens: true,
    table: table && table.type === 'table' ? { columns: table.columns, rows: data.rows } : null,
  }

  const toMm = (clientX: number, clientY: number) => {
    const rect = pageRef.current!.getBoundingClientRect()
    return { x: (clientX - rect.left) / scale, y: (clientY - rect.top) / scale }
  }

  const startDrag = (event: ReactPointerEvent, element: CanvasElement, mode: 'move' | 'resize') => {
    if (element.locked && mode === 'move') return
    event.preventDefault()
    event.stopPropagation()
    dispatch({ type: 'select', id: element.id })
    const startPointer = { x: event.clientX, y: event.clientY }
    const origin = { x: element.x, y: element.y, w: element.w, h: element.h }
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)

    const onMove = (move: globalThis.PointerEvent) => {
      const dx = (move.clientX - startPointer.x) / scale
      const dy = (move.clientY - startPointer.y) / scale
      if (mode === 'move') {
        const siblings = elements.filter((sibling) => sibling.id !== element.id)
        const snapped = computeSnap(
          { x: origin.x + dx, y: origin.y + dy, w: element.w, h: element.h },
          siblings,
          { w: size.w, h: size.h, margin: layout.page.marginMm },
        )
        setGuides(snapped.guides)
        dispatch({ type: 'moveElement', id: element.id, x: snapped.x, y: snapped.y })
      } else {
        dispatch({ type: 'resizeElement', id: element.id, w: origin.w + dx, h: origin.h + dy })
      }
    }
    const onUp = () => {
      // The captured element may have unmounted mid-drag; never let release abort cleanup.
      if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      dragCleanupRef.current = null
      setGuides([])
      dispatch({ type: 'commit' })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    dragCleanupRef.current = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    const point = toMm(event.clientX, event.clientY)
    const token = event.dataTransfer.getData('application/x-doc-token')
    if (token) {
      const hit = elements.find((element) =>
        element.type === 'text'
        && point.x >= element.x && point.x <= element.x + element.w
        && point.y >= element.y && point.y <= element.y + element.h)
      if (hit && hit.type === 'text') {
        // updateElement is transient — a dropped token is a settled edit, so commit immediately.
        dispatch({ type: 'updateElement', id: hit.id, patch: { content: `${hit.content} {{${token}}}`.trim() } })
        dispatch({ type: 'commit' })
      } else {
        const element = defaultElement('text', data.category)
        if (element.type === 'text') element.content = `{{${token}}}`
        dispatch({ type: 'addElement', element: { ...element, x: point.x, y: point.y, w: 50, h: 8 } })
      }
      return
    }
    const type = event.dataTransfer.getData('application/x-doc-element')
    if (type) {
      const element = defaultElement(type as CanvasElement['type'], data.category)
      dispatch({ type: 'addElement', element: { ...element, x: point.x, y: point.y } })
    }
  }

  const onKeyDown = (event: KeyboardEvent) => {
    if (!selectedId || editingId) return
    const selected = elements.find((element) => element.id === selectedId)
    if (!selected) return
    const step = 1
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      dispatch({ type: 'deleteElement', id: selectedId })
    } else if (event.key === 'Escape') {
      dispatch({ type: 'select', id: null })
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault()
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
      const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
      // Transient move/resize + debounced commit: key-repeat coalesces into one history entry (same as drag).
      if (event.shiftKey) {
        if (selected.locked) return
        dispatch({ type: 'resizeElement', id: selectedId, w: selected.w + dx, h: selected.h + dy })
      } else {
        dispatch({ type: 'moveElement', id: selectedId, x: selected.x + dx, y: selected.y + dy })
      }
      if (nudgeTimerRef.current !== null) window.clearTimeout(nudgeTimerRef.current)
      nudgeTimerRef.current = window.setTimeout(() => {
        nudgeTimerRef.current = null
        dispatch({ type: 'commit' })
      }, 300)
    }
  }

  // Zone tag mirroring the reference: selected header/footer-band elements announce repetition.
  const zoneTagFor = (element: CanvasElement): string | null => {
    if (layout.zones.headerMm > 0 && element.y < layout.zones.headerMm) {
      return layout.zones.repeatHeader ? '↑ header · every page' : '↑ header'
    }
    if (layout.zones.footerMm > 0 && element.y + element.h > size.h - layout.zones.footerMm) {
      return layout.zones.repeatFooter ? '↓ footer · every page' : '↓ footer'
    }
    return null
  }

  const backgroundStyle = typeof layout.page.background === 'string'
    ? { background: layout.page.background }
    : { backgroundImage: `url(${layout.page.background.imageUrl})`, backgroundSize: 'cover' }

  return (
    <div className="stu-stage" tabIndex={0} onKeyDown={onKeyDown}>
      <div className="stu-page-note">
        {layout.page.sizeId} · {size.w}×{size.h}mm
        {layout.pages.length > 1 && (
          <span className="stu-page-tabs">
            {layout.pages.map((_page, index) => (
              <button key={index} type="button" className={index === activePage ? 'is-active' : ''}
                onClick={() => dispatch({ type: 'setActivePage', page: index })}>
                {index === 0 ? 'Front' : 'Back'}
              </button>
            ))}
          </span>
        )}
      </div>
      <div
        ref={pageRef}
        className="stu-page"
        style={{ width: size.w * scale, height: size.h * scale, ...backgroundStyle }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        onPointerDown={(event) => { if (event.target === pageRef.current) dispatch({ type: 'select', id: null }) }}
      >
        {layout.watermark.enabled && (
          <div className="stu-watermark">
            {layout.watermark.mode === 'text'
              ? <span style={{ opacity: layout.watermark.opacity }}>{layout.watermark.text}</span>
              : layout.watermark.imageUrl && <img src={layout.watermark.imageUrl} style={{ opacity: layout.watermark.opacity * 4 }} alt="" />}
          </div>
        )}
        {layout.zones.headerMm > 0 && (
          <div className="stu-zone stu-zone--header" style={{ height: layout.zones.headerMm * scale }}>
            <span>Header{layout.zones.repeatHeader ? ' · repeats on every page' : ''}</span>
          </div>
        )}
        {layout.zones.footerMm > 0 && (
          <div className="stu-zone stu-zone--footer" style={{ height: layout.zones.footerMm * scale }}>
            <span>Footer{layout.zones.repeatFooter ? ' · repeats on every page' : ''}</span>
          </div>
        )}
        {guides.map((guide, index) => guide.orientation === 'v'
          ? <div key={index} className="stu-guide stu-guide--v" style={{ left: guide.positionMm * scale }} />
          : <div key={index} className="stu-guide stu-guide--h" style={{ top: guide.positionMm * scale }} />)}
        {elements.map((element) => (
          <div
            key={element.id}
            aria-label={TYPE_LABELS[element.type]}
            data-typelabel={TYPE_LABELS[element.type]}
            className={`stu-el${element.id === selectedId ? ' is-selected' : ''}${element.locked ? ' is-locked' : ''}`}
            style={{ left: element.x * scale, top: element.y * scale, width: element.w * scale, height: element.h * scale }}
            onPointerDown={(event) => startDrag(event, element, 'move')}
            onDoubleClick={() => { if (element.type === 'text' && !element.locked) setEditingId(element.id) }}
          >
            {editingId === element.id && element.type === 'text' ? (
              <textarea
                className="stu-inline-edit"
                autoFocus
                defaultValue={element.content}
                onBlur={(event) => {
                  // updateElement is transient — inline-edit settles on blur, so commit on the same blur.
                  dispatch({ type: 'updateElement', id: element.id, patch: { content: event.target.value } })
                  dispatch({ type: 'commit' })
                  setEditingId(null)
                }}
              />
            ) : (
              <div
                className="stu-el-inner"
                style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', width: element.w * PX_PER_MM, height: element.h * PX_PER_MM }}
                dangerouslySetInnerHTML={{ __html: renderElementInner(element, ctx) }}
              />
            )}
            {element.id === selectedId && zoneTagFor(element) && (
              <span className="stu-zonetag">{zoneTagFor(element)}</span>
            )}
            {element.id === selectedId && !element.locked && (
              <div className="stu-resize" onPointerDown={(event) => startDrag(event, element, 'resize')} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
