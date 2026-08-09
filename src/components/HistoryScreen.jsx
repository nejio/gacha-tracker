import { useState } from 'react'
import { formatYen, formatCurrency, computePity } from '../utils/calc'

export default function HistoryScreen({ purchases, pulls, apps, banners, purchasesApi, pullsApi }) {
  const nameById = new Map(apps.map(a => [a.id, a.name]))
  const currencyById = new Map(apps.map(a => [a.id, a.currencyName || '石']))
  const [confirming, setConfirming] = useState(null)

  // 残高・天井は記録から都度計算されるため、削除は記録を消すだけでよい。
  // ただし削除の影響が分かりにくいので、実行前に変化を提示する。
  const deleteEffect = (item) => {
    const app = apps.find(a => a.id === item.appId)
    const unit = currencyById.get(item.appId) || '石'
    const lines = []
    if (item.kind === 'purchase') {
      lines.push(`残高: ${formatCurrency(app?.currencyBalance || 0, unit)} → ${formatCurrency((app?.currencyBalance || 0) - (item.currencyGained || 0), unit)}`)
      if (!item.isFree) lines.push(`課金額の集計から ${formatYen(item.amountYen)} が除かれます`)
    } else {
      lines.push(`残高: ${formatCurrency(app?.currencyBalance || 0, unit)} → ${formatCurrency((app?.currencyBalance || 0) + (item.currencySpent || 0), unit)}`)
      const banner = banners?.find(b => b.id === item.bannerId)
      if (banner) {
        const after = computePity(banner, pulls.filter(p => p.id !== item.id))
        lines.push(`天井: ${banner.pityCurrent || 0} → ${after.pityCurrent} / ${banner.pityMax}`)
        if (!!banner.guaranteed !== after.guaranteed) {
          lines.push(after.guaranteed ? '「次回確定」が付きます' : '「次回確定」が外れます')
        }
      }
    }
    return lines
  }

  const confirmDelete = async () => {
    const item = confirming
    setConfirming(null)
    if (item.kind === 'purchase') await purchasesApi.remove(item.id)
    else await pullsApi.remove(item.id)
  }

  const merged = [
    ...purchases.map(p => ({ ...p, kind: 'purchase' })),
    ...pulls.map(p => ({ ...p, kind: 'pull' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date))

  return (
    <div style={{ padding: '20px 16px 8px' }}>
      <h3 style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 500, marginBottom: 14 }}>記録履歴</h3>

      {merged.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-faint)' }}>まだ記録がありません</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {merged.map(item => (
          <div key={`${item.kind}-${item.id}`} style={{
            background: 'var(--ink-bg-card)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', padding: 14
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Badge kind={item.kind} />
                <span style={{ fontWeight: 500 }}>{nameById.get(item.appId) || '不明なアプリ'}</span>
              </span>
              {item.kind === 'purchase' ? (
                <span className="mono" style={{ color: item.isFree ? 'var(--teal)' : 'var(--gold)', fontSize: 15 }}>
                  {item.isFree ? '無償' : formatYen(item.amountYen)}
                </span>
              ) : (
                <span className="mono" style={{ color: 'var(--teal)', fontSize: 15 }}>
                  -{formatCurrency(item.currencySpent, currencyById.get(item.appId))}
                </span>
              )}
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>
              {new Date(item.date).toLocaleDateString('ja-JP')}
              {item.kind === 'purchase' && item.purchaseUnits ? ` ・ ${item.purchaseCurrencyName}${item.purchaseUnits}個` : ''}
              {item.kind === 'purchase' && item.currencyGained ? ` ・ +${formatCurrency(item.currencyGained, currencyById.get(item.appId))}` : ''}
              {item.kind === 'pull' && item.pullCount ? ` ・ ${item.pullCount}連` : ''}
              {item.kind === 'pull' && item.targetItem ? ` ・ ${item.targetItem}` : ''}
            </div>

            {item.kind === 'pull' && item.pullCount > 0 && (
              <div style={{ fontSize: 12, marginTop: 4, color: item.obtained ? 'var(--teal)' : item.lost ? 'var(--gold)' : 'var(--danger)' }}>
                {item.obtained ? (item.isPityTriggered ? '天井到達で確定入手' : '入手') : item.lost ? 'すり抜け(次の最高レアは確定)' : '未入手'}
              </div>
            )}

            {item.note && <div style={{ fontSize: 12, color: 'var(--text-faint)', marginTop: 4 }}>{item.note}</div>}

            <div style={{ textAlign: 'right', marginTop: 6 }}>
              <button
                onClick={() => setConfirming(item)}
                style={{ fontSize: 11, color: 'var(--danger)' }}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>

      {confirming && (
        <div
          onClick={() => setConfirming(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--ink-bg-card)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', padding: 18, maxWidth: 340, width: '100%'
          }}>
            <div style={{ fontWeight: 500, marginBottom: 10 }}>この記録を削除しますか?</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 16 }}>
              {deleteEffect(confirming).map((l, i) => <div key={i}>{l}</div>)}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setConfirming(null)}
                style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--ink-bg-elevated)', color: 'var(--text-dim)', fontSize: 14 }}
              >
                キャンセル
              </button>
              <button
                onClick={confirmDelete}
                style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'var(--ink-bg)', fontWeight: 700, fontSize: 14 }}
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Badge({ kind }) {
  const isPurchase = kind === 'purchase'
  return (
    <span style={{
      fontSize: 10, padding: '2px 6px', borderRadius: 4,
      background: isPurchase ? 'var(--gold-soft)' : 'var(--teal-soft)',
      color: isPurchase ? 'var(--gold)' : 'var(--teal)'
    }}>
      {isPurchase ? '課金' : '消費'}
    </span>
  )
}
