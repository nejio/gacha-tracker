import { useMemo } from 'react'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { totalAmount, monthlyTotal, currentMonthKey, monthlySeries, totalsByApp, formatYen } from '../utils/calc'
import { consumptionByTag, poolTotal } from '../utils/currency'

export default function Dashboard({ acquisitions, consumptions, apps }) {
  const thisMonth = currentMonthKey()
  // 支出が発生するのは課金した時点。消費・交換は課金額に一切関与しない
  const monthSum = useMemo(() => monthlyTotal(acquisitions, thisMonth), [acquisitions, thisMonth])
  const cumulative = useMemo(() => totalAmount(acquisitions), [acquisitions])
  const series = useMemo(() => monthlySeries(acquisitions, 6), [acquisitions])
  const byApp = useMemo(() => totalsByApp(acquisitions, apps), [acquisitions, apps])

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

      <Section title="通貨の残高">
        {apps.length === 0 && <EmptyNote text="まずはアプリを登録してください" />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {apps.map(app => (
            <div key={app.id}>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 4 }}>{app.name}</div>
              {(app.currencies || []).map(c => (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingLeft: 8 }}>
                  <span style={{ color: 'var(--text-dim)' }}>{c.name}</span>
                  <span>
                    <span className="mono" style={{ color: 'var(--gold)' }}>
                      {(c.total ?? poolTotal(c.balance)).toLocaleString('ja-JP')}
                    </span>
                    <span className="mono" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                      {' '}(有償 {(c.balance?.paid || 0).toLocaleString('ja-JP')})
                    </span>
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>

      <UsageSection apps={apps} consumptions={consumptions} />
    </div>
  )
}

// 用途別の内訳。金額は「相当額」であって支出ではないため、通貨量を主として見せる
function UsageSection({ apps, consumptions }) {
  const rows = useMemo(() => {
    const all = []
    for (const app of apps) {
      for (const r of consumptionByTag(app, consumptions)) {
        all.push({ ...r, appName: app.name, key: `${app.id}-${r.tag}` })
      }
    }
    return all.sort((a, b) => b.yenEquivalent - a.yenEquivalent)
  }, [apps, consumptions])

  const max = rows.reduce((m, r) => Math.max(m, r.yenEquivalent), 0)

  return (
    <Section title="用途別の内訳">
      {rows.length === 0 && <EmptyNote text="まだ消費の記録がありません" />}
      {rows.length > 0 && (
        <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 0, marginBottom: 10, lineHeight: 1.6 }}>
          使った通貨を円に換算した参考値です。実際の支出額(上の課金額)とは別のものです。
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rows.map(r => (
          <div key={r.key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
              <span>{r.tag} <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>{r.appName}</span></span>
              <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                約{r.yenEquivalent.toLocaleString('ja-JP')}円相当
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }} className="mono">
              {r.currencies.map(c => `${c.name} ${c.qty.toLocaleString('ja-JP')}`).join(' / ')}
            </div>
            <div style={{ height: 5, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{ width: `${max > 0 ? (r.yenEquivalent / max) * 100 : 0}%`, height: '100%', background: 'var(--gold)' }} />
            </div>
          </div>
        ))}
      </div>
    </Section>
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
