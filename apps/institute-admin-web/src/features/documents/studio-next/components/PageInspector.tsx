import React from 'react'
import type { LayoutV3, PageSizeId, Orientation, MasterLetterheadBindingV3 } from '@campusone/document-engine'
import type { DocumentTemplateRecord } from '../../documents.api'
import { PAGE_SIZES_MM } from '../../engine/types'

export interface PageInspectorProps {
  layout: LayoutV3
  masterLetterheads?: DocumentTemplateRecord[]
  onUpdatePage: (patch: Partial<LayoutV3['page']>) => void
  onUpdateZones: (patch: Partial<LayoutV3['zones']>) => void
  onSetMasterLetterhead: (binding: MasterLetterheadBindingV3 | null) => void
}

export function PageInspector({
  layout,
  masterLetterheads = [],
  onUpdatePage,
  onUpdateZones,
  onSetMasterLetterhead,
}: PageInspectorProps) {
  const { page, zones, masterLetterhead } = layout
  const margins = page.marginsMm ?? { top: 10, right: 10, bottom: 10, left: 10 }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Page Setup */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Page Setup</div>
        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">Paper Format</span>
            <select
              className="sn-select"
              value={page.sizeId}
              onChange={(e) => onUpdatePage({ sizeId: e.target.value as PageSizeId })}
            >
              <option value="A4P">A4 Portrait (210 × 297 mm)</option>
              <option value="A4L">A4 Landscape (297 × 210 mm)</option>
              <option value="CR80">CR80 PVC Card (86 × 54 mm)</option>
              <option value="A4P_HALF_TOP">A4 Half Top (210 × 148.5 mm)</option>
              <option value="A4P_HALF_BOTTOM">A4 Half Bottom (210 × 148.5 mm)</option>
            </select>
          </div>
        </div>

        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">Orientation</span>
            <select
              className="sn-select"
              value={page.orientation}
              onChange={(e) => onUpdatePage({ orientation: e.target.value as Orientation })}
            >
              <option value="PORTRAIT">Portrait</option>
              <option value="LANDSCAPE">Landscape</option>
            </select>
          </div>
          <div className="sn-field-col">
            <span className="sn-field-label">Background Fill</span>
            <input
              type="color"
              className="sn-input"
              style={{ padding: 2 }}
              value={typeof page.background === 'string' ? page.background : '#FFFFFF'}
              onChange={(e) => onUpdatePage({ background: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Margins */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Margins (mm)</div>
        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">Top (mm)</span>
            <input
              type="number"
              className="sn-input"
              value={margins.top}
              onChange={(e) =>
                onUpdatePage({
                  marginsMm: { ...margins, top: Math.max(0, parseFloat(e.target.value) || 0) },
                })
              }
            />
          </div>
          <div className="sn-field-col">
            <span className="sn-field-label">Bottom (mm)</span>
            <input
              type="number"
              className="sn-input"
              value={margins.bottom}
              onChange={(e) =>
                onUpdatePage({
                  marginsMm: { ...margins, bottom: Math.max(0, parseFloat(e.target.value) || 0) },
                })
              }
            />
          </div>
        </div>
        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">Left (mm)</span>
            <input
              type="number"
              className="sn-input"
              value={margins.left}
              onChange={(e) =>
                onUpdatePage({
                  marginsMm: { ...margins, left: Math.max(0, parseFloat(e.target.value) || 0) },
                })
              }
            />
          </div>
          <div className="sn-field-col">
            <span className="sn-field-label">Right (mm)</span>
            <input
              type="number"
              className="sn-input"
              value={margins.right}
              onChange={(e) =>
                onUpdatePage({
                  marginsMm: { ...margins, right: Math.max(0, parseFloat(e.target.value) || 0) },
                })
              }
            />
          </div>
        </div>
      </div>

      {/* Stationery Zones */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Stationery Zones</div>
        <div className="sn-field-row">
          <div className="sn-field-col">
            <span className="sn-field-label">Header Band Height</span>
            <input
              type="number"
              className="sn-input"
              value={zones.headerMm}
              onChange={(e) => onUpdateZones({ headerMm: Math.max(0, parseFloat(e.target.value) || 0) })}
            />
          </div>
          <div className="sn-field-col">
            <span className="sn-field-label">Footer Band Height</span>
            <input
              type="number"
              className="sn-input"
              value={zones.footerMm}
              onChange={(e) => onUpdateZones({ footerMm: Math.max(0, parseFloat(e.target.value) || 0) })}
            />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={Boolean(zones.repeatHeader)}
              onChange={(e) => onUpdateZones({ repeatHeader: e.target.checked })}
            />
            Repeat Header across multi-page flows
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <input
              type="checkbox"
              checked={Boolean(zones.repeatFooter)}
              onChange={(e) => onUpdateZones({ repeatFooter: e.target.checked })}
            />
            Repeat Footer across multi-page flows
          </label>
        </div>
      </div>

      {/* Master Letterhead Binding */}
      <div className="sn-inspector-section">
        <div className="sn-section-header">Master Letterhead</div>
        <div className="sn-field-col">
          <span className="sn-field-label">Bound Letterhead</span>
          <select
            className="sn-select"
            value={masterLetterhead?.templateId ?? ''}
            onChange={(e) => {
              const tid = e.target.value
              if (!tid) {
                onSetMasterLetterhead(null)
              } else {
                onSetMasterLetterhead({ templateId: tid, mode: 'followDraft' })
              }
            }}
          >
            <option value="">None (Independent stationery)</option>
            {masterLetterheads.map((lh) => (
              <option key={lh.id} value={lh.id}>
                {lh.name}
              </option>
            ))}
          </select>
        </div>
        {masterLetterhead && (
          <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="sn-badge sn-badge-master">
              Mode: {masterLetterhead.mode || 'followDraft'}
            </span>
            <button
              type="button"
              className="sn-btn"
              style={{ height: 24, fontSize: 11 }}
              onClick={() => onSetMasterLetterhead(null)}
            >
              Detach
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
