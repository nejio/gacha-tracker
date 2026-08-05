import { increment } from 'firebase/firestore'
import { formatYen, formatCurrency } from '../utils/calc'

export default function HistoryScreen({ purchases, pulls, apps, purchasesApi, pullsApi, appsApi, bannersApi }) {
  const nameById = new Map(apps.map(a => [a.id, a.name]))
  const currencyById = new Map(apps.map(a => [a.id, a.currencyName || '石']))

  // 削除時の巻き戻し: 課金削除→残高から獲得分を減算 / ガチャ削除→消費分を残高に戻す
  // 天井と保証状態は、そのバナーの最新の記録を消す場合のみスナップショットへ復元
  const removePurchase = async (item) => {
    await appsApi.update(item.appId, { currencyBalance: increment(-(item.currencyGained || 0)) })
    await purchasesApi.remove(item.id)
  }

  const removePull = async (item) => {
    await appsApi.update(item.appId, { currencyBalance: increment(item.currencySpent || 0) })
    if (item.bannerId && item.pityBefore != null) {
      const laterExists = pulls.some(p => p.bannerId === item.bannerId && p.id !== item.id && p.date > item.date)
      if (!laterExists) {
        const revert = { pityCurrent: item.pityBefore }
        if (item.guaranteedBefore != null) revert.guaranteed = item.guaranteedBefore
        await bannersApi.update(item.bannerId, revert)
      }
    }
    await pullsApi.remove(item.id)
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
                onClick={() => (item.kind === 'purchase' ? removePurchase(item) : removePull(item))}
                style={{ fontSize: 11, color: 'var(--danger)' }}
              >
                削除
              </button>
            </div>
          </div>
        ))}
      </div>
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
