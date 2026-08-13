// アプリのバージョン情報(ビルド時に vite.config.js から埋め込まれる)
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
export const BUILD_DATE = typeof __BUILD_DATE__ !== 'undefined' ? __BUILD_DATE__ : ''

export function formatBuildDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

// ============ 天井(保証)カウンター ============

// outcome: 'none'(何も出ていない) | 'obtained'(目的を入手) | 'lost'(すり抜け)
// すり抜けでも最高レア排出なので天井カウンターはその時点でリセットされ、
// バナーに guaranteed(次の最高レアは確定)フラグが立つ。入手または天井到達で解除。
// atPullInput は「バッチ内の何回目で入手/すり抜けしたか」(例: 10連の3回目)。
// 省略時はバッチの最後で発生したものとして扱う。
export function applyPullToBanner(banner, pulls, outcome, atPullInput = null) {
  const pityMax = banner.pityMax || 0
  let pityCurrent = banner.pityCurrent || 0
  let guaranteed = !!banner.guaranteed
  let obtained = false
  let lost = false
  let isPityTriggered = false

  if (outcome === 'obtained' || outcome === 'lost') {
    const atPull = atPullInput && atPullInput > 0 && atPullInput <= pulls ? atPullInput : pulls
    // 最高レアが出た時点でリセット
    pityCurrent = 0
    if (outcome === 'obtained') { obtained = true; guaranteed = false }
    else { lost = true; guaranteed = true }
    // 入手/すり抜け後、バッチ内に残っている回数を積み直す
    pityCurrent += pulls - atPull
    if (pityMax > 0 && pityCurrent >= pityMax) {
      obtained = true; isPityTriggered = true; guaranteed = false
      pityCurrent -= pityMax
    }
  } else {
    pityCurrent += pulls
    if (pityMax > 0 && pityCurrent >= pityMax) {
      obtained = true; isPityTriggered = true; guaranteed = false
      pityCurrent -= pityMax
    }
  }

  return { pityCurrent, obtained, lost, guaranteed, isPityTriggered }
}

// ============ 導出計算(残高・天井を記録から算出) ============
//
// 残高と天井カウンターは値を保存せず、常に記録から計算する。
// これにより記録の削除・編集をしても不整合が起きない。
//
// 計算は「チェックポイント(基準時点の状態)＋それ以降の記録」で行う。
// 現在は開始時点(openingBalance / openingPity)のみをチェックポイントとして使うが、
// 将来、履歴を分割読み込みする際は「月末時点のスナップショット」を
// チェックポイントとして渡すだけで、この関数はそのまま使える。

// アプリのチェックポイントを取り出す。将来はスナップショット文書から取得する想定
export function balanceCheckpoint(app) {
  return { balance: Number(app.openingBalance) || 0, since: app.openingDate || '' }
}

// 石残高 = 基準残高 + 基準時点以降の獲得 − 基準時点以降の消費
export function computeBalance(app, purchases, pulls) {
  const cp = balanceCheckpoint(app)
  let balance = cp.balance
  for (const p of purchases) {
    if (p.appId === app.id && p.date >= cp.since) balance += Number(p.currencyGained) || 0
  }
  for (const p of pulls) {
    if (p.appId === app.id && p.date >= cp.since) balance -= Number(p.currencySpent) || 0
  }
  return balance
}

// バナーのチェックポイント
export function pityCheckpoint(banner) {
  return {
    pityCurrent: Number(banner.openingPity) || 0,
    guaranteed: !!banner.openingGuaranteed,
    since: banner.openingDate || ''
  }
}

// 記録に保存された結果種別を取り出す(outcome 未保存の古い記録にも対応)
export function pullOutcome(pull) {
  if (pull.outcome) return pull.outcome
  if (pull.lost) return 'lost'
  // 天井到達による入手はユーザー入力ではなく計算結果なので、再生時は 'none' として扱う
  if (pull.obtained && !pull.isPityTriggered) return 'obtained'
  return 'none'
}

// 天井カウンター = 基準時点の状態から、記録を古い順に再生した結果
// 引数はガチャ消費の記録(v1.4以降は consumptions、それ以前は pulls)
export function computePity(banner, gachaRecords) {
  const cp = pityCheckpoint(banner)
  const related = (gachaRecords || [])
    .filter(p => p.bannerId === banner.id && p.date >= cp.since)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  let state = { pityCurrent: cp.pityCurrent, guaranteed: cp.guaranteed }
  for (const p of related) {
    const r = applyPullToBanner(
      { ...banner, pityCurrent: state.pityCurrent, guaranteed: state.guaranteed },
      Number(p.pullCount) || 0,
      pullOutcome(p),
      p.obtainedAtPull
    )
    state = { pityCurrent: r.pityCurrent, guaranteed: r.guaranteed }
  }
  return state
}

