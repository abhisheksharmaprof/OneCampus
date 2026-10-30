/**
 * Pure TypeScript Vector SVG Barcode Generator (Code 128 & Code 39)
 *
 * Generates crisp vector SVG barcodes with exact module dimensions,
 * shape-rendering="crispEdges", human-readable labels, and configurable quiet zones.
 */
import { escapeHtml } from './tokens'

export type BarcodeSymbology = 'CODE128' | 'CODE39'

export interface BarcodeRenderOptions {
  format?: BarcodeSymbology
  showText?: boolean
  textPosition?: 'bottom' | 'top'
  color?: string
  backgroundColor?: string
  quietZoneMm?: number
  barHeightPercent?: number
}

// Code 128 Patterns (Table B)
// Each 6-digit number represents widths of 3 bars and 3 spaces (sum = 11 modules)
const CODE128_PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'                                 // 100-106 (106 is STOP)
]

const START_B = 104
const STOP_CODE = 106

/** Encodes string to Code 128 Type B */
function encodeCode128(text: string): string {
  const clean = text || '0'
  const values: number[] = [START_B]
  let checkSum = START_B

  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i)
    // Code 128B maps ASCII 32..127 to values 0..95
    const val = (code >= 32 && code <= 126) ? code - 32 : 0
    values.push(val)
    checkSum += val * (i + 1)
  }

  values.push(checkSum % 103)
  values.push(STOP_CODE)

  // Assemble run pattern: each code is alternating bar/space
  let modules = ''
  for (const v of values) {
    const pat = CODE128_PATTERNS[v] || CODE128_PATTERNS[0]
    let isBar = true
    for (let j = 0; j < pat.length; j++) {
      const len = parseInt(pat[j], 10)
      modules += (isBar ? '1' : '0').repeat(len)
      isBar = !isBar
    }
  }

  return modules
}

// Code 39 Patterns
// 'b' = narrow bar, 'B' = wide bar, 's' = narrow space, 'S' = wide space
const CODE39_ENCODINGS: Record<string, string> = {
  '0': 'b s b S B s B s b',
  '1': 'B s b S b s b s B',
  '2': 'b s B S b s b s B',
  '3': 'B s B S b s b s b',
  '4': 'b s b S B s b s B',
  '5': 'B s b S B s b s b',
  '6': 'b s B S B s b s b',
  '7': 'b s b S b s B s B',
  '8': 'B s b S b s B s b',
  '9': 'b s B S b s B s b',
  'A': 'B s b s b S b s B',
  'B': 'b s B s b S b s B',
  'C': 'B s B s b S b s b',
  'D': 'b s b s B S b s B',
  'E': 'B s b s B S b s b',
  'F': 'b s B s B S b s b',
  'G': 'b s b s b S B s B',
  'H': 'B s b s b S B s b',
  'I': 'b s B s b S B s b',
  'J': 'b s b s B S B s b',
  'K': 'B s b s b s b S B',
  'L': 'b s B s b s b S B',
  'M': 'B s B s b s b S b',
  'N': 'b s b s B s b S B',
  'O': 'B s b s B s b S b',
  'P': 'b s B s B s b S b',
  'Q': 'b s b s b s B S B',
  'R': 'B s b s b s B S b',
  'S': 'b s B s b s B S b',
  'T': 'b s b s B s B S b',
  'U': 'B S b s b s b s B',
  'V': 'b S B s b s b s B',
  'W': 'B S B s b s b s b',
  'X': 'b S b s B s b s B',
  'Y': 'B S b s B s b s b',
  'Z': 'b S B s B s b s b',
  '-': 'b S b s b s B s B',
  '.': 'B S b s b s B s b',
  ' ': 'b S B s b s B s b',
  '$': 'b S b S b S b s b',
  '/': 'b S b S b s b S b',
  '+': 'b S b s b S b S b',
  '%': 'b s b S b S b S b',
  '*': 'b S b s B s B s b', // Start/Stop delimiter
}

function encodeCode39(text: string): string {
  const upper = `*${(text || '0').toUpperCase()}*`
  let modules = ''

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i]
    const pattern = CODE39_ENCODINGS[ch] || CODE39_ENCODINGS['0']
    const elements = pattern.split(' ')

    for (const el of elements) {
      if (el === 'b') modules += '1'        // narrow bar (1)
      else if (el === 'B') modules += '111' // wide bar (3)
      else if (el === 's') modules += '0'   // narrow space (1)
      else if (el === 'S') modules += '000' // wide space (3)
    }
    // Inter-character narrow space
    if (i < upper.length - 1) {
      modules += '0'
    }
  }

  return modules
}

/**
 * Generates an ultra-crisp vector SVG for 1D barcodes.
 */
export function generateBarcodeSvg(value: string, options: BarcodeRenderOptions = {}): string {
  const {
    format = 'CODE128',
    showText = true,
    textPosition = 'bottom',
    color = '#000000',
    backgroundColor = 'transparent',
    quietZoneMm = 2,
    barHeightPercent = 80,
  } = options

  const safeVal = value || '123456'
  const escapedVal = escapeHtml(safeVal)
  const escapedColor = escapeHtml(color)
  const escapedBgColor = escapeHtml(backgroundColor)
  const modules = format === 'CODE39' ? encodeCode39(safeVal) : encodeCode128(safeVal)

  // Module calculation
  const quietZoneModules = Math.max(4, Math.round(quietZoneMm * 3))
  const totalModules = modules.length + quietZoneModules * 2
  const svgHeight = 100
  const labelHeight = showText ? 20 : 0
  const barHeight = Math.max(20, Math.min(100, Math.round((svgHeight - labelHeight) * (barHeightPercent / 100))))
  const barY = showText && textPosition === 'top' ? labelHeight + 2 : 2
  const textY = textPosition === 'top' ? 14 : barY + barHeight + 14

  // Group continuous 1s into rectangles
  let rects = ''
  let currentStart = -1

  for (let i = 0; i < modules.length; i++) {
    if (modules[i] === '1') {
      if (currentStart === -1) currentStart = i
    } else {
      if (currentStart !== -1) {
        const x = currentStart + quietZoneModules
        const w = i - currentStart
        rects += `<rect x="${x}" y="${barY}" width="${w}" height="${barHeight}" fill="${escapedColor}"/>`
        currentStart = -1
      }
    }
  }
  if (currentStart !== -1) {
    const x = currentStart + quietZoneModules
    const w = modules.length - currentStart
    rects += `<rect x="${x}" y="${barY}" width="${w}" height="${barHeight}" fill="${escapedColor}"/>`
  }

  const bgRect = backgroundColor && backgroundColor !== 'transparent'
    ? `<rect width="100%" height="100%" fill="${escapedBgColor}"/>`
    : ''

  const labelText = showText
    ? `<text x="${totalModules / 2}" y="${textY}" text-anchor="middle" font-family="'JetBrains Mono', monospace, Arial" font-size="12" font-weight="600" fill="${escapedColor}">${escapedVal}</text>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalModules} ${svgHeight}" width="100%" height="100%" preserveAspectRatio="none" shape-rendering="crispEdges">${bgRect}${rects}${labelText}</svg>`
}
