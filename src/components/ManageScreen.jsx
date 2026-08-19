import { useState } from 'react'
import PityGauge from './PityGauge'
import BackupSection from './BackupSection'
import { formatYen, systemPulls, GAME_PRESETS, APP_VERSION, BUILD_DATE, formatBuildDate } from '../utils/calc'
import { appCurrencies, poolTotal } from '../utils/currency'

export default function ManageScreen({ apps, appsApi, banners, bannersApi, pityPools, pityPoolsApi, pulls, backupApis }) {
  const [presetKey, setPresetKey] = useState('')
  const [newApp, setNewApp] = useState('')
  const [newCurrencyName, setNewCurrencyName] = useState('石')
  const [newYenRate, setNewYenRate] = useState(1.5)
  const [newOpeningBalance, setNewOpeningBalance] = useState('')
  const [expandedAppId, setExpandedAppId] = useState(null)

  const preset = GAME_PRESETS.find(g => g.key === presetKey)

  const selectPreset = (key) => {
    setPresetKey(key)
    const g = GAME_PRESETS.find(x => x.key === key)
    if (g) {
      setNewApp(g.name)
      setNewCurrencyName(g.currencyName)
      setNewYenRate(g.yenPerCurrency)
    } else {
      setNewApp(''); setNewCurrencyName('石'); setNewYenRate(1.5)
    }
  }

  // プリセット選択時は、アプリと同時にそのゲームのバナー(天井設定)も自動生成する
  const addApp = async (e) => {
    e.preventDefault()
    if (!newApp.trim()) return
    // 通貨定義を組み立てる。2通貨制なら課金で買う通貨を先頭に置く
    const currencies = []
    if (preset?.purchaseCurrencyName) {
      currencies.push({
        id: 'purchase', name: preset.purchaseCurrencyName,
        openingPaid: 0, openingFree: 0,
        yenPerUnit: Math.round((Number(newYenRate) || 0) * preset.currencyPerPurchaseUnit * 100) / 100
      })
    }
    currencies.push({
      id: 'main', name: newCurrencyName.trim() || '石',
      openingPaid: 0, openingFree: Number(newOpeningBalance) || 0,
      yenPerUnit: Number(newYenRate) || 0
    })
    // ガチャの副産物(スターダスト等)も通貨として持つ。ガチャ用アイテムに交換できるため
    for (const bp of (preset?.byproducts || [])) {
      currencies.push({ id: bp.id, name: bp.name, openingPaid: 0, openingFree: 0, yenPerUnit: bp.yenPerUnit })
    }

    const ref = await appsApi.add({
      name: newApp.trim(),
      currencies,
      defaultCurrencyId: 'main',
      // 既定は課金額だけを追うシンプルモード。必要な人だけ詳細に切り替える
      trackingLevel: 'simple',
      schemaVersion: 2,
      openingDate: new Date().toISOString(),
      currencyPerPurchaseUnit: preset?.currencyPerPurchaseUnit || null
    })
    if (preset) {
      // プリセットのバナー定義はそのまま天井枠になる(キャラ枠・武器枠など)
      for (const b of preset.banners) {
        await pityPoolsApi.add({
          appId: ref.id,
          name: b.name,
          pityMax: b.pityMax,
          costPerPull: b.costPerPull,
          carryOver: b.carryOver !== false,   // バナーが切り替わっても天井を引き継ぐか
          openingPity: 0,
          openingGuaranteed: false,
          openingDate: new Date().toISOString(),
          currencyId: 'main',
          system: b.system
        })
      }
    }
    setPresetKey(''); setNewApp(''); setNewCurrencyName('石'); setNewYenRate(1.5); setNewOpeningBalance('')
  }

  return (
    <div style={{ padding: '20px 16px 8px' }}>
      <h3 style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 500, marginBottom: 10 }}>アプリを登録</h3>
      <form onSubmit={addApp} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          ゲームを選ぶ(確率・天井・通貨レートが自動設定されます)
          <select value={presetKey} onChange={e => selectPreset(e.target.value)} style={{ ...inputStyle, marginTop: 4 }}>
            <option value="">カスタム(手動入力)</option>
            {GAME_PRESETS.map(g => <option key={g.key} value={g.key}>{g.name}{g.verified ? '' : '(要確認)'}</option>)}
          </select>
        </label>

        <input value={newApp} onChange={e => setNewApp(e.target.value)} placeholder="アプリ名(例: 原神)" style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={newCurrencyName} onChange={e => setNewCurrencyName(e.target.value)} placeholder="ガチャ通貨の呼び方(例: 石)" style={inputStyle} />
          <label style={{ fontSize: 11, color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
            1{newCurrencyName || '石'}=
            <input type="number" step="0.01" value={newYenRate} onChange={e => setNewYenRate(e.target.value)} style={{ ...inputStyle, width: 60, padding: '6px 8px', flex: 'none' }} />
            円
          </label>
        </div>

        <label style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          今持っている{newCurrencyName || '石'}の数(記録開始時点の残高)
          <input type="number" value={newOpeningBalance} onChange={e => setNewOpeningBalance(e.target.value)} placeholder="0" style={{ ...inputStyle, marginTop: 4 }} />
        </label>

        {preset && (
          <div style={{ background: 'var(--ink-bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12, fontSize: 11, color: 'var(--text-dim)' }}>
            {preset.purchaseCurrencyName && (
              <div style={{ marginBottom: 6, color: 'var(--teal)' }}>
                課金で{preset.purchaseCurrencyName}を購入し、1個を{preset.currencyName}{preset.currencyPerPurchaseUnit}個に交換して使うゲームです
              </div>
            )}
            {preset.byproducts && (
              <div style={{ marginBottom: 6, color: 'var(--teal)' }}>
                ガチャの副産物({preset.byproducts.map(b => b.name).join('・')})も通貨として登録され、
                「交換する」から{preset.currencyName}への交換を記録できます
              </div>
            )}
            <div style={{ marginBottom: 6, color: 'var(--gold)' }}>以下のバナーも自動作成されます</div>
            {preset.banners.map(b => {
              const r = systemPulls(b.system)
              const yen = r.expected * b.costPerPull * (Number(newYenRate) || 0)
              return (
                <div key={b.name} style={{ marginBottom: 4 }}>
                  ・{b.name}(1回{b.costPerPull}{preset.currencyName}・天井{b.pityMax}連)
                  <br />
                  <span style={{ paddingLeft: 12 }}>
                    1体入手の期待: <span className="mono" style={{ color: 'var(--teal)' }}>約{Math.round(r.expected)}連 / {formatYen(yen)}</span>
                  </span>
                </div>
              )
            })}
            <div style={{ marginTop: 6, color: preset.verified ? 'var(--text-faint)' : 'var(--danger)', fontSize: 10 }}>
              {preset.verified
                ? '※確率・天井は公式確率表記に基づく目安です。登録後にいつでも編集できます'
                : '※このタイトルは情報が少ない、または仕様が特殊なため推定値です。ゲーム内の提供割合表記を確認して修正してください'}
            </div>
          </div>
        )}

        <button type="submit" style={primaryBtnStyle}>追加</button>
      </form>

      {apps.length === 0 && (
        <div style={{ fontSize: 13, color: 'var(--text-faint)', marginBottom: 16 }}>まずはアプリを登録してください</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {apps.map(app => (
          <div key={app.id} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 500 }}>{app.name}</div>
                <TrackingLevelSwitch app={app} appsApi={appsApi} />
                {(app.trackingLevel || 'simple') === 'full' && <CurrencyEditor app={app} appsApi={appsApi} />}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setExpandedAppId(expandedAppId === app.id ? null : app.id)} style={linkBtnStyle}>
                  天井枠 {expandedAppId === app.id ? '▲' : '▼'}
                </button>
                <button onClick={() => appsApi.remove(app.id)} style={{ ...linkBtnStyle, color: 'var(--danger)' }}>削除</button>
              </div>
            </div>

            {expandedAppId === app.id && (
              <PoolSection app={app} pools={(pityPools || []).filter(p => p.appId === app.id)} pityPoolsApi={pityPoolsApi} banners={banners.filter(b => b.appId === app.id)} bannersApi={bannersApi} />
            )}
          </div>
        ))}
      </div>

      {backupApis && <BackupSection apis={backupApis} />}

      <div style={{
        marginTop: 28, paddingTop: 14, borderTop: '1px solid var(--line)',
        textAlign: 'center', fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.7
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, color: 'var(--text-dim)' }}>召喚録</div>
        <div className="mono">v{APP_VERSION}</div>
        {BUILD_DATE && <div className="mono">build {formatBuildDate(BUILD_DATE)}</div>}
      </div>
    </div>
  )
}

// アプリごとに記録の細かさを切り替える。
// 課金管理の中心は金額なので既定はシンプル。残高や用途まで追いたい人だけ詳細にする。
// 切り替えても記録は消えず、表示が変わるだけ。
function TrackingLevelSwitch({ app, appsApi }) {
  const level = app.trackingLevel || 'simple'
  const [confirming, setConfirming] = useState(null)

  const apply = async (next) => {
    setConfirming(null)
    await appsApi.update(app.id, { trackingLevel: next })
  }

  const OPTIONS = [
    { v: 'simple', t: 'シンプル', d: '課金額とガチャ回数だけ記録' },
    { v: 'full', t: '詳細', d: '通貨の残高・交換・用途も管理' }
  ]

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 4 }}>記録の細かさ</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {OPTIONS.map(o => (
          <button
            key={o.v}
            onClick={() => { if (o.v !== level) setConfirming(o.v) }}
            style={{
              flex: 1, textAlign: 'left', padding: '7px 10px', borderRadius: 'var(--radius-sm)',
              border: `1px solid ${level === o.v ? 'var(--gold)' : 'var(--line)'}`,
              background: level === o.v ? 'var(--gold-soft)' : 'var(--ink-bg-elevated)'
            }}
          >
            <div style={{ fontSize: 12, color: level === o.v ? 'var(--gold)' : 'var(--text)' }}>{o.t}</div>
            <div style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 1, lineHeight: 1.4 }}>{o.d}</div>
          </button>
        ))}
      </div>

      {confirming && (
        <div onClick={() => setConfirming(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 250,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--ink-bg-card)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', padding: 18, maxWidth: 340, width: '100%'
          }}>
            <div style={{ fontWeight: 500, marginBottom: 10 }}>
              {confirming === 'full' ? '詳細モードに切り替えますか?' : 'シンプルモードに切り替えますか?'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.7, marginBottom: 14 }}>
              {confirming === 'full' ? (
                <>
                  これまでの記録は残っています。シンプルモードの間に増減した通貨は
                  記録されていないため、残高がずれている可能性があります。
                  次にガチャを引くときに現在の残高を入力すると自動で調整されます。
                </>
              ) : (
                <>
                  記録は削除されません。通貨の残高や用途の内訳が画面に表示されなくなり、
                  記録するのは課金額とガチャ回数だけになります。
                  いつでも詳細モードに戻せます。
                </>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setConfirming(null)} style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--ink-bg-elevated)', color: 'var(--text-dim)', fontSize: 14 }}>
                キャンセル
              </button>
              <button onClick={() => apply(confirming)} style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--gold)', color: 'var(--ink-bg)', fontWeight: 700, fontSize: 14 }}>
                切り替える
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// アプリの通貨(残高・開始値・円単価)を編集する
function CurrencyEditor({ app, appsApi }) {
  const currencies = appCurrencies(app)
  // 表示用に付与した balance / total は保存しない
  const strip = (list) => list.map(({ balance, total, ...rest }) => rest)
  const save = (list) => appsApi.update(app.id, { currencies: strip(list) })

  const updateCurrency = (id, patch) => save(currencies.map(c => (c.id === id ? { ...c, ...patch } : c)))
  const addCurrency = () => save([...currencies, { id: `c${Date.now()}`, name: '新しい通貨', openingPaid: 0, openingFree: 0, yenPerUnit: 0 }])
  const removeCurrency = (id) => { if (currencies.length > 1) save(currencies.filter(c => c.id !== id)) }

  return (
    <div style={{ marginTop: 6 }}>
      {currencies.map(c => {
        const bal = c.balance || { paid: 0, free: 0 }
        return (
          <div key={c.id} style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input value={c.name} onChange={e => updateCurrency(c.id, { name: e.target.value })}
                style={{ ...inputStyle, padding: '4px 8px', fontSize: 12, flex: 1 }} />
              <span className="mono" style={{ fontSize: 12, color: 'var(--gold)', whiteSpace: 'nowrap' }}>
                {(c.total ?? poolTotal(bal)).toLocaleString('ja-JP')}
              </span>
              {currencies.length > 1 && (
                <button onClick={() => removeCurrency(c.id)} style={{ fontSize: 10, color: 'var(--danger)' }}>削除</button>
              )}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 3 }} className="mono">
              有償 {bal.paid.toLocaleString('ja-JP')} / 無償 {bal.free.toLocaleString('ja-JP')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 5, fontSize: 10, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
              開始時 有償
              <input type="number" value={c.openingPaid ?? 0} onChange={e => updateCurrency(c.id, { openingPaid: Number(e.target.value) || 0 })}
                style={{ ...inputStyle, width: 66, padding: '3px 6px', fontSize: 10, flex: 'none' }} />
              無償
              <input type="number" value={c.openingFree ?? 0} onChange={e => updateCurrency(c.id, { openingFree: Number(e.target.value) || 0 })}
                style={{ ...inputStyle, width: 66, padding: '3px 6px', fontSize: 10, flex: 'none' }} />
              1個=
              <input type="number" step="0.01" value={c.yenPerUnit ?? 0} onChange={e => updateCurrency(c.id, { yenPerUnit: Number(e.target.value) || 0 })}
                style={{ ...inputStyle, width: 56, padding: '3px 6px', fontSize: 10, flex: 'none' }} />
              円
            </div>
          </div>
        )
      })}
      <button onClick={addCurrency} style={{ fontSize: 11, color: 'var(--teal)', marginTop: 8 }}>＋ 通貨を追加</button>
    </div>
  )
}

