import { useMemo, useState } from 'react'
import PityGauge from './PityGauge'
import { applyPullToBanner } from '../utils/calc'
import { appCurrencies, poolTotal, DEFAULT_TAGS, usedTags } from '../utils/currency'

const SUB_TABS = [
  { key: 'acquire', label: '取得' },
  { key: 'exchange', label: '交換' },
  { key: 'consume', label: '消費' }
]

export default function RecordScreen({
  apps, banners, schedules, prefill, consumptions,
  bannersApi, acquisitionsApi, exchangesApi, consumptionsApi
}) {
  const [subTab, setSubTab] = useState(prefill ? 'consume' : 'acquire')

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
              flex: 1, padding: '10px 0', fontSize: 13, borderRadius: 'var(--radius-sm)',
              background: subTab === t.key ? 'var(--gold-soft)' : 'var(--ink-bg-elevated)',
              color: subTab === t.key ? 'var(--gold)' : 'var(--text-dim)',
              fontWeight: subTab === t.key ? 700 : 400
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'acquire' && <AcquireForm apps={apps} acquisitionsApi={acquisitionsApi} />}
      {subTab === 'exchange' && <ExchangeForm apps={apps} exchangesApi={exchangesApi} />}
      {subTab === 'consume' && (
        <ConsumeForm
          apps={apps} banners={banners} schedules={schedules} prefill={prefill}
          consumptions={consumptions} bannersApi={bannersApi} consumptionsApi={consumptionsApi}
        />
      )}
    </div>
  )
}

// 選択中の通貨の残高(有償・無償の内訳つき)
function BalanceNote({ app, currencyId }) {
  if (!app) return null
  const c = (app.currencies || []).find(x => x.id === currencyId)
  if (!c) return null
  const total = c.total ?? poolTotal(c.balance)
  return (
    <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
      現在の残高: <span className="mono" style={{ color: 'var(--gold)' }}>{total.toLocaleString('ja-JP')}{c.name}</span>
      <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>
        {' '}(有償 {(c.balance?.paid || 0).toLocaleString('ja-JP')} / 無償 {(c.balance?.free || 0).toLocaleString('ja-JP')})
      </span>
    </div>
  )
}

