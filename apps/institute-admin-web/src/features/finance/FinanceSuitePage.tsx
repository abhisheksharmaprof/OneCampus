import type { ComponentType } from 'react'
import { BadgeIndianRupee, CalendarClock, FileText, LayoutDashboard, ListChecks, ReceiptText, Settings2 } from 'lucide-react'
import OverviewSection from './sections/OverviewSection'
import InvoicesSection from './sections/InvoicesSection'
import PaymentsSection from './sections/PaymentsSection'
import DuesSection from './sections/DuesSection'
import FeePlansSection from './sections/FeePlansSection'
import SettingsSection from './sections/SettingsSection'
import './finance-suite.css'

export type FinanceSection =
  | 'overview' | 'invoices' | 'payments' | 'dues' | 'plans' | 'settings'

// Keep these prop types identical to the previous version of this file (App.tsx contract):
// accessToken, branches, selectedBranch (branch id string, or 'all'), section, onNavigate.
type FinanceSuitePageProps = {
  accessToken: string
  branches: { id: string; name: string }[]
  selectedBranch: string
  section: FinanceSection
  onNavigate: (path: string) => void
}

const NAV: { section: FinanceSection; label: string; path: string; icon: ComponentType<{ size?: number | string }> }[] = [
  { section: 'overview', label: 'Overview', path: '/finance', icon: LayoutDashboard },
  { section: 'invoices', label: 'Invoices', path: '/finance/invoices', icon: FileText },
  { section: 'payments', label: 'Payments & Receipts', path: '/finance/payments', icon: ReceiptText },
  { section: 'dues', label: 'Dues', path: '/finance/dues', icon: CalendarClock },
  { section: 'plans', label: 'Fee plans', path: '/finance/fee-structure', icon: ListChecks },
  { section: 'settings', label: 'Settings', path: '/finance/settings', icon: Settings2 },
]

const OPERATIONS = [
  { label: 'Expenses', path: '/finance/expenses' },
  { label: 'Payroll', path: '/finance/payroll' },
  { label: 'Budget', path: '/finance/budget' },
  { label: 'Reports', path: '/finance/reports' },
]

export default function FinanceSuitePage({ accessToken, branches, selectedBranch, section, onNavigate }: FinanceSuitePageProps) {
  const branchId = selectedBranch === 'all' ? undefined : selectedBranch
  const sectionProps = { accessToken, branchId, onNavigate }
  return (
    <div className="fin-suite">
      <nav className="fin-sidebar" aria-label="Finance sections">
        <div className="fin-sidebar__title"><BadgeIndianRupee size={18} /> Finance</div>
        {NAV.map((item) => (
          <button
            key={item.section}
            type="button"
            className={`fin-sidebar__link${section === item.section ? ' is-active' : ''}`}
            aria-current={section === item.section ? 'page' : undefined}
            onClick={() => onNavigate(item.path)}
          >
            <item.icon size={16} /> {item.label}
          </button>
        ))}
        <div className="fin-sidebar__group">Operations</div>
        {OPERATIONS.map((item) => (
          <button key={item.path} type="button" className="fin-sidebar__link" onClick={() => onNavigate(item.path)}>
            {item.label}
          </button>
        ))}
      </nav>
      <div className="fin-content">
        {section === 'overview' && <OverviewSection {...sectionProps} />}
        {section === 'invoices' && <InvoicesSection {...sectionProps} branches={branches} />}
        {section === 'payments' && <PaymentsSection {...sectionProps} />}
        {section === 'dues' && <DuesSection {...sectionProps} />}
        {section === 'plans' && <FeePlansSection {...sectionProps} />}
        {section === 'settings' && <SettingsSection {...sectionProps} />}
      </div>
    </div>
  )
}
