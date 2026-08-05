import { useState } from 'react'
import { useAuth } from './contexts/AuthContext'
import { useUserCollection } from './hooks/useUserCollection'
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
        {tab === 'dashboard' && <Dashboard purchases={purchasesApi.items} apps={appsApi.items} />}

        {tab === 'record' && (
          <RecordScreen
            key={recordPrefill?.token || 'default'}
            apps={appsApi.items}
            banners={bannersApi.items}
            schedules={schedulesApi.items}
            prefill={recordPrefill}
            appsApi={appsApi}
            bannersApi={bannersApi}
            purchasesApi={purchasesApi}
            pullsApi={pullsApi}
          />
        )}

        {tab === 'schedule' && (
          <ScheduleScreen
            apps={appsApi.items}
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
            apps={appsApi.items}
            purchasesApi={purchasesApi}
            pullsApi={pullsApi}
            appsApi={appsApi}
            bannersApi={bannersApi}
          />
        )}

        {tab === 'manage' && (
          <ManageScreen apps={appsApi.items} appsApi={appsApi} banners={bannersApi.items} bannersApi={bannersApi} />
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
