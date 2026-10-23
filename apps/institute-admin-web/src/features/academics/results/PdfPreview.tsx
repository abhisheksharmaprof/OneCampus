import { useEffect, useRef, useState } from 'react'
import type { PDFDocumentLoadingTask, RenderTask } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

export function PdfPreview({ url }: { url: string }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(1)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  useEffect(() => {
    let active = true
    let documentTask: PDFDocumentLoadingTask | undefined
    let renderTask: RenderTask | undefined
    void (async () => {
      const pdf = await import('pdfjs-dist')
      if (!active) return
      setLoading(true)
      setError('')
      pdf.GlobalWorkerOptions.workerSrc = workerUrl
      documentTask = pdf.getDocument({
        url,
        useSystemFonts: true,
      })
      const document = await documentTask.promise
      if (!active) return
      setPages(document.numPages)
      const current = await document.getPage(Math.min(page, document.numPages))
      if (!active || !canvas.current) return
      const viewport = current.getViewport({ scale: 1.6 })
      canvas.current.width = viewport.width
      canvas.current.height = viewport.height
      renderTask = current.render({ canvas: canvas.current, viewport })
      await renderTask.promise
      const content = await current.getTextContent()
      if (active) {
        setText(content.items.map((item) => ('str' in item ? item.str : '')).join(' '))
        setLoading(false)
      }
    })().catch((e) => {
      if (active) {
        setError(
          e instanceof Error ? e.message : 'Could not display PDF. Open or download it to view.',
        )
        setLoading(false)
      }
    })
    return () => {
      active = false
      renderTask?.cancel()
      void documentTask?.destroy().catch(() => {})
    }
  }, [url, page])
  return (
    <div ref={container} className="mr-pdf-viewer">
      <div className="mr-actions">
        <button className="button-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Previous page
        </button>
        <span>
          Page {Math.min(page, pages)} / {pages}
        </span>
        <button
          className="button-secondary"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
        >
          Next page
        </button>
        <button
          className="button-secondary"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen()
            else
              void container.current
                ?.requestFullscreen()
                .catch(() => setError('Full-screen mode is unavailable in this browser.'))
          }}
        >
          Full-screen preview
        </button>
      </div>
      {loading && <p role="status">Rendering marksheet…</p>}
      {error && (
        <p role="alert" className="mr-error">
          {error}{' '}
          <a href={url} target="_blank" rel="noreferrer">
            Open PDF
          </a>
        </p>
      )}
      <canvas
        ref={canvas}
        aria-label={`Marksheet PDF preview, page ${Math.min(page, pages)}`}
        role="img"
      />
      <details>
        <summary>Accessible report text</summary>
        <p>{text}</p>
      </details>
    </div>
  )
}
