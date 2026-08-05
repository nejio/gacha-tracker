import { useAuth } from '../contexts/AuthContext'

export default function Login() {
  const { login } = useAuth()

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 24
    }}>
      <div style={{ fontSize: 13, letterSpacing: '0.3em', color: 'var(--gold)', marginBottom: 12 }}>
        SUMMON LEDGER
      </div>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>召喚録</h1>
      <p style={{ color: 'var(--text-dim)', fontSize: 14, marginBottom: 40, maxWidth: 280 }}>
        課金額とガチャの記録を、すべての端末で。
      </p>
      <button
        onClick={login}
        style={{
          background: 'var(--gold)', color: 'var(--ink-bg)', fontWeight: 700,
          padding: '14px 32px', borderRadius: 'var(--radius)', fontSize: 15
        }}
      >
        Googleでログインして始める
      </button>
    </div>
  )
}