// 表示用に、導出値を埋め込んだアプリ/バナーの配列を作る
export function withDerivedBalance(apps, purchases, pulls) {
  return apps.map(a => ({ ...a, currencyBalance: computeBalance(a, purchases, pulls) }))
}

export function withDerivedPity(banners, gachaRecords) {
  return banners.map(b => ({ ...b, ...computePity(b, gachaRecords) }))
}

// ============ 天井枠 ============
// 多くのゲームでは、バナーが切り替わっても天井カウンターは引き継がれる。
// ただし引き継がれるのは「同じ枠」の中だけで、キャラ枠と武器枠は別に進む。
// そこでカウンターは個別のバナーではなく「天井枠(pityPool)」が持ち、
// その枠に属する全バナーの記録をまとめて再生する。
export function computePoolPity(pool, banners, gachaRecords) {
  const since = pool.openingDate || ''
  const bannerIds = new Set((banners || []).filter(b => b.poolId === pool.id).map(b => b.id))

  const related = (gachaRecords || [])
    .filter(r => {
      if (r.date < since) return false
      if (r.poolId) return r.poolId === pool.id
      return bannerIds.has(r.bannerId)
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))

  // ウマ娘やブルアカのように、バナーごとに天井が独立するゲームもある。
  // その場合は最後に引いたバナーの記録だけを再生する。
  const carryOver = pool.carryOver !== false
  let target = related
  if (!carryOver) {
    const lastBanner = [...related].reverse().find(r => r.bannerId)?.bannerId
    if (lastBanner) target = related.filter(r => r.bannerId === lastBanner)
  }

  let state = { pityCurrent: Number(pool.openingPity) || 0, guaranteed: !!pool.openingGuaranteed }
  for (const r of target) {
    const res = applyPullToBanner(
      { pityMax: pool.pityMax, pityCurrent: state.pityCurrent, guaranteed: state.guaranteed },
      Number(r.pullCount) || 0,
      pullOutcome(r),
      r.obtainedAtPull
    )
    state = { pityCurrent: res.pityCurrent, guaranteed: res.guaranteed }
  }
  return state
}

export function withDerivedPoolPity(pools, banners, gachaRecords) {
  return (pools || []).map(p => ({ ...p, ...computePoolPity(p, banners, gachaRecords) }))
}

// バナーに、所属する天井枠の状態を合成する
export function withPoolInfo(banners, pools) {
  const byId = new Map((pools || []).map(p => [p.id, p]))
  return (banners || []).map(b => {
    const pool = byId.get(b.poolId)
    if (!pool) return b
    return {
      ...b,
      pityMax: pool.pityMax,
      pityCurrent: pool.pityCurrent,
      guaranteed: pool.guaranteed,
      costPerPull: b.costPerPull ?? pool.costPerPull,
      system: b.system || pool.system,
      poolName: pool.name
    }
  })
}

// 消費記録からガチャに該当するものだけ取り出す(天井計算に使う)
export function gachaConsumptions(consumptions) {
  return (consumptions || []).filter(c => {
    if (c.bannerId) return true
    const tag = c.tag || (Array.isArray(c.tags) ? c.tags[0] : null)
    return tag === 'ガチャ'
  })
}

export function pityProgress(banner) {
  if (!banner.pityMax) return 0
  return Math.min(1, (banner.pityCurrent || 0) / banner.pityMax)
}

// ============ 課金額の集計(purchases 基準・円ベース) ============

// ローカル時刻で月を判定(UTC文字列スライスだとJST早朝が前月扱いになるため)
const monthKey = (isoDate) => {
  const d = new Date(isoDate)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 課金額の集計。支出は課金した時点で発生するため、取得記録のみから算出する
export function totalAmount(acquisitions) {
  return acquisitions.reduce((sum, p) => sum + (p.amountYen || 0), 0)
}

export function monthlyTotal(purchases, targetMonthKey) {
  return totalAmount(purchases.filter(p => monthKey(p.date) === targetMonthKey))
}

export function currentMonthKey() {
  return monthKey(new Date().toISOString())
}

export function monthlySeries(purchases, months = 6) {
  const now = new Date()
  const buckets = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    buckets.push({ key, label: `${d.getMonth() + 1}月`, amount: 0 })
  }
  const map = new Map(buckets.map(b => [b.key, b]))
  for (const p of purchases) {
    const key = monthKey(p.date)
    if (map.has(key)) map.get(key).amount += (p.amountYen || 0)
  }
  return buckets
}

