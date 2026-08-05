import { useMemo, useState } from 'react'
import { increment } from 'firebase/firestore'
import PityGauge from './PityGauge'
import { applyPullToBanner, formatCurrency } from '../utils/calc'

const SUB_TABS = [
  { key: 'purchase', label: '課金する(円→石)' },
  { key: 'pull', label: 'ガチャを引く(石を消費)' }
]

export default function RecordScreen({ apps, banners, schedules, prefill, appsApi, bannersApi, purchasesApi, pullsApi }) {
  const [subTab, setSubTab] = useState(prefill ? 'pull' : 'purchase')

  if (apps.length === 0) {
    return (
      <div style={{ padding: '20px 16px 8px', fontSize: 13, color: 'var(--text-faint)' }}>
        先に「管理」タブでアプリを登録してください
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, padding: '20px 16px 0' }}>
        {SUB_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setSubTab(t.key)}
            style={{
              flex: 1, padding: '10px 0', fontSize: 12, borderRadius: 'var(--radius-sm)',
              background: subTab === t.key ? 'var(--gold-soft)' : 'var(--ink-bg-elevated)',
              color: subTab === t.key ? 'var(--gold)' : 'var(--text-dim)',
              fontWeight: subTab === t.key ? 700 : 400
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'purchase'
        ? <PurchaseForm apps={apps} appsApi={appsApi} purchasesApi={purchasesApi} />
        : <PullForm apps={apps} banners={banners} schedules={schedules} prefill={prefill} appsApi={appsApi} bannersApi={bannersApi} pullsApi={pullsApi} />}
    </div>
  )
}

