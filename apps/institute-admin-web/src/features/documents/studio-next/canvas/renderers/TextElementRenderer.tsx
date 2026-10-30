import React from 'react'
import type { TextElementV3, TextStyleV3 } from '@campusone/document-engine'
import { interpolateTokens, computeAutoFitFontSize, compileFillCss, compileBorderCss, compileCornerRadiiCss } from '@campusone/document-engine'
import { PX_PER_MM } from '../../constants'

const FONT_FALLBACK_STACKS: Record<string, string> = {
  Inter: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  Roboto: "'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif",
  'Open Sans': "'Open Sans', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  Poppins: "'Poppins', -apple-system, BlinkMacSystemFont, sans-serif",
  Lato: "'Lato', -apple-system, BlinkMacSystemFont, Arial, sans-serif",
  Arial: 'Arial, Helvetica, sans-serif',
  Merriweather: "'Merriweather', Georgia, 'Times New Roman', serif",
  'Playfair Display': "'Playfair Display', Georgia, 'Times New Roman', serif",
  Lora: "'Lora', Georgia, serif",
  'Times New Roman': "'Times New Roman', Times, serif",
  Georgia: 'Georgia, serif',
  'JetBrains Mono': "'JetBrains Mono', 'Courier New', Consolas, monospace",
  'Courier New': "'Courier New', Courier, monospace",
  Cinzel: "'Cinzel', Georgia, serif",
}

export interface TextElementRendererProps {
  element: TextElementV3
  zoom: number
  sampleMode: boolean
  sampleData?: Record<string, unknown>
}

export const TextElementRenderer: React.FC<TextElementRendererProps> = ({
  element,
  zoom,
  sampleMode,
  sampleData = {},
}) => {
  const style = (element.style || {}) as TextStyleV3
  const rawContent = element.content || ''
  const interpolated = interpolateTokens(rawContent, sampleData, { sampleMode })

  // Auto-fit calculation
  let effectiveFontSizePt = typeof style.fontSizePt === 'number' && style.fontSizePt > 0 ? style.fontSizePt : 12
  let isOverflow = false

  if (style.autoFit) {
    const minPt = style.minFontSizePt ?? 6
    const fit = computeAutoFitFontSize({
      text: interpolated,
      widthMm: element.widthMm,
      heightMm: element.heightMm,
      baseFontSizePt: effectiveFontSizePt,
      minFontSizePt: minPt,
      lineHeight: style.lineHeight ?? 1.25,
      fontFamily: style.fontFamily,
    })
    effectiveFontSizePt = fit.fittedFontSizePt
    isOverflow = fit.isOverflow
  }

  const fontSizePx = effectiveFontSizePt * (96 / 72) * zoom
  const family = style.fontFamily || 'Inter'
  const fontStack = FONT_FALLBACK_STACKS[family] || `'${family}', sans-serif`

  const weight = style.bold ? 700 : style.fontWeight || 400
  const fontStyle = style.italic ? 'italic' : style.fontStyle || 'normal'

  let textDecoration = 'none'
  if (style.underline && style.strikethrough) textDecoration = 'underline line-through'
  else if (style.underline) textDecoration = 'underline'
  else if (style.strikethrough) textDecoration = 'line-through'
  else if (style.textDecoration) textDecoration = style.textDecoration

  const letterSpacingPx = typeof style.letterSpacingMm === 'number' ? style.letterSpacingMm * PX_PER_MM * zoom : 0
  const lineHeight = style.lineHeight ?? 1.25
  const color = style.color || '#16212E'
  const align = style.align || 'left'
  const textTransform = style.textTransform || 'none'

  // Vertical alignment via flexbox
  let justifyContent: 'flex-start' | 'center' | 'flex-end' = 'flex-start'
  if (style.verticalAlign === 'middle') justifyContent = 'center'
  else if (style.verticalAlign === 'bottom') justifyContent = 'flex-end'

  // Box background, border, corner radii
  const background = compileFillCss(element.fill || element.fillColor, 'transparent')
  const borderCss = compileBorderCss(element.border, element.borderWidthMm, element.borderColor, undefined, 'px')
  const cornerCss = compileCornerRadiiCss(element.cornerRadii, element.borderRadiusMm, 'px')

  // Parse border & corner radii into CSSProperties object if present
  const scale = PX_PER_MM * zoom
  const borderRadiusPx = element.borderRadiusMm ? element.borderRadiusMm * scale : undefined

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent,
        background,
        borderRadius: borderRadiusPx ? `${borderRadiusPx}px` : undefined,
        overflow: 'hidden',
        boxSizing: 'border-box',
        position: 'relative',
        outline: isOverflow ? '1px dashed #EF4444' : undefined,
      }}
    >
      {isOverflow && (
        <div
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            background: '#EF4444',
            color: '#FFFFFF',
            fontSize: `${Math.max(8, 8 * zoom)}px`,
            fontWeight: 700,
            padding: '1px 4px',
            borderRadius: '2px',
            lineHeight: 1.2,
            pointerEvents: 'none',
            zIndex: 10,
          }}
          title="Text overflows bounding box at minimum font size"
        >
          OVERFLOW
        </div>
      )}

      {element.runs && element.runs.length > 0 ? (
        <div style={{ width: '100%', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
          {element.runs.map((run, i) => {
            const runStyle = (run.style || {}) as TextStyleV3
            const runSizePx = ((runStyle.fontSizePt as number) ?? effectiveFontSizePt) * (96 / 72) * zoom
            const runVal = run.field
              ? interpolateTokens(`{{${run.field.id}}}`, sampleData, { sampleMode }) || run.field.fallback || `{{${run.field.id}}}`
              : run.text ?? ''
            return (
              <span
                key={i}
                style={{
                  fontFamily: FONT_FALLBACK_STACKS[runStyle.fontFamily || family] || fontStack,
                  fontSize: `${runSizePx}px`,
                  fontWeight: runStyle.bold ? 700 : runStyle.fontWeight || 400,
                  fontStyle: runStyle.italic ? 'italic' : runStyle.fontStyle || 'normal',
                  color: (runStyle.color as string) || color,
                }}
              >
                {runVal}
              </span>
            )
          })}
        </div>
      ) : (
        <div
          style={{
            width: '100%',
            fontFamily: fontStack,
            fontSize: `${fontSizePx}px`,
            fontWeight: weight,
            fontStyle,
            textDecoration,
            color,
            lineHeight,
            letterSpacing: letterSpacingPx ? `${letterSpacingPx}px` : undefined,
            textAlign: align,
            textTransform,
            wordBreak: 'break-word',
            whiteSpace: 'pre-wrap',
          }}
        >
          {interpolated || (sampleMode ? '' : 'Double click to edit text')}
        </div>
      )}
    </div>
  )
}
