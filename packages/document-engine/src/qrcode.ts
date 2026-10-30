/**
 * Pure Vector SVG QR Code Generator
 *
 * Emits sharp, scalable SVGs using crispEdges and compact SVG path strings.
 */
import QRCode from 'qrcode'

export interface QrSvgOptions {
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H'
  margin?: number
  darkColor?: string
  lightColor?: string
}

export function generateQrSvg(text: string, options: QrSvgOptions = {}): string {
  const {
    errorCorrectionLevel = 'M',
    margin = 1,
    darkColor = '#000000',
    lightColor = '#FFFFFF',
  } = options

  const safeText = text || ' '
  let qr: QRCode.QRCode
  try {
    qr = QRCode.create(safeText, { errorCorrectionLevel })
  } catch {
    qr = QRCode.create(' ', { errorCorrectionLevel: 'M' })
  }

  const size = qr.modules.size
  const total = size + margin * 2

  let pathD = ''
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (qr.modules.get(r, c)) {
        const x = c + margin
        const y = r + margin
        pathD += `M${x} ${y}h1v1h-1z `
      }
    }
  }

  const bgRect = lightColor && lightColor !== 'transparent'
    ? `<rect width="100%" height="100%" fill="${lightColor}"/>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="100%" height="100%" shape-rendering="crispEdges">${bgRect}<path fill="${darkColor}" d="${pathD.trim()}"/></svg>`
}
