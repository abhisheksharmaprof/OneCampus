import React from 'react'
import type { ShapeElementV3, BorderV3, CornerRadiiV3 } from '@campusone/document-engine'
import { compileFillCss } from '@campusone/document-engine'
import { PX_PER_MM } from '../../constants'

export interface ShapeElementRendererProps {
  element: ShapeElementV3
  zoom: number
}

export const ShapeElementRenderer: React.FC<ShapeElementRendererProps> = ({
  element,
  zoom,
}) => {
  const scale = PX_PER_MM * zoom
  const fill = compileFillCss(element.fill || element.fillColor, '#E2E8F0')
  const border = element.border as BorderV3 | undefined
  const cornerRadii = element.cornerRadii as CornerRadiiV3 | undefined
  const shapeType = element.shapeType || 'rectangle'

  // Border computation
  let borderStyleObj: React.CSSProperties = {}
  if (border && border.unified === false) {
    if (border.top && border.top.style !== 'none' && border.top.widthMm > 0) {
      borderStyleObj.borderTop = `${Math.max(1, border.top.widthMm * scale)}px ${border.top.style} ${border.top.color}`
    } else {
      borderStyleObj.borderTop = 'none'
    }
    if (border.right && border.right.style !== 'none' && border.right.widthMm > 0) {
      borderStyleObj.borderRight = `${Math.max(1, border.right.widthMm * scale)}px ${border.right.style} ${border.right.color}`
    } else {
      borderStyleObj.borderRight = 'none'
    }
    if (border.bottom && border.bottom.style !== 'none' && border.bottom.widthMm > 0) {
      borderStyleObj.borderBottom = `${Math.max(1, border.bottom.widthMm * scale)}px ${border.bottom.style} ${border.bottom.color}`
    } else {
      borderStyleObj.borderBottom = 'none'
    }
    if (border.left && border.left.style !== 'none' && border.left.widthMm > 0) {
      borderStyleObj.borderLeft = `${Math.max(1, border.left.widthMm * scale)}px ${border.left.style} ${border.left.color}`
    } else {
      borderStyleObj.borderLeft = 'none'
    }
  } else {
    const widthMm = border?.top?.widthMm ?? element.borderWidthMm ?? 0
    const color = border?.top?.color ?? element.borderColor ?? '#CBD5E1'
    const style = border?.top?.style ?? element.borderStyle ?? (widthMm > 0 ? 'solid' : 'none')
    if (widthMm > 0 && style !== 'none') {
      borderStyleObj.border = `${Math.max(1, widthMm * scale)}px ${style} ${color}`
    }
  }

  // Corner radius computation
  let borderRadiusStyle = '0px'
  if (shapeType === 'ellipse') {
    borderRadiusStyle = '50%'
  } else if (shapeType === 'pill') {
    borderRadiusStyle = '9999px'
  } else if (cornerRadii && cornerRadii.unified === false) {
    const tl = (cornerRadii.topLeftMm ?? 0) * scale
    const tr = (cornerRadii.topRightMm ?? 0) * scale
    const br = (cornerRadii.bottomRightMm ?? 0) * scale
    const bl = (cornerRadii.bottomLeftMm ?? 0) * scale
    borderRadiusStyle = `${tl}px ${tr}px ${br}px ${bl}px`
  } else {
    const rMm = cornerRadii?.topLeftMm ?? element.borderRadiusMm ?? 0
    if (rMm > 0) {
      borderRadiusStyle = `${rMm * scale}px`
    }
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: fill,
        borderRadius: borderRadiusStyle,
        opacity: element.opacity ?? 1,
        boxSizing: 'border-box',
        overflow: 'hidden',
        ...borderStyleObj,
      }}
    />
  )
}
