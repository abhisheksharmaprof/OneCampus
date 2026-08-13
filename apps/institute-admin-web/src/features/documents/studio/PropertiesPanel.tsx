import { useState, type Dispatch } from 'react'
import { CATEGORY_CONFIG } from '../engine/datasets'
import { computeTableRows } from '../engine/formula'
import type {
  CanvasElement, DocumentCategory, DocumentData, PageSizeId,
  TableColumn, TableElement, TotalsElement, TotalsRow,
} from '../engine/types'
import type { EditorAction, EditorState } from './useEditorState'

const SWATCHES = ['#16212E', '#173A5E', '#9A5B12', '#C0392B', '#137A4B', '#7C4EA6', '#E8EEF5', '#FFFFFF']

interface PropertiesPanelProps {
  category: DocumentCategory
  state: EditorState
  dispatch: Dispatch<EditorAction>
  data: DocumentData
}

export function PropertiesPanel({ category, state, dispatch, data }: PropertiesPanelProps) {
  const [tab, setTab] = useState<'element' | 'page'>('element')
  const selected = state.layout.pages[state.activePage].elements.find(
    (element) => element.id === state.selectedId,
  )

  return (
    <div className="stu-props">
      <div className="stu-ptabs">
        <button type="button" className={tab === 'element' ? 'is-active' : ''} onClick={() => setTab('element')}>Element</button>
        <button type="button" className={tab === 'page' ? 'is-active' : ''} onClick={() => setTab('page')}>Page</button>
      </div>
      <div className="stu-pbody">
        {tab === 'element'
          ? (selected
            ? <ElementForm element={selected} dispatch={dispatch} data={data} />
            : <p className="stu-empty"><b>Nothing selected.</b><br />Click a block on the page, or drag a component from the left rail.</p>)
          : <PageForm category={category} state={state} dispatch={dispatch} />}
      </div>
    </div>
  )
}

