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
  // 残高の実測による調整。同じ日時なら他の記録より後に適用する(実測は結果だから)
  for (const r of (records.adjustments || [])) {
    if (r.appId === app.id && r.date >= since) events.push({ ...r, _type: 'adj' })
  }
  events.sort((a, b) => {
    const c = String(a.date).localeCompare(String(b.date))
    if (c !== 0) return c
    return (a._type === 'adj' ? 1 : 0) - (b._type === 'adj' ? 1 : 0)
  })

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
    } else if (e._type === 'adj') {
      // 実測残高に合わせる。差分が増えていれば無償入手、減っていればガチャ以外の消費とみなす
      const pool = balances[e.currencyId]
      if (!pool) continue
      const observed = Number(e.observedTotal) || 0
      const diff = observed - poolTotal(pool)
      if (diff > 0) {
        pool.free += diff
      } else if (diff < 0) {
        balances[e.currencyId] = drawFromPool(pool, -diff).next
      }
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

// --- 用途 ---
// 消費は「この通貨をこの数量使った」という1つの事実なので、用途は1つに限る。
// 複数の用途に使った場合は記録を分ける。
// (複数を許すと、数量をどう配分するか決められず、集計が実態とずれるため)

// 記録から用途を取り出す。v1.4.0 の tags 配列にも対応する
export function consumptionTag(c) {
  if (c.tag) return c.tag
  if (Array.isArray(c.tags) && c.tags.length > 0) return c.tags[0]
  return '未分類'
}

// 用途別の集計。円換算は「相当額」であって支出ではないため、通貨量を主・金額を従として返す
export const UNKNOWN_TAG = '使途不明'

// 用途別の集計。records を渡すと、残高の実測で判明した記録漏れの消費を
// 「使途不明」として合流させる(課金した資産が集計から抜け落ちないようにするため)
export function consumptionByTag(app, consumptions, { filterMonth = null, records = null } = {}) {
  const currencyById = new Map(appCurrencies(app).map(c => [c.id, c]))
  const map = new Map()

  for (const c of consumptions) {
    if (c.appId !== app.id) continue
    if (filterMonth && !inMonth(c.date, filterMonth.year, filterMonth.month)) continue

    const tag = consumptionTag(c)
    const currency = currencyById.get(c.currencyId)
    const qty = Number(c.quantity) || 0

    if (!map.has(tag)) map.set(tag, { tag, byCurrency: new Map(), yen: 0, count: 0, pulls: 0 })
    const bucket = map.get(tag)
    const name = currency?.name || '不明'
    bucket.byCurrency.set(name, (bucket.byCurrency.get(name) || 0) + qty)
    bucket.yen += qty * (Number(currency?.yenPerUnit) || 0)
    bucket.count += 1
    bucket.pulls += Number(c.pullCount) || 0
  }

  // 残高の実測で判明した、記録されていない消費を「使途不明」としてまとめる
  if (records) {
    for (const d of adjustmentDiffs(app, records)) {
      if (d.diff >= 0) continue
      if (filterMonth && !inMonth(d.date, filterMonth.year, filterMonth.month)) continue
      const currency = currencyById.get(d.currencyId)
      const qty = -d.diff
      if (!map.has(UNKNOWN_TAG)) map.set(UNKNOWN_TAG, { tag: UNKNOWN_TAG, byCurrency: new Map(), yen: 0, count: 0, pulls: 0 })
      const bucket = map.get(UNKNOWN_TAG)
      const name = currency?.name || '不明'
      bucket.byCurrency.set(name, (bucket.byCurrency.get(name) || 0) + qty)
      bucket.yen += qty * (Number(currency?.yenPerUnit) || 0)
      bucket.count += 1
    }
  }

  return [...map.values()]
    .map(b => ({
      tag: b.tag,
      currencies: [...b.byCurrency.entries()].map(([name, qty]) => ({ name, qty })),
      yenEquivalent: Math.round(b.yen),
      count: b.count,
      pulls: b.pulls
    }))
    .sort((a, b) => b.yenEquivalent - a.yenEquivalent)
}

// 指定した年月(YYYY-MM)の期間を [開始, 終了] のISO文字列で返す。ローカル時刻基準
export function monthRange(year, month) {
  const p2 = (n) => String(n).padStart(2, '0')
  const start = new Date(year, month, 1)
  const end = new Date(year, month + 1, 1)
  const fmt = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}T00:00:00.000Z`
  // 日付境界の比較はローカル時刻で行う必要があるため、ISO文字列ではなく Date で比較する
  return { start, end, startIso: fmt(start), endIso: fmt(end) }
}

// ローカル時刻で「その月の記録か」を判定する
export function inMonth(isoDate, year, month) {
  const d = new Date(isoDate)
  return d.getFullYear() === year && d.getMonth() === month
}

// 残高の実測時点で生じた差分を求める。
// プラスなら記録されていない無償入手、マイナスなら記録されていない消費(使途不明)。
export function adjustmentDiffs(app, records) {
  const out = []
  const adjustments = (records.adjustments || [])
    .filter(a => a.appId === app.id)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  for (const adj of adjustments) {
    // その調整の直前までの記録で残高を求める
    const before = computeCurrencyBalances(app, {
      acquisitions: (records.acquisitions || []).filter(r => r.date < adj.date),
      exchanges: (records.exchanges || []).filter(r => r.date < adj.date),
      consumptions: (records.consumptions || []).filter(r => r.date < adj.date),
      adjustments: adjustments.filter(a => a.date < adj.date)
    })
    const expected = poolTotal(before[adj.currencyId])
    const observed = Number(adj.observedTotal) || 0
    out.push({
      id: adj.id,
      date: adj.date,
      currencyId: adj.currencyId,
      expected,
      observed,
      diff: observed - expected
    })
  }
  return out
}

// ガチャに使える実質的な残高を求める。
// 原神やZZZのように「課金通貨を1:1でガチャ通貨に交換して使う」ゲームでは、
// ゲーム内で残高が別々に表示されるため、そのままだとユーザーが足し算する必要がある。
// 交換すれば使える分を合算して「実質いくら引けるか」を示す。
export function effectiveGachaBalance(app, currencyId) {
  const currencies = appCurrencies(app)
  const target = currencies.find(c => c.id === currencyId)
  if (!target) return null

  const own = target.total ?? poolTotal(target.balance)
  const rate = Number(app.currencyPerPurchaseUnit) || 0

  // 課金通貨からの交換で増やせる分(ガチャ通貨が対象のときのみ)
  const source = currencies.find(c => c.id === 'purchase')
  if (currencyId !== 'main' || !source || rate <= 0) {
    return { own, convertible: 0, total: own, sourceName: null, sourceQty: 0, rate }
  }

  const sourceQty = source.total ?? poolTotal(source.balance)
  const convertible = sourceQty * rate
  return {
    own,
    convertible,
    total: own + convertible,
    sourceName: source.name,
    sourceQty,
    rate
  }
}

// 用途の初期候補
export const DEFAULT_TAGS = ['ガチャ', 'スタミナ回復', 'パス・月額', '装備・強化', 'その他']

// これまでに使われた用途を候補として集める
export function usedTags(consumptions) {
  const set = new Set()
  for (const c of consumptions) {
    const t = c.tag || (Array.isArray(c.tags) ? c.tags[0] : null)
    if (t) set.add(t)
  }
  return [...set]
}
