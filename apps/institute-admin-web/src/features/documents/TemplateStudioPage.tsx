import { useState } from 'react'
import { AdminApiError } from '../admin/admin.api'
import { StatePanel, useAbortableLoad } from '../finance/sections/shared'
import {
  createDocumentTemplate, deleteDocumentTemplate, listDocumentTemplates, patchDocumentTemplate,
  type DocumentTemplateRecord,
} from './documents.api'
import { CATEGORY_CONFIG } from './engine/datasets'
import { defaultLayout, type DocumentCategory } from './engine/types'
import { StudioEditor } from './studio/StudioEditor'
import './studio.css'

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as DocumentCategory[]

export default function TemplateStudioPage({ accessToken }: { accessToken: string }) {
  const [category, setCategory] = useState<DocumentCategory | null>(null)
  const [editing, setEditing] = useState<DocumentTemplateRecord | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const templates = useAbortableLoad(
    (signal) => category ? listDocumentTemplates(accessToken, category, signal) : Promise.resolve(null),
    [accessToken, category, editing === null],
  )

  const run = (action: Promise<unknown>, then?: () => void) => {
    setBusy(true)
    setNotice(null)
    action
      .then(() => { templates.reload(); then?.() })
      .catch((cause: unknown) => setNotice(cause instanceof AdminApiError
        ? (Object.values(cause.fieldErrors)[0]?.[0] ?? cause.message)
        : 'The action failed.'))
      .finally(() => setBusy(false))
  }

  if (editing) {
    return <StudioEditor accessToken={accessToken} template={editing} onBack={() => setEditing(null)} />
  }

  if (!category) {
    return (
      <section>
        <h2>Template Studio</h2>
        <p style={{ color: '#5B6675', fontSize: 13 }}>Design and print every school document — drag-and-drop, merge fields, formulas, QR verification.</p>
        <div className="stu-home-grid">
          {CATEGORIES.map((candidate) => (
            <button key={candidate} type="button" className="stu-home-card" onClick={() => setCategory(candidate)}>
              <h3 style={{ margin: '0 0 6px' }}>{CATEGORY_CONFIG[candidate].label}</h3>
              <p style={{ margin: 0, fontSize: 12, color: '#5B6675' }}>
                3 ready-made presets · custom designs · {CATEGORY_CONFIG[candidate].pageSizeIds[0]}
              </p>
            </button>
          ))}
        </div>
      </section>
    )
  }

  const items = templates.data?.items ?? []
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button type="button" className="stu-btn" onClick={() => setCategory(null)}>← All documents</button>
        <h2 style={{ margin: 0 }}>{CATEGORY_CONFIG[category].label} templates</h2>
        <span style={{ flex: 1 }} />
        <button type="button" className="stu-btn stu-btn--primary" disabled={busy} onClick={() =>
          run(
            createDocumentTemplate(accessToken, {
              name: 'Untitled template', category,
              layout: defaultLayout(CATEGORY_CONFIG[category].pageSizeIds[0], CATEGORY_CONFIG[category].pageCount),
            }).then((created) => setEditing(created)),
          )}>
          + New template
        </button>
      </div>
      {notice && <p role="alert" style={{ color: '#C0392B', fontSize: 12 }}>{notice}</p>}
      <StatePanel loading={templates.loading} error={templates.error} onRetry={templates.reload}
        empty={!items.length} emptyMessage="No templates yet — presets seed on first load.">
        <div className="stu-gallery">
          {items.map((template) => (
            <div key={template.id} className={`stu-gallery-card${template.isDefault ? ' is-default' : ''}`}>
              <h3 style={{ margin: '0 0 4px', fontSize: 14 }}>{template.name}{template.isDefault ? ' ★' : ''}</h3>
              <p style={{ margin: '0 0 10px', fontSize: 11, color: '#5B6675' }}>{template.layout.page.sizeId} · {template.layout.pages.length} page{template.layout.pages.length > 1 ? 's' : ''}</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" className="stu-btn" onClick={() => setEditing(template)}>Open in editor</button>
                {!template.isDefault && (
                  <>
                    <button type="button" className="stu-btn" disabled={busy}
                      onClick={() => run(patchDocumentTemplate(accessToken, template.id, { isDefault: true }))}>Set default</button>
                    <button type="button" className="stu-btn stu-danger" disabled={busy}
                      onClick={() => { if (window.confirm(`Delete template "${template.name}"?`)) run(deleteDocumentTemplate(accessToken, template.id)) }}>Delete</button>
                  </>
                )}
                <button type="button" className="stu-btn" disabled={busy}
                  onClick={() => run(createDocumentTemplate(accessToken, { name: `Copy of ${template.name}`, category, layout: template.layout }))}>Duplicate</button>
              </div>
            </div>
          ))}
        </div>
      </StatePanel>
    </section>
  )
}
