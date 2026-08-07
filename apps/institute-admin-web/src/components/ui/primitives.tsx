import type { PropsWithChildren, ReactNode } from 'react'

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <section className={`card ${className}`.trim()}>{children}</section>
}

export function SectionHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="section-header">
      <h2>{title}</h2>
      {action}
    </div>
  )
}

export function IconButton({ label, children, onClick, expanded }: PropsWithChildren<{
  label: string
  onClick?: () => void
  expanded?: boolean
}>) {
  return (
    <button
      className="icon-button"
      type="button"
      aria-label={label}
      aria-expanded={expanded}
      onClick={onClick}
    >
      {children}
    </button>
  )
}
