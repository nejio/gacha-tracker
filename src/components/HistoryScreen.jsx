import { useState } from 'react'
import { formatYen, computePoolPity, gachaConsumptions } from '../utils/calc'
import { appCurrencies, consumptionTag } from '../utils/currency'

const KIND_META = {
  acq: { label: '取得', color: 'var(--gold)', soft: 'var(--gold-soft)' },
  exc: { label: '交換', color: 'var(--text-dim)', soft: 'var(--line)' },
  con: { label: '消費', color: 'var(--teal)', soft: 'var(--teal-soft)' }
}

export default function HistoryScreen({
  apps, banners, pityPools, acquisitions, exchanges, consumptions,
  acquisitionsApi, exchangesApi, consumptionsApi
}) {
  const [confirming, setConfirming] = useState(null)

  const appById = new Map(apps.map(a => [a.id, a]))
  const currencyName = (appId, currencyId) => {
    const app = appById.get(appId)
    if (!app) return ''
    return appCurrencies(app).find(c => c.id === currencyId)?.name || ''
  }

  const merged = [
    ...acquisitions.map(r => ({ ...r, kind: 'acq' })),
    ...exchanges.map(r => ({ ...r, kind: 'exc' })),
    ...consumptions.map(r => ({ ...r, kind: 'con' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  // 残高・天井は記録から都度計算されるため削除は記録を消すだけでよいが、影響が分かるよう提示する
  const deleteEffect = (item) => {
    const lines = []
    if (item.kind === 'acq') {
      lines.push(`${currencyName(item.appId, item.currencyId)} が ${item.quantity.toLocaleString('ja-JP')} 減ります`)
      if (!item.isFree) lines.push(`課金額の集計から ${formatYen(item.amountYen)} が除かれます`)
    } else if (item.kind === 'exc') {
      lines.push(`${currencyName(item.appId, item.fromCurrencyId)} が ${item.fromQty.toLocaleString('ja-JP')} 戻ります`)
      lines.push(`${currencyName(item.appId, item.toCurrencyId)} が ${item.toQty.toLocaleString('ja-JP')} 減ります`)
    } else {
      lines.push(`${currencyName(item.appId, item.currencyId)} が ${item.quantity.toLocaleString('ja-JP')} 戻ります`)
      // 天井は枠が持つ。記録に紐づく枠(なければバナーの所属枠)で再計算する
      const poolId = item.poolId || banners.find(b => b.id === item.bannerId)?.poolId
      const pool = (pityPools || []).find(p => p.id === poolId)
      if (pool) {
        const after = computePoolPity(pool, banners, gachaConsumptions(consumptions.filter(c => c.id !== item.id)))
        lines.push(`天井(${pool.name}): ${pool.pityCurrent || 0} → ${after.pityCurrent} / ${pool.pityMax}`)
        if (!!pool.guaranteed !== after.guaranteed) {
          lines.push(after.guaranteed ? '「次回確定」が付きます' : '「次回確定」が外れます')
        }
      }
    }
    return lines
  }

  const confirmDelete = async () => {
    const item = confirming
    setConfirming(null)
    if (item.kind === 'acq') await acquisitionsApi.remove(item.id)
    else if (item.kind === 'exc') await exchangesApi.remove(item.id)
    else await consumptionsApi.remove(item.id)
  }

  return (
    <div style={{ padding: '20px 16px 8px' }}>
      <h3 style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 500, marginBottom: 14 }}>記録履歴</h3>

      {merged.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>まだ記録がありません</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {merged.map(item => {
          const meta = KIND_META[item.kind]
          return (
            <div key={`${item.kind}-${item.id}`} style={{
              background: 'var(--ink-bg-card)', border: '1px solid var(--line)',
              borderRadius: 'var(--radius)', padding: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: meta.soft, color: meta.color }}>
                    {meta.label}
                  </span>
                  <span style={{ fontWeight: 500 }}>{appById.get(item.appId)?.name || '不明なアプリ'}</span>
                </span>

                {item.kind === 'acq' && (
                  <span className="mono" style={{ color: item.isFree ? 'var(--teal)' : 'var(--gold)', fontSize: 15 }}>
                    {item.isFree ? '無償' : formatYen(item.amountYen)}
                  </span>
                )}
                {item.kind === 'con' && (
                  <span className="mono" style={{ color: 'var(--teal)', fontSize: 15 }}>
                    -{item.quantity.toLocaleString('ja-JP')}{currencyName(item.appId, item.currencyId)}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
                {new Date(item.date).toLocaleDateString('ja-JP')}
                {item.kind === 'acq' && ` ・ +${item.quantity.toLocaleString('ja-JP')}${currencyName(item.appId, item.currencyId)}`}
                {item.kind === 'exc' && ` ・ ${item.fromQty.toLocaleString('ja-JP')}${currencyName(item.appId, item.fromCurrencyId)} → ${item.toQty.toLocaleString('ja-JP')}${currencyName(item.appId, item.toCurrencyId)}`}
                {item.kind === 'con' && item.pullCount ? ` ・ ${item.pullCount}連` : ''}
                {item.kind === 'con' && item.targetItem ? ` ・ ${item.targetItem}` : ''}
              </div>

              {item.kind === 'con' && (
                <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--ink-bg-elevated)', color: 'var(--text-dim)' }}>
                    {consumptionTag(item)}
                  </span>
                  {item.paidOnly && (
                    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, background: 'var(--gold-soft)', color: 'var(--gold)' }}>
                      有償のみ
                    </span>
                  )}
                </div>
              )}

              {item.kind === 'con' && item.pullCount > 0 && (
                <div style={{ fontSize: 12, marginTop: 4, color: item.obtained ? 'var(--teal)' : item.lost ? 'var(--gold)' : 'var(--danger)' }}>
                  {item.obtained ? (item.isPityTriggered ? '天井到達で確定入手' : '入手') : item.lost ? 'すり抜け(次の最高レアは確定)' : '未入手'}
                </div>
              )}

              {item.note && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>{item.note}</div>}

              <div style={{ textAlign: 'right', marginTop: 6 }}>
                <button onClick={() => setConfirming(item)} style={{ fontSize: 11, color: 'var(--danger)' }}>削除</button>
              </div>
            </div>
          )
        })}
      </div>

      {confirming && (
        <div onClick={() => setConfirming(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--ink-bg-card)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', padding: 18, maxWidth: 340, width: '100%'
          }}>
            <div style={{ fontWeight: 500, marginBottom: 10 }}>この記録を削除しますか?</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {deleteEffect(confirming).map((l, i) => <div key={i}>{l}</div>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirming(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--ink-bg-elevated)', color: 'var(--text-dim)', fontSize: 14 }}>
                キャンセル
              </button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'var(--ink-bg)', fontWeight: 700, fontSize: 14 }}>
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
