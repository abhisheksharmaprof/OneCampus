import { useEffect, useMemo, useState } from 'react'
import { AdminApiError } from '../admin/admin.api'
import { StatePanel, useAbortableLoad } from '../finance/sections/shared'
import {
  createDocumentTemplate, deleteDocumentTemplate, listDocumentTemplates, patchDocumentTemplate,
  publishDocumentTemplate,
  type DocumentTemplateRecord,
} from './documents.api'
import { CATEGORY_CONFIG, sampleDocumentData } from './engine/datasets'
import { renderDocumentHtml } from './engine/docRender'
import { prepareQrDataUrls } from './engine/qrPayload'
import { defaultLayout, PAGE_SIZES_MM, type DocumentCategory, type PageSizeId } from './engine/types'
import { StudioEditor } from './studio/StudioEditor'
import './studio.css'

const CATEGORIES = Object.keys(CATEGORY_CONFIG) as DocumentCategory[]
const CATEGORY_DETAILS: Record<DocumentCategory, { description: string; icon: string }> = {
  FEE_INVOICE: { description: 'Issue clear, itemised fee statements for students and families.', icon: '₹' },
  FEE_RECEIPT: { description: 'Create branded receipts for payments and collections.', icon: '↗' },
  MARKSHEET: { description: 'Present exam results, subject marks, and grades.', icon: 'A+' },
  ID_CARD: { description: 'Design student or staff cards ready for batch printing.', icon: 'ID' },
  CERTIFICATE: { description: 'Prepare certificates for awards, events, and milestones.', icon: '✦' },
}
const PAGE_SIZE_LABELS: Record<PageSizeId, string> = {
  A4P: 'A4 portrait', A4L: 'A4 landscape', CR80: 'ID card (CR80)',
  A4P_HALF_TOP: 'A4 half sheet', A4P_HALF_BOTTOM: 'A4 half sheet',
}

function DocumentPreview({ template }: { template: DocumentTemplateRecord }) {
  const pageSize = PAGE_SIZES_MM[template.layout.page.sizeId]
  const [previewHtml, setPreviewHtml] = useState('')
  const pixelRatio = 96 / 25.4
  const frameWidth = pageSize.w * pixelRatio + 24
  const frameHeight = pageSize.h * pixelRatio + 24
  const scale = Math.min(176 / frameWidth, 224 / frameHeight)

  useEffect(() => {
    let current = true
    const data = sampleDocumentData(template.category)
    void prepareQrDataUrls(template.layout, data)
      .catch(() => ({}))
      .then((qrDataUrls) => {
        if (!current) return
        data.qrDataUrls = qrDataUrls
        setPreviewHtml(renderDocumentHtml({ layout: template.layout, data, mode: 'preview', sampleMode: true }))
      })
    return () => { current = false }
  }, [template])

  return (
    <div className="stu-document-preview" aria-label={`Preview of ${template.name}`}>
      {previewHtml
        ? <iframe
            className="stu-template-frame"
            title={`${template.name} document preview`}
            srcDoc={previewHtml}
            sandbox=""
            tabIndex={-1}
            aria-hidden="true"
            style={{ width: `${frameWidth}px`, height: `${frameHeight}px`, transform: `translateX(-50%) scale(${scale})` }}
          />
        : <span className="stu-template-preview-loading" aria-hidden="true">Preparing preview…</span>}
    </div>
  )
}

function CategoryPreview({ category }: { category: DocumentCategory }) {
  const config = CATEGORY_CONFIG[category]
  const pageSize = PAGE_SIZES_MM[config.pageSizeIds[0]]
  return (
    <div className={`stu-category-preview ${config.pageSizeIds[0] === 'CR80' ? 'is-card' : ''}`} aria-hidden="true">
      <div className="stu-document-sheet" style={{ aspectRatio: `${pageSize.w} / ${pageSize.h}` }}>
        <span className="stu-document-placeholder"><i /><i /><i /></span>
      </div>
      {config.pageCount > 1 && <span className="stu-document-sheet stu-document-sheet--back" style={{ aspectRatio: `${pageSize.w} / ${pageSize.h}` }} />}
    </div>
  )
}

