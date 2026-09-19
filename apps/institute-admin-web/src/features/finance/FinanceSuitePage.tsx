import type { ComponentType } from 'react'
import {
  BadgeIndianRupee, Banknote, BarChart3, CalendarClock, FileText, Landmark,
  LayoutDashboard, ListChecks, ReceiptText, Settings2, UsersRound, WalletCards,
} from 'lucide-react'
import { FinanceModulePage, type FinanceModule } from './FinanceModulePage'
import DuesSection from './sections/DuesSection'
import FeePlansSection from './sections/FeePlansSection'
import InvoicesSection from './sections/InvoicesSection'
import OverviewSection from './sections/OverviewSection'
import PaymentsSection from './sections/PaymentsSection'
import SettingsSection from './sections/SettingsSection'
import './finance-suite.css'

export type FinanceSection =
  | 'overview' | 'invoices' | 'payments' | 'dues' | 'plans'
  | 'expenses' | 'payroll' | 'budget' | 'reports' | 'settings'

type FinanceSuitePageProps = {
  accessToken: string
  branches: { id: string; name: string }[]
  selectedBranch: string
  section: FinanceSection
  onNavigate: (path: string) => void
}

type FinanceNavItem = {
  section: FinanceSection
  label: string
  shortLabel: string
  description: string
  path: string
  icon: ComponentType<{ size?: number | string; 'aria-hidden'?: boolean }>
}

const BILLING_NAV: FinanceNavItem[] = [
  { section: 'overview', label: 'Overview', shortLabel: 'Overview', description: 'Collections, receivables, and the actions that need attention.', path: '/finance', icon: LayoutDashboard },
  { section: 'invoices', label: 'Invoices', shortLabel: 'Invoices', description: 'Create, issue, collect, and print student fee invoices.', path: '/finance/invoices', icon: FileText },
  { section: 'payments', label: 'Payments & receipts', shortLabel: 'Payments', description: 'Record collections and issue branded payment receipts.', path: '/finance/payments', icon: ReceiptText },
  { section: 'dues', label: 'Outstanding dues', shortLabel: 'Dues', description: 'Prioritise overdue balances and follow-up queues.', path: '/finance/dues', icon: CalendarClock },
  { section: 'plans', label: 'Fee plans', shortLabel: 'Fee plans', description: 'Define reusable fee structures for classes and academic years.', path: '/finance/fee-structure', icon: ListChecks },
]

const OPERATIONS_NAV: FinanceNavItem[] = [
  { section: 'expenses', label: 'Expenses', shortLabel: 'Expenses', description: 'Track institutional spending and approval status.', path: '/finance/expenses', icon: WalletCards },
  { section: 'payroll', label: 'Payroll', shortLabel: 'Payroll', description: 'Review payroll runs and salary disbursement records.', path: '/finance/payroll', icon: UsersRound },
  { section: 'budget', label: 'Budget', shortLabel: 'Budget', description: 'Plan allocations and monitor approved budgets.', path: '/finance/budget', icon: Landmark },
  { section: 'reports', label: 'Reports', shortLabel: 'Reports', description: 'Understand collections, receivables, tax, and cash flow.', path: '/finance/reports', icon: BarChart3 },
  { section: 'settings', label: 'Finance settings', shortLabel: 'Settings', description: 'Control numbering, tax defaults, and document footers.', path: '/finance/settings', icon: Settings2 },
]

const ALL_NAV = [...BILLING_NAV, ...OPERATIONS_NAV]

export default function FinanceSuitePage({ accessToken, branches, selectedBranch, section, onNavigate }: FinanceSuitePageProps) {
  const branchId = selectedBranch === 'all' ? undefined : selectedBranch
  const sectionProps = { accessToken, branchId, onNavigate }
  const activeItem = ALL_NAV.find((item) => item.section === section) ?? BILLING_NAV[0]
  const branchName = selectedBranch === 'all'
    ? 'All branches'
    : branches.find((branch) => branch.id === selectedBranch)?.name ?? 'Selected branch'

  const renderLinks = (items: FinanceNavItem[]) => items.map((item) => (
    <button
      key={item.section}
      type="button"
      className={`fin-sidebar__link${section === item.section ? ' is-active' : ''}`}
      aria-label={item.label}
      aria-current={section === item.section ? 'page' : undefined}
      onClick={() => onNavigate(item.path)}
    >
      <span className="fin-sidebar__icon"><item.icon size={17} aria-hidden /></span>
      <span>{item.shortLabel}</span>
    </button>
  ))

  return (
    <div className="fin-workspace">
      <header className="fin-hero">
        <div>
          <div className="fin-hero__eyebrow"><BadgeIndianRupee size={16} aria-hidden /> Finance workspace</div>
          <h1>{activeItem.label}</h1>
          <p>{activeItem.description}</p>
        </div>
        <div className="fin-hero__scope"><Banknote size={17} aria-hidden /><span>Scope</span><strong>{branchName}</strong></div>
      </header>
      <div className="fin-suite">
        <nav className="fin-sidebar" aria-label="Finance sections">
          <div className="fin-sidebar__group">Billing</div>
          {renderLinks(BILLING_NAV)}
          <div className="fin-sidebar__group">Operations</div>
          {renderLinks(OPERATIONS_NAV)}
        </nav>
        <div className="fin-content">
          {section === 'overview' && <OverviewSection {...sectionProps} />}
          {section === 'invoices' && <InvoicesSection {...sectionProps} branches={branches} />}
          {section === 'payments' && <PaymentsSection {...sectionProps} />}
          {section === 'dues' && <DuesSection {...sectionProps} />}
          {section === 'plans' && <FeePlansSection {...sectionProps} />}
          {section === 'settings' && <SettingsSection {...sectionProps} />}
          {(['expenses', 'payroll', 'budget', 'reports'] as FinanceModule[]).includes(section as FinanceModule) && (
            <FinanceModulePage
              accessToken={accessToken}
              selectedBranch={selectedBranch}
              branches={branches}
              module={section as FinanceModule}
              embedded
            />
          )}
        </div>
      </div>
    </div>
  )
}
