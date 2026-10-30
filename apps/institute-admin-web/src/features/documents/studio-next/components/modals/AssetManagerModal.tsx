import React, { useState } from 'react'
import { ASSET_PRESETS, type AssetPreset } from '../../utils/assetPresets'
import { removeWhiteBackground } from '../../utils/removeWhiteThreshold'

export interface AssetRecord {
  id: string
  name: string
  category: 'logos' | 'signatures' | 'stamps' | 'badges' | 'custom'
  src: string
  isDerived?: boolean
}

export interface AssetManagerModalProps {
  isOpen: boolean
  onClose: () => void
  onSelectAsset: (asset: { id: string; src: string; name: string }) => void
  initialCategory?: 'all' | 'logos' | 'signatures' | 'stamps' | 'badges' | 'presets'
}

export const AssetManagerModal: React.FC<AssetManagerModalProps> = ({
  isOpen,
  onClose,
  onSelectAsset,
  initialCategory = 'all',
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'logos' | 'signatures' | 'stamps' | 'badges' | 'presets'>(initialCategory)
  const [search, setSearch] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<AssetRecord | null>(null)
  const [cleaning, setCleaning] = useState(false)
  const [uploadedAssets, setUploadedAssets] = useState<AssetRecord[]>([])

  if (!isOpen) return null

  // Convert preset SVG to data URL for uniform usage
  const presetAssets: AssetRecord[] = ASSET_PRESETS.map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    src: `data:image/svg+xml;utf8,${encodeURIComponent(p.svg)}`,
  }))

  const allAssets = [...presetAssets, ...uploadedAssets]

  const filteredAssets = allAssets.filter((a) => {
    if (activeTab === 'presets') return a.id.startsWith('stamp-') || a.id.startsWith('crest-') || a.id.startsWith('sig-') || a.id.startsWith('badge-')
    if (activeTab !== 'all' && a.category !== activeTab) return false
    if (!search.trim()) return true
    return a.name.toLowerCase().includes(search.toLowerCase())
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    Array.from(files).forEach((file) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const newAsset: AssetRecord = {
          id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          category: 'custom',
          src: result,
        }
        setUploadedAssets((prev) => [newAsset, ...prev])
        setSelectedAsset(newAsset)
      }
      reader.readAsDataURL(file)
    })
  }

  const handleCleanBackground = async () => {
    if (!selectedAsset) return
    setCleaning(true)
    try {
      const cleanSrc = await removeWhiteBackground(selectedAsset.src, { threshold: 235, feather: 15 })
      const derivedAsset: AssetRecord = {
        id: `${selectedAsset.id}-clean`,
        name: `${selectedAsset.name.replace(/\.[^/.]+$/, '')} (Transparent).png`,
        category: selectedAsset.category,
        src: cleanSrc,
        isDerived: true,
      }
      setUploadedAssets((prev) => [derivedAsset, ...prev])
      setSelectedAsset(derivedAsset)
    } catch (err) {
      console.error('Failed to remove white background:', err)
    } finally {
      setCleaning(false)
    }
  }

  return (
    <div className="sn-modal-overlay" style={{ zIndex: 1000 }}>
      <div className="sn-modal-dialog" style={{ width: 750, maxWidth: '95vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <div className="sn-modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 18 }}>🖼️</span>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Institute Asset Manager</span>
          </div>
          <button type="button" className="sn-btn" onClick={onClose} style={{ padding: '0 8px', height: 24 }}>
            ✕
          </button>
        </div>

        {/* Toolbar: Search, Upload & Filter Tabs */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              className="sn-input"
              placeholder="Search assets (e.g. seal, logo, signature)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1, height: 32 }}
            />
            <label className="sn-btn sn-btn-primary" style={{ height: 32, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <span>+ Upload Asset</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                multiple
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </label>
          </div>

          {/* Category Tabs */}
          <div style={{ display: 'flex', gap: 4, overflowX: 'auto' }}>
            {(['all', 'logos', 'signatures', 'stamps', 'badges', 'presets'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`sn-btn ${activeTab === tab ? 'sn-btn-primary' : ''}`}
                onClick={() => setActiveTab(tab)}
                style={{ height: 26, padding: '0 10px', fontSize: 11, textTransform: 'capitalize' }}
              >
                {tab === 'stamps' ? 'Stamps & Seals' : tab}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content: Grid + Preview Sidebar */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Asset Grid */}
          <div style={{ flex: 1, padding: 16, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
            {filteredAssets.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', textAlign: 'center', color: '#64748B', padding: '40px 0' }}>
                No assets found. Try another search or upload a new asset.
              </div>
            ) : (
              filteredAssets.map((asset) => {
                const isSelected = selectedAsset?.id === asset.id
                return (
                  <div
                    key={asset.id}
                    onClick={() => setSelectedAsset(asset)}
                    style={{
                      border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                      borderRadius: 6,
                      padding: 8,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      background: isSelected ? '#EFF6FF' : '#FFFFFF',
                      cursor: 'pointer',
                      transition: 'all 0.1s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '100%',
                        height: 90,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: '#F8FAFC',
                        borderRadius: 4,
                        overflow: 'hidden',
                        marginBottom: 6,
                      }}
                    >
                      <img
                        src={asset.src}
                        alt={asset.name}
                        style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }}
                      />
                    </div>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 600,
                        color: isSelected ? '#1D4ED8' : '#1E293B',
                        textAlign: 'center',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={asset.name}
                    >
                      {asset.name}
                    </span>
                    {asset.isDerived && (
                      <span style={{ fontSize: 9, background: '#DCFCE7', color: '#15803D', padding: '1px 4px', borderRadius: 2, marginTop: 2 }}>
                        Cleaned ✓
                      </span>
                    )}
                  </div>
                )
              })
            )}
          </div>

          {/* Details Sidebar */}
          {selectedAsset && (
            <div style={{ width: 220, borderLeft: '1px solid #E2E8F0', padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: '#FAFAFA' }}>
              <div style={{ fontWeight: 700, fontSize: 12 }}>Asset Details</div>
              <div
                style={{
                  width: '100%',
                  height: 120,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'repeating-conic-gradient(#E2E8F0 0% 25%, #FFFFFF 0% 50%) 50% / 12px 12px',
                  borderRadius: 6,
                  border: '1px solid #CBD5E1',
                }}
              >
                <img src={selectedAsset.src} alt="" style={{ maxWidth: '90%', maxHeight: '90%', objectFit: 'contain' }} />
              </div>

              <div style={{ fontSize: 11, color: '#334155', wordBreak: 'break-word' }}>
                <strong>File:</strong> {selectedAsset.name}
              </div>

              {/* Scanned paper background cleaner tool */}
              {!selectedAsset.id.endsWith('-clean') && (
                <div style={{ background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, padding: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#92400E', marginBottom: 4 }}>
                    Scanned Signature Tool
                  </div>
                  <div style={{ fontSize: 10, color: '#B45309', marginBottom: 8 }}>
                    Remove white paper background and create a transparent signature copy.
                  </div>
                  <button
                    type="button"
                    className="sn-btn"
                    disabled={cleaning}
                    onClick={handleCleanBackground}
                    style={{ width: '100%', height: 26, fontSize: 11, fontWeight: 600, background: '#FFFFFF', color: '#92400E' }}
                  >
                    {cleaning ? 'Cleaning...' : '✨ Clean Background'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sn-modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: '#64748B' }}>
            {selectedAsset ? `Selected: ${selectedAsset.name}` : 'Select an asset from the gallery'}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="sn-btn" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="sn-btn sn-btn-primary"
              disabled={!selectedAsset}
              onClick={() => {
                if (selectedAsset) {
                  onSelectAsset({ id: selectedAsset.id, src: selectedAsset.src, name: selectedAsset.name })
                  onClose()
                }
              }}
            >
              Insert / Apply Asset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
