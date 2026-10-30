import React from 'react'
import { PX_PER_MM } from '../constants'

export interface RulersProps {
  pageWidthMm: number
  pageHeightMm: number
  zoom: number
  cursorMm: { xMm: number; yMm: number } | null
}

export function TopRuler({ pageWidthMm, zoom, cursorMm }: { pageWidthMm: number; zoom: number; cursorMm: { xMm: number; yMm: number } | null }) {
  const scale = PX_PER_MM * zoom
  const totalPx = pageWidthMm * scale
  const stepMm = zoom < 0.6 ? 50 : zoom < 1.2 ? 10 : 5

  const ticks: React.ReactNode[] = []
  for (let mm = 0; mm <= pageWidthMm; mm += stepMm) {
    const isMajor = mm % (stepMm === 5 ? 25 : 50) === 0 || (stepMm === 10 && mm % 50 === 0)
    const x = mm * scale
    ticks.push(
      <g key={mm} transform={`translate(${x}, 0)`}>
        <line x1={0} y1={isMajor ? 8 : 14} x2={0} y2={24} stroke="#94A3B8" strokeWidth={1} />
        {isMajor && (
          <text x={2} y={10} fill="#64748B" fontSize={8} fontFamily="sans-serif">
            {mm}
          </text>
        )}
      </g>,
    )
  }

  const cursorX = cursorMm ? cursorMm.xMm * scale : null

  return (
    <svg width={totalPx} height={24} style={{ display: 'block' }}>
      {ticks}
      {cursorX !== null && cursorX >= 0 && cursorX <= totalPx && (
        <line x1={cursorX} y1={0} x2={cursorX} y2={24} stroke="#2563EB" strokeWidth={1.5} />
      )}
    </svg>
  )
}

export function LeftRuler({ pageHeightMm, zoom, cursorMm }: { pageHeightMm: number; zoom: number; cursorMm: { xMm: number; yMm: number } | null }) {
  const scale = PX_PER_MM * zoom
  const totalPx = pageHeightMm * scale
  const stepMm = zoom < 0.6 ? 50 : zoom < 1.2 ? 10 : 5

  const ticks: React.ReactNode[] = []
  for (let mm = 0; mm <= pageHeightMm; mm += stepMm) {
    const isMajor = mm % (stepMm === 5 ? 25 : 50) === 0 || (stepMm === 10 && mm % 50 === 0)
    const y = mm * scale
    ticks.push(
      <g key={mm} transform={`translate(0, ${y})`}>
        <line x1={isMajor ? 8 : 14} y1={0} x2={24} y2={0} stroke="#94A3B8" strokeWidth={1} />
        {isMajor && (
          <text
            x={2}
            y={-2}
            fill="#64748B"
            fontSize={8}
            fontFamily="sans-serif"
            transform="rotate(-90 2,-2)"
          >
            {mm}
          </text>
        )}
      </g>,
    )
  }

  const cursorY = cursorMm ? cursorMm.yMm * scale : null

  return (
    <svg width={24} height={totalPx} style={{ display: 'block' }}>
      {ticks}
      {cursorY !== null && cursorY >= 0 && cursorY <= totalPx && (
        <line x1={0} y1={cursorY} x2={24} y2={cursorY} stroke="#2563EB" strokeWidth={1.5} />
      )}
    </svg>
  )
}
