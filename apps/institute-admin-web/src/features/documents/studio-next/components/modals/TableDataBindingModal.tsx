import React, { useState } from 'react'
import type {
  TableColumnV3,
  TableDatasetBindingV3,
} from '@campusone/document-engine'
import {
  CANONICAL_DATASETS,
  resolveDatasetName,
  getSampleDataset,
  evaluateTotalsFormula,
} from '@campusone/document-engine'

export interface TableDataBindingModalProps {
  isOpen: boolean
  currentBinding?: TableDatasetBindingV3
  currentColumns?: TableColumnV3[]
  onClose: () => void
  onApply: (binding: TableDatasetBindingV3, columns: TableColumnV3[]) => void
}

export function TableDataBindingModal({
  isOpen,
  currentBinding,
  currentColumns = [],
  onClose,
  onApply,
}: TableDataBindingModalProps) {
  if (!isOpen) return null

  const initialDataset = resolveDatasetName(currentBinding?.datasetName || 'academics.exam_marks')
  const [selectedDatasetKey, setSelectedDatasetKey] = useState<string>(initialDataset)

  const activeDef = CANONICAL_DATASETS[selectedDatasetKey] || CANONICAL_DATASETS['academics.exam_marks']

  const [columns, setColumns] = useState<TableColumnV3[]>(() => {
    if (currentColumns && currentColumns.length > 0) {
      return JSON.parse(JSON.stringify(currentColumns))
    }
    return activeDef.defaultColumns.map((col, idx) => ({
      id: `col_${idx + 1}`,
      header: col.header,
      fieldId: col.fieldId,
      widthPercent: col.widthPercent,
      align: col.align || 'left',
    }))
  })

  const [totalsEnabled, setTotalsEnabled] = useState<boolean>(
    currentBinding?.totalsRow?.enabled ?? true,
  )
  const [totalsFormula, setTotalsFormula] = useState<string>(() => {
    return currentBinding?.totalsRow?.cells?.[1]?.formula || (selectedDatasetKey.includes('fee') ? 'SUM(amount)' : 'SUM(marks)')
  })

  const handleDatasetChange = (newKey: string) => {
    setSelectedDatasetKey(newKey)
    const newDef = CANONICAL_DATASETS[newKey]
    if (newDef) {
      setColumns(
        newDef.defaultColumns.map((col, idx) => ({
          id: `col_${idx + 1}`,
          header: col.header,
          fieldId: col.fieldId,
          widthPercent: col.widthPercent,
          align: col.align || 'left',
        })),
      )
      setTotalsFormula(newKey.includes('fee') ? 'SUM(amount)' : 'SUM(marks)')
    }
  }

  const handleColumnChange = (index: number, patch: Partial<TableColumnV3>) => {
    setColumns((prev) =>
      prev.map((c, i) => (i === index ? { ...c, ...patch } : c)),
    )
  }

  const handleAddColumn = () => {
    const firstField = activeDef.fields[0]?.key || 'field'
    const newColPct = Math.round((100 / (columns.length + 1)) * 10) / 10
    const scale = (100 - newColPct) / 100
    const scaled = columns.map((col) => ({
      ...col,
      widthPercent: Math.round((col.widthPercent ?? 20) * scale * 10) / 10,
    }))
    setColumns([
      ...scaled,
      {
        id: `col_${Date.now()}`,
        header: 'New Column',
        fieldId: firstField,
        widthPercent: newColPct,
        align: 'left',
      },
    ])
  }

  const handleDeleteColumn = (index: number) => {
    if (columns.length <= 1) return
    const filtered = columns.filter((_, i) => i !== index)
    const totalRemaining = filtered.reduce((sum, c) => sum + (c.widthPercent ?? 20), 0)
    const rebalanced = filtered.map((c) => ({
      ...c,
      widthPercent: Math.round((((c.widthPercent ?? 20) / totalRemaining) * 100) * 10) / 10,
    }))
    setColumns(rebalanced)
  }

  const handleSave = () => {
    const rowTemplateCells = columns.map((col, idx) => ({
      column: idx,
      content: col.fieldId ? `{{item.${col.fieldId}}}` : '',
      align: col.align,
    }))

    const newBinding: TableDatasetBindingV3 = {
      datasetName: selectedDatasetKey,
      rowTemplate: {
        heightMm: 7,
        cells: rowTemplateCells,
      },
      totalsRow: {
        enabled: totalsEnabled,
        label: 'Total',
        heightMm: 8,
        cells: totalsEnabled
          ? [
              { column: 0, content: 'Total', colSpan: Math.max(1, columns.length - 1), align: 'left' },
              {
                column: Math.max(0, columns.length - 1),
                content: `{{${totalsFormula}}}`,
                formula: totalsFormula,
                format: selectedDatasetKey.includes('fee') ? 'currency' : 'number',
                align: 'right',
              },
            ]
          : undefined,
      },
    }

    onApply(newBinding, columns)
    onClose()
  }

  const sampleRows = getSampleDataset(selectedDatasetKey)
  const evaluatedTotal = totalsEnabled ? evaluateTotalsFormula(totalsFormula, sampleRows) : null

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          width: '90%',
          maxWidth: '850px',
          maxHeight: '90vh',
          backgroundColor: '#FFFFFF',
          borderRadius: '8px',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
              Configure Dataset Binding
            </h3>
            <span style={{ fontSize: 12, color: '#64748B' }}>
              Bind table repeating rows and totals to canonical institute datasets
            </span>
          </div>
          <button
            type="button"
            className="sn-btn"
            onClick={onClose}
            style={{ padding: '4px 8px', fontSize: 12 }}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Dataset Selector Cards */}
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
              Select Canonical Dataset:
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
              {Object.values(CANONICAL_DATASETS).map((def) => {
                const isSelected = def.name === selectedDatasetKey
                return (
                  <div
                    key={def.name}
                    onClick={() => handleDatasetChange(def.name)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      border: isSelected ? '2px solid #2563EB' : '1px solid #E2E8F0',
                      backgroundColor: isSelected ? '#EFF6FF' : '#F8FAFC',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13, color: isSelected ? '#1D4ED8' : '#1E293B' }}>
                      {def.label}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{def.description}</div>
                    <div style={{ fontSize: 10, color: '#94A3B8', marginTop: 4, fontFamily: 'monospace' }}>
                      {def.name}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Column Mappings Table */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#334155', margin: 0 }}>
                Column Fields & Layout:
              </label>
              <button
                type="button"
                className="sn-btn sn-btn-primary"
                onClick={handleAddColumn}
                style={{ fontSize: 11, padding: '4px 10px' }}
              >
                + Add Column
              </button>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 6, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                    <th style={{ padding: '8px 10px', width: '25%' }}>Header Title</th>
                    <th style={{ padding: '8px 10px', width: '35%' }}>Dataset Field</th>
                    <th style={{ padding: '8px 10px', width: '15%' }}>Align</th>
                    <th style={{ padding: '8px 10px', width: '15%' }}>Width %</th>
                    <th style={{ padding: '8px 10px', width: '10%', textAlign: 'center' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {columns.map((col, idx) => (
                    <tr key={col.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="text"
                          className="sn-input"
                          value={col.header || ''}
                          onChange={(e) => handleColumnChange(idx, { header: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <select
                          className="sn-select"
                          value={col.fieldId || ''}
                          onChange={(e) => handleColumnChange(idx, { fieldId: e.target.value })}
                          style={{ width: '100%' }}
                        >
                          {activeDef.fields.map((f) => (
                            <option key={f.key} value={f.key}>
                              {f.label} ({f.key})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <select
                          className="sn-select"
                          value={col.align || 'left'}
                          onChange={(e) => handleColumnChange(idx, { align: e.target.value as any })}
                          style={{ width: '100%' }}
                        >
                          <option value="left">Left</option>
                          <option value="center">Center</option>
                          <option value="right">Right</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <input
                          type="number"
                          className="sn-input"
                          value={col.widthPercent ?? 20}
                          onChange={(e) =>
                            handleColumnChange(idx, { widthPercent: parseFloat(e.target.value) || 10 })
                          }
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <button
                          type="button"
                          className="sn-btn"
                          onClick={() => handleDeleteColumn(idx)}
                          style={{ color: '#DC2626', padding: '2px 6px' }}
                          title="Delete Column"
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals Row Settings */}
          <div style={{ background: '#F8FAFC', padding: '12px 16px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <input
                type="checkbox"
                id="enable-totals-chk"
                checked={totalsEnabled}
                onChange={(e) => setTotalsEnabled(e.target.checked)}
              />
              <label htmlFor="enable-totals-chk" style={{ fontSize: 13, fontWeight: 600, color: '#1E293B' }}>
                Enable Totals Summary Row (tfoot)
              </label>
            </div>

            {totalsEnabled && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: '#475569' }}>Formula Expression:</span>
                <input
                  type="text"
                  className="sn-input"
                  value={totalsFormula}
                  onChange={(e) => setTotalsFormula(e.target.value)}
                  placeholder="SUM(marks) or SUM(amount)"
                  style={{ width: 220 }}
                />
                <span style={{ fontSize: 12, color: '#059669', fontWeight: 600 }}>
                  Evaluated Result: {evaluatedTotal !== null ? String(evaluatedTotal) : '—'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '14px 20px',
            borderTop: '1px solid #E2E8F0',
            backgroundColor: '#F8FAFC',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button type="button" className="sn-btn" onClick={onClose} style={{ padding: '6px 16px' }}>
            Cancel
          </button>
          <button
            type="button"
            className="sn-btn sn-btn-primary"
            onClick={handleSave}
            style={{ padding: '6px 20px' }}
          >
            Apply Binding
          </button>
        </div>
      </div>
    </div>
  )
}
