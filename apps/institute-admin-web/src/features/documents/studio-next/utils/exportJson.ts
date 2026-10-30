import type { LayoutV3 } from '@campusone/document-engine'

/** Downloads the template LayoutV3 as a formatted JSON file */
export function exportLayoutJson(layout: LayoutV3, templateName: string): void {
  const json = JSON.stringify(layout, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const safeName = (templateName || 'template')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/(^-|-$)/g, '')
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}-v3.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Copies the template LayoutV3 JSON to the clipboard */
export async function copyLayoutToClipboard(layout: LayoutV3): Promise<boolean> {
  const json = JSON.stringify(layout, null, 2)
  try {
    await navigator.clipboard.writeText(json)
    return true
  } catch {
    return false
  }
}
