import React from 'react'
import type { ElementV3 } from '@campusone/document-engine'

export interface SavedBlocksTabProps {
  onInsertElements: (elements: ElementV3[]) => void
}

interface SavedBlockDefinition {
  id: string
  name: string
  description: string
  elements: ElementV3[]
}

const PREDEFINED_BLOCKS: SavedBlockDefinition[] = [
  {
    id: 'header-block',
    name: 'Official Letterhead Header',
    description: 'Institution logo, name, address, and affiliation band in header zone',
    elements: [
      {
        id: 'block-header-logo',
        type: 'image',
        zone: 'header',
        xMm: 15,
        yMm: 5,
        widthMm: 25,
        heightMm: 25,
        fit: 'contain',
      },
      {
        id: 'block-header-title',
        type: 'text',
        zone: 'header',
        xMm: 45,
        yMm: 6,
        widthMm: 120,
        heightMm: 12,
        runs: [
          {
            field: { id: 'school_name', fallback: 'CAMPUSONE INTERNATIONAL SCHOOL' },
            style: { fontSizePt: 16, bold: true, color: '#173A5E' },
          },
        ],
      },
      {
        id: 'block-header-subtitle',
        type: 'text',
        zone: 'header',
        xMm: 45,
        yMm: 18,
        widthMm: 140,
        heightMm: 10,
        runs: [
          {
            field: { id: 'school_address', fallback: 'Affiliated to CBSE · New Delhi · Tel: +91 11 2617 0000' },
            style: { fontSizePt: 9, color: '#64748B' },
          },
        ],
      },
      {
        id: 'block-header-divider',
        type: 'divider',
        zone: 'header',
        xMm: 15,
        yMm: 32,
        widthMm: 180,
        heightMm: 1,
        color: '#173A5E',
      },
    ],
  },
  {
    id: 'student-summary-block',
    name: 'Student Profile Card',
    description: 'Photo frame with candidate details matrix (Name, ID, Roll, Class)',
    elements: [
      {
        id: 'block-student-photo',
        type: 'photo',
        zone: 'body',
        xMm: 160,
        yMm: 10,
        widthMm: 30,
        heightMm: 38,
        mask: 'rounded',
      },
      {
        id: 'block-student-name',
        type: 'text',
        zone: 'body',
        xMm: 15,
        yMm: 10,
        widthMm: 135,
        heightMm: 10,
        runs: [
          { text: 'Candidate Name: ', style: { bold: true, fontSizePt: 10, color: '#16212E' } },
          { field: { id: 'student_name', fallback: 'Aarav Sharma' }, style: { fontSizePt: 10, color: '#16212E' } },
        ],
      },
      {
        id: 'block-student-id',
        type: 'text',
        zone: 'body',
        xMm: 15,
        yMm: 22,
        widthMm: 135,
        heightMm: 10,
        runs: [
          { text: 'Admission No: ', style: { bold: true, fontSizePt: 10, color: '#16212E' } },
          { field: { id: 'student_id', fallback: 'STU-2026-089' }, style: { fontSizePt: 10, color: '#16212E' } },
          { text: '   |   Roll No: ', style: { bold: true, fontSizePt: 10, color: '#16212E' } },
          { field: { id: 'roll_no', fallback: '24' }, style: { fontSizePt: 10, color: '#16212E' } },
        ],
      },
    ],
  },
  {
    id: 'signatures-footer-block',
    name: 'Dual Authorization Signatures',
    description: 'Class Teacher and Principal signature lines with QR validation in footer',
    elements: [
      {
        id: 'block-sig-qr',
        type: 'qr',
        zone: 'footer',
        xMm: 15,
        yMm: 2,
        widthMm: 18,
        heightMm: 18,
      },
      {
        id: 'block-sig-teacher',
        type: 'signature',
        zone: 'footer',
        xMm: 60,
        yMm: 2,
        widthMm: 50,
        heightMm: 18,
        label: 'Class Teacher',
      },
      {
        id: 'block-sig-principal',
        type: 'signature',
        zone: 'footer',
        xMm: 140,
        yMm: 2,
        widthMm: 50,
        heightMm: 18,
        label: 'Principal / Head of School',
      },
    ],
  },
]

export function SavedBlocksTab({ onInsertElements }: SavedBlocksTabProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="sn-section-header">Reusable Component Blocks</div>
      {PREDEFINED_BLOCKS.map((block) => (
        <div
          key={block.id}
          style={{
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            padding: 12,
            background: '#FFFFFF',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, color: '#16212E' }}>{block.name}</div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{block.description}</div>
          </div>
          <button
            type="button"
            className="sn-btn sn-btn-primary"
            style={{ alignSelf: 'flex-start', height: 28, fontSize: 11 }}
            onClick={() => {
              // Generate fresh UUIDs for each element when inserting block
              const clones: ElementV3[] = block.elements.map((el) => ({
                ...JSON.parse(JSON.stringify(el)),
                id: crypto.randomUUID(),
              }))
              onInsertElements(clones)
            }}
          >
            + Insert Block
          </button>
        </div>
      ))}
    </div>
  )
}
