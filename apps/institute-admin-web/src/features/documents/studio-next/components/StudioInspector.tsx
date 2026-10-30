import React from 'react'
import type { ElementV3, LayoutV3, ZoneV3, MasterLetterheadBindingV3, WatermarkV3 } from '@campusone/document-engine'
import type { DocumentTemplateRecord } from '../../documents.api'
import type { InspectorTabId } from '../types'
import { ElementInspector } from './ElementInspector'
import { PageInspector } from './PageInspector'
import { WatermarkInspector } from './WatermarkInspector'

export interface StudioInspectorProps {
  layout: LayoutV3
  activeTab: InspectorTabId
  selectedElement: ElementV3 | null
  masterLetterheads?: DocumentTemplateRecord[]
  onTabChange: (tab: InspectorTabId) => void
  onUpdateElement: (id: string, patch: Partial<ElementV3>) => void
  onReassignZone: (id: string, zone: ZoneV3) => void
  onDeleteElement: (id: string) => void
  onDuplicateElement: (id: string) => void
  onToggleLock: (id: string) => void
  onUpdatePage: (patch: Partial<LayoutV3['page']>) => void
  onUpdateZones: (patch: Partial<LayoutV3['zones']>) => void
  onSetMasterLetterhead: (binding: MasterLetterheadBindingV3 | null) => void
  onUpdateWatermark: (patch: Partial<WatermarkV3>) => void
}

export function StudioInspector({
  layout,
  activeTab,
  selectedElement,
  masterLetterheads,
  onTabChange,
  onUpdateElement,
  onReassignZone,
  onDeleteElement,
  onDuplicateElement,
  onToggleLock,
  onUpdatePage,
  onUpdateZones,
  onSetMasterLetterhead,
  onUpdateWatermark,
}: StudioInspectorProps) {
  return (
    <div className="sn-inspector">
      {/* 3 Inspector Tabs */}
      <div className="sn-inspector-tabs">
        <button
          type="button"
          className={`sn-inspector-tab ${activeTab === 'element' ? 'active' : ''}`}
          onClick={() => onTabChange('element')}
        >
          Element
        </button>
        <button
          type="button"
          className={`sn-inspector-tab ${activeTab === 'page' ? 'active' : ''}`}
          onClick={() => onTabChange('page')}
        >
          Page & Zones
        </button>
        <button
          type="button"
          className={`sn-inspector-tab ${activeTab === 'watermark' ? 'active' : ''}`}
          onClick={() => onTabChange('watermark')}
        >
          Watermark
        </button>
      </div>

      {/* Inspector Content */}
      <div className="sn-inspector-content">
        {activeTab === 'element' && (
          <ElementInspector
            element={selectedElement}
            onUpdateElement={onUpdateElement}
            onReassignZone={onReassignZone}
            onDeleteElement={onDeleteElement}
            onDuplicateElement={onDuplicateElement}
            onToggleLock={onToggleLock}
          />
        )}
        {activeTab === 'page' && (
          <PageInspector
            layout={layout}
            masterLetterheads={masterLetterheads}
            onUpdatePage={onUpdatePage}
            onUpdateZones={onUpdateZones}
            onSetMasterLetterhead={onSetMasterLetterhead}
          />
        )}
        {activeTab === 'watermark' && (
          <WatermarkInspector
            watermark={layout.watermark}
            onUpdateWatermark={onUpdateWatermark}
          />
        )}
      </div>
    </div>
  )
}
