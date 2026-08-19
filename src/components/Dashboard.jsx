import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts'
import { totalAmount, monthlyTotal, currentMonthKey, monthlySeries, totalsByApp, formatYen } from '../utils/calc'
import { consumptionByTag, poolTotal, inMonth, effectiveGachaBalance } from '../utils/currency'

export default function Dashboard({ acquisitions, consumptions, apps, records }) {
  const thisMonth = currentMonthKey()
  // 支出が発生するのは課金した時点。消費・交換は課金額に一切関与しない
  const monthSum = useMemo(() => monthlyTotal(acquisitions, thisMonth), [acquisitions, thisMonth])
  const cumulative = useMemo(() => totalAmount(acquisitions), [acquisitions])
  const series = useMemo(() => monthlySeries(acquisitions, 6), [acquisitions])
  const byApp = useMemo(() => totalsByApp(acquisitions, apps), [acquisitions, apps])
  const fullApps = useMemo(() => apps.filter(a => (a.trackingLevel || 'simple') === 'full'), [apps])

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

      {/* 残高と用途の内訳は、詳細モードで記録しているアプリだけが対象 */}
      <BalanceSection apps={fullApps} />
      <UsageSection apps={fullApps} consumptions={consumptions} acquisitions={acquisitions} records={records} />
    </div>
  )
}

