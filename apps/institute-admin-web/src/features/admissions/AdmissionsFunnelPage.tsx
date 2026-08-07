import { Card, SectionHeader } from '../../components/ui/primitives'
import { PageSkeleton } from '../../components/admin-ui'
import type { DashboardData } from '../dashboard/dashboard.api'

export function AdmissionsFunnelPage({ data, error }: { data: DashboardData | null; error: string }) {
  const stages = data ? [
    ['Enquiry', data.admissionsFunnel.enquiry],
    ['Visit scheduled', data.admissionsFunnel.visitScheduled],
    ['Applied', data.admissionsFunnel.applied],
    ['Enrolled', data.admissionsFunnel.enrolled],
  ] as const : []

  return (
    <div className="entity-page">
      <div className="page-heading"><div><p className="breadcrumb">Admissions CRM / Funnel Report</p><h1>Funnel Report</h1></div></div>
      <Card>
        <SectionHeader title="Admissions funnel — this month" />
        {!data ? error ? <p className="empty-copy" role="alert">{error}</p> : <PageSkeleton name="admissions-funnel" label="Loading admissions funnel" variant="form" /> : (
          <div className="funnel-report" aria-label="Admissions funnel stages">
            {stages.map(([label, value], index) => {
              const previous = index ? stages[index - 1][1] : null
              const conversion = previous ? Math.round(value / previous * 100) : null
              return <div className="funnel-report-stage" key={label}><span>{label}</span><strong>{value.toLocaleString('en-IN')}</strong><small>{conversion == null ? 'Starting stage' : `${conversion}% conversion`}</small></div>
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