function ElementForm({ element, dispatch, data }: { element: CanvasElement; dispatch: Dispatch<EditorAction>; data: DocumentData }) {
  const patch = (values: Partial<CanvasElement>) =>
    dispatch({ type: 'updateElement', id: element.id, patch: values })

  return (
    <div>
      {element.type === 'text' && (
        <>
          <div className="stu-field">
            <label>Content — use {'{{token}}'} for merge fields</label>
            <textarea rows={3} value={element.content} onChange={(event) => patch({ content: event.target.value })} />
          </div>
          <div className="stu-row2">
            <div className="stu-field">
              <label>Font size</label>
              <input type="number" min={5} max={72} value={element.style.fontSize}
                onChange={(event) => patch({ style: { ...element.style, fontSize: Number(event.target.value) || 12 } })} />
            </div>
            <div className="stu-field">
              <label>Align</label>
              <select value={element.style.align}
                onChange={(event) => patch({ style: { ...element.style, align: event.target.value as 'left' | 'center' | 'right' } })}>
                <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
              </select>
            </div>
          </div>
          <div className="stu-row2">
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={element.style.bold}
              onChange={(event) => patch({ style: { ...element.style, bold: event.target.checked } })} /> Bold</label>
            <label style={{ fontSize: 12 }}><input type="checkbox" checked={element.style.italic}
              onChange={(event) => patch({ style: { ...element.style, italic: event.target.checked } })} /> Italic</label>
          </div>
          <ColorField label="Colour" value={element.style.color}
            onPick={(color) => patch({ style: { ...element.style, color } })} />
        </>
      )}

      {element.type === 'image' && (
        <>
          <div className="stu-infobox">Symbolic sources pull live from the ERP: <b>institute-logo</b> (Branding), <b>student-photo</b>, <b>staff-photo</b>. Or paste an image URL.</div>
          <div className="stu-field" style={{ marginTop: 10 }}>
            <label>Source</label>
            <input value={element.src} onChange={(event) => patch({ src: event.target.value })} />
          </div>
          <div className="stu-field">
            <label>Fallback initials</label>
            <input value={element.fallbackInitials} maxLength={3}
              onChange={(event) => patch({ fallbackInitials: event.target.value })} />
          </div>
        </>
      )}

      {element.type === 'table' && <TableForm element={element} patch={patch} data={data} />}
      {element.type === 'totals' && <TotalsForm element={element} patch={patch} />}

      {element.type === 'shape' && (
        <ColorField label="Fill" value={element.fill} onPick={(fill) => patch({ fill })} />
      )}
      {element.type === 'divider' && (
        <ColorField label="Line colour" value={element.stroke} onPick={(stroke) => patch({ stroke })} />
      )}
      {element.type === 'signature' && (
        <div className="stu-field"><label>Label</label>
          <input value={element.label} onChange={(event) => patch({ label: event.target.value })} /></div>
      )}
      {element.type === 'qr' && (
        <>
          <div className="stu-infobox">The verify URL embeds the document's data — scanning renders it even if the database is unreachable. "Document number" encodes just the number for internal scanning.</div>
          <div className="stu-field" style={{ marginTop: 10 }}>
            <label>Encodes</label>
            <select value={element.encode} onChange={(event) => patch({ encode: event.target.value as 'verify-url' | 'document-number' })}>
              <option value="verify-url">Verify URL (self-contained data)</option>
              <option value="document-number">Document number only</option>
            </select>
          </div>
        </>
      )}

      <div className="stu-field">
        <label>Position & size (mm)</label>
        <div className="stu-row4">
          {(['x', 'y', 'w', 'h'] as const).map((key) => (
            <input key={key} type="number" value={Math.round(element[key] * 10) / 10} aria-label={key.toUpperCase()}
              onChange={(event) => patch({ [key]: Number(event.target.value) || 0 })} />
          ))}
        </div>
      </div>
      <label style={{ fontSize: 12 }}>
        <input type="checkbox" checked={Boolean(element.locked)} onChange={(event) => patch({ locked: event.target.checked })} /> Lock element
      </label>
      <div className="stu-actions">
        <button type="button" className="stu-btn" onClick={() => dispatch({ type: 'duplicateElement', id: element.id })} disabled={element.type === 'table'}>Duplicate</button>
        <button type="button" className="stu-btn stu-danger" onClick={() => dispatch({ type: 'deleteElement', id: element.id })}>Delete</button>
      </div>
    </div>
  )
}

function TableForm({ element, patch, data }: { element: TableElement; patch: (values: Partial<CanvasElement>) => void; data: DocumentData }) {
  const setColumns = (columns: TableColumn[]) => patch({ columns })
  const previewRows = computeTableRows(element.columns, data.rows)
  const quickFormulas: [string, string][] = element.datasetId === 'marks'
    ? [['Grade', '=IF([Marks]>=91,"A1",IF([Marks]>=81,"A2","B1"))'], ['Rank', '=RANK([Marks])'], ['Percentile', '=PERCENTILE([Marks])']]
    : [['Amount', '=[Qty]*[Rate]'], ['Amount w/ tax', '=[Qty]*[Rate]*1.18']]

  return (
    <>
      <div className="stu-infobox" style={{ marginBottom: 10 }}>
        Formulas work like a spreadsheet — reference columns as <b>[Column name]</b>; use SUM, IF, RANK, PERCENTILE, AVG, ROUND.
      </div>
      <div className="stu-field"><label>Columns</label></div>
      {element.columns.map((column, index) => (
        <div className="stu-colcard" key={column.id}>
          <div className="top">
            <input value={column.label} onChange={(event) =>
              setColumns(element.columns.map((candidate, position) => position === index ? { ...candidate, label: event.target.value } : candidate))} />
            <select value={column.type} onChange={(event) =>
              setColumns(element.columns.map((candidate, position) => position === index
                ? { ...candidate, type: event.target.value as 'data' | 'formula', formula: event.target.value === 'formula' ? (candidate.formula ?? '=0') : candidate.formula }
                : candidate))}>
              <option value="data">Data</option><option value="formula">Formula ƒx</option>
            </select>
            <button type="button" className="stu-btn stu-danger" style={{ padding: '2px 8px' }} onClick={() =>
              setColumns(element.columns.filter((_candidate, position) => position !== index))}>✕</button>
          </div>
          {column.type === 'formula' && (
            <>
              <div className="stu-fx">
                <span className="prefix">ƒx =</span>
                <input value={(column.formula ?? '').replace(/^=/, '')} placeholder="[Qty]*[Rate]" onChange={(event) =>
                  setColumns(element.columns.map((candidate, position) => position === index ? { ...candidate, formula: `=${event.target.value}` } : candidate))} />
              </div>
              <div style={{ fontSize: 10.5, color: '#5B6675', marginTop: 4 }}>
                Preview (row 1): <b style={{ color: '#1D6FA5' }}>{String(previewRows[0]?.[column.id] ?? '—')}</b>
              </div>
            </>
          )}
        </div>
      ))}
      <div className="stu-quickfx">
        {quickFormulas.map(([label, formula]) => (
          <button key={label} type="button" onClick={() =>
            setColumns([...element.columns, { id: `c-${Math.random().toString(36).slice(2, 8)}`, label, type: 'formula', formula, widthPct: 14, align: 'center' }])}>
            + {label}
          </button>
        ))}
      </div>
      <button type="button" className="stu-addbtn" onClick={() =>
        setColumns([...element.columns, { id: `c-${Math.random().toString(36).slice(2, 8)}`, label: 'New column', type: 'data', dtype: 'text', widthPct: 16, align: 'left' }])}>
        + Add column
      </button>
    </>
  )
}

