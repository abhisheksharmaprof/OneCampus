import type { ReactNode } from 'react'

export interface BreadcrumbItem {
  label: string
  href?: string
}

export interface BreadcrumbsProps {
  items: readonly BreadcrumbItem[]
  label?: string
}

export function Breadcrumbs({ items, label = 'Breadcrumb' }: BreadcrumbsProps) {
  return (
    <nav className="admin-breadcrumbs" aria-label={label}>
      <ol>
        {items.map((item, index) => {
          const current = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !current ? <a href={item.href}>{item.label}</a> : <span aria-current={current ? 'page' : undefined}>{item.label}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export interface PageHeaderProps {
  title: string
  breadcrumbs?: readonly BreadcrumbItem[]
  description?: ReactNode
  actions?: ReactNode
  metadata?: ReactNode
  headingId?: string
}

export function PageHeader({ title, breadcrumbs, description, actions, metadata, headingId }: PageHeaderProps) {
  return (
    <header className="admin-page-header">
      <div className="admin-page-header__main">
        {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
        <h1 id={headingId}>{title}</h1>
        {description ? <div className="admin-page-header__description">{description}</div> : null}
        {metadata ? <div className="admin-page-header__metadata">{metadata}</div> : null}
      </div>
      {actions ? <div className="admin-page-header__actions">{actions}</div> : null}
    </header>
  )
}
