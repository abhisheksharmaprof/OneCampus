import { useState, type Dispatch } from 'react'
import { CATEGORY_CONFIG } from '../engine/datasets'
import type { DocumentCategory, ElementType } from '../engine/types'
import { defaultElement } from './elementDefaults'
import type { EditorAction, EditorState } from './useEditorState'

const PALETTE: { type: ElementType; label: string; icon: string }[] = [
  { type: 'text', label: 'Text', icon: 'T' },
  { type: 'image', label: 'Logo / image', icon: '▣' },
  { type: 'table', label: 'Table', icon: '▤' },
  { type: 'totals', label: 'Totals', icon: 'Σ' },
  { type: 'shape', label: 'Shape / band', icon: '▭' },
  { type: 'divider', label: 'Divider line', icon: '—' },
  { type: 'signature', label: 'Signature', icon: '✒' },
  { type: 'qr', label: 'QR code', icon: '▦' },
]

interface ComponentRailProps {
  category: DocumentCategory
  state: EditorState
  dispatch: Dispatch<EditorAction>
}

export function ComponentRail({ category, state, dispatch }: ComponentRailProps) {
  const [search, setSearch] = useState('')
  const hasTable = state.layout.pages.some((page) => page.elements.some((element) => element.type === 'table'))
  const selected = state.layout.pages[state.activePage].elements.find((element) => element.id === state.selectedId)

  const addToken = (token: string) => {
    if (selected?.type === 'text') {
      dispatch({ type: 'updateElement', id: selected.id, patch: { content: `${selected.content} {{${token}}}`.trim() } })
      return
    }
    const element = defaultElement('text', category)
    if (element.type === 'text') element.content = `{{${token}}}`
    dispatch({ type: 'addElement', element: { ...element, w: 50, h: 8 } })
  }

  return (
    <div className="stu-rail">
      <h4>Drag onto page</h4>
      {PALETTE.map((item) => {
        const disabled = item.type === 'table' && (hasTable || !CATEGORY_CONFIG[category].datasets.length)
        return (
          <div
            key={item.type}
            className={`stu-comp${disabled ? ' is-disabled' : ''}`}
            draggable={!disabled}
            onDragStart={(event) => event.dataTransfer.setData('application/x-doc-element', item.type)}
            onClick={() => { if (!disabled) dispatch({ type: 'addElement', element: defaultElement(item.type, category) }) }}
          >
            <span className="ic">{item.icon}</span>
            <span>{item.label}</span>
            {item.type === 'table' && hasTable && <span style={{ marginLeft: 'auto', fontSize: 10 }}>added ✓</span>}
          </div>
        )
      })}
      <h4>Merge fields</h4>
      <input
        className="stu-search"
        placeholder="Search fields…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      {CATEGORY_CONFIG[category].tokenGroups.map((group) => {
        const fields = group.fields.filter((field) => field.toLowerCase().includes(search.toLowerCase()))
        if (!fields.length) return null
        return (
          <div key={group.source}>
            <div className="stu-token-src">{group.source}</div>
            {fields.map((field) => (
              <span
                key={field}
                className="stu-token"
                draggable
                onDragStart={(event) => event.dataTransfer.setData('application/x-doc-token', field)}
                onClick={() => addToken(field)}
              >
                {field}
              </span>
            ))}
          </div>
        )
      })}
    </div>
  )
}
