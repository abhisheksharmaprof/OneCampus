import React, { useEffect, useState } from 'react'
import type { LayoutV3 } from '@campusone/document-engine'
import {
  getDocumentTemplate,
  listDocumentTemplates,
  patchDocumentTemplate,
  type DocumentTemplateRecord,
} from '../documents.api'
import { fetchInstituteBranding, type InstituteBranding } from '../../finance/finance.api'
import { isLayoutV3 } from '../engine/types'
import { createDefaultLayoutV3 } from './constants'
import { StudioNextProvider } from './state/StudioNextContext'
import { StudioNextEditor } from './StudioNextEditor'

export interface StudioNextPageProps {
  accessToken: string
  templateId: string
  initialTemplate?: DocumentTemplateRecord
  onBack: (saved: boolean) => void
}

export function StudioNextPage({
  accessToken,
  templateId,
  initialTemplate,
  onBack,
}: StudioNextPageProps) {
  const [template, setTemplate] = useState<DocumentTemplateRecord | null>(initialTemplate ?? null)
  const [loading, setLoading] = useState(!initialTemplate)
  const [error, setError] = useState<string | null>(null)
  const [branding, setBranding] = useState<InstituteBranding | null>(null)
  const [letterheads, setLetterheads] = useState<DocumentTemplateRecord[]>([])

  // Load fresh template if needed
  useEffect(() => {
    let active = true
    if (!initialTemplate) {
      setLoading(true)
      getDocumentTemplate(accessToken, templateId)
        .then((doc) => {
          if (active) {
            setTemplate(doc)
            setLoading(false)
          }
        })
        .catch((err) => {
          if (active) {
            setError(err instanceof Error ? err.message : 'Failed to load document template.')
            setLoading(false)
          }
        })
    }
    return () => {
      active = false
    }
  }, [accessToken, templateId, initialTemplate])

  // Load branding and letterheads in parallel
  useEffect(() => {
    let active = true
    const controller = new AbortController()

    fetchInstituteBranding(accessToken, controller.signal)
      .then((b) => {
        if (active) setBranding(b)
      })
      .catch(() => {})

    listDocumentTemplates(accessToken, 'LETTERHEAD', controller.signal)
      .then((data) => {
        if (active) setLetterheads((data.items ?? []).filter((item) => item.id !== templateId))
      })
      .catch(() => {})

    return () => {
      active = false
      controller.abort()
    }
  }, [accessToken, templateId])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center', color: '#64748B' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>📄</div>
          <div style={{ fontWeight: 600 }}>Loading Studio Next Workspace...</div>
        </div>
      </div>
    )
  }

  if (error || !template) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center', color: '#DC2626', maxWidth: 400 }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Error Loading Template</div>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>{error || 'Template not found'}</div>
          <button type="button" className="sn-btn sn-btn-primary" onClick={() => onBack(false)}>
            ← Return to Templates
          </button>
        </div>
      </div>
    )
  }

  // Ensure V3 layout
  const layoutV3: LayoutV3 = isLayoutV3(template.layout)
    ? template.layout
    : createDefaultLayoutV3(
        template.layout && 'page' in template.layout ? (template.layout as any).page?.sizeId : 'A4P',
      )

  const handleSave = async (
    layout: LayoutV3,
    expectedRevision: number,
    name: string,
  ): Promise<DocumentTemplateRecord> => {
    const updated = await patchDocumentTemplate(accessToken, template.id, {
      layout,
      name,
      expectedRevision,
    })
    setTemplate(updated)
    return updated
  }

  const handleReload = async (): Promise<DocumentTemplateRecord> => {
    const fresh = await getDocumentTemplate(accessToken, template.id)
    setTemplate(fresh)
    return fresh
  }

  return (
    <StudioNextProvider template={template} layoutV3={layoutV3}>
      <StudioNextEditor
        accessToken={accessToken}
        template={template}
        branding={branding}
        masterLetterheads={letterheads}
        onBack={onBack}
        onSaveTemplate={handleSave}
        onReloadTemplate={handleReload}
      />
    </StudioNextProvider>
  )
}
