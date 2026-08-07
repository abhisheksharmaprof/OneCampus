import { Construction, DatabaseZap } from 'lucide-react'
import { Card } from '../../components/ui/primitives'

export function UnavailableModulePage({ title, breadcrumb, comingSoon = false }: { title: string; breadcrumb: string; comingSoon?: boolean }) {
  return (
    <div className="entity-page">
      <div className="page-heading">
        <div><p className="breadcrumb">{breadcrumb}</p><h1>{title}</h1></div>
      </div>
      <Card className="module-availability">
        <span className="module-availability-icon" aria-hidden="true">{comingSoon ? <Construction /> : <DatabaseZap />}</span>
        <div role="status">
          <h2>{comingSoon ? `${title} — Coming Soon` : 'Data source not available yet'}</h2>
          <p className="empty-copy">{comingSoon
            ? `${title === 'Transport' ? 'Routes, GPS bus tracking, and automatic bus-arrival parent alerts.' : title === 'Library' ? 'Catalog, circulation, and overdue fine workflows.' : 'Room allocation, visitor logs, and meal tracking.'}`
            : 'This route is connected, but the server does not currently expose an admin API or persisted model for this module. No sample or fabricated records are shown.'}</p>
        </div>
      </Card>
    </div>
  )
}
