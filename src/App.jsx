import { useEffect, useMemo, useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useUserCollection } from './hooks/useUserCollection'
import { withDerivedPity, gachaConsumptions } from './utils/calc'
import { withDerivedCurrencies } from './utils/currency'
import { needsMigration, runMigration } from './utils/migration'
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
  const [migrating, setMigrating] = useState(null)

  const appsApi = useUserCollection('apps', 'createdAt')
  const bannersApi = useUserCollection('banners', 'createdAt')
  const schedulesApi = useUserCollection('schedules', 'createdAt')
  const budgetsApi = useUserCollection('budgets', 'createdAt')
  // 旧構造(移行元として読むだけ)
  const purchasesApi = useUserCollection('purchases', 'date')
  const pullsApi = useUserCollection('pulls', 'date')
  // 新構造
  const acquisitionsApi = useUserCollection('acquisitions', 'date')
  const exchangesApi = useUserCollection('exchanges', 'date')
  const consumptionsApi = useUserCollection('consumptions', 'date')

  // 旧構造から新構造への移行(1回だけ実行される)
  useEffect(() => {
    if (!user) return
    if (appsApi.loading || purchasesApi.loading || pullsApi.loading || bannersApi.loading || consumptionsApi.loading) return
    if (appsApi.items.length === 0) return
    if (!needsMigration(appsApi.items)) return
    if (migrating) return

    setMigrating({ done: 0, label: '準備中' })
    runMigration(
      { apps: appsApi.items, banners: bannersApi.items, purchases: purchasesApi.items, pulls: pullsApi.items, consumptions: consumptionsApi.items },
      { apps: appsApi, banners: bannersApi, acquisitions: acquisitionsApi, exchanges: exchangesApi, consumptions: consumptionsApi },
      { onProgress: (done, label) => setMigrating({ done, label }) }
    )
      .then(() => setMigrating(null))
      .catch(err => setMigrating({ error: err.message }))
  }, [user, appsApi.loading, purchasesApi.loading, pullsApi.loading, bannersApi.loading, consumptionsApi.loading, appsApi.items])

  const records = useMemo(() => ({
    acquisitions: acquisitionsApi.items,
    exchanges: exchangesApi.items,
    consumptions: consumptionsApi.items
  }), [acquisitionsApi.items, exchangesApi.items, consumptionsApi.items])

  // 残高・天井は保存せず、記録から毎回計算する
  const apps = useMemo(() => withDerivedCurrencies(appsApi.items, records), [appsApi.items, records])
  const banners = useMemo(
    () => withDerivedPity(bannersApi.items, gachaConsumptions(consumptionsApi.items)),
    [bannersApi.items, consumptionsApi.items]
  )

  if (loading) return null
  if (!user) return <Login />

  if (migrating) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', gap: 10 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18 }}>データを更新しています</div>
        {migrating.error ? (
          <div style={{ fontSize: 13, color: 'var(--danger)' }}>エラー: {migrating.error}</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{migrating.label}</div>
            <div className="mono" style={{ fontSize: 12, color: 'var(--gold)' }}>{migrating.done} 件処理</div>
            <div style={{ fontSize: 11, color: 'var(--text-faint)', maxWidth: 260, lineHeight: 1.7 }}>
              通貨と記録の構造を新しい形式に変換しています。この画面を閉じずにお待ちください。
            </div>
          </>
        )}
      </div>
    )
  }

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
        {tab === 'dashboard' && (
          <Dashboard acquisitions={acquisitionsApi.items} consumptions={consumptionsApi.items} apps={apps} />
        )}

        {tab === 'record' && (
          <RecordScreen
            key={recordPrefill?.token || 'default'}
            apps={apps}
            banners={banners}
            schedules={schedulesApi.items}
            prefill={recordPrefill}
            consumptions={consumptionsApi.items}
            bannersApi={bannersApi}
            acquisitionsApi={acquisitionsApi}
            exchangesApi={exchangesApi}
            consumptionsApi={consumptionsApi}
          />
        )}

        {tab === 'schedule' && (
          <ScheduleScreen
            apps={apps}
            schedules={schedulesApi.items}
            schedulesApi={schedulesApi}
            pulls={gachaConsumptions(consumptionsApi.items)}
            budgets={budgetsApi.items}
            budgetsApi={budgetsApi}
            onJumpToRecord={(sc) => { setRecordPrefill({ appId: sc.appId, scheduleId: sc.id, token: Date.now() }); setTab('record') }}
          />
        )}

        {tab === 'history' && (
          <HistoryScreen
            apps={apps}
            banners={banners}
            acquisitions={acquisitionsApi.items}
            exchanges={exchangesApi.items}
            consumptions={consumptionsApi.items}
            acquisitionsApi={acquisitionsApi}
            exchangesApi={exchangesApi}
            consumptionsApi={consumptionsApi}
          />
        )}

        {tab === 'manage' && (
          <ManageScreen
            apps={apps}
            appsApi={appsApi}
            banners={banners}
            bannersApi={bannersApi}
            backupApis={{
              apps: appsApi, banners: bannersApi, purchases: purchasesApi, pulls: pullsApi,
              schedules: schedulesApi, budgets: budgetsApi,
              acquisitions: acquisitionsApi, exchanges: exchangesApi, consumptions: consumptionsApi
            }}
          />
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