// 天井枠 = 天井カウンターを共有する単位。
// バナーが切り替わっても同じ枠なら天井が引き継がれるため、カウンターは枠が持つ。
function PoolSection({ app, pools, pityPoolsApi, banners, bannersApi }) {
  const gachaCurrency = (app.currencies || []).find(c => c.id === 'main') || (app.currencies || [])[0]
  const currencyName = gachaCurrency?.name || '石'
  const [form, setForm] = useState({ name: '', pityMax: 90, costPerPull: 160, openingPity: 0 })
  const [expandedPoolId, setExpandedPoolId] = useState(null)

  const addPool = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    await pityPoolsApi.add({
      appId: app.id,
      name: form.name.trim(),
      pityMax: Number(form.pityMax) || 0,
      costPerPull: Number(form.costPerPull) || 0,
      openingPity: Number(form.openingPity) || 0,
      openingGuaranteed: false,
      openingDate: new Date().toISOString(),
      currencyId: gachaCurrency?.id || 'main'
    })
    setForm({ name: '', pityMax: 90, costPerPull: 160, openingPity: 0 })
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginBottom: 10, lineHeight: 1.6 }}>
        天井枠は天井カウンターを共有する単位です。同じ枠のバナーは、切り替わっても天井が引き継がれます。
      </div>

      {pools.map(pool => {
        const poolBanners = banners.filter(b => b.poolId === pool.id)
        const unit = (app.currencies || []).find(c => c.id === pool.currencyId)?.name || currencyName
        return (
          <div key={pool.id} style={{ marginBottom: 16 }}>
            <PityGauge banner={pool} />
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              1回 {pool.costPerPull}{unit}{poolBanners.length > 0 && ` ・ バナー${poolBanners.length}件`}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 10, color: 'var(--text-dim)' }}>
              <input
                type="checkbox"
                checked={pool.carryOver !== false}
                onChange={e => pityPoolsApi.update(pool.id, { carryOver: e.target.checked })}
              />
              バナーが切り替わっても天井を引き継ぐ
            </label>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
              開始時の天井
              <input type="number" value={pool.openingPity ?? 0}
                onChange={e => pityPoolsApi.update(pool.id, { openingPity: e.target.value === '' ? 0 : Number(e.target.value) })}
                style={{ ...inputStyle, width: 64, padding: '4px 6px', fontSize: 11, flex: 'none' }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input type="checkbox" checked={!!pool.openingGuaranteed}
                  onChange={e => pityPoolsApi.update(pool.id, { openingGuaranteed: e.target.checked })} />
                開始時すり抜け済み
              </label>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
              表示中の天井は記録から自動計算されます。ズレた場合はここを修正してください
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
              <button onClick={() => setExpandedPoolId(expandedPoolId === pool.id ? null : pool.id)} style={linkBtnStyle}>
                バナー {expandedPoolId === pool.id ? '▲' : '▼'}
              </button>
              <button onClick={() => pityPoolsApi.remove(pool.id)} style={{ ...linkBtnStyle, color: 'var(--danger)', fontSize: 11 }}>
                この天井枠を削除
              </button>
            </div>

            {expandedPoolId === pool.id && (
              <BannerList app={app} pool={pool} banners={poolBanners} bannersApi={bannersApi} />
            )}
          </div>
        )
      })}

      <form onSubmit={addPool} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="天井枠を追加(例: 限定キャラ)" style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <LabeledInput label="天井回数" value={form.pityMax} onChange={v => setForm({ ...form, pityMax: v })} />
          <LabeledInput label={`1回の${currencyName}消費数`} value={form.costPerPull} onChange={v => setForm({ ...form, costPerPull: v })} />
        </div>
        <LabeledInput label="現在の天井カウンター" value={form.openingPity} onChange={v => setForm({ ...form, openingPity: v })} />
        <button type="submit" style={primaryBtnStyle}>天井枠を追加</button>
      </form>
    </div>
  )
}

