import React from 'react'
import type { BarcodeElementV3, QrCodeElementV3 } from '@campusone/document-engine'
import { generateBarcodeSvg, generateQrSvg } from '@campusone/document-engine'

export interface BarcodeElementRendererProps {
  element: BarcodeElementV3 | QrCodeElementV3
  zoom: number
  sampleMode: boolean
  sampleData?: Record<string, unknown>
}

export const BarcodeElementRenderer: React.FC<BarcodeElementRendererProps> = ({
  element,
  sampleMode,
  sampleData = {},
}) => {
  if (element.type === 'qr') {
    const qrEl = element as QrCodeElementV3
    const payload = (sampleMode && qrEl.fieldId && sampleData[qrEl.fieldId])
      ? String(sampleData[qrEl.fieldId])
      : qrEl.staticText || (sampleData['certificate.verification_url'] as string) || 'https://campusone.in/verify'

    const svg = generateQrSvg(String(payload), {
      errorCorrectionLevel: qrEl.eccLevel ?? 'M',
      margin: qrEl.quietZone ?? 1,
      darkColor: qrEl.darkColor ?? '#000000',
      lightColor: qrEl.lightColor ?? '#FFFFFF',
    })

    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  // 1D Barcode
  const barEl = element as BarcodeElementV3
  const payload = (sampleMode && barEl.fieldId && sampleData[barEl.fieldId])
    ? String(sampleData[barEl.fieldId])
    : barEl.staticValue || (sampleData['student.admission_no'] as string) || (sampleData['admission_no'] as string) || 'STU-2026-089'

  const svg = generateBarcodeSvg(String(payload), {
    format: barEl.format ?? 'CODE128',
    showText: barEl.showText !== false,
    textPosition: barEl.textPosition ?? 'bottom',
    barHeightPercent: barEl.barHeightPercent ?? 80,
    quietZoneMm: barEl.quietZoneMm ?? 2,
    color: barEl.color ?? '#000000',
    backgroundColor: barEl.backgroundColor ?? 'transparent',
  })

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