// ============ 取得(課金または無償で通貨を得る) ============
function AcquireForm({ apps, acquisitionsApi }) {
  const [appId, setAppId] = useState('')
  const [currencyId, setCurrencyId] = useState('')
  const [isFree, setIsFree] = useState(false)
  const [amountYen, setAmountYen] = useState('')
  const [quantity, setQuantity] = useState('')
  const [note, setNote] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const app = apps.find(a => a.id === appId)
  const currencies = app ? appCurrencies(app) : []

  const chooseApp = (id) => {
    setAppId(id)
    const a = apps.find(x => x.id === id)
    const list = a ? appCurrencies(a) : []
    // 課金で買う通貨を先頭に定義しているので、それを既定にする
    setCurrencyId(list[0]?.id || '')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!appId) { setErrorMsg('アプリを選択してください'); return }
    if (!currencyId) { setErrorMsg('通貨を選択してください'); return }
    if (!isFree && !amountYen) { setErrorMsg('課金額を入力してください'); return }
    if (!quantity) { setErrorMsg('数量を入力してください'); return }
    setErrorMsg('')

    await acquisitionsApi.add({
      appId, currencyId,
      date: new Date().toISOString(),
      amountYen: isFree ? 0 : Number(amountYen),
      isFree,
      quantity: Number(quantity),
      note: note || null
    })

    const cname = currencies.find(c => c.id === currencyId)?.name || ''
    setSavedMsg(`${Number(quantity).toLocaleString('ja-JP')}${cname} を追加しました`)
    setAmountYen(''); setQuantity(''); setNote(''); setIsFree(false)
    setTimeout(() => setSavedMsg(''), 2500)
  }

  const cname = currencies.find(c => c.id === currencyId)?.name

  return (
    <form onSubmit={submit} style={formStyle}>
      <p style={hintStyle}>課金して通貨を買った、またはログインボーナスなどで無償で受け取ったときに記録します。</p>

      <Field label="アプリ">
        <select value={appId} onChange={e => chooseApp(e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      {currencies.length > 1 && (
        <Field label="通貨">
          <select value={currencyId} onChange={e => setCurrencyId(e.target.value)} style={inputStyle}>
            {currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      <BalanceNote app={app} currencyId={currencyId} />

      <label style={checkStyle}>
        <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} />
        無償で獲得(ログインボーナス・配布・クエスト報酬など)
      </label>

      {!isFree && (
        <Field label="課金額(円)">
          <input type="number" inputMode="numeric" value={amountYen} onChange={e => setAmountYen(e.target.value)} style={inputStyle} />
        </Field>
      )}

      <Field label={`獲得した数量${cname ? `(${cname})` : ''}`}>
        <input type="number" inputMode="numeric" value={quantity} onChange={e => setQuantity(e.target.value)} style={inputStyle} />
      </Field>

      <Field label="メモ(任意)">
        <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
      </Field>

      <button type="submit" style={primaryBtnStyle}>{isFree ? '獲得を記録する' : '課金を記録する'}</button>
      <Messages error={errorMsg} success={savedMsg} />
    </form>
  )
}

// ============ 交換(通貨Aを通貨Bに変換) ============
function ExchangeForm({ apps, exchangesApi }) {
  const [appId, setAppId] = useState('')
  const [fromId, setFromId] = useState('')
  const [toId, setToId] = useState('')
  const [fromQty, setFromQty] = useState('')
  const [toQtyOverride, setToQtyOverride] = useState('')
  const [note, setNote] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const app = apps.find(a => a.id === appId)
  const currencies = app ? appCurrencies(app) : []
  const fromC = currencies.find(c => c.id === fromId)
  const toC = currencies.find(c => c.id === toId)

  // アプリに換算レートが設定されていれば自動計算する
  const rate = Number(app?.currencyPerPurchaseUnit) || 0
  const autoTo = rate > 0 && fromId === 'purchase' && toId === 'main' ? (Number(fromQty) || 0) * rate : 0
  const toQty = toQtyOverride !== '' ? Number(toQtyOverride) : autoTo

  const chooseApp = (id) => {
    setAppId(id)
    const a = apps.find(x => x.id === id)
    const list = a ? appCurrencies(a) : []
    setFromId(list[0]?.id || '')
    setToId(list[1]?.id || '')
    setFromQty(''); setToQtyOverride('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!appId) { setErrorMsg('アプリを選択してください'); return }
    if (currencies.length < 2) { setErrorMsg('このアプリには通貨が1種類しかありません'); return }
    if (fromId === toId) { setErrorMsg('交換元と交換先が同じです'); return }
    if (!fromQty || !toQty) { setErrorMsg('数量を入力してください'); return }
    setErrorMsg('')

    await exchangesApi.add({
      appId,
      date: new Date().toISOString(),
      fromCurrencyId: fromId, fromQty: Number(fromQty),
      toCurrencyId: toId, toQty: Number(toQty),
      note: note || null
    })

    setSavedMsg(`${Number(fromQty).toLocaleString('ja-JP')}${fromC?.name} → ${Number(toQty).toLocaleString('ja-JP')}${toC?.name} を記録しました`)
    setFromQty(''); setToQtyOverride(''); setNote('')
    setTimeout(() => setSavedMsg(''), 2500)
  }

  return (
    <form onSubmit={submit} style={formStyle}>
      <p style={hintStyle}>
        通貨を別の通貨に交換したときに記録します(例: 展延源石を赤晶石に交換)。
        有償・無償の内訳は、交換元から引かれた比率で交換先に引き継がれます。
      </p>

      <Field label="アプリ">
        <select value={appId} onChange={e => chooseApp(e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      {app && currencies.length < 2 && (
        <div style={{ fontSize: 12, color: 'var(--text-faint)' }}>
          このアプリには通貨が1種類しか登録されていません。管理タブで通貨を追加してください。
        </div>
      )}

      {currencies.length >= 2 && (
        <>
          <Field label="交換元">
            <select value={fromId} onChange={e => setFromId(e.target.value)} style={inputStyle}>
              {currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <BalanceNote app={app} currencyId={fromId} />

          <Field label={`交換に出した数量${fromC ? `(${fromC.name})` : ''}`}>
            <input type="number" value={fromQty} onChange={e => { setFromQty(e.target.value); setToQtyOverride('') }} style={inputStyle} />
          </Field>

          <Field label="交換先">
            <select value={toId} onChange={e => setToId(e.target.value)} style={inputStyle}>
              {currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <Field label={`受け取った数量${toC ? `(${toC.name})` : ''}${autoTo > 0 ? '(自動計算・修正可)' : ''}`}>
            <input type="number" value={toQtyOverride !== '' ? toQtyOverride : (autoTo || '')} onChange={e => setToQtyOverride(e.target.value)} style={inputStyle} />
          </Field>

          <Field label="メモ(任意)">
            <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
          </Field>

          <button type="submit" style={primaryBtnStyle}>交換を記録する</button>
        </>
      )}
      <Messages error={errorMsg} success={savedMsg} />
    </form>
  )
}

// ============ 消費(通貨を使う。ガチャもこの一形態) ============
function ConsumeForm({ apps, banners, schedules, prefill, consumptions, bannersApi, consumptionsApi }) {
  const [appId, setAppId] = useState(prefill?.appId || '')
  const [currencyId, setCurrencyId] = useState('')
  const [tag, setTag] = useState(prefill ? 'ガチャ' : '')
  const [customTag, setCustomTag] = useState('')
  const [quantity, setQuantity] = useState('')
  const [paidOnly, setPaidOnly] = useState(false)
  const [note, setNote] = useState('')
  const [bannerId, setBannerId] = useState('')
  const [scheduleId, setScheduleId] = useState(prefill?.scheduleId || '')
  const [pullCount, setPullCount] = useState(10)
  const [targetItem, setTargetItem] = useState('')
  const [outcome, setOutcome] = useState('none')
  const [atPull, setAtPull] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const app = apps.find(a => a.id === appId)
  const currencies = app ? appCurrencies(app) : []
  const isGacha = tag === 'ガチャ'
  const appBanners = banners.filter(b => b.appId === appId)
  const appSchedules = (schedules || []).filter(s => s.appId === appId)
  const selectedBanner = banners.find(b => b.id === bannerId)

  const tagOptions = useMemo(
    () => [...new Set([...DEFAULT_TAGS, ...usedTags(consumptions || [])])],
    [consumptions]
  )
  const targetSuggestions = useMemo(
    () => [...new Set((consumptions || []).filter(c => c.appId === appId && c.targetItem).map(c => c.targetItem))].slice(0, 20),
    [consumptions, appId]
  )

  const autoQty = isGacha && selectedBanner ? (Number(pullCount) || 0) * (selectedBanner.costPerPull || 0) : 0
  const effectiveQty = quantity !== '' ? Number(quantity) : autoQty
  const atPullValue = atPull !== '' ? Number(atPull) : Number(pullCount)

  const pityPreview = useMemo(() => {
    if (!isGacha || !selectedBanner) return null
    return applyPullToBanner(selectedBanner, Number(pullCount) || 0, outcome, atPullValue)
  }, [isGacha, selectedBanner, pullCount, outcome, atPullValue])

  const chooseApp = (id) => {
    setAppId(id)
    const a = apps.find(x => x.id === id)
    const list = a ? appCurrencies(a) : []
    setCurrencyId(list.find(c => c.id === 'main')?.id || list[list.length - 1]?.id || '')
    setBannerId(''); setScheduleId('')
  }

  const chooseBanner = (id) => {
    setBannerId(id)
    const b = banners.find(x => x.id === id)
    if (b?.currencyId) setCurrencyId(b.currencyId)
    if (b?.lastTarget && !targetItem.trim()) setTargetItem(b.lastTarget)
    setQuantity('')
  }

  // 消費は「この通貨をこの数量使った」という1つの事実なので、用途は1つだけ選ぶ。
  // 複数の用途に使った場合は記録を分ける。
  const addCustomTag = () => {
    const t = customTag.trim()
    if (!t) return
    setTag(t)
    setCustomTag('')
  }

  const reset = () => {
    setQuantity(''); setNote(''); setPullCount(10); setOutcome('none'); setAtPull(''); setPaidOnly(false)
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!appId) { setErrorMsg('アプリを選択してください'); return }
    if (!currencyId) { setErrorMsg('通貨を選択してください'); return }
    if (!tag) { setErrorMsg('用途を選んでください'); return }
    if (!effectiveQty) { setErrorMsg('消費した数量を入力してください'); return }
    setErrorMsg('')

    const record = {
      appId, currencyId,
      date: new Date().toISOString(),
      quantity: effectiveQty,
      tag, paidOnly,
      note: note || null
    }

    if (isGacha) {
      let pityTriggered = false
      let finalObtained = outcome === 'obtained'
      let finalLost = outcome === 'lost'
      if (selectedBanner) {
        const r = applyPullToBanner(selectedBanner, Number(pullCount) || 0, outcome, atPullValue)
        finalObtained = r.obtained
        finalLost = r.lost
        pityTriggered = r.isPityTriggered
      }
      Object.assign(record, {
        bannerId: bannerId || null,
        scheduleId: scheduleId || null,
        pullCount: Number(pullCount) || 0,
        targetItem: targetItem || null,
        outcome,
        obtained: finalObtained,
        lost: finalLost,
        obtainedAtPull: outcome !== 'none' ? atPullValue : null,
        isPityTriggered: pityTriggered
      })
      if (selectedBanner && targetItem.trim()) {
        await bannersApi.update(selectedBanner.id, { lastTarget: targetItem.trim() })
      }
      setSavedMsg(pityTriggered ? '天井到達で確定入手として記録しました'
        : finalLost ? 'すり抜けとして記録しました(次の最高レアは確定扱い)'
        : '記録しました')
    } else {
      setSavedMsg('記録しました')
    }

    await consumptionsApi.add(record)
    reset()
    setTimeout(() => setSavedMsg(''), 2500)
  }

  const currencyName = currencies.find(c => c.id === currencyId)?.name || ''

  return (
    <form onSubmit={submit} style={formStyle}>
      <p style={hintStyle}>通貨を使ったときに記録します。用途に「ガチャ」を選ぶと、天井カウンターの入力欄が出ます。</p>

      <Field label="アプリ">
        <select value={appId} onChange={e => chooseApp(e.target.value)} style={inputStyle}>
          <option value="">選択してください</option>
          {apps.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </Field>

      <Field label="用途">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {tagOptions.map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(t)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12,
                border: `1px solid ${tag === t ? 'var(--gold)' : 'var(--line)'}`,
                background: tag === t ? 'var(--gold-soft)' : 'var(--ink-bg-elevated)',
                color: tag === t ? 'var(--gold)' : 'var(--text-dim)'
              }}
            >
              {t}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 4 }}>
          複数の用途に使った場合は、用途ごとに分けて記録してください
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <input
            value={customTag}
            onChange={e => setCustomTag(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomTag() } }}
            placeholder="用途を追加"
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={addCustomTag} style={tealBtnStyle}>＋</button>
        </div>
      </Field>

      {currencies.length > 1 && (
        <Field label="使った通貨">
          <select value={currencyId} onChange={e => setCurrencyId(e.target.value)} style={inputStyle}>
            {currencies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      )}

      <BalanceNote app={app} currencyId={currencyId} />

      {isGacha && appBanners.length > 0 && (
        <Field label="バナー">
          <select value={bannerId} onChange={e => chooseBanner(e.target.value)} style={inputStyle}>
            <option value="">指定しない(天井管理なし)</option>
            {appBanners.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </Field>
      )}

      {isGacha && selectedBanner && (
        <div style={{ background: 'var(--ink-bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 12 }}>
          <PityGauge banner={selectedBanner} segments={16} />
        </div>
      )}

      {isGacha && appSchedules.length > 0 && (
        <Field label="対応する予定(任意)">
          <select value={scheduleId} onChange={e => setScheduleId(e.target.value)} style={inputStyle}>
            <option value="">紐付けない</option>
            {appSchedules.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
      )}

      {isGacha && (
        <Field label="ガチャ回数">
          <input type="number" value={pullCount} onChange={e => { setPullCount(e.target.value); setQuantity('') }} style={inputStyle} min="0" />
        </Field>
      )}

      <Field label={`消費した数量${currencyName ? `(${currencyName})` : ''}${autoQty > 0 ? '(自動計算・修正可)' : ''}`}>
        <input type="number" value={quantity !== '' ? quantity : (autoQty || '')} onChange={e => setQuantity(e.target.value)} style={inputStyle} />
      </Field>

      <label style={checkStyle}>
        <input type="checkbox" checked={paidOnly} onChange={e => setPaidOnly(e.target.checked)} />
        有償の通貨のみで消費(有償限定ガチャなど)
      </label>

      {isGacha && (
        <>
          <Field label="目的のキャラ・アイテム(任意)">
            <input value={targetItem} onChange={e => setTargetItem(e.target.value)} style={inputStyle} placeholder="例: 水着ver.○○" list="target-suggestions" />
            <datalist id="target-suggestions">
              {targetSuggestions.map(t => <option key={t} value={t} />)}
            </datalist>
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
              <input type="number" min="1" max={pullCount} value={atPull} onChange={e => setAtPull(e.target.value)} style={inputStyle} />
            </Field>
          )}
        </>
      )}

      <Field label="メモ(任意)">
        <textarea value={note} onChange={e => setNote(e.target.value)} style={{ ...inputStyle, minHeight: 50, resize: 'vertical' }} />
      </Field>

      {pityPreview && Number(pullCount) > 0 && selectedBanner && (
        <div style={{ fontSize: 12, color: 'var(--text-dim)', background: 'var(--ink-bg-elevated)', borderRadius: 'var(--radius-sm)', padding: '8px 10px' }}>
          天井カウンター:{' '}
          <span className="mono">現在 {selectedBanner.pityCurrent || 0}</span>
          {' → '}
          <span className="mono" style={{ color: 'var(--gold)' }}>記録後 {pityPreview.pityCurrent}</span>
          <span className="mono"> / {selectedBanner.pityMax}</span>
          {pityPreview.guaranteed && <div style={{ color: 'var(--gold)' }}>次の最高レアは確定になります</div>}
          {pityPreview.isPityTriggered && <div style={{ color: 'var(--gold)' }}>天井到達で確定入手扱いになります</div>}
        </div>
      )}

      <button type="submit" style={primaryBtnStyle}>記録する</button>
      <Messages error={errorMsg} success={savedMsg} />
    </form>
  )
}

function Messages({ error, success }) {
  return (
    <>
      {error && <div style={{ fontSize: 13, color: 'var(--danger)', textAlign: 'center' }}>{error}</div>}
      {success && <div style={{ fontSize: 13, color: 'var(--teal)', textAlign: 'center' }}>{success}</div>}
    </>
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

const formStyle = { padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }
const hintStyle = { fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.7, margin: 0 }
const checkStyle = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }

const inputStyle = {
  background: 'var(--ink-bg-elevated)', border: '1px solid var(--line)',
  borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontSize: 14, color: 'var(--text)', width: '100%'
}
const primaryBtnStyle = {
  background: 'var(--gold)', color: 'var(--ink-bg)', fontWeight: 700,
  padding: '13px 16px', borderRadius: 'var(--radius)', fontSize: 15, marginTop: 4
}
const tealBtnStyle = {
  background: 'var(--teal)', color: 'var(--ink-bg)', fontWeight: 600,
  padding: '10px 16px', borderRadius: 'var(--radius-sm)', fontSize: 13, whiteSpace: 'nowrap'
}
