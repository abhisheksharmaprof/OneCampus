import React, { useState } from 'react'
import { DOCUMENT_MERGE_FIELDS, type MergeFieldDefinition } from '@campusone/document-engine'

export interface MergeFieldsTabProps {
  onInsertField: (field: { id: string; label: string; fallback: string }) => void
}

export function MergeFieldsTab({ onInsertField }: MergeFieldsTabProps) {
  const [search, setSearch] = useState('')
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null)

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => ({ ...prev, [cat]: !prev[cat] }))
  }

  const expandAll = () => setCollapsedCategories({})
  const collapseAll = () => {
    const allCollapsed: Record<string, boolean> = {}
    DOCUMENT_MERGE_FIELDS.forEach((f) => {
      allCollapsed[f.category] = true
    })
    setCollapsedCategories(allCollapsed)
  }

  const handleCopy = (e: React.MouseEvent, field: MergeFieldDefinition) => {
    e.stopPropagation()
    const tokenStr = `{{${field.id}}}`
    navigator.clipboard.writeText(tokenStr).then(() => {
      setCopiedTokenId(field.id)
      setTimeout(() => {
        setCopiedTokenId(null)
      }, 2000)
    })
  }

  const filtered = DOCUMENT_MERGE_FIELDS.filter((f) => {
    const q = search.toLowerCase()
    return (
      f.label.toLowerCase().includes(q) ||
      f.id.toLowerCase().includes(q) ||
      f.category.toLowerCase().includes(q) ||
      (f.description && f.description.toLowerCase().includes(q))
    )
  })

  const CATEGORY_ORDER: Array<MergeFieldDefinition['category']> = [
    'Student',
    'Institute',
    'Exam',
    'Finance',
    'Certificate',
    'System',
  ]

  const categories = CATEGORY_ORDER.filter((cat) => filtered.some((f) => f.category === cat))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Search Bar & Collapse Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input
          type="text"
          className="sn-input"
          placeholder="Search 36 merge fields..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ width: '100%', height: 32 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748B' }}>
            {filtered.length} {filtered.length === 1 ? 'field' : 'fields'} available
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className="sn-btn"
              onClick={expandAll}
              style={{ padding: '0 6px', height: 20, fontSize: 10 }}
            >
              Expand All
            </button>
            <button
              type="button"
              className="sn-btn"
              onClick={collapseAll}
              style={{ padding: '0 6px', height: 20, fontSize: 10 }}
            >
              Collapse All
            </button>
          </div>
        </div>
      </div>

      {/* Accordion Categories */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {categories.map((cat) => {
          const fieldsInCat = filtered.filter((f) => f.category === cat)
          const isCollapsed = Boolean(collapsedCategories[cat])

          return (
            <div key={cat} style={{ background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', overflow: 'hidden' }}>
              {/* Category Header */}
              <div
                onClick={() => toggleCategory(cat)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '8px 10px',
                  background: '#F1F5F9',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#64748B' }}>{isCollapsed ? '▶' : '▼'}</span>
                  <span style={{ fontWeight: 700, fontSize: 12, color: '#1E293B' }}>{cat}</span>
                </div>
                <span style={{ fontSize: 10, background: '#E2E8F0', padding: '1px 6px', borderRadius: 10, color: '#475569', fontWeight: 600 }}>
                  {fieldsInCat.length}
                </span>
              </div>

              {/* Cards List */}
              {!isCollapsed && (
                <div style={{ padding: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fieldsInCat.map((field) => {
                    const isCopied = copiedTokenId === field.id

                    return (
                      <div
                        key={field.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/x-doc-token', field.id)
                          e.dataTransfer.setData('text/plain', `{{${field.id}}}`)
                        }}
                        style={{
                          background: '#FFFFFF',
                          border: '1px solid #E2E8F0',
                          borderRadius: 4,
                          padding: '6px 8px',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                          cursor: 'grab',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: 12, color: '#0F172A' }}>{field.label}</div>
                            <div style={{ fontSize: 11, color: '#2563EB', fontFamily: 'monospace' }}>
                              {`{{${field.id}}}`}
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              type="button"
                              className="sn-btn"
                              onClick={(e) => handleCopy(e, field)}
                              style={{
                                height: 22,
                                padding: '0 6px',
                                fontSize: 10,
                                background: isCopied ? '#DCFCE7' : undefined,
                                color: isCopied ? '#15803D' : undefined,
                                borderColor: isCopied ? '#86EFAC' : undefined,
                              }}
                              title="Copy token string"
                            >
                              {isCopied ? 'Copied ✓' : 'Copy'}
                            </button>
                            <button
                              type="button"
                              className="sn-btn sn-btn-primary"
                              onClick={() => onInsertField(field)}
                              style={{ height: 22, padding: '0 6px', fontSize: 10 }}
                              title="Insert into text"
                            >
                              + Insert
                            </button>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#64748B' }}>
                          <span>Sample: {field.fallback}</span>
                          <span style={{ fontSize: 9, background: '#F1F5F9', padding: '0 4px', borderRadius: 2 }}>
                            {field.dataType || 'text'}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
