import type { Invoice, InstituteBranding, Payment } from '../../finance/finance.api'
import type { DocumentTemplateRecord } from '../documents.api'
import { invoiceToDocumentData } from './datasets'
import { openPrintWindow, renderDocumentHtml } from './docRender'
import { prepareQrDataUrls } from './qrPayload'
import { defaultLayout } from './types'

/** Print a real invoice/receipt through a document template. Returns false if the popup was blocked. */
export async function printFinanceDocument(options: {
  invoice: Invoice
  branding: InstituteBranding
  template: DocumentTemplateRecord | null
  payment?: Payment
}): Promise<boolean> {
  const { invoice, branding, template, payment } = options
  const layout = template?.layout ?? defaultLayout('A4P')
  const data = invoiceToDocumentData(invoice, branding, payment)
  data.qrDataUrls = await prepareQrDataUrls(layout, data)
  return openPrintWindow(renderDocumentHtml({ layout, data, mode: 'print' }))
}
