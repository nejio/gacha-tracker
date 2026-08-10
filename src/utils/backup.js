// 全記録の書き出し・読み込み
//
// データ構造を変更する前に手元へ退避しておくための機能。
// 書き出したJSONは、別端末への移行や、移行に失敗した際の復元にも使える。

// 書き出し対象のコレクション。構造を変えたらここも合わせる
export const BACKUP_COLLECTIONS = [
  'apps', 'banners', 'purchases', 'pulls', 'schedules', 'budgets',
  'acquisitions', 'exchanges', 'consumptions', 'adjustments'
]

// Firestore の serverTimestamp などをそのままJSONにできない場合に備えて整形する
function serializable(value) {
  if (value === null || value === undefined) return null
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  if (Array.isArray(value)) return value.map(serializable)
  if (typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = serializable(v)
    return out
  }
  return value
}

export function buildBackup(collections, appVersion) {
  const data = {}
  for (const name of BACKUP_COLLECTIONS) {
    data[name] = (collections[name] || []).map(serializable)
  }
  return {
    format: 'gacha-tracker-backup',
    formatVersion: 1,
    appVersion,
    exportedAt: new Date().toISOString(),
    data
  }
}

export function downloadBackup(backup) {
  const json = JSON.stringify(backup, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const d = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`
  const a = document.createElement('a')
  a.href = url
  a.download = `gacha-tracker-backup-${stamp}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function parseBackup(text) {
  const parsed = JSON.parse(text)
  if (parsed?.format !== 'gacha-tracker-backup') {
    throw new Error('このファイルは召喚録のバックアップではないようです')
  }
  if (!parsed.data || typeof parsed.data !== 'object') {
    throw new Error('バックアップの中身が読み取れません')
  }
  return parsed
}

export function backupSummary(backup) {
  return BACKUP_COLLECTIONS
    .map(name => ({ name, count: (backup.data[name] || []).length }))
    .filter(x => x.count > 0)
}

// 読み込みは「全消しして入れ直す」方式。
// 部分的に混ざると残高計算が二重になるため、置き換えを基本とする。
export async function restoreBackup(backup, apis, { onProgress } = {}) {
  let done = 0
  const total = BACKUP_COLLECTIONS.reduce(
    (sum, name) => sum + (apis[name] ? (apis[name].items.length + (backup.data[name] || []).length) : 0), 0
  )
  const tick = () => { done++; onProgress?.(done, total) }

  for (const name of BACKUP_COLLECTIONS) {
    const api = apis[name]
    if (!api) continue
    // 既存を削除
    for (const item of [...api.items]) {
      await api.remove(item.id)
      tick()
    }
    // バックアップの内容を投入(idはFirestoreが再採番するため、参照関係はここで貼り直す)
    for (const item of (backup.data[name] || [])) {
      const { id, createdAt, ...rest } = item
      await api.addWithId(id, rest)
      tick()
    }
  }
}
