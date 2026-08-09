// ============ 旧データ構造からの移行 ============
//
// v1.3 以前:
//   apps      … 単一通貨(currencyName / openingBalance / yenPerCurrency)
//                2通貨制は purchaseCurrencyName / currencyPerPurchaseUnit で表現
//   purchases … 課金記録(amountYen / currencyGained / purchaseUnits)
//   pulls     … ガチャ消費記録
//
// v1.4 以降:
//   apps.currencies … 通貨の配列(有償・無償の開始残高つき)
//   acquisitions / exchanges / consumptions … 取得・交換・消費
//
// 移行は1回だけ行い、apps に schemaVersion を立てて再実行を防ぐ。
// 旧コレクション(purchases / pulls)は削除せず残す。復元の手がかりになるため。

export const SCHEMA_VERSION = 3

// v1.4.0 では消費の用途を tags(配列)で保存していたが、
// 1件の消費に複数の用途が付くと数量の配分が決められず集計が実態とずれるため、
// v1.4.1 で単一の tag に改めた。既存記録は先頭の用途を採用して変換する。
export function migrateConsumptionTag(c) {
  if (c.tag || !Array.isArray(c.tags)) return null
  return { tag: c.tags[0] || 'その他' }
}

export function needsMigration(apps) {
  return apps.some(a => (a.schemaVersion || 1) < SCHEMA_VERSION)
}

// 旧アプリを新しい通貨定義に変換する。
// 2通貨制の場合は「課金通貨」と「ガチャ通貨」の2つを作る。
export function migrateApp(app) {
  const gachaCurrency = {
    id: 'main',
    name: app.currencyName || '石',
    openingPaid: 0,
    // 旧構造は有償・無償を区別していなかったため、開始残高はすべて無償として扱う。
    // 有償分が分かる場合は管理画面で修正できる。
    openingFree: Number(app.openingBalance) || 0,
    yenPerUnit: Number(app.yenPerCurrency) || 0
  }

  const currencies = [gachaCurrency]

  if (app.purchaseCurrencyName) {
    const rate = Number(app.currencyPerPurchaseUnit) || 1
    currencies.unshift({
      id: 'purchase',
      name: app.purchaseCurrencyName,
      openingPaid: 0,
      openingFree: 0,
      // 課金通貨1個あたりの円 = ガチャ通貨1個あたりの円 × 換算レート
      yenPerUnit: Math.round((Number(app.yenPerCurrency) || 0) * rate * 100) / 100
    })
  }

  return {
    currencies,
    defaultCurrencyId: 'main',
    schemaVersion: SCHEMA_VERSION
  }
}

// 旧 purchases を acquisitions(+ 2通貨制なら exchanges)に変換する。
// 2通貨制の課金は「課金通貨を取得」→「ガチャ通貨へ交換」の2件に分解する。
export function migratePurchase(purchase, app) {
  const out = { acquisitions: [], exchanges: [] }
  const twoStep = !!app.purchaseCurrencyName && !!purchase.purchaseUnits

  if (twoStep) {
    out.acquisitions.push({
      appId: purchase.appId,
      currencyId: 'purchase',
      date: purchase.date,
      amountYen: Number(purchase.amountYen) || 0,
      isFree: !!purchase.isFree,
      quantity: Number(purchase.purchaseUnits) || 0,
      note: purchase.note || null,
      migratedFrom: purchase.id
    })
    if (purchase.currencyGained) {
      const rate = Number(app.currencyPerPurchaseUnit) || 1
      out.exchanges.push({
        appId: purchase.appId,
        date: purchase.date,
        fromCurrencyId: 'purchase',
        fromQty: Math.round((Number(purchase.currencyGained) || 0) / rate),
        toCurrencyId: 'main',
        toQty: Number(purchase.currencyGained) || 0,
        note: null,
        migratedFrom: purchase.id
      })
    }
  } else {
    out.acquisitions.push({
      appId: purchase.appId,
      currencyId: 'main',
      date: purchase.date,
      amountYen: Number(purchase.amountYen) || 0,
      isFree: !!purchase.isFree,
      quantity: Number(purchase.currencyGained) || 0,
      note: purchase.note || null,
      migratedFrom: purchase.id
    })
  }

  return out
}

// 旧 pulls を consumptions に変換する。用途タグ「ガチャ」を付ける。
export function migratePull(pull) {
  return {
    appId: pull.appId,
    currencyId: 'main',
    date: pull.date,
    quantity: Number(pull.currencySpent) || 0,
    tag: 'ガチャ',
    paidOnly: false,
    // ガチャ固有の情報
    bannerId: pull.bannerId || null,
    scheduleId: pull.scheduleId || null,
    pullCount: Number(pull.pullCount) || 0,
    targetItem: pull.targetItem || null,
    outcome: pull.outcome || (pull.lost ? 'lost' : (pull.obtained && !pull.isPityTriggered ? 'obtained' : 'none')),
    obtained: !!pull.obtained,
    lost: !!pull.lost,
    obtainedAtPull: pull.obtainedAtPull ?? null,
    isPityTriggered: !!pull.isPityTriggered,
    note: pull.note || null,
    migratedFrom: pull.id
  }
}

// 全体の移行を実行する
export async function runMigration({ apps, banners, purchases, pulls, consumptions }, apis, { onProgress } = {}) {
  const targets = apps.filter(a => (a.schemaVersion || 1) < SCHEMA_VERSION)
  if (targets.length === 0) return { migrated: 0 }

  let done = 0
  const tick = (label) => { done++; onProgress?.(done, label) }

  // v1.4.0 で作られた tags 配列を単一の tag に変換する
  for (const c of (consumptions || [])) {
    const patch = migrateConsumptionTag(c)
    if (patch) {
      await apis.consumptions.update(c.id, patch)
      tick('用途を変換')
    }
  }

  for (const app of targets) {
    const alreadyV2 = (app.schemaVersion || 1) >= 2

    // 1. アプリを新しい通貨定義に更新(v2で変換済みならバージョンだけ上げる)
    if (alreadyV2) {
      await apis.apps.update(app.id, { schemaVersion: SCHEMA_VERSION })
      tick(`${app.name} を更新`)
      continue
    }
    await apis.apps.update(app.id, migrateApp(app))
    tick(`${app.name} の通貨を設定`)

    // 2. 課金記録を変換
    for (const p of purchases.filter(x => x.appId === app.id)) {
      const { acquisitions, exchanges } = migratePurchase(p, app)
      for (const a of acquisitions) await apis.acquisitions.add(a)
      for (const e of exchanges) await apis.exchanges.add(e)
      tick('課金記録を変換')
    }

    // 3. ガチャ記録を変換
    for (const g of pulls.filter(x => x.appId === app.id)) {
      await apis.consumptions.add(migratePull(g))
      tick('ガチャ記録を変換')
    }

    // 4. バナーに使用通貨を設定
    for (const b of banners.filter(x => x.appId === app.id)) {
      if (!b.currencyId) {
        await apis.banners.update(b.id, { currencyId: 'main' })
        tick('バナーを更新')
      }
    }
  }

  return { migrated: targets.length }
}
