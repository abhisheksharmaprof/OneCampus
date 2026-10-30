/**
 * Deterministic Auto-Fit Font Sizing Engine
 *
 * Mathematically shrinks text font size to fit within strict millimeter box dimensions,
 * emitting overflow diagnostics if text still exceeds bounds at minimum font size.
 */

export interface AutoFitOptions {
  text: string
  widthMm: number
  heightMm: number
  baseFontSizePt?: number
  minFontSizePt?: number
  lineHeight?: number
  fontFamily?: string
  paddingMm?: number
}

export interface AutoFitResult {
  fontSizePt: number
  fittedFontSizePt: number
  overflows: boolean
  isOverflow: boolean
  estimatedLines: number
  estimatedHeightMm: number
  reductionRatio: number
}

const MM_PER_PT = 25.4 / 72 // ~0.352778 mm per pt

/**
 * Returns average character width ratio based on font family category.
 */
function getCharWidthRatio(fontFamily?: string): number {
  if (!fontFamily) return 0.52
  const family = fontFamily.toLowerCase()
  if (family.includes('mono') || family.includes('courier') || family.includes('consolas')) {
    return 0.60
  }
  if (family.includes('times') || family.includes('georgia') || family.includes('merriweather') || family.includes('serif')) {
    return 0.54
  }
  return 0.52
}

/**
 * Deterministically checks whether text fits within available width and height at a given font size.
 */
function checkTextFits(
  text: string,
  fontSizePt: number,
  availableWidthMm: number,
  availableHeightMm: number,
  lineHeightMultiple: number,
  charRatio: number,
): { fits: boolean; totalLines: number; totalHeightMm: number } {
  if (availableWidthMm <= 0 || availableHeightMm <= 0) {
    return { fits: false, totalLines: 1, totalHeightMm: 9999 }
  }

  const charWidthMm = Math.max(0.01, fontSizePt * MM_PER_PT * charRatio)
  const lineGapMm = Math.max(0.1, fontSizePt * MM_PER_PT * lineHeightMultiple)

  const maxCharsPerLine = Math.max(1, Math.floor(availableWidthMm / charWidthMm))
  const paragraphs = text.split('\n')
  let totalLines = 0

  for (const para of paragraphs) {
    if (para.length === 0) {
      totalLines += 1
      continue
    }

    const words = para.split(' ')
    let currentLineChars = 0

    for (let i = 0; i < words.length; i++) {
      const word = words[i]
      const wordLen = word.length

      // Word longer than entire line -> broken into chunks
      if (wordLen > maxCharsPerLine) {
        if (currentLineChars > 0) {
          totalLines += 1
          currentLineChars = 0
        }
        const chunks = Math.ceil(wordLen / maxCharsPerLine)
        totalLines += chunks - 1
        currentLineChars = wordLen % maxCharsPerLine || maxCharsPerLine
        continue
      }

      const needed = currentLineChars === 0 ? wordLen : currentLineChars + 1 + wordLen
      if (needed <= maxCharsPerLine) {
        currentLineChars = needed
      } else {
        totalLines += 1
        currentLineChars = wordLen
      }
    }
    if (currentLineChars > 0) {
      totalLines += 1
    }
  }

  const totalHeightMm = totalLines * lineGapMm
  const fits = totalHeightMm <= availableHeightMm + 0.1 // slight tolerance

  return { fits, totalLines, totalHeightMm }
}

/**
 * Computes the optimal font size to shrink-to-fit text inside bounding box.
 *
 * Supports dual invocation:
 * 1. computeAutoFitFontSize(text, style, boxWidthMm, boxHeightMm, minFontSizePt)
 * 2. computeAutoFitFontSize(options: AutoFitOptions)
 */