// 天井枠に属する個別のバナー(開催単位)。記録の内訳を残したいときだけ登録すればよい
function BannerList({ app, pool, banners, bannersApi }) {
  const [name, setName] = useState('')
  const addBanner = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    await bannersApi.add({ appId: app.id, poolId: pool.id, name: name.trim(), currencyId: pool.currencyId || 'main' })
    setName('')
  }
  return (
    <div style={{ marginTop: 10, paddingLeft: 10, borderLeft: '2px solid var(--line)' }}>
      {banners.length === 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginBottom: 6 }}>
          バナーは記録の内訳を残したいときだけ登録すれば十分です
        </div>
      )}
      {banners.map(b => (
        <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, marginBottom: 4 }}>
          <span style={{ color: 'var(--text-dim)' }}>{b.name}</span>
          <button onClick={() => bannersApi.remove(b.id)} style={{ fontSize: 10, color: 'var(--danger)' }}>削除</button>
        </div>
      ))}
      <form onSubmit={addBanner} style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="バナーを追加(例: 雷電将軍 復刻)" style={{ ...inputStyle, fontSize: 12, padding: '6px 8px' }} />
        <button type="submit" style={{ ...primaryBtnStyle, padding: '6px 12px', fontSize: 12 }}>追加</button>
      </form>
    </div>
  )
}

function LabeledInput({ label, value, onChange }) {
  return (
    <label style={{ flex: 1, fontSize: 11, color: 'var(--text-dim)' }}>
      {label}
      <input type="number" value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, marginTop: 4 }} />
    </label>
  )
}

const inputStyle = {
  flex: 1, background: 'var(--ink-bg-elevated)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 14, color: 'var(--text)', width: '100%'
}

const primaryBtnStyle = {
  background: 'var(--teal)', color: 'var(--ink-bg)', fontWeight: 600,
  padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, whiteSpace: 'nowrap'
}

const linkBtnStyle = { fontSize: 12, color: 'var(--teal)' }

const cardStyle = {
  background: 'var(--ink-bg-card)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius)', padding: 14
}
