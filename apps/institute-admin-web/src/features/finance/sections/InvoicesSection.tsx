import type { FinanceSectionProps } from './shared'

type Props = FinanceSectionProps & { branches: { id: string; name: string }[] }

export default function InvoicesSection(_props: Props) {
  return <div className="fin-state fin-state--empty">Coming in a later task.</div>
}