// 通貨の残高。課金で得た資産がいくら残っているかを有償・無償の内訳つきで見る
function BalanceSection({ apps }) {
  if (apps.length === 0) return null   // 詳細モードのアプリが無ければ表示しない
  return (
    <Section title="通貨の残高">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {apps.map(app => (
          <div key={app.id}>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 6 }}>{app.name}</div>
            {(() => {
              // 課金通貨を交換して使うゲームは、合算した実質残高も示す
              const eff = effectiveGachaBalance(app, 'main')
              if (!eff || eff.convertible <= 0) return null
              return (
                <div style={{ fontSize: 11, color: 'var(--teal)', marginBottom: 6, paddingLeft: 8 }}>
                  ガチャに使える実質残高{' '}
                  <span className="mono" style={{ color: 'var(--gold)' }}>{eff.total.toLocaleString('ja-JP')}</span>
                  <span style={{ color: 'var(--text-faint)' }}>
                    {' '}({eff.sourceName}を交換した場合)
                  </span>
                </div>
              )
            })()}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(app.currencies || []).map(c => {
                const bal = c.balance || { paid: 0, free: 0 }
                const total = c.total ?? poolTotal(bal)
                const paidPct = total > 0 ? (bal.paid / total) * 100 : 0
                return (
                  <div key={c.id} style={{ paddingLeft: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                      <span>{c.name}</span>
                      <span className="mono" style={{ color: 'var(--gold)' }}>{total.toLocaleString('ja-JP')}</span>
                    </div>
                    {total > 0 && (
                      <div style={{ display: 'flex', height: 5, borderRadius: 4, overflow: 'hidden', background: 'var(--line)' }}>
                        <div style={{ width: `${paidPct}%`, background: 'var(--gold)' }} />
                        <div style={{ width: `${100 - paidPct}%`, background: 'var(--teal)' }} />
                      </div>
                    )}
                    <div className="mono" style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }}>
                      <span style={{ color: 'var(--gold)' }}>有償 {bal.paid.toLocaleString('ja-JP')}</span>
                      {' / '}
                      <span style={{ color: 'var(--teal)' }}>無償 {bal.free.toLocaleString('ja-JP')}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

// 用途別の内訳。金額は「相当額」であって支出ではないため、通貨量を主として見せる
function UsageSection({ apps, consumptions, acquisitions, records }) {
  if (apps.length === 0) return null   // 詳細モードのアプリが無ければ表示しない
  const now = new Date()
  const [scope, setScope] = useState('month')   // month | all
  const [appId, setAppId] = useState('all')

  const filterMonth = scope === 'month' ? { year: now.getFullYear(), month: now.getMonth() } : null
  const targetApps = appId === 'all' ? apps : apps.filter(a => a.id === appId)

  const rows = useMemo(() => {
    const all = []
    for (const app of targetApps) {
      for (const r of consumptionByTag(app, consumptions, { filterMonth, records })) {
        all.push({ ...r, appName: app.name, key: `${app.id}-${r.tag}` })
      }
    }
    return all.sort((a, b) => b.yenEquivalent - a.yenEquivalent)
  }, [targetApps, consumptions, scope, records])

  const totalYen = rows.reduce((s, r) => s + r.yenEquivalent, 0)
  const max = rows.reduce((m, r) => Math.max(m, r.yenEquivalent), 0)

  // 同期間の課金額(比較用)
  const spentYen = useMemo(() => {
    return acquisitions
      .filter(a => (appId === 'all' || a.appId === appId))
      .filter(a => !filterMonth || inMonth(a.date, filterMonth.year, filterMonth.month))
      .reduce((s, a) => s + (a.amountYen || 0), 0)
  }, [acquisitions, appId, scope])

  return (
    <Section title="用途別の内訳">
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {[{ k: 'month', l: '今月' }, { k: 'all', l: '全期間' }].map(o => (
          <button
            key={o.k}
            onClick={() => setScope(o.k)}
            style={{
              padding: '5px 14px', borderRadius: 999, fontSize: 12,
              border: `1px solid ${scope === o.k ? 'var(--gold)' : 'var(--line)'}`,
              background: scope === o.k ? 'var(--gold-soft)' : 'transparent',
              color: scope === o.k ? 'var(--gold)' : 'var(--text-dim)'
            }}
          >
            {o.l}
          </button>
        ))}
        {apps.length > 1 && (
          <select
            value={appId}
            onChange={e => setAppId(e.target.value)}
            style={{
              marginLeft: 'auto', background: 'var(--ink-bg-elevated)', border: '1px solid var(--line)',
              borderRadius: 999, padding: '5px 10px', fontSize: 12, color: 'var(--text-dim)'
            }}
          >
            <option value="all">すべてのアプリ</option>
            {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        )}
      </div>

      {rows.length === 0 && <EmptyNote text={scope === 'month' ? '今月の消費記録がありません' : 'まだ消費の記録がありません'} />}

      {rows.length > 0 && (
        <>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            padding: '8px 10px', background: 'var(--ink-bg-elevated)', borderRadius: 'var(--radius-sm)', marginBottom: 10
          }}>
            <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>使った資産の合計</span>
            <span className="mono" style={{ fontSize: 14, color: 'var(--gold)' }}>約{totalYen.toLocaleString('ja-JP')}円相当</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map(r => (
              <div key={r.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                  <span>
                    {r.tag}
                    {apps.length > 1 && appId === 'all' && (
                      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}> {r.appName}</span>
                    )}
                  </span>
                  <span className="mono" style={{ color: 'var(--text-dim)', fontSize: 12 }}>
                    約{r.yenEquivalent.toLocaleString('ja-JP')}円相当
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }} className="mono">
                  {r.currencies.map(c => `${c.name} ${c.qty.toLocaleString('ja-JP')}`).join(' / ')}
                  {r.pulls > 0 && ` ・ ${r.pulls}連`}
                  {` ・ ${r.count}件`}
                </div>
                <div style={{ height: 5, background: 'var(--line)', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${max > 0 ? (r.yenEquivalent / max) * 100 : 0}%`, height: '100%', background: 'var(--gold)' }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 12, lineHeight: 1.7 }}>
            使った通貨を円に換算した参考値です。無償で得た分も含むため、
            実際の支出({scope === 'month' ? '今月' : '累計'}の課金額 {formatYen(spentYen)})とは一致しません。
          </div>
        </>
      )}
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
