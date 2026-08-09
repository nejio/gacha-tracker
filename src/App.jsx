import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useUserCollection } from './hooks/useUserCollection'
import { withDerivedBalance, withDerivedPity } from './utils/calc'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import RecordScreen from './components/RecordScreen'
import ManageScreen from './components/ManageScreen'
import HistoryScreen from './components/HistoryScreen'
import ScheduleScreen from './components/ScheduleScreen'

const TABS = [
  { key: 'dashboard', label: '台帳' },
  { key: 'record', label: '記録' },
  { key: 'schedule', label: '予定' },
  { key: 'history', label: '履歴' },
  { key: 'manage', label: '管理' }
]

export default function App() {
  const { user, loading, logout } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [recordPrefill, setRecordPrefill] = useState(null)

  const appsApi = useUserCollection('apps', 'createdAt')
  const bannersApi = useUserCollection('banners', 'createdAt')
  const purchasesApi = useUserCollection('purchases', 'date')       // 課金記録(円→石。無償も含む)
  const pullsApi = useUserCollection('pulls', 'date')               // ガチャ消費記録(石を使って引く)
  const schedulesApi = useUserCollection('schedules', 'createdAt')  // ガチャスケジュール
  const budgetsApi = useUserCollection('budgets', 'createdAt')      // 月次予算

  // 旧形式のデータ(残高・天井を保存していたもの)を初期値へ一度だけ移行する
  useEffect(() => {
    if (!user) return
    for (const a of appsApi.items) {
      if (a.openingBalance === undefined && a.currencyBalance !== undefined) {
        // 既存の残高をそのまま開始残高にし、以降の記録で差し引かれないよう基準日を現在にする
        appsApi.update(a.id, { openingBalance: a.currencyBalance, openingDate: new Date().toISOString() })
      }
    }
    for (const b of bannersApi.items) {
      if (b.openingPity === undefined && b.pityCurrent !== undefined) {
        appsApi && bannersApi.update(b.id, {
          openingPity: b.pityCurrent,
          openingGuaranteed: !!b.guaranteed,
          openingDate: new Date().toISOString()
        })
      }
    }
  }, [user, appsApi.items, bannersApi.items])

  // 残高と天井は保存値ではなく、記録から毎回計算する(記録の削除・編集で自動的に整合する)
  const apps = useMemo(
    () => withDerivedBalance(appsApi.items, purchasesApi.items, pullsApi.items),
    [appsApi.items, purchasesApi.items, pullsApi.items]
  )
  const banners = useMemo(
    () => withDerivedPity(bannersApi.items, pullsApi.items),
    [bannersApi.items, pullsApi.items]
  )

  if (loading) return null
  if (!user) return <Login />

  return (
    <div className="app-shell">
      <header style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '18px 16px 10px', borderBottom: '1px solid var(--line)'
      }}>
        <h1 style={{ fontSize: 18 }}>召喚録</h1>
        <button onClick={logout} style={{ fontSize: 12, color: 'var(--text-faint)' }}>ログアウト</button>
      </header>

      <main style={{ flex: 1, overflowY: 'auto' }}>
        {tab === 'dashboard' && <Dashboard purchases={purchasesApi.items} apps={apps} />}

        {tab === 'record' && (
          <RecordScreen
            key={recordPrefill?.token || 'default'}
            apps={apps}
            banners={banners}
            schedules={schedulesApi.items}
            prefill={recordPrefill}
            pulls={pullsApi.items}
            appsApi={appsApi}
            bannersApi={bannersApi}
            purchasesApi={purchasesApi}
            pullsApi={pullsApi}
          />
        )}

        {tab === 'schedule' && (
          <ScheduleScreen
            apps={apps}
            schedules={schedulesApi.items}
            schedulesApi={schedulesApi}
            pulls={pullsApi.items}
            budgets={budgetsApi.items}
            budgetsApi={budgetsApi}
            onJumpToRecord={(sc) => { setRecordPrefill({ appId: sc.appId, scheduleId: sc.id, token: Date.now() }); setTab('record') }}
          />
        )}

        {tab === 'history' && (
          <HistoryScreen
            purchases={purchasesApi.items}
            pulls={pullsApi.items}
            apps={apps}
            banners={banners}
            purchasesApi={purchasesApi}
            pullsApi={pullsApi}
          />
        )}

        {tab === 'manage' && (
          <ManageScreen apps={apps} appsApi={appsApi} banners={banners} bannersApi={bannersApi} pulls={pullsApi.items} />
        )}
      </main>

      <nav style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 480, display: 'flex', zIndex: 100,
        background: 'var(--ink-bg-elevated)', borderTop: '1px solid var(--line)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              flex: 1, padding: '14px 0', fontSize: 12,
              color: tab === t.key ? 'var(--gold)' : 'var(--text-faint)',
              fontWeight: tab === t.key ? 700 : 400
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