function TotalsForm({ element, patch }: { element: TotalsElement; patch: (values: Partial<CanvasElement>) => void }) {
  const setRows = (rows: TotalsRow[]) => patch({ rows })
  return (
    <>
      <div className="stu-infobox" style={{ marginBottom: 10 }}>
        Rows can pull from the table with <b>SUM_TABLE("Column")</b> or reference other rows as <b>[Row label]</b>.
      </div>
      {element.rows.map((row, index) => (
        <div className="stu-colcard" key={row.id}>
          <div className="top">
            <input value={row.label} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, label: event.target.value } : candidate))} />
            <select value={row.kind} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index
                ? { ...candidate, kind: event.target.value as 'value' | 'formula', formula: event.target.value === 'formula' ? (candidate.formula ?? '=0') : candidate.formula }
                : candidate))}>
              <option value="value">Fixed value</option><option value="formula">Formula ƒx</option>
            </select>
            <button type="button" className="stu-btn stu-danger" style={{ padding: '2px 8px' }} onClick={() =>
              setRows(element.rows.filter((_candidate, position) => position !== index))}>✕</button>
          </div>
          {row.kind === 'value' ? (
            <input type="number" value={row.value ?? 0} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, value: Number(event.target.value) || 0 } : candidate))} />
          ) : (
            <div className="stu-fx">
              <span className="prefix">ƒx =</span>
              <input value={(row.formula ?? '').replace(/^=/, '')} placeholder='SUM_TABLE("Amount")' onChange={(event) =>
                setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, formula: `=${event.target.value}` } : candidate))} />
            </div>
          )}
          <label style={{ fontSize: 11, display: 'block', marginTop: 5 }}>
            <input type="checkbox" checked={Boolean(row.emphasize)} onChange={(event) =>
              setRows(element.rows.map((candidate, position) => position === index ? { ...candidate, emphasize: event.target.checked } : candidate))} /> Emphasize (grand total)
          </label>
        </div>
      ))}
      <button type="button" className="stu-addbtn" onClick={() =>
        setRows([...element.rows, { id: `r-${Math.random().toString(36).slice(2, 8)}`, label: 'New row', kind: 'value', value: 0 }])}>
        + Add row
      </button>
    </>
  )
}

