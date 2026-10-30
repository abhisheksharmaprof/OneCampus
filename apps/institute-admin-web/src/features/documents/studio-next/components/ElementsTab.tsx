import React from 'react'
import { createElementDefault } from '../constants'
import type { ElementV3, ZoneV3 } from '@campusone/document-engine'

export interface ElementsTabProps {
  onAddElement: (element: ElementV3) => void
  currentZone?: ZoneV3
}

interface ElementDefinition {
  type: string
  name: string
  icon: string
  defaultZone: ZoneV3
  category: string
}

const PALETTE: ElementDefinition[] = [
  // Basic
  { type: 'text', name: 'Text Box', icon: 'T', defaultZone: 'body', category: 'Basic' },
  { type: 'shape', name: 'Rectangle', icon: '▭', defaultZone: 'body', category: 'Basic' },
  { type: 'divider', name: 'Divider Line', icon: '―', defaultZone: 'body', category: 'Basic' },
  { type: 'pageFrame', name: 'Page Border', icon: '□', defaultZone: 'body', category: 'Basic' },

  // Media
  { type: 'image', name: 'Logo / Image', icon: '🖼', defaultZone: 'header', category: 'Media' },
  { type: 'photo', name: 'Student Photo', icon: '👤', defaultZone: 'body', category: 'Media' },
  { type: 'signature', name: 'Signature', icon: '✍', defaultZone: 'footer', category: 'Media' },

  // Tables
  { type: 'staticTable', name: 'Static Table', icon: '▦', defaultZone: 'body', category: 'Data & Tables' },
  { type: 'dynamicTable', name: 'Dynamic Table', icon: '▤', defaultZone: 'body', category: 'Data & Tables' },
  { type: 'totals', name: 'Summary Totals', icon: '∑', defaultZone: 'body', category: 'Data & Tables' },

  // Codes
  { type: 'qr', name: 'QR Code', icon: '▣', defaultZone: 'footer', category: 'Codes' },
  { type: 'barcode', name: 'Barcode', icon: '|||', defaultZone: 'body', category: 'Codes' },
]

export function ElementsTab({ onAddElement }: ElementsTabProps) {
  const categories = Array.from(new Set(PALETTE.map((p) => p.category)))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {categories.map((cat) => (
        <div key={cat}>
          <div className="sn-section-header">{cat}</div>
          <div className="sn-element-grid">
            {PALETTE.filter((p) => p.category === cat).map((item) => (
              <button
                key={item.type}
                type="button"
                className="sn-element-tile"
                onClick={() => {
                  const element = createElementDefault(item.type, item.defaultZone)
                  onAddElement(element)
                }}
              >
                <span className="sn-element-tile-icon">{item.icon}</span>
                <span className="sn-element-tile-label">{item.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