export function totalsByApp(purchases, apps) {
  const nameById = new Map(apps.map(a => [a.id, a.name]))
  const map = new Map()
  for (const p of purchases) {
    const key = p.appId
    if (!map.has(key)) map.set(key, { appId: key, name: nameById.get(key) || '不明なアプリ', amount: 0, count: 0 })
    const bucket = map.get(key)
    bucket.amount += (p.amountYen || 0)
    bucket.count += 1
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

export function formatYen(n) {
  return `¥${Math.round(n || 0).toLocaleString('ja-JP')}`
}

export function formatCurrency(n, unit = '石') {
  return `${Math.round(n || 0).toLocaleString('ja-JP')}${unit}`
}

// ============ ガチャシステム別の期待値計算エンジン ============

// ソフト天井を考慮した「最高レア1体あたりの期待回数」の厳密計算
// i回目の排出確率 p_i を使い、E = Σ i × P(i回目で初めて出る) を計算する
export function expectedPullsPerFiveStar(sys) {
  const base = (sys.baseRate || 0) / 100
  const inc = (sys.softPityInc || 0) / 100
  const start = sys.softPityStart || Infinity
  const hard = sys.hardPity || 90
  let expected = 0
  let noneSoFar = 1
  for (let i = 1; i <= hard; i++) {
    let p = i >= start ? Math.min(1, base + inc * (i - start + 1)) : base
    if (i === hard) p = 1
    expected += i * noneSoFar * p
    noneSoFar *= (1 - p)
  }
  return expected
}

// システム種別ごとに「目的の1体を入手するまで」の期待回数と最大回数を返す
// max が null の場合は理論上の上限なし
// - fiftyFifty: ピックアップ50/50型(原神・スタレ系)。すり抜け保証ありなら
//   必要な最高レア数の期待値 = 2 - ピックアップ率 なので E = E5★ × (2 - f)
// - spark: 天井交換型(プリコネ・グラブル系)。E = Σ i·r·(1-r)^(i-1) + S·(1-r)^S
// - manual: 期待回数を手動入力(後方互換)
export function systemPulls(system) {
  if (!system || system.type === 'manual') {
    return { expected: Number(system?.expectedPulls) || 0, max: Number(system?.pityMax) || 0 }
  }
  // maxPullsOverride: モデルの理論上限とゲームの実際の保証回数が異なる場合に指定
  //   (例: エンドフィールドは80連★6確定だが120連でPU確定)
  const override = Number(system.maxPullsOverride) || null

  if (system.type === 'fiftyFifty') {
    const e5 = expectedPullsPerFiveStar(system)
    const f = (system.featuredRate ?? 50) / 100
    if (system.guarantee) return { expected: e5 * (2 - f), max: override || 2 * (system.hardPity || 90) }
    return { expected: e5 / f, max: override }
  }
  if (system.type === 'spark') {
    const r = (system.pickupRate || 0) / 100
    const S = Number(system.ceiling) || 0
    // 天井なし(S=0)の場合は幾何分布。期待値は 1/r、上限は理論上なし
    if (S <= 0) return { expected: r > 0 ? 1 / r : 0, max: override }
    let expected = 0
    let noneSoFar = 1
    for (let i = 1; i <= S; i++) {
      expected += i * noneSoFar * r
      noneSoFar *= (1 - r)
    }
    expected += S * noneSoFar
    return { expected, max: override || S }
  }
  return { expected: 0, max: 0 }
}

// 後方互換: system未設定の古いスケジュールは手動モデルとして扱う
export function scheduleSystem(schedule) {
  return schedule.system || { type: 'manual', expectedPulls: schedule.expectedPulls, pityMax: schedule.pityMax }
}

export const SYSTEM_PRESETS = [
  {
    key: 'hoyo', label: '原神/スタレ系',
    system: { type: 'fiftyFifty', baseRate: 0.6, softPityStart: 74, softPityInc: 6, hardPity: 90, featuredRate: 50, guarantee: true }
  },
  { key: 'pricone', label: 'プリコネ系', system: { type: 'spark', pickupRate: 0.7, ceiling: 200 } },
  { key: 'gbf', label: 'グラブル系', system: { type: 'spark', pickupRate: 0.5, ceiling: 300 } }
]

// ============ ガチャスケジュール×予算計画 ============

// 期待費用 = 必要入手数 × 1入手あたりの期待回数(モデル計算) × 1回の石数 × 円換算レート
// 最大費用 = 必要入手数 × 最大回数 × 1回の石数 × 円換算レート(上限なしの場合は null)
export function scheduleCosts(schedule, app) {
  const options = schedule.targetOptions || []
  const target = options.find(o => o.id === schedule.selectedTargetId) || options[0] || { label: '-', copies: 1 }
  // ガチャに使う通貨の円単価。新構造では currencies から取る
  const list = Array.isArray(app?.currencies) && app.currencies.length > 0 ? app.currencies : null
  const yenRate = list
    ? (Number((list.find(c => c.id === 'main') || list[list.length - 1])?.yenPerUnit) || 0)
    : (Number(app?.yenPerCurrency) || 0)
  const per = systemPulls(scheduleSystem(schedule))
  const pullsExpected = (target.copies || 1) * per.expected
  const pullsMax = per.max == null ? null : (target.copies || 1) * per.max
  return {
    target,
    pullsExpected,
    pullsMax,
    expectedYen: pullsExpected * (schedule.costPerPull || 0) * yenRate,
    maxYen: pullsMax == null ? null : pullsMax * (schedule.costPerPull || 0) * yenRate
  }
}

export function overlapsMonth(schedule, year, month) {
  const mStart = new Date(year, month, 1)
  const mEnd = new Date(year, month + 1, 0, 23, 59, 59)
  const st = new Date(schedule.startDate + 'T00:00:00')
  const en = new Date(schedule.endDate + 'T23:59:59')
  return st <= mEnd && en >= mStart
}

export const pad2 = (n) => String(n).padStart(2, '0')
export const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

export const defaultTargetOptions = () => ([
  { id: 't1', label: 'キャラ1体', copies: 1 },
  { id: 't2', label: 'キャラ完凸(7体分)', copies: 7 }
])

// ============ ゲーム別マスターデータ ============
// 各ゲームのガチャ仕様プリセット。アプリ登録時に選ぶと確率・天井・通貨レートが自動設定される。
//
// verified: true  … 公式確率表記や複数の攻略サイトで数値を確認済み
// verified: false … 情報が少ない/仕様が特殊なため推定値。UIに「要確認」を表示し、
//                   ユーザーがゲーム内の提供割合表記を見て修正することを前提とする
//
// 円換算レートは「まとめ買いや初回ボーナスを使わない標準的な購入」を基準にした概算です。
// いずれの値も登録後にアプリ内で編集できます。
// ============ ゲーム別マスターデータ ============
// 各ゲームのガチャ仕様プリセット。アプリ登録時に選ぶと確率・天井・通貨が自動設定される。
//
// verified: true  … 公式確率表記や複数の攻略サイトで数値を確認済み
// verified: false … 情報が少ない/仕様が特殊なため推定値。UIに「要確認」を表示する
//
// 通貨の階層(ゲームにより2〜4層):
//   purchaseCurrencyName … 課金でのみ買える通貨(例: 創世結晶、モノクローム)
//   currencyName         … ガチャの計算基準にする通貨(例: 原石、ジュエル)
//   byproducts           … ガチャの副産物。ガチャ用アイテムに交換できるため資産として追跡する
//
// ガチャ用アイテム(紡がれた運命など)は currencyName × costPerPull で換算できるため、
// 記録の手間を抑える観点から個別の通貨としては持たない(README「通貨と記録の構造」参照)。
//
// 円換算レートはまとめ買いや初回ボーナスを使わない標準的な購入を基準にした概算。
// いずれの値も登録後にアプリ内で編集できる。
export const GAME_PRESETS = [
  // ---- ホヨバース系(ソフト天井 + 50/50 + すり抜け保証) ----
  {
    key: 'genshin', name: '原神', currencyName: '原石', yenPerCurrency: 1.85, verified: true,
    // 課金で「創世結晶」を買い、1:1で「原石」に交換。原石160個でガチャ用の「紡がれた運命」1個
    purchaseCurrencyName: '創世結晶', currencyPerPurchaseUnit: 1,
    // 副産物: ★3武器でスターダスト15個、★4以上の重複でスターライト。
    // スターダスト75個(月5個まで)、スターライト5個で紡がれた運命1個に交換できる
    byproducts: [
      { id: 'stardust', name: 'スターダスト', yenPerUnit: 0 },
      { id: 'starlight', name: 'スターライト', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'キャラクター(限定PU)', costPerPull: 160, pityMax: 90, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.6, softPityStart: 74, softPityInc: 6, hardPity: 90, featuredRate: 50, guarantee: true } },
      { name: '武器(限定PU)', costPerPull: 160, pityMax: 80, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.7, softPityStart: 63, softPityInc: 7, hardPity: 80, featuredRate: 50, guarantee: true } }
    ]
  },
  {
    key: 'hsr', name: '崩壊:スターレイル', currencyName: '星玉', yenPerCurrency: 1.85, verified: true,
    purchaseCurrencyName: '往日の夢華', currencyPerPurchaseUnit: 1,
    // 副産物: ★3光円錐で燃えさしのエンバー、★4以上で消えない星芒
    byproducts: [
      { id: 'ember', name: '燃えさしのエンバー', yenPerUnit: 0 },
      { id: 'starlight', name: '消えない星芒', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'キャラクター(限定PU)', costPerPull: 160, pityMax: 90, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.6, softPityStart: 74, softPityInc: 6, hardPity: 90, featuredRate: 50, guarantee: true } },
      { name: '光円錐(限定PU)', costPerPull: 160, pityMax: 80, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.8, softPityStart: 63, softPityInc: 7, hardPity: 80, featuredRate: 75, guarantee: true } }
    ]
  },
  {
    key: 'zzz', name: 'ゼンレスゾーンゼロ', currencyName: 'ポリクローム', yenPerCurrency: 1.85, verified: true,
    purchaseCurrencyName: 'モノクローム', currencyPerPurchaseUnit: 1,
    // 副産物: A級以上の重複で余波シグナル、B級音動機の重複で残響シグナル20個
    byproducts: [
      { id: 'residual', name: '余波シグナル', yenPerUnit: 0 },
      { id: 'echo', name: '残響シグナル', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'エージェント(限定PU)', costPerPull: 160, pityMax: 90, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.6, softPityStart: 74, softPityInc: 6, hardPity: 90, featuredRate: 50, guarantee: true } },
      { name: '音動機(限定PU)', costPerPull: 160, pityMax: 80, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 1.0, softPityStart: 65, softPityInc: 7, hardPity: 80, featuredRate: 75, guarantee: true } }
    ]
  },
  {
    key: 'wuwa', name: '鳴潮', currencyName: '星声', yenPerCurrency: 1.85, verified: true,
    // 課金で「月相」を買い、1:1で「星声」に交換。星声160個でガチャ石(金髄の波模様など)1個
    purchaseCurrencyName: '月相', currencyPerPurchaseUnit: 1,
    // 副産物: ガチャで得られる2種類の珊瑚。海市交換所でガチャ石に交換できる
    byproducts: [
      { id: 'coral1', name: '漂流する珊瑚', yenPerUnit: 0 },
      { id: 'coral2', name: '無音の珊瑚', yenPerUnit: 0 }
    ],
    banners: [
      { name: '共鳴者(限定PU)', costPerPull: 160, pityMax: 80, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.8, softPityStart: 66, softPityInc: 4, hardPity: 80, featuredRate: 50, guarantee: true } },
      { name: '武器(限定PU)', costPerPull: 160, pityMax: 80, carryOver: true,
        system: { type: 'spark', pickupRate: 0.8, ceiling: 80 } }
    ]
  },
  {
    key: 'p5x', name: 'ペルソナ5: The Phantom X', currencyName: '自在結晶', yenPerCurrency: 1.9, verified: true,
    // 課金で「異界宝珠」を買い、1:1で「自在結晶」に交換
    purchaseCurrencyName: '異界宝珠', currencyPerPurchaseUnit: 1,
    // 副産物: ガチャ重複で「認知の残響」。ショップでガチャチケットに交換できる
    byproducts: [
      { id: 'echo', name: '認知の残響', yenPerUnit: 0 }
    ],
    banners: [
      // 80連で★5確定、160連でPU確定。同タイプのバナー間で引き継ぎあり
      { name: 'キャラ(80連形式)', costPerPull: 150, pityMax: 80, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.6, softPityStart: 66, softPityInc: 5, hardPity: 80, featuredRate: 50, guarantee: true, maxPullsOverride: 160 } },
      // 110連で100%PU確定(すり抜けなし)
      { name: 'キャラ(110連確定形式)', costPerPull: 150, pityMax: 110, carryOver: true,
        system: { type: 'spark', pickupRate: 0.6, ceiling: 110 } }
    ]
  },

  // ---- 天井交換型(Ptを貯めて対象と交換) ----
  {
    key: 'fgo', name: 'Fate/Grand Order', currencyName: '聖晶石', yenPerCurrency: 60, verified: true,
    // 副産物: ★3以上のカード売却でマナプリズム。交換所で呼符と交換できる(月5枚まで)
    byproducts: [
      { id: 'mana', name: 'マナプリズム', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'ピックアップ召喚', costPerPull: 3, pityMax: 330, carryOver: false,
        system: { type: 'spark', pickupRate: 0.8, ceiling: 330 } }
    ]
  },
  {
    key: 'umamusume', name: 'ウマ娘 プリティーダービー', currencyName: 'ジュエル', yenPerCurrency: 1.2, verified: true,
    // 副産物: ガチャPtが終了時にクローバーへ変換。200個でガチャチケット1枚(月2枚まで)
    byproducts: [
      { id: 'clover', name: 'クローバー', yenPerUnit: 0 }
    ],
    banners: [
      { name: '育成ウマ娘(PU)', costPerPull: 150, pityMax: 200, carryOver: false,
        system: { type: 'spark', pickupRate: 0.75, ceiling: 200 } },
      { name: 'サポートカード(PU)', costPerPull: 150, pityMax: 200, carryOver: false,
        system: { type: 'spark', pickupRate: 0.75, ceiling: 200 } }
    ]
  },
  {
    key: 'bluearchive', name: 'ブルーアーカイブ', currencyName: '青輝石', yenPerCurrency: 1.9, verified: true,
    // 副産物: 呼び出しPtが期間終了時にキーストーンのカケラへ変換
    byproducts: [
      { id: 'keystone', name: 'キーストーンのカケラ', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'ピックアップ募集', costPerPull: 120, pityMax: 200, carryOver: false,
        system: { type: 'spark', pickupRate: 0.7, ceiling: 200 } }
    ]
  },
  {
    key: 'gakumas', name: '学園アイドルマスター', currencyName: 'ジュエル', yenPerCurrency: 1.2, verified: true,
    // 副産物: ガチャ1回でフラワー10個。100個でプラチナガチャチケット1枚(月10枚まで)
    byproducts: [
      { id: 'flower', name: 'フラワー', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'Pアイドル(限定PU)', costPerPull: 250, pityMax: 200, carryOver: false,
        system: { type: 'spark', pickupRate: 0.75, ceiling: 200 } },
      { name: 'サポートカード(PU)', costPerPull: 250, pityMax: 200, carryOver: false,
        system: { type: 'spark', pickupRate: 1.0, ceiling: 200 } }
    ]
  },
  {
    key: 'priconne', name: 'プリンセスコネクト!Re:Dive', currencyName: 'ジュエル', yenPerCurrency: 1.0, verified: true,
    // 副産物: キャラ重複で女神の秘石(メモリーピース交換用。ガチャ券には交換できない)
    byproducts: [
      { id: 'goddess', name: '女神の秘石', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'プリンセスフェス/限定PU', costPerPull: 150, pityMax: 200, carryOver: false,
        system: { type: 'spark', pickupRate: 0.7, ceiling: 200 } }
    ]
  },
  {
    key: 'gbf', name: 'グランブルーファンタジー', currencyName: '宝晶石', yenPerCurrency: 1.0, verified: true,
    // 副産物: 御印(1回1個、300個で天井交換)。★3/★4重複でブロンズ/シルバー/ゴールドムーン
    byproducts: [
      { id: 'bronzemoon', name: 'ブロンズムーン', yenPerUnit: 0 },
      { id: 'silvermoon', name: 'シルバームーン', yenPerUnit: 0 },
      { id: 'goldmoon', name: 'ゴールドムーン', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'レジェンドフェス/限定PU', costPerPull: 300, pityMax: 300, carryOver: false,
        system: { type: 'spark', pickupRate: 0.5, ceiling: 300 } }
    ]
  },
  {
    key: 'nikke', name: '勝利の女神:NIKKE', currencyName: 'ジュエル', yenPerCurrency: 1.0, verified: true,
    // 副産物: 特殊募集1回でゴールドマイレージ1枚。200枚でPUキャラと直接交換でき、
    // バナーをまたいで無期限に持ち越せる(実質的にこれが天井)
    byproducts: [
      { id: 'goldmileage', name: 'ゴールドマイレージ', yenPerUnit: 0 },
      { id: 'silvermileage', name: 'シルバーマイレージ', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'ピックアップ募集', costPerPull: 300, pityMax: 200, carryOver: true,
        system: { type: 'spark', pickupRate: 2.0, ceiling: 200 } }
    ]
  },

  // ---- アークナイツ系(ソフト天井 + PU確定回数) ----
  {
    key: 'arknights', name: 'アークナイツ', currencyName: '合成玉', yenPerCurrency: 0.83, verified: true,
    // 課金で「純正源石」を買い、1個=合成玉180個に交換
    purchaseCurrencyName: '純正源石', currencyPerPurchaseUnit: 180,
    // 副産物: ★4以上の重複などで上級/一般資格証。上級資格証ショップでスカウト券に交換できる
    byproducts: [
      { id: 'cert_high', name: '上級資格証', yenPerUnit: 0 },
      { id: 'cert_normal', name: '一般資格証', yenPerUnit: 0 }
    ],
    banners: [
      // 星6は2%開始・51連目から2%ずつ上昇。天井カウントはバナー間で引き継がれる
      { name: 'イベントスカウト(単独PU)', costPerPull: 600, pityMax: 99, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 2.0, softPityStart: 51, softPityInc: 2, hardPity: 99, featuredRate: 50, guarantee: false } },
      // 限定スカウトは限定契約証300枚で指名交換。引き継ぎなし
      { name: 'リミテッドスカウト', costPerPull: 600, pityMax: 300, carryOver: false,
        system: { type: 'fiftyFifty', baseRate: 2.0, softPityStart: 51, softPityInc: 2, hardPity: 99, featuredRate: 70, guarantee: false, maxPullsOverride: 300 } }
    ]
  },
  {
    key: 'endfield', name: 'アークナイツ:エンドフィールド',
    currencyName: '赤晶玉', yenPerCurrency: 0.69, verified: true,
    purchaseCurrencyName: '展延源石', currencyPerPurchaseUnit: 75,
    // 副産物: オペレーター招集・重複で各種配給。配給交換所でガチャ券などに交換できる
    byproducts: [
      { id: 'ration_guarantee', name: '保証配給', yenPerUnit: 0 },
      { id: 'ration_premium', name: '高級配給', yenPerUnit: 0 }
    ],
    banners: [
      // 80連で★6確定(この分はバナー間で引き継ぎあり)、120連でPU確定(引き継ぎなし)
      { name: '特別スカウト(限定PU)', costPerPull: 500, pityMax: 80, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.8, softPityStart: 66, softPityInc: 5, hardPity: 80, featuredRate: 50, guarantee: true, maxPullsOverride: 120 } }
    ]
  },

  // ---- その他 ----
  {
    key: 'nte', name: 'NTE: Neverness to Everness', currencyName: '円石', yenPerCurrency: 1.85, verified: true,
    // 課金で「異晶」を買い、1:1で「円石」に交換。円石160個でサイコロ(ガチャ用アイテム)1個
    purchaseCurrencyName: '異晶', currencyPerPurchaseUnit: 1,
    // 副産物: 迷走ピース(70個で本質サイコロ1個、月5個まで)、次元ピース(無制限)
    byproducts: [
      { id: 'lost_piece', name: '迷走ピース', yenPerUnit: 0 },
      { id: 'dim_piece', name: '次元ピース', yenPerUnit: 0 }
    ],
    banners: [
      // Sランク排出時は100%PU確定(すり抜けなし)。バナー更新でも天井を引き継ぐ
      { name: 'キャラクター(限定PU)', costPerPull: 160, pityMax: 90, carryOver: true,
        system: { type: 'fiftyFifty', baseRate: 0.6, softPityStart: 71, softPityInc: 6, hardPity: 90, featuredRate: 100, guarantee: true } },
      { name: '武器・弧盤', costPerPull: 160, pityMax: 80, carryOver: true,
        system: { type: 'spark', pickupRate: 0.8, ceiling: 80 } }
    ]
  },
  {
    key: 'heavenburns', name: 'ヘブンバーンズレッド', currencyName: 'クォーツ', yenPerCurrency: 1.2, verified: true,
    // 副産物: ガチャPtが期間終了時に万能スタイルピースへ変換
    byproducts: [
      { id: 'stylepiece', name: '万能スタイルピース', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'ピックアップガチャ', costPerPull: 300, pityMax: 200, carryOver: false,
        system: { type: 'spark', pickupRate: 0.875, ceiling: 200 } }
    ]
  },
  {
    key: 'monst', name: 'モンスターストライク', currencyName: 'オーブ', yenPerCurrency: 100, verified: true,
    // 副産物: ★4以下の獲得でホシ玉のカケラ1個。50個で★5以上確定のホシ玉ガチャが発動する。
    // このカケラは全ガチャ共通で持ち越せるため、天井もバナー間で引き継がれる扱いにする
    byproducts: [
      { id: 'hoshitama', name: 'ホシ玉のカケラ', yenPerUnit: 0 }
    ],
    banners: [
      { name: '限定ガチャ', costPerPull: 5, pityMax: 50, carryOver: true,
        system: { type: 'spark', pickupRate: 0.6, ceiling: 50 } }
    ]
  },
  {
    key: 'pad', name: 'パズル&ドラゴンズ', currencyName: '魔法石', yenPerCurrency: 85, verified: true,
    // カウント型の天井は無く、モンスター交換所でのキャラ差し出し交換が実質的な天井
    byproducts: [
      { id: 'mp', name: 'モンスターポイント', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'フェス限ガチャ', costPerPull: 5, pityMax: 0, carryOver: false,
        system: { type: 'spark', pickupRate: 1.0, ceiling: 0 } }
    ]
  },
  {
    key: 'ptcgp', name: 'Pokémon TCG Pocket', currencyName: 'ポケゴールド', yenPerCurrency: 17, verified: true,
    // パック開封型。1パック=6ポケゴールド。開封ごとに5ptが貯まり、
    // 最大2500pt(=500パック)で好きなカードと直接交換できる(これが実質の天井)
    byproducts: [
      { id: 'packpoint', name: 'パック開封ポイント', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'パック開封', costPerPull: 6, pityMax: 500, carryOver: true,
        system: { type: 'spark', pickupRate: 0.4, ceiling: 500 } }
    ]
  },
  {
    key: 'spira', name: 'プロ野球スピリッツA', currencyName: 'エナジー', yenPerCurrency: 4.0, verified: true,
    // 副産物なし。ステップアップの確定枠方式でカウント型の天井は無い
    banners: [
      { name: 'スカウト(PU)', costPerPull: 25, pityMax: 0, carryOver: false,
        system: { type: 'spark', pickupRate: 1.0, ceiling: 0 } }
    ]
  },
  {
    key: 'dqwalk', name: 'ドラゴンクエストウォーク', currencyName: 'ジェム', yenPerCurrency: 1.0, verified: true,
    // 副産物: 10連1回ごとにスラミチスタンプ1個。スタンプ数で★5やPU★5の確定枠が発生する
    byproducts: [
      { id: 'stamp', name: 'スラミチスタンプ', yenPerUnit: 0 }
    ],
    banners: [
      // 10連10回目でPU★5確定 = 100連相当を天井とみなす
      { name: 'ふくびき(PU)', costPerPull: 300, pityMax: 100, carryOver: false,
        system: { type: 'spark', pickupRate: 0.6, ceiling: 100 } }
    ]
  },
  {
    key: 'ensemble', name: 'あんさんぶるスターズ!! Music', currencyName: 'ダイヤ', yenPerCurrency: 10, verified: true,
    // 副産物: スカウト1回でセレクトコイン1枚。300枚で対象★5と交換(=天井)
    byproducts: [
      { id: 'selectcoin', name: 'セレクトコイン', yenPerUnit: 0 }
    ],
    banners: [
      { name: 'スカウト(PU)', costPerPull: 30, pityMax: 300, carryOver: false,
        system: { type: 'spark', pickupRate: 1.5, ceiling: 300 } }
    ]
  },
  {
    key: 'mugen', name: '無限大ANANTA (旧 Project Mugen)', currencyName: '-', yenPerCurrency: 0, verified: false,
    // 開発元より「キャラクターガチャを設置しない」方針が示されている。
    // ガチャ通貨体系が存在しない見込みのため、記録用の枠のみ用意する
    banners: [
      { name: '(ガチャ非搭載の方針)', costPerPull: 0, pityMax: 0, carryOver: false,
        system: { type: 'manual', expectedPulls: 0, pityMax: 0 } }
    ]
  }
]
