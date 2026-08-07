import { useState } from 'react'
import { Card } from '../../components/ui/primitives'
import { FeeCollectionsPage } from './FeeCollectionsPage'
import { FeeStructurePage } from './FeeStructurePage'
import { FinanceModulePage, type FinanceModule } from './FinanceModulePage'
import './finance-workspace.css'

type Branch = { id: string; name: string }
type Props = { accessToken: string; selectedBranch: string; branches: Branch[] }

export function FinanceFeesPage({ initialTab = 'collections', ...props }: Props & { initialTab?: 'collections' | 'structure' }) {
  const [tab, setTab] = useState<'collections' | 'structure'>(initialTab)
  return <main className="finance-workspace"><header className="finance-workspace__header"><div><p>Finance / Fees</p><h1>Fees & Collections</h1><span>Configure what students owe, then track invoices, payments, refunds, and defaults in the same workflow.</span></div></header><Card className="finance-workspace__tabs"><div role="tablist" aria-label="Fees and collections views"><button role="tab" aria-selected={tab === 'collections'} className={tab === 'collections' ? 'is-active' : ''} type="button" onClick={() => setTab('collections')}>Collections</button><button role="tab" aria-selected={tab === 'structure'} className={tab === 'structure' ? 'is-active' : ''} type="button" onClick={() => setTab('structure')}>Fee structure</button></div></Card>{tab === 'collections' ? <FeeCollectionsPage {...props} /> : <FeeStructurePage {...props} />}</main>
}

export function FinanceOperationsPage({ initialTab = 'expenses', ...props }: Props & { initialTab?: FinanceModule }) {
  const [tab, setTab] = useState<FinanceModule>(initialTab)
  const tabs: { id: FinanceModule; label: string }[] = [{ id: 'expenses', label: 'Expenses' }, { id: 'payroll', label: 'Payroll' }, { id: 'budget', label: 'Budget' }, { id: 'reports', label: 'Reports' }]
  return <main className="finance-workspace"><header className="finance-workspace__header"><div><p>Finance / Operations</p><h1>Operations & Reports</h1><span>Manage operating records and review the financial views your institute needs to make decisions.</span></div></header><Card className="finance-workspace__tabs"><div role="tablist" aria-label="Finance operations views">{tabs.map((item) => <button role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'is-active' : ''} type="button" key={item.id} onClick={() => setTab(item.id)}>{item.label}</button>)}</div></Card><FinanceModulePage {...props} module={tab} embedded /></main>
}
