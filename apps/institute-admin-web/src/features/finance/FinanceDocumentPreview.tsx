import { useEffect, useRef, useState } from 'react'
import { Modal } from '../../components/admin-ui/Modal'
import type { InstituteBranding, Invoice, Payment } from './finance.api'
import type { DocumentTemplateRecord } from '../documents/documents.api'
import { buildFinanceDocumentHtml } from '../documents/engine/printDocument'

type Props = {
  invoice: Invoice
  branding: InstituteBranding
  template: DocumentTemplateRecord | null
  payment?: Payment
  onClose: () => void
}

export default function FinanceDocumentPreview({ invoice, branding, template, payment, onClose }: Props) {
  const [html, setHtml] = useState('')
  const [error, setError] = useState('')
  const frameRef = useRef<HTMLIFrameElement>(null)
  const title = payment ? 'Receipt preview' : 'Invoice preview'

  useEffect(() => {
    let active = true
    setHtml('')
    setError('')
    buildFinanceDocumentHtml({ invoice, branding, template, payment, mode: 'preview' })
      .then((documentHtml) => { if (active) setHtml(documentHtml) })
      .catch(() => { if (active) setError('The document preview could not be prepared.') })
    return () => { active = false }
  }, [invoice, branding, template, payment])

  return (
    <Modal
      open
      title={title}
      description="Check the institute branding and document details before printing."
      onClose={onClose}
      closeLabel="Close preview"
      size="large"
      footer={(
        <>
          <button type="button" className="fin-btn" onClick={onClose}>Close</button>
          <button
            type="button"
            className="fin-btn fin-btn--primary"
            disabled={!html}
            onClick={() => frameRef.current?.contentWindow?.print()}
          >Print</button>
        </>
      )}
    >
      {error ? <p role="alert">{error}</p> : !html ? <p role="status">Preparing preview…</p> : (
        <iframe
          ref={frameRef}
          title={title}
          srcDoc={html}
          style={{ display: 'block', width: '100%', height: 'min(68vh, 760px)', border: '1px solid #DCE2EA', borderRadius: 8, background: '#F3F5F8' }}
        />
      )}
    </Modal>
  )
}
