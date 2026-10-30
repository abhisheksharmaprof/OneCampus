import React from 'react'
import type { ElementV3, ZoneV3 } from '@campusone/document-engine'

export interface LayersTabProps {
  elements: ElementV3[]
  selectedElementIds: string[]
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

export function LayersTab({
  elements,
  selectedElementIds,
  onSelectElement,
  onToggleLock,
  onToggleVisibility,
  onBringToFront,
  onSendToBack,
  onStepUp,
  onStepDown,
  onDetachMaster,
  onReassignZone,
}: LayersTabProps) {
  const headerElements = elements.filter((el) => el.zone === 'header')
  const bodyElements = elements.filter((el) => !el.zone || el.zone === 'body')
  const footerElements = elements.filter((el) => el.zone === 'footer')

  const renderGroup = (title: string, groupZone: ZoneV3, items: ElementV3[]) => (
    <div className="sn-layer-group">
      <div className="sn-layer-group-title">
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <div style={{ fontSize: 11, color: '#94A3B8', padding: '4px 8px' }}>No elements in {title.toLowerCase()}</div>
      ) : (
        items.map((el) => {
          const isSelected = selectedElementIds.includes(el.id)
          const isInherited = Boolean(el.isInherited)
          const isLocked = Boolean(el.locked)
          const isVisible = el.visible !== false

          return (
            <div
              key={el.id}
              className={`sn-layer-item ${isSelected ? 'selected' : ''}`}
              onClick={(e) => {
                onSelectElement(el.id, e.shiftKey || e.metaKey || e.ctrlKey)
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                <span style={{ fontSize: 13 }}>
                  {el.type === 'text'
                    ? 'T'
                    : el.type === 'image'
                      ? '🖼'
                      : el.type === 'table'
                        ? '▦'
                        : el.type === 'signature'
                          ? '✍'
                          : '■'}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: isSelected ? 600 : 400,
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    overflow: 'hidden',
                    maxWidth: 120,
                  }}
                >
                  {el.type}
                  {el.id ? ` (${el.id.slice(0, 4)})` : ''}
                </span>

                {isInherited && (
                  <span
                    className="sn-badge sn-badge-master"
                    style={{ fontSize: 9, padding: '1px 4px', cursor: 'pointer' }}
                    title="Click to detach from master letterhead"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDetachMaster(el.id)
                    }}
                  >
                    Master
                  </span>
                )}
              </div>

              <div className="sn-layer-actions" onClick={(e) => e.stopPropagation()}>
                {/* Z-order controls */}
                {!isInherited && (
                  <>
                    <button
                      type="button"
                      className="sn-btn"
                      style={{ padding: '0 4px', height: 20, fontSize: 10 }}
                      title="Move Up"
                      onClick={() => onStepUp(el.id)}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      className="sn-btn"
                      style={{ padding: '0 4px', height: 20, fontSize: 10 }}
                      title="Move Down"
                      onClick={() => onStepDown(el.id)}
                    >
                      ▼
                    </button>
                  </>
                )}

                {/* Lock toggle */}
                <button
                  type="button"
                  className="sn-btn"
                  style={{ padding: '0 4px', height: 20, fontSize: 10 }}
                  title={isLocked ? 'Unlock Element' : 'Lock Element'}
                  onClick={() => onToggleLock(el.id)}
                >
                  {isLocked ? '🔒' : '🔓'}
                </button>

                {/* Visibility toggle */}
                <button
                  type="button"
                  className="sn-btn"
                  style={{ padding: '0 4px', height: 20, fontSize: 10 }}
                  title={isVisible ? 'Hide Element' : 'Show Element'}
                  onClick={() => onToggleVisibility(el.id)}
                >
                  {isVisible ? '👁' : '👁‍🗨'}
                </button>
              </div>
            </div>
          )
        })
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {renderGroup('Header Zone', 'header', headerElements)}
      {renderGroup('Body Zone', 'body', bodyElements)}
      {renderGroup('Footer Zone', 'footer', footerElements)}

      {/* Background layer */}
      <div className="sn-layer-group">
        <div className="sn-layer-group-title">Background & Watermark</div>
        <div className="sn-layer-item" style={{ color: '#64748B' }}>
          <span>Page Canvas & Watermark</span>
          <span style={{ fontSize: 10 }}>Base Layer</span>
        </div>
      </div>
    </div>
  )
}
