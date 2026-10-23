/** Render the supplied markup in a script-disabled document, outside the opaque studio frame. */
export async function renderStudioImage(html: string, styles: string, width: number) {
  if (
    typeof html !== 'string' ||
    typeof styles !== 'string' ||
    html.length + styles.length > 8000000 ||
    !Number.isFinite(width) ||
    width < 300 ||
    width > 2000
  )
    throw new Error('The export is too large or has invalid dimensions.')
  const frame = document.createElement('iframe')
  frame.title = 'Preparing marksheet export'
  // Scripts, forms, popups and top navigation remain disabled for supplied markup.
  frame.setAttribute('sandbox', 'allow-same-origin')
  frame.style.cssText = `position:fixed;left:-20000px;top:0;width:${width + 40}px;height:1200px;border:0;pointer-events:none`
  const loaded = new Promise<void>((resolve, reject) => {
    frame.onload = () => resolve()
    frame.onerror = () => reject(new Error('Could not prepare the export document.'))
  })
  frame.srcdoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data: blob: https: http:; base-uri 'none'; form-action 'none'"><style>${styles.replace(/<\/style/gi, '<\\/style')}\nbody{margin:0;background:white}img{display:inline-block!important}*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}</style></head><body><div id="studio-export" style="width:${width}px">${html}</div></body></html>`
  document.body.appendChild(frame)
  try {
    const [, { default: html2canvas }] = await Promise.all([loaded, import('html2canvas')])
    const doc = frame.contentDocument!
    await doc.fonts.ready
    const target = doc.getElementById('studio-export')!.firstElementChild as HTMLElement
    if (!target) throw new Error('The export document is empty.')
    const height = Math.max(target.scrollHeight, target.getBoundingClientRect().height)
    if (height > 30000) throw new Error('Export fewer gazette rows at a time.')
    const scale = Math.min(2.5, Math.sqrt(60000000 / (width * Math.max(height, 1))))
    const canvas = await html2canvas(target, {
      scale,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      scrollX: 0,
      scrollY: 0,
      windowWidth: width + 40,
    })
    return canvas.toDataURL('image/png')
  } finally {
    frame.remove()
  }
}