// ============ 課金記録(円 → 石。無償獲得もここで記録) ============
function PurchaseForm({ apps, appsApi, purchasesApi }) {
  const [appId, setAppId] = useState('')
  const [isFree, setIsFree] = useState(false)
  const [amountYen, setAmountYen] = useState('')
  const [currencyGained, setCurrencyGained] = useState('')
  const [note, setNote] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const selectedApp = apps.find(a => a.id === appId)

  const submit = async (e) => {
    e.preventDefault()
    if (!appId) { setErrorMsg('アプリを選択してください'); return }
    if (!isFree && !amountYen) { setErrorMsg('課金額を入力してください'); return }
    if (!currencyGained) { setErrorMsg(`獲得した${selectedApp?.currencyName || '石'}の数を入力してください`); return }
    setErrorMsg('')

    await purchasesApi.add({
      appId,
      date: new Date().toISOString(),
      amountYen: isFree ? 0 : Number(amountYen),
      isFree,
      currencyGained: Number(currencyGained),
      note: note || null
    })
    await appsApi.update(appId, { currencyBalance: increment(Number(currencyGained)) })

    setSavedMsg(`${formatCurrency(Number(currencyGained), selectedApp?.currencyName || '石')} を追加しました`)
    setAmountYen(''); setCurrencyGained(''); setNote(''); setIsFree(false)
    setTimeout(() => setSavedMsg(''), 2500)
  }

  return (
    <form onSubmit={submit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="アプリ">
        <select value={appId} onChange={e => setAppId(e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      {selectedApp && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          現在の残高: <span className="mono" style={{ color: 'var(--gold)' }}>
            {formatCurrency(selectedApp.currencyBalance || 0, selectedApp.currencyName || '石')}
          </span>
        </div>
      )}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
        無償で獲得(ログインボーナス・配布・クエスト報酬など)
      </label>

      {!isFree && (
        <Field label="課金額(円)">
          <input type="number" inputMode="numeric" value={amountYen} onChange={e => setAmountYen(e.target.value)} style={inputStyle} />
        </Field>
      )}

      <Field label={`獲得した${selectedApp?.currencyName || '石'}の数`}>
        <input type="number" inputMode="numeric" value={currencyGained} onChange={e => setCurrencyGained(e.target.value)} style={inputStyle} />
      </Field>

      <Field label="メモ(任意)">
        <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
      </Field>

      <button type="submit" style={primaryBtnStyle}>{isFree ? '獲得を記録する' : '課金を記録する'}</button>
      {errorMsg && <div style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{errorMsg}</div>}
      {savedMsg && <div style={{ fontSize: 13, color: 'var(--teal)', textAlign: 'center' }}>{savedMsg}</div>}
    </form>
  )
}

// ============ ガチャ消費記録(石を使って引く) ============
function PullForm({ apps, banners, schedules, prefill, appsApi, bannersApi, pullsApi }) {
  const [appId, setAppId] = useState(prefill?.appId || '')
  const [scheduleId, setScheduleId] = useState(prefill?.scheduleId || '')
  const [bannerId, setBannerId] = useState('')
  const [pullCount, setPullCount] = useState(10)
  const [currencySpentOverride, setCurrencySpentOverride] = useState('')
  const [targetItem, setTargetItem] = useState('')
  const [outcome, setOutcome] = useState('none') // none | obtained | lost(すり抜け)
  const [atPull, setAtPull] = useState('')
  const [note, setNote] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const selectedApp = apps.find(a => a.id === appId)
  const appBanners = banners.filter(b => b.appId === appId)
  const appSchedules = (schedules || []).filter(sc => sc.appId === appId)
  const selectedBanner = banners.find(b => b.id === bannerId)

  const autoSpend = selectedBanner ? (Number(pullCount) || 0) * (selectedBanner.costPerPull || 0) : 0
  const currencySpent = currencySpentOverride !== '' ? Number(currencySpentOverride) : autoSpend
  const atPullValue = atPull !== '' ? Number(atPull) : Number(pullCount)

  const preview = useMemo(() => {
    if (!selectedBanner) return null
    return applyPullToBanner(selectedBanner, Number(pullCount) || 0, outcome, atPullValue)
  }, [selectedBanner, pullCount, outcome, atPullValue])

  const reset = () => {
    setPullCount(10); setCurrencySpentOverride(''); setTargetItem(''); setOutcome('none'); setAtPull(''); setNote('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!appId) { setErrorMsg('アプリを選択してください'); return }
    if (!pullCount || Number(pullCount) <= 0) { setErrorMsg('ガチャ回数を入力してください'); return }
    setErrorMsg('')

    let pityTriggered = false
    let finalObtained = outcome === 'obtained'
    let finalLost = outcome === 'lost'

    if (selectedBanner) {
      const result = applyPullToBanner(selectedBanner, Number(pullCount) || 0, outcome, atPullValue)
      finalObtained = result.obtained
      finalLost = result.lost
      pityTriggered = result.isPityTriggered
      await bannersApi.update(selectedBanner.id, { pityCurrent: result.pityCurrent, guaranteed: result.guaranteed })
    }

    await pullsApi.add({
      appId,
      bannerId: bannerId || null,
      scheduleId: scheduleId || null,
      date: new Date().toISOString(),
      pullCount: Number(pullCount) || 0,
      currencySpent,
      targetItem: targetItem || null,
      obtained: finalObtained,
      lost: finalLost,
      obtainedAtPull: outcome !== 'none' ? atPullValue : null,
      isPityTriggered: pityTriggered,
      pityBefore: selectedBanner ? (selectedBanner.pityCurrent || 0) : null,      // 削除時の天井復元用
      guaranteedBefore: selectedBanner ? !!selectedBanner.guaranteed : null,      // 削除時の保証状態復元用
      note: note || null
    })

    await appsApi.update(appId, { currencyBalance: increment(-currencySpent) })

    setSavedMsg(pityTriggered ? '天井到達で確定入手として記録しました'
      : finalLost ? 'すり抜けとして記録しました(次の最高レアは確定扱い)'
      : '記録しました')
    reset()
    setTimeout(() => setSavedMsg(''), 2500)
  }

  return (
    <form onSubmit={submit} style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Field label="アプリ">
        <select value={appId} onChange={e => { setAppId(e.target.value); setBannerId(''); setScheduleId('') }} style={inputStyle}>
          <option value="">選択してください</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      {selectedApp && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          現在の残高: <span className="mono" style={{ color: 'var(--gold)' }}>
            {formatCurrency(selectedApp.currencyBalance || 0, selectedApp.currencyName || '石')}
          </span>
        </div>
      )}

      {appBanners.length > 0 && (
        <Field label="バナー">
          <select value={bannerId} onChange={e => setBannerId(e.target.value)} style={inputStyle}>
            <option value="">指定しない(天井管理なし)</option>
            {appBanners.map(b => <option key={b.id} value={b.id}>{b.name}({b.costPerPull}{selectedApp?.currencyName || '石'}/回)</option>)}
          </select>
        </Field>
      )}

      {selectedBanner && (
        <div style={{ background: 'var(--ink-bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          <PityGauge banner={selectedBanner} segments={16} />
        </div>
      )}

      {appSchedules.length > 0 && (
        <Field label="対応する予定(任意・実績を予定に紐付け)">
          <select value={scheduleId} onChange={e => setScheduleId(e.target.value)} style={inputStyle}>
            <option value="">紐付けない</option>
            {appSchedules.map(sc => <option key={sc.id} value={sc.id}>{sc.name}({sc.startDate.slice(5).replace('-', '/')}〜)</option>)}
          </select>
        </Field>
      )}

      <Field label="ガチャ回数">
        <input type="number" value={pullCount} onChange={e => setPullCount(e.target.value)} style={inputStyle} min="0" />
      </Field>

      <Field label={`消費した${selectedApp?.currencyName || '石'}(自動計算・修正可)`}>
        <input
          type="number"
          value={currencySpentOverride !== '' ? currencySpentOverride : autoSpend}
          onChange={e => setCurrencySpentOverride(e.target.value)}
          style={inputStyle}
        />
      </Field>

      {selectedApp && currencySpent > (selectedApp.currencyBalance || 0) && (
        <div style={{ fontSize: 12, color: 'var(--danger)' }}>
          残高({formatCurrency(selectedApp.currencyBalance || 0, selectedApp.currencyName || '石')})を超える消費です。記録すると残高がマイナスになります(無償石などの記録漏れがないか確認してください)
        </div>
      )}

      <Field label="目的のキャラ・アイテム(任意)">
        <input value={targetItem} onChange={e => setTargetItem(e.target.value)} style={inputStyle} placeholder="例: 水着ver.○○" />
      </Field>

      <Field label="結果">
        <select value={outcome} onChange={e => { setOutcome(e.target.value); setAtPull('') }} style={inputStyle}>
          <option value="none">目的のアイテムは出ていない</option>
          <option value="obtained">目的のアイテムを入手した</option>
          <option value="lost">すり抜けた(最高レアは出たが目的ではない)</option>
        </select>
      </Field>

      {outcome !== 'none' && Number(pullCount) > 1 && (
        <Field label={`${pullCount}連のうち何回目で${outcome === 'obtained' ? '入手' : 'すり抜け'}しましたか(空欄なら最後の回)`}>
          <input type="number" min="1" max={pullCount} value={atPull} onChange={e => setAtPull(e.target.value)} style={inputStyle} placeholder={`例: 3(${pullCount}連中3回目)`} />
        </Field>
      )}

      <Field label="メモ(任意)">
        <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
      </Field>

      {preview && Number(pullCount) > 0 && selectedBanner && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
          記録後の天井カウンター: <span className="mono" style={{ color: 'var(--gold)' }}>{preview.pityCurrent} / {selectedBanner.pityMax}</span>
          {preview.guaranteed && <span style={{ color: 'var(--gold)' }}>(次の最高レアは確定)</span>}
          {preview.isPityTriggered && <span style={{ color: 'var(--gold)' }}>(天井到達で確定入手扱いになります)</span>}
        </div>
      )}

      <button type="submit" style={primaryBtnStyle}>記録する</button>
      {errorMsg && <div style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{errorMsg}</div>}
      {savedMsg && <div style={{ fontSize: 13, color: 'var(--teal)', textAlign: 'center' }}>{savedMsg}</div>}
    </form>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-dim)' }}>
      {label}
      {children}
    </label>
  )
}

const inputStyle = {
  background: 'var(--ink-bg-elevated)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 14, color: 'var(--text)', width: '100%'
}

const primaryBtnStyle = {
  background: 'var(--gold)', color: 'var(--ink-bg)', fontWeight: 700,
  padding: '13px 16px', borderRadius: 'var(--radius)', fontSize: 15, marginTop: 4
}
