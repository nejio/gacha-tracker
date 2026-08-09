// ============ 通貨残高の計算(有償・無償プール) ============
//
// 課金管理として、課金で得た資産をすべて追跡する。
// アプリは複数の通貨を持ち、各通貨に有償・無償の残高がある。
//
// 記録は3種類:
//   acquisitions … 取得(課金または無償で通貨を得る)
//   exchanges    … 交換(通貨Aを通貨Bに変換する)
//   consumptions … 消費(通貨を使う。用途タグ付き。ガチャもこの一形態)
//
// 残高は保存せず、開始残高から記録を日時順に再生して求める。
// 計算は「チェックポイント(基準時点の状態)＋それ以降の記録」の形なので、
// 将来、履歴を分割読み込みする際は月末スナップショットを基準に差し替えるだけで済む。

// --- 金額に関する原則 ---
// 支出が発生するのは課金した時点であり、通貨をいつ何に使うかは支出額に影響しない。
// したがって課金額の集計は acquisitions のみから算出し、消費・交換は一切関与しない。
// 消費側で出す金額は「使った資産を円に換算した参考値(相当額)」であって支出ではない。

export function emptyPool() {
  return { paid: 0, free: 0 }
}

export function poolTotal(pool) {
  return (pool?.paid || 0) + (pool?.free || 0)
}

// プールから数量を引く。既定は無償優先、paidOnly 指定時は有償のみ。
// 実際に引かれた内訳を返す(交換時の按分に使う)。残高不足でもマイナスを許容し、
// 記録漏れがあっても計算が破綻しないようにする。
export function drawFromPool(pool, quantity, paidOnly = false) {
  const qty = Number(quantity) || 0
  if (paidOnly) {
    return { paid: qty, free: 0, next: { paid: pool.paid - qty, free: pool.free } }
  }
  const fromFree = Math.min(pool.free, qty)
  const fromPaid = qty - fromFree
  return {
    paid: fromPaid,
    free: fromFree,
    next: { paid: pool.paid - fromPaid, free: pool.free - fromFree }
  }
}

// アプリの通貨定義を取り出す(旧形式のアプリにも対応)
export function appCurrencies(app) {
  if (Array.isArray(app?.currencies) && app.currencies.length > 0) return app.currencies
  // 旧形式: currencyName / openingBalance を単一通貨として扱う
  return [{
    id: 'main',
    name: app?.currencyName || '石',
    openingPaid: 0,
    openingFree: Number(app?.openingBalance) || 0,
    yenPerUnit: Number(app?.yenPerCurrency) || 0
  }]
}

// アプリ内の全通貨の残高を計算して { [currencyId]: { paid, free } } を返す
export function computeCurrencyBalances(app, records) {
  const since = app.openingDate || ''
  const balances = {}
  for (const c of appCurrencies(app)) {
    balances[c.id] = { paid: Number(c.openingPaid) || 0, free: Number(c.openingFree) || 0 }
  }

  const events = []
  for (const r of (records.acquisitions || [])) {
    if (r.appId === app.id && r.date >= since) events.push({ ...r, _type: 'acq' })
  }
  for (const r of (records.exchanges || [])) {
    if (r.appId === app.id && r.date >= since) events.push({ ...r, _type: 'exc' })
  }
  for (const r of (records.consumptions || [])) {
    if (r.appId === app.id && r.date >= since) events.push({ ...r, _type: 'con' })
  }
  events.sort((a, b) => String(a.date).localeCompare(String(b.date)))

  for (const e of events) {
    if (e._type === 'acq') {
      const pool = balances[e.currencyId]
      if (!pool) continue
      const qty = Number(e.quantity) || 0
      if (e.isFree) pool.free += qty
      else pool.paid += qty
    } else if (e._type === 'con') {
      const pool = balances[e.currencyId]
      if (!pool) continue
      const drawn = drawFromPool(pool, e.quantity, e.paidOnly)
      balances[e.currencyId] = drawn.next
    } else if (e._type === 'exc') {
      const from = balances[e.fromCurrencyId]
      const to = balances[e.toCurrencyId]
      if (!from || !to) continue
      const fromQty = Number(e.fromQty) || 0
      const toQty = Number(e.toQty) || 0
      const drawn = drawFromPool(from, fromQty, e.paidOnly)
      balances[e.fromCurrencyId] = drawn.next
      // 交換先には、引かれた有償・無償の比率で配分する
      if (fromQty > 0) {
        to.paid += toQty * (drawn.paid / fromQty)
        to.free += toQty * (drawn.free / fromQty)
      } else {
        to.free += toQty
      }
    }
  }

  for (const id of Object.keys(balances)) {
    balances[id] = { paid: Math.round(balances[id].paid), free: Math.round(balances[id].free) }
  }
  return balances
}

// 表示用に、通貨ごとの残高を埋め込んだアプリ配列を作る
export function withDerivedCurrencies(apps, records) {
  return apps.map(app => {
    const balances = computeCurrencyBalances(app, records)
    const currencies = appCurrencies(app).map(c => ({
      ...c,
      balance: balances[c.id] || emptyPool(),
      total: poolTotal(balances[c.id])
    }))
    return { ...app, currencies, balances }
  })
}

// --- 用途別の集計 ---
// 消費した通貨量を用途タグごとにまとめる。円換算は「相当額」であって支出ではないため、
// 通貨量を主、金額を従として返す。
export function consumptionByTag(app, consumptions, { since = '', until = '' } = {}) {
  const currencyById = new Map(appCurrencies(app).map(c => [c.id, c]))
  const map = new Map()

  for (const c of consumptions) {
    if (c.appId !== app.id) continue
    if (since && c.date < since) continue
    if (until && c.date > until) continue
    const tags = (c.tags && c.tags.length > 0) ? c.tags : ['未分類']
    const currency = currencyById.get(c.currencyId)
    const qty = Number(c.quantity) || 0
    // 複数タグが付いている場合は等分して割り当てる
    const share = qty / tags.length
    for (const tag of tags) {
      if (!map.has(tag)) map.set(tag, { tag, byCurrency: new Map(), yen: 0 })
      const bucket = map.get(tag)
      const name = currency?.name || '不明'
      bucket.byCurrency.set(name, (bucket.byCurrency.get(name) || 0) + share)
      bucket.yen += share * (Number(currency?.yenPerUnit) || 0)
    }
  }

  return [...map.values()]
    .map(b => ({
      tag: b.tag,
      currencies: [...b.byCurrency.entries()].map(([name, qty]) => ({ name, qty: Math.round(qty) })),
      yenEquivalent: Math.round(b.yen)
    }))
    .sort((a, b) => b.yenEquivalent - a.yenEquivalent)
}

// 用途タグの初期候補
export const DEFAULT_TAGS = ['ガチャ', 'スタミナ回復', 'パス・月額', '装備・強化', 'その他']

// これまでに使われたタグを候補として集める
export function usedTags(consumptions) {
  const set = new Set()
  for (const c of consumptions) for (const t of (c.tags || [])) set.add(t)
  return [...set]
}
