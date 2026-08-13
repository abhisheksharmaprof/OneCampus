import { adminRequest, type PageData } from '../admin/admin.api'
import type { DocumentCategory, LayoutV2 } from './engine/types'

export interface DocumentTemplateRecord {
  id: string
  name: string
  category: DocumentCategory
  layout: LayoutV2
  isDefault: boolean
  createdAt: string
}

function query(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') search.set(key, String(value))
  })
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export function listDocumentTemplates(
  accessToken: string,
  category?: DocumentCategory,
  signal?: AbortSignal,
) {
  // pageSize 100: templates per institute are author-curated; the cap is a deliberate bound.
  return adminRequest<PageData<DocumentTemplateRecord>>(
    accessToken, `documents/templates${query({ category, pageSize: 100 })}`, { signal },
  )
}

export function getDocumentTemplate(accessToken: string, templateId: string, signal?: AbortSignal) {
  return adminRequest<DocumentTemplateRecord>(accessToken, `documents/templates/${templateId}`, { signal })
}

export function createDocumentTemplate(
  accessToken: string,
  body: { name: string; category: DocumentCategory; layout: LayoutV2; isDefault?: boolean },
) {
  return adminRequest<DocumentTemplateRecord>(accessToken, 'documents/templates', {
    method: 'POST', body: JSON.stringify(body),
  })
}

export function patchDocumentTemplate(
  accessToken: string,
  templateId: string,
  body: Partial<{ name: string; category: DocumentCategory; layout: LayoutV2; isDefault: boolean }>,
) {
  return adminRequest<DocumentTemplateRecord>(accessToken, `documents/templates/${templateId}`, {
    method: 'PATCH', body: JSON.stringify(body),
  })
}

export function deleteDocumentTemplate(accessToken: string, templateId: string) {
  return adminRequest<void>(accessToken, `documents/templates/${templateId}`, { method: 'DELETE' })
}
