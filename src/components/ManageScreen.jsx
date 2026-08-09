import { useState } from 'react'
import PityGauge from './PityGauge'
import { formatCurrency, formatYen, systemPulls, GAME_PRESETS, APP_VERSION, BUILD_DATE, formatBuildDate } from '../utils/calc'

export default function ManageScreen({ apps, appsApi, banners, bannersApi, pulls }) {
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
    const ref = await appsApi.add({
      name: newApp.trim(),
      currencyName: newCurrencyName.trim() || '石',
      openingBalance: Number(newOpeningBalance) || 0,   // 記録開始時点の残高(ここを直すと全体が再計算される)
      openingDate: new Date().toISOString(),
      yenPerCurrency: Number(newYenRate) || 0,
      // 2通貨制のゲームのみ設定される(課金通貨 → ガチャ通貨の換算)
      purchaseCurrencyName: preset?.purchaseCurrencyName || null,
      currencyPerPurchaseUnit: preset?.currencyPerPurchaseUnit || null
    })
    if (preset) {
      for (const b of preset.banners) {
        await bannersApi.add({
          appId: ref.id,
          name: b.name,
          pityMax: b.pityMax,
          costPerPull: b.costPerPull,
          openingPity: 0,
          openingGuaranteed: false,
          openingDate: new Date().toISOString(),
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
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }} className="mono">
                  残高: {formatCurrency(app.currencyBalance || 0, app.currencyName || '石')}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--text-dim)' }}>
                  開始時の残高
                  <input
                    type="number"
                    value={app.openingBalance ?? 0}
                    onChange={e => appsApi.update(app.id, { openingBalance: e.target.value === '' ? 0 : Number(e.target.value) })}
                    style={{ ...inputStyle, width: 80, padding: '4px 6px', fontSize: 11, flex: 'none' }}
                  />
                  {app.currencyName || '石'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontSize: 11, color: 'var(--text-dim)' }}>
                  1{app.currencyName || '石'}あたり
                  <input
                    type="number"
                    step="0.01"
                    value={app.yenPerCurrency ?? ''}
                    onChange={e => appsApi.update(app.id, { yenPerCurrency: e.target.value === '' ? '' : Number(e.target.value) })}
                    style={{ ...inputStyle, width: 64, padding: '4px 6px', fontSize: 11, flex: 'none' }}
                  />
                  円(予算計画の換算に使用)
                </div>
                {app.purchaseCurrencyName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, fontSize: 11, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
                    {app.purchaseCurrencyName}1個 =
                    <input
                      type="number"
                      value={app.currencyPerPurchaseUnit ?? ''}
                      onChange={e => appsApi.update(app.id, { currencyPerPurchaseUnit: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ ...inputStyle, width: 60, padding: '4px 6px', fontSize: 11, flex: 'none' }}
                    />
                    {app.currencyName || '石'}
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setExpandedAppId(expandedAppId === app.id ? null : app.id)} style={linkBtnStyle}>
                  天井設定 {expandedAppId === app.id ? '▲' : '▼'}
                </button>
                <button onClick={() => appsApi.remove(app.id)} style={{ ...linkBtnStyle, color: 'var(--danger)' }}>削除</button>
              </div>
            </div>

            {expandedAppId === app.id && (
              <BannerSection appId={app.id} currencyName={app.currencyName || '石'} banners={banners.filter(b => b.appId === app.id)} bannersApi={bannersApi} />
            )}
          </div>
        ))}
      </div>

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

function BannerSection({ appId, currencyName, banners, bannersApi }) {
  const [form, setForm] = useState({ name: '', pityMax: 90, costPerPull: 160, openingPity: 0 })

  const addBanner = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    await bannersApi.add({
      appId,
      name: form.name.trim(),
      pityMax: Number(form.pityMax) || 0,
      costPerPull: Number(form.costPerPull) || 0,
      openingPity: Number(form.openingPity) || 0,
      openingGuaranteed: false,
      openingDate: new Date().toISOString()
    })
    setForm({ name: '', pityMax: 90, costPerPull: 160, openingPity: 0 })
  }

  return (
    <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
      {banners.map(b => (
        <div key={b.id} style={{ marginBottom: 14 }}>
          <PityGauge banner={b} />
          <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>1回 {b.costPerPull}{currencyName}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, fontSize: 11, color: 'var(--text-dim)', flexWrap: 'wrap' }}>
            開始時の天井
            <input
              type="number"
              value={b.openingPity ?? 0}
              onChange={e => bannersApi.update(b.id, { openingPity: e.target.value === '' ? 0 : Number(e.target.value) })}
              style={{ ...inputStyle, width: 64, padding: '4px 6px', fontSize: 11, flex: 'none' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="checkbox"
                checked={!!b.openingGuaranteed}
                onChange={e => bannersApi.update(b.id, { openingGuaranteed: e.target.checked })}
              />
              開始時すり抜け済み
            </label>
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
            表示中の天井は記録から自動計算されます。ズレた場合はここを修正してください
          </div>
          <div style={{ textAlign: 'right', marginTop: 4 }}>
            <button onClick={() => bannersApi.remove(b.id)} style={{ ...linkBtnStyle, color: 'var(--danger)', fontSize: 11 }}>
              このバナーを削除
            </button>
          </div>
        </div>
      ))}

      <form onSubmit={addBanner} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="バナー名(例: 限定ピックアップ)" style={inputStyle} />
        <div style={{ display: 'flex', gap: 8 }}>
          <LabeledInput label="天井回数" value={form.pityMax} onChange={v => setForm({ ...form, pityMax: v })} />
          <LabeledInput label={`1回の${currencyName}消費数`} value={form.costPerPull} onChange={v => setForm({ ...form, costPerPull: v })} />
        </div>
        <LabeledInput label="現在の天井カウンター(記録開始時点)" value={form.openingPity} onChange={v => setForm({ ...form, openingPity: v })} />
        <button type="submit" style={primaryBtnStyle}>バナーを追加</button>
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
