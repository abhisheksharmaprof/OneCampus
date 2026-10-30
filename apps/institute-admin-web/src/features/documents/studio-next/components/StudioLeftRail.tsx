import React from 'react'
import type { ElementV3, ZoneV3 } from '@campusone/document-engine'
import type { LeftRailTabId } from '../types'
import { ElementsTab } from './ElementsTab'
import { MergeFieldsTab } from './MergeFieldsTab'
import { SavedBlocksTab } from './SavedBlocksTab'
import { LayersTab } from './LayersTab'

export interface StudioLeftRailProps {
  activeTab: LeftRailTabId
  onTabChange: (tab: LeftRailTabId) => void
  elements: ElementV3[]
  selectedElementIds: string[]
  onAddElement: (element: ElementV3) => void
  onInsertElements: (elements: ElementV3[]) => void
  onInsertFieldToken: (field: { id: string; label: string; fallback: string }) => void
  onSelectElement: (id: string | null, multi?: boolean) => void
  onToggleLock: (id: string) => void
  onToggleVisibility: (id: string) => void
  onBringToFront: (id: string) => void
  onSendToBack: (id: string) => void
  onStepUp: (id: string) => void
  onStepDown: (id: string) => void
  onDetachMaster: (id: string) => void
  onReassignZone: (id: string, zone: ZoneV3) => void
}

export function StudioLeftRail({
  activeTab,
  onTabChange,
  elements,
  selectedElementIds,
  onAddElement,
  onInsertElements,
  onInsertFieldToken,
  onSelectElement,
  onToggleLock,
  onToggleVisibility,
  onBringToFront,
  onSendToBack,
  onStepUp,
  onStepDown,
  onDetachMaster,
  onReassignZone,
}: StudioLeftRailProps) {
  return (
    <div className="sn-leftrail">
      {/* 4-Tab Navigation */}
      <div className="sn-rail-tabs">
        <button
          type="button"
          className={`sn-rail-tab ${activeTab === 'elements' ? 'active' : ''}`}
          onClick={() => onTabChange('elements')}
        >
          Elements
        </button>
        <button
          type="button"
          className={`sn-rail-tab ${activeTab === 'fields' ? 'active' : ''}`}
          onClick={() => onTabChange('fields')}
        >
          Fields
        </button>
        <button
          type="button"
          className={`sn-rail-tab ${activeTab === 'blocks' ? 'active' : ''}`}
          onClick={() => onTabChange('blocks')}
        >
          Blocks
        </button>
        <button
          type="button"
          className={`sn-rail-tab ${activeTab === 'layers' ? 'active' : ''}`}
          onClick={() => onTabChange('layers')}
        >
          Layers
        </button>
      </div>

      {/* Tab Content */}
      <div className="sn-rail-content">
        {activeTab === 'elements' && <ElementsTab onAddElement={onAddElement} />}
        {activeTab === 'fields' && <MergeFieldsTab onInsertField={onInsertFieldToken} />}
        {activeTab === 'blocks' && <SavedBlocksTab onInsertElements={onInsertElements} />}
        {activeTab === 'layers' && (
          <LayersTab
            elements={elements}
            selectedElementIds={selectedElementIds}
            onSelectElement={onSelectElement}
            onToggleLock={onToggleLock}
            onToggleVisibility={onToggleVisibility}
            onBringToFront={onBringToFront}
            onSendToBack={onSendToBack}
            onStepUp={onStepUp}
            onStepDown={onStepDown}
            onDetachMaster={onDetachMaster}
            onReassignZone={onReassignZone}
          />
        )}
      </div>
    </div>
  )
}