export function computeAutoFitFontSize(
  textOrOptions: string | AutoFitOptions,
  style?: { fontSizePt?: number; lineHeight?: number; fontFamily?: string },
  boxWidthMm?: number,
  boxHeightMm?: number,
  minFontSizePtArg?: number,
): AutoFitResult {
  let text = ''
  let widthMm = 100
  let heightMm = 50
  let baseFontSizePt = 14
  let minFontSizePt = 6
  let lineHeight = 1.25
  let fontFamily = 'Inter'
  let paddingMm = 0

  if (typeof textOrOptions === 'object' && textOrOptions !== null) {
    text = textOrOptions.text ?? ''
    widthMm = textOrOptions.widthMm ?? 100
    heightMm = textOrOptions.heightMm ?? 50
    baseFontSizePt = textOrOptions.baseFontSizePt ?? 14
    minFontSizePt = textOrOptions.minFontSizePt ?? 6
    lineHeight = textOrOptions.lineHeight ?? 1.25
    fontFamily = textOrOptions.fontFamily ?? 'Inter'
    paddingMm = textOrOptions.paddingMm ?? 0
  } else {
    text = String(textOrOptions ?? '')
    widthMm = boxWidthMm ?? 100
    heightMm = boxHeightMm ?? 50
    baseFontSizePt = (style?.fontSizePt as number) ?? 14
    minFontSizePt = minFontSizePtArg ?? 6
    lineHeight = (style?.lineHeight as number) ?? 1.25
    fontFamily = (style?.fontFamily as string) ?? 'Inter'
    paddingMm = 0
  }

  const availableWidthMm = widthMm - paddingMm * 2
  const availableHeightMm = heightMm - paddingMm * 2

  if (widthMm <= 0 || heightMm <= 0 || availableWidthMm <= 0 || availableHeightMm <= 0) {
    return {
      fontSizePt: minFontSizePt,
      fittedFontSizePt: minFontSizePt,
      overflows: true,
      isOverflow: true,
      estimatedLines: 1,
      estimatedHeightMm: 9999,
      reductionRatio: baseFontSizePt > 0 ? minFontSizePt / baseFontSizePt : 1.0,
    }
  }
  const charRatio = getCharWidthRatio(fontFamily)

  // Edge case: empty text fits at base size
  if (!text.trim()) {
    return {
      fontSizePt: baseFontSizePt,
      fittedFontSizePt: baseFontSizePt,
      overflows: false,
      isOverflow: false,
      estimatedLines: 1,
      estimatedHeightMm: baseFontSizePt * MM_PER_PT * lineHeight,
      reductionRatio: 1.0,
    }
  }

  // 1. Check if base font size fits
  const baseCheck = checkTextFits(text, baseFontSizePt, availableWidthMm, availableHeightMm, lineHeight, charRatio)
  if (baseCheck.fits) {
    return {
      fontSizePt: baseFontSizePt,
      fittedFontSizePt: baseFontSizePt,
      overflows: false,
      isOverflow: false,
      estimatedLines: baseCheck.totalLines,
      estimatedHeightMm: baseCheck.totalHeightMm,
      reductionRatio: 1.0,
    }
  }

  // 2. Check if min font size fits
  const minCheck = checkTextFits(text, minFontSizePt, availableWidthMm, availableHeightMm, lineHeight, charRatio)
  if (!minCheck.fits) {
    // Even min font size overflows!
    return {
      fontSizePt: minFontSizePt,
      fittedFontSizePt: minFontSizePt,
      overflows: true,
      isOverflow: true,
      estimatedLines: minCheck.totalLines,
      estimatedHeightMm: minCheck.totalHeightMm,
      reductionRatio: minFontSizePt / baseFontSizePt,
    }
  }

  // 3. Binary search between minFontSizePt and baseFontSizePt
  let low = minFontSizePt
  let high = baseFontSizePt
  let bestFit = minFontSizePt
  let bestLines = minCheck.totalLines
  let bestHeight = minCheck.totalHeightMm
  const tolerance = 0.25 // pt precision

  for (let iter = 0; iter < 12 && high - low > tolerance; iter++) {
    const mid = Math.round(((low + high) / 2) * 4) / 4 // round to 0.25 pt
    const check = checkTextFits(text, mid, availableWidthMm, availableHeightMm, lineHeight, charRatio)
    if (check.fits) {
      bestFit = mid
      bestLines = check.totalLines
      bestHeight = check.totalHeightMm
      low = mid // try larger font
    } else {
      high = mid // must be smaller
    }
  }

  return {
    fontSizePt: bestFit,
    fittedFontSizePt: bestFit,
    overflows: false,
    isOverflow: false,
    estimatedLines: bestLines,
    estimatedHeightMm: bestHeight,
    reductionRatio: bestFit / baseFontSizePt,
  }
}
