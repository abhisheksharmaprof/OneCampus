import { useMemo } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { AttendanceStatus } from '../types'

const DISTRIBUTION_COLORS: Record<string, string> = {
  Present: '#138a63',
  Absent: '#d14343',
  Late: '#c87b12',
  'On leave': '#6366f1',
  Excused: '#3b82f6',
}

type RecordItem = { date: string; status: AttendanceStatus }

export function AttendanceCharts({ records }: { records: RecordItem[] }) {
  const { trend, distribution } = useMemo(() => {
    const byDate = new Map<string, { date: string; present: number; absent: number; late: number }>()
    const totals = { Present: 0, Absent: 0, Late: 0, 'On leave': 0, Excused: 0 }
    records.forEach((record) => {
      const daily = byDate.get(record.date) ?? { date: record.date, present: 0, absent: 0, late: 0 }
      if (record.status === 'PRESENT') { daily.present += 1; totals.Present += 1 }
      if (record.status === 'ABSENT') { daily.absent += 1; totals.Absent += 1 }
      if (record.status === 'LATE') { daily.late += 1; totals.Late += 1 }
      if (record.status === 'ON_LEAVE') totals['On leave'] += 1
      if (record.status === 'EXCUSED') totals.Excused += 1
      byDate.set(record.date, daily)
    })
    return {
      trend: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-30),
      distribution: Object.entries(totals).map(([name, value]) => ({ name, value })).filter((item) => item.value > 0),
    }
  }, [records])

  if (records.length === 0) {
    return <div className="attendance-chart-empty">Analytics will appear as soon as attendance is marked for this month.</div>
  }

  return (
    <div className="attendance-dashboard">
      <article className="card attendance-chart-card">
        <div className="section-header"><div><h2>30-day movement</h2><p>Present, absent and late records from the live register.</p></div></div>
        <div className="attendance-chart">
          <ResponsiveContainer>
            <AreaChart data={trend} margin={{ top: 10, right: 18, left: -18, bottom: 0 }}>
              <defs>
                <linearGradient id="attendancePresent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#138a63" stopOpacity={.35}/><stop offset="100%" stopColor="#138a63" stopOpacity={.03}/></linearGradient>
              </defs>
              <CartesianGrid stroke="#e8edf4" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(-2)} tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Legend />
              <Area type="monotone" dataKey="present" stroke="#138a63" fill="url(#attendancePresent)" strokeWidth={2} />
              <Area type="monotone" dataKey="absent" stroke="#d14343" fill="transparent" strokeWidth={2} />
              <Area type="monotone" dataKey="late" stroke="#c87b12" fill="transparent" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card attendance-chart-card">
        <div className="section-header"><div><h2>Monthly distribution</h2><p>Share of every recorded attendance state.</p></div></div>
        <div className="attendance-chart">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={distribution} cx="50%" cy="48%" innerRadius={58} outerRadius={82} paddingAngle={4} dataKey="value">
                {distribution.map((entry) => <Cell key={entry.name} fill={DISTRIBUTION_COLORS[entry.name]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </article>

      <article className="card attendance-chart-card attendance-chart-card--wide">
        <div className="section-header"><div><h2>Absence pressure</h2><p>Daily absence volume makes unusual spikes easy to spot.</p></div></div>
        <div className="attendance-chart attendance-chart--short">
          <ResponsiveContainer>
            <BarChart data={trend} margin={{ top: 8, right: 18, left: -18, bottom: 0 }}>
              <CartesianGrid stroke="#e8edf4" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={(value) => String(value).slice(-2)} tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#718096', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="absent" fill="#e56b6b" radius={[5, 5, 0, 0]} name="Absences" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </article>
    </div>
  )
}
