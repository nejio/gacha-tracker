import { useMemo } from 'react'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import {
  totalAmount, monthlyTotal, currentMonthKey, monthlySeries, totalsByApp, formatYen, formatCurrency
} from '../utils/calc'

export default function Dashboard({ purchases, apps }) {
  const thisMonth = currentMonthKey()
  const monthSum = useMemo(() => monthlyTotal(purchases, thisMonth), [purchases, thisMonth])
  const cumulative = useMemo(() => totalAmount(purchases), [purchases])
  const series = useMemo(() => monthlySeries(purchases, 6), [purchases])
  const byApp = useMemo(() => totalsByApp(purchases, apps), [purchases, apps])

  return (
    <div style={{ padding: '20px 16px 8px' }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <StatCard label="今月の課金額" value={formatYen(monthSum)} accent="gold" />
        <StatCard label="累計課金額" value={formatYen(cumulative)} accent="teal" />
      </div>

      <Section title="月次推移">
        <div style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <XAxis dataKey="label" stroke="var(--text-faint)" fontSize={12} axisLine={false} tickLine={false} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                formatter={(v) => formatYen(v)}
                contentStyle={{ background: 'var(--ink-bg-elevated)', border: '1px solid var(--line)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--text-dim)' }}
              />
              <Bar dataKey="amount" fill="var(--gold)" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="アプリ別の課金額">
        {byApp.length === 0 && <EmptyNote text="まだ課金記録がありません" />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {byApp.map(a => {
            const pct = cumulative > 0 ? (a.amount / cumulative) * 100 : 0
            return (
              <div key={a.appId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span>{a.name}</span>
                  <span className="mono" style={{ color: 'var(--text-dim)' }}>{formatYen(a.amount)} ・ {a.count}件</span>
                </div>
                <div style={{ height: 6, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)' }} />
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="石の残高">
        {apps.length === 0 && <EmptyNote text="まずはアプリを登録してください" />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {apps.map(app => (
            <div key={app.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{app.name}</span>
              <span className="mono" style={{ color: 'var(--gold)' }}>
                {formatCurrency(app.currencyBalance || 0, app.currencyName || '石')}
              </span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

function StatCard({ label, value, accent }) {
  return (
    <div style={{ flex: 1, background: 'var(--ink-bg-card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '14px 16px' }}>
      <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{label}</div>
      <div className="mono" style={{ fontSize: 20, fontWeight: 600, color: accent === 'gold' ? 'var(--gold)' : 'var(--teal)' }}>{value}</div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--ink-bg-card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, marginBottom: 12, color: 'var(--text-dim)', fontWeight: 500, fontFamily: 'var(--font-body)' }}>{title}</h3>
      {children}
    </div>
  )
}

function EmptyNote({ text }) {
  return <div style={{ fontSize: 13, color: 'var(--text-faint)', padding: '8px 0' }}>{text}</div>
}
