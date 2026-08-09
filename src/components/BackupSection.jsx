import { useRef, useState } from 'react'
import { buildBackup, downloadBackup, parseBackup, backupSummary, restoreBackup } from '../utils/backup'
import { APP_VERSION } from '../utils/calc'

const LABELS = {
  apps: 'アプリ', banners: 'バナー', purchases: '課金記録', pulls: 'ガチャ記録',
  schedules: 'ガチャ予定', budgets: '月次予算',
  acquisitions: '取得記録', exchanges: '交換記録', consumptions: '消費記録'
}

export default function BackupSection({ apis }) {
  const fileRef = useRef(null)
  const [pending, setPending] = useState(null)   // 読み込み確認待ちのバックアップ
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const collections = Object.fromEntries(
    Object.entries(apis).map(([name, api]) => [name, api.items])
  )

  const doExport = () => {
    try {
      downloadBackup(buildBackup(collections, APP_VERSION))
      setStatus('バックアップを書き出しました')
      setError('')
      setTimeout(() => setStatus(''), 3000)
    } catch (e) {
      setError('書き出しに失敗しました: ' + e.message)
    }
  }

  const onPickFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''  // 同じファイルを選び直せるようにする
    if (!file) return
    try {
      const parsed = parseBackup(await file.text())
      setPending(parsed)
      setError('')
    } catch (err) {
      setError('読み込めませんでした: ' + err.message)
    }
  }

  const doRestore = async () => {
    setBusy(true)
    setError('')
    try {
      await restoreBackup(pending, apis, {
        onProgress: (done, total) => setStatus(`復元中... ${done} / ${total}`)
      })
      setStatus('復元が完了しました')
      setPending(null)
      setTimeout(() => setStatus(''), 4000)
    } catch (err) {
      setError('復元中にエラーが発生しました: ' + err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--line)' }}>
      <h3 style={{ fontSize: 14, color: 'var(--text-dim)', fontWeight: 500, marginBottom: 6, fontFamily: 'var(--font-body)' }}>
        バックアップ
      </h3>
      <p style={{ fontSize: 11, color: 'var(--text-faint)', lineHeight: 1.7, marginTop: 0, marginBottom: 12 }}>
        すべての記録をファイルに書き出して保存できます。アプリを更新する前や、
        端末を移行する前に書き出しておくと安心です。
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={doExport} style={btnStyle}>書き出す</button>
        <button onClick={() => fileRef.current?.click()} style={{ ...btnStyle, background: 'var(--ink-bg-elevated)', color: 'var(--text-dim)' }}>
          読み込む
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" onChange={onPickFile} style={{ display: 'none' }} />
      </div>

      {status && <div style={{ fontSize: 12, color: 'var(--teal)', marginTop: 10 }}>{status}</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 10 }}>{error}</div>}

      {pending && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
        }}>
          <div style={{
            background: 'var(--ink-bg-card)', border: '1px solid var(--line)',
            borderRadius: 'var(--radius)', padding: 18, maxWidth: 340, width: '100%'
          }}>
            <div style={{ fontWeight: 500, marginBottom: 10 }}>このバックアップを復元しますか?</div>

            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 10, lineHeight: 1.8 }}>
              <div>書き出し日時: {new Date(pending.exportedAt).toLocaleString('ja-JP')}</div>
              <div>作成時のバージョン: v{pending.appVersion || '不明'}</div>
            </div>

            <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12, lineHeight: 1.8 }}>
              {backupSummary(pending).map(x => (
                <div key={x.name}>{LABELS[x.name] || x.name}: {x.count}件</div>
              ))}
            </div>

            <div style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 14, lineHeight: 1.6 }}>
              現在のデータはすべて削除され、この内容に置き換わります。この操作は取り消せません。
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setPending(null)}
                disabled={busy}
                style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--ink-bg-elevated)', color: 'var(--text-dim)', fontSize: 14 }}
              >
                キャンセル
              </button>
              <button
                onClick={doRestore}
                disabled={busy}
                style={{ flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)', background: 'var(--danger)', color: 'var(--ink-bg)', fontWeight: 700, fontSize: 14, opacity: busy ? 0.6 : 1 }}
              >
                {busy ? '復元中...' : '復元する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btnStyle = {
  flex: 1, padding: '11px 0', borderRadius: 'var(--radius-sm)',
  background: 'var(--teal)', color: 'var(--ink-bg)', fontWeight: 600, fontSize: 13
}