export default function TemplateStudioPage({ accessToken }: { accessToken: string }) {
  const [category, setCategory] = useState<DocumentCategory | null>(null)
  const [editing, setEditing] = useState<DocumentTemplateRecord | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')

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

  const items = templates.data?.items ?? []
  const filteredItems = useMemo(() => items.filter((item) => item.name.toLowerCase().includes(search.trim().toLowerCase())), [items, search])

  if (editing) {
    return <StudioEditor accessToken={accessToken} template={editing} onBack={() => setEditing(null)} />
  }

  if (!category) {
    return (
      <section className="stu-page">
        <header className="stu-home-hero">
          <div>
            <span className="stu-eyebrow">DOCUMENT WORKSPACE</span>
            <h1>Template Studio</h1>
            <p>Build polished, print-ready school documents with your data and branding.</p>
          </div>
          <div className="stu-home-callout"><strong>From blank page to print</strong><span>Design once. Preview with real fields. Print when it’s ready.</span></div>
        </header>
        <div className="stu-section-heading">
          <div><h2>Choose a document</h2><p>Start with a document type, then open a saved design or create your own.</p></div>
          <span>{CATEGORIES.length} document types</span>
        </div>
        <div className="stu-home-grid">
          {CATEGORIES.map((candidate) => {
            const config = CATEGORY_CONFIG[candidate]
            const detail = CATEGORY_DETAILS[candidate]
            return (
              <button key={candidate} type="button" className="stu-home-card" onClick={() => { setSearch(''); setCategory(candidate) }}>
                <span className="stu-category-icon" aria-hidden="true">{detail.icon}</span>
                <CategoryPreview category={candidate} />
                <span className="stu-category-copy"><strong>{config.label}</strong><span>{detail.description}</span>
                  <small>{[...new Set(config.pageSizeIds.map((id) => PAGE_SIZE_LABELS[id]))].join(' · ')}{config.pageCount > 1 ? ` · ${config.pageCount} pages` : ' · 1 page'}</small></span>
                <span className="stu-card-arrow" aria-hidden="true">→</span>
              </button>
            )
          })}
        </div>
        <aside className="stu-home-footnote"><strong>Built for everyday school operations</strong><span>Drag components onto the page, insert student and school fields, then preview before printing.</span></aside>
      </section>
    )
  }

  const config = CATEGORY_CONFIG[category]
  const detail = CATEGORY_DETAILS[category]
  return (
    <section className="stu-page">
      <header className="stu-gallery-hero">
        <div className="stu-breadcrumb"><button type="button" onClick={() => setCategory(null)}>All documents</button><span aria-hidden="true">/</span><span>{config.label}</span></div>
        <div className="stu-gallery-heading">
          <div><span className="stu-eyebrow">TEMPLATE LIBRARY</span><h1>{config.label}</h1><p>{detail.description}</p></div>
          <button type="button" className="stu-btn stu-btn--primary" disabled={busy} onClick={() =>
            run(
              createDocumentTemplate(accessToken, {
                name: 'Untitled template', category,
                layout: defaultLayout(config.pageSizeIds[0], config.pageCount),
              }).then((created) => setEditing(created)),
            )}>
            <span aria-hidden="true">＋</span> Create template
          </button>
        </div>
        <div className="stu-gallery-meta"><span>{[...new Set(config.pageSizeIds.map((id) => PAGE_SIZE_LABELS[id]))].join(' · ')} formats</span><span>{config.pageCount} page{config.pageCount > 1 ? 's' : ''} in the starter layout</span><span>Print-ready design editor</span></div>
      </header>
      {notice && <p role="alert" className="stu-notice">{notice}</p>}
      <div className="stu-library-toolbar">
        <div><h2>Saved templates</h2><p>{templates.loading ? 'Loading your templates…' : `${items.length} saved template${items.length === 1 ? '' : 's'}`}</p></div>
        <label className="stu-library-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search templates" aria-label="Search templates" /></label>
      </div>
      <StatePanel loading={templates.loading} error={templates.error} onRetry={templates.reload}
        empty={!filteredItems.length} emptyMessage={search ? 'No templates match this search.' : 'No saved templates yet. Create a template to start your library.'}>
        <div className="stu-gallery">
          {filteredItems.map((template) => (
            <article key={template.id} className={`stu-gallery-card${template.isDefault ? ' is-default' : ''}`}>
              <div className="stu-template-open">
                <DocumentPreview template={template} />
                <span className="stu-template-state">{template.isDefault ? 'Default' : category === 'ID_CARD' && template.publishedVersion ? `Published · v${template.publishedVersion.version}` : category === 'ID_CARD' ? 'Draft' : 'Saved'}</span>
                <span className="stu-template-title">{template.name}</span>
                <span className="stu-template-format">{PAGE_SIZE_LABELS[template.layout.page.sizeId]} <span>·</span> {template.layout.pages.length} page{template.layout.pages.length === 1 ? '' : 's'}</span>
                <button type="button" className="stu-template-open-hit" onClick={() => setEditing(template)} aria-label={`Open ${template.name} in editor`} />
              </div>
              <div className="stu-gallery-actions">
                <button type="button" className="stu-btn stu-btn--primary" onClick={() => setEditing(template)}>Open editor</button>
                {category === 'ID_CARD' && <button type="button" className="stu-btn" disabled={busy}
                  onClick={() => run(publishDocumentTemplate(accessToken, template.id))}>Publish</button>}
                <button type="button" className="stu-btn" disabled={busy}
                  onClick={() => run(createDocumentTemplate(accessToken, { name: `Copy of ${template.name}`, category, layout: template.layout }))}>Duplicate</button>
                {!template.isDefault && <button type="button" className="stu-btn" disabled={busy}
                  onClick={() => run(patchDocumentTemplate(accessToken, template.id, { isDefault: true }))}>Set default</button>}
                {!template.isDefault && <button type="button" className="stu-btn stu-danger" disabled={busy}
                  onClick={() => { if (window.confirm(`Delete template "${template.name}"?`)) run(deleteDocumentTemplate(accessToken, template.id)) }}>Delete</button>}
              </div>
            </article>
          ))}
        </div>
      </StatePanel>
    </section>
  )
}