function PageForm({ category, state, dispatch }: { category: DocumentCategory; state: EditorState; dispatch: Dispatch<EditorAction> }) {
  const { layout } = state
  const sizes = CATEGORY_CONFIG[category].pageSizeIds
  return (
    <div>
      <div className="stu-field">
        <label>Print area</label>
        <select value={layout.page.sizeId} onChange={(event) => dispatch({ type: 'setPage', patch: { sizeId: event.target.value as PageSizeId } })}>
          {sizes.map((sizeId) => <option key={sizeId} value={sizeId}>{sizeId}</option>)}
        </select>
      </div>
      <div className="stu-row2">
        <div className="stu-field"><label>Header height (mm)</label>
          <input type="number" min={0} max={100} value={layout.zones.headerMm}
            onChange={(event) => dispatch({ type: 'setZones', patch: { headerMm: Number(event.target.value) || 0 } })} /></div>
        <div className="stu-field"><label>Footer height (mm)</label>
          <input type="number" min={0} max={100} value={layout.zones.footerMm}
            onChange={(event) => dispatch({ type: 'setZones', patch: { footerMm: Number(event.target.value) || 0 } })} /></div>
      </div>
      {([['repeatHeader', 'Repeat header on every page'], ['repeatFooter', 'Repeat footer on every page'], ['hideHeaderOnFirstPage', 'Hide header on page 1']] as const).map(([key, label]) => (
        <label key={key} style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
          <input type="checkbox" checked={layout.zones[key]}
            onChange={(event) => dispatch({ type: 'setZones', patch: { [key]: event.target.checked } })} /> {label}
        </label>
      ))}
      <div className="stu-field" style={{ marginTop: 12 }}>
        <label>Watermark</label>
        <label style={{ fontSize: 12, display: 'block' }}>
          <input type="checkbox" checked={layout.watermark.enabled}
            onChange={(event) => dispatch({ type: 'setWatermark', patch: { enabled: event.target.checked } })} /> Show watermark
        </label>
      </div>
      {layout.watermark.enabled && (
        <>
          <div className="stu-row2">
            <div className="stu-field"><label>Mode</label>
              <select value={layout.watermark.mode} onChange={(event) => dispatch({ type: 'setWatermark', patch: { mode: event.target.value as 'text' | 'image' } })}>
                <option value="text">Text</option><option value="image">Image URL</option>
              </select></div>
            <div className="stu-field"><label>Opacity %</label>
              <input type="number" min={2} max={35} value={Math.round(layout.watermark.opacity * 100)}
                onChange={(event) => dispatch({ type: 'setWatermark', patch: { opacity: (Number(event.target.value) || 7) / 100 } })} /></div>
          </div>
          {layout.watermark.mode === 'text' ? (
            <div className="stu-field"><label>Text</label>
              <input value={layout.watermark.text} onChange={(event) => dispatch({ type: 'setWatermark', patch: { text: event.target.value } })} /></div>
          ) : (
            <div className="stu-field"><label>Image URL</label>
              <input value={layout.watermark.imageUrl} onChange={(event) => dispatch({ type: 'setWatermark', patch: { imageUrl: event.target.value } })} /></div>
          )}
        </>
      )}
      <ColorField label="Page background" value={typeof layout.page.background === 'string' ? layout.page.background : '#FFFFFF'}
        onPick={(background) => dispatch({ type: 'setPage', patch: { background } })} />
    </div>
  )
}

function ColorField({ label, value, onPick }: { label: string; value: string; onPick: (color: string) => void }) {
  return (
    <div className="stu-field">
      <label>{label}</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {SWATCHES.map((swatch) => (
          <button key={swatch} type="button" aria-label={`Colour ${swatch}`} onClick={() => onPick(swatch)}
            style={{ width: 20, height: 20, borderRadius: 999, background: swatch, border: value === swatch ? '2px solid #173A5E' : '1px solid #E1E4EA', cursor: 'pointer' }} />
        ))}
        <input type="color" value={/^#[0-9A-Fa-f]{6}$/.test(value) ? value : '#16212E'}
          onChange={(event) => onPick(event.target.value)} style={{ width: 28, height: 24, padding: 0, border: 'none' }} aria-label={`${label} custom`} />
      </div>
    </div>
  )
}
