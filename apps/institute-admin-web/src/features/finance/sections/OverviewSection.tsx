import { fetchSummary } from '../finance.api'
import { money, StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

export default function OverviewSection({ accessToken, branchId, onNavigate }: FinanceSectionProps) {
  const summary = useAbortableLoad((signal) => fetchSummary(accessToken, branchId, signal), [accessToken, branchId])
  const data = summary.data
  const series = data?.monthlySeries ?? []
  const maxCollected = Math.max(1, ...series.map((point) => Number(point.collected || 0)))

  return (
    <>
      <div className="fin-toolbar">
        <span style={{ flex: 1 }} />
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => onNavigate('/finance/invoices')}>New invoice</button>
        <button type="button" className="fin-btn" onClick={() => onNavigate('/finance/payments')}>Record payment</button>
        <button type="button" className="fin-btn" onClick={() => onNavigate('/finance/dues')}>View dues</button>
      </div>
      <StatePanel loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        <div className="fin-kpis">
          <div className="fin-kpi">
            <span>Collected this month</span>
            <b>{money(data?.collectedThisMonth ?? 0)}</b>
          </div>
          <div className="fin-kpi">
            <span>Outstanding total</span>
            <b>{money(data?.outstandingTotal ?? 0)}</b>
          </div>
          <div className="fin-kpi">
            <span>Overdue invoices</span>
            <b>{data?.overdueCount ?? 0}</b>
          </div>
          <div className="fin-kpi">
            <span>Receipts today</span>
            <b>{data?.receiptsToday ?? 0}</b>
          </div>
        </div>
        <div className="fin-card">
          <h4>Monthly collections</h4>
          {series.length ? (
            <div className="fin-chart">
              {series.map((point) => (
                <div
                  key={point.month}
                  className="bar"
                  style={{ height: `${Math.max(2, (Number(point.collected || 0) / maxCollected) * 100)}%` }}
                  title={`${point.month}: ${money(point.collected)}`}
                >
                  <span>{point.month}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="fin-hint">No collection history yet.</p>
          )}
        </div>
      </StatePanel>
    </>
  )
}
