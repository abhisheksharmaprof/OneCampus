import { Banknote, CalendarClock, FileText, ReceiptIndianRupee, Sparkles } from 'lucide-react'
import { fetchSummary } from '../finance.api'
import { money, StatePanel, useAbortableLoad, type FinanceSectionProps } from './shared'

export default function OverviewSection({ accessToken, branchId, onNavigate }: FinanceSectionProps) {
  const summary = useAbortableLoad((signal) => fetchSummary(accessToken, branchId, signal), [accessToken, branchId])
  const data = summary.data
  const series = data?.monthlySeries ?? []
  const maxCollected = Math.max(1, ...series.map((point) => Number(point.collected || 0)))

  return (
    <>
      <div className="fin-toolbar fin-toolbar--panel">
        <div><strong>Today’s finance pulse</strong><small className="fin-hint">Live data from Supabase</small></div>
        <span className="fin-toolbar__spacer" />
        <button type="button" className="fin-btn fin-btn--primary" onClick={() => onNavigate('/finance/invoices')}><FileText size={15} aria-hidden /> New invoice</button>
        <button type="button" className="fin-btn" onClick={() => onNavigate('/finance/payments')}><ReceiptIndianRupee size={15} aria-hidden /> Record payment</button>
        <button type="button" className="fin-btn" onClick={() => onNavigate('/finance/dues')}><CalendarClock size={15} aria-hidden /> View dues</button>
      </div>
      <StatePanel loading={summary.loading} error={summary.error} onRetry={summary.reload}>
        <div className="fin-kpis">
          <div className="fin-kpi">
            <span className="fin-kpi__icon fin-kpi__icon--success"><Banknote size={18} /></span>
            <span>Collected this month</span>
            <b>{money(data?.collectedThisMonth ?? 0)}</b>
            <small>Recorded collections</small>
          </div>
          <div className="fin-kpi">
            <span className="fin-kpi__icon fin-kpi__icon--warning"><CalendarClock size={18} /></span>
            <span>Outstanding total</span>
            <b>{money(data?.outstandingTotal ?? 0)}</b>
            <small>Across open invoices</small>
          </div>
          <div className="fin-kpi">
            <span className="fin-kpi__icon"><FileText size={18} /></span>
            <span>Overdue invoices</span>
            <b>{data?.overdueCount ?? 0}</b>
            <small>Needs follow-up</small>
          </div>
          <div className="fin-kpi">
            <span className="fin-kpi__icon"><Sparkles size={18} /></span>
            <span>Receipts today</span>
            <b>{data?.receiptsToday ?? 0}</b>
            <small>Completed today</small>
          </div>
        </div>
        <div className="fin-card">
          <div className="fin-card__header"><div><h3>Monthly collections</h3><p>Compare recorded payments across the last 12 months.</p></div></div>
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
