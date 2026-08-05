import { pityProgress } from '../utils/calc'

// 天井までの距離を刻印(セグメント)で示すゲージ。近づくほどゴールドの発光が強まる。
// すり抜け後は「次回確定」バッジを表示する。
export default function PityGauge({ banner, segments = 20 }) {
  const progress = pityProgress(banner)
  const filled = Math.round(progress * segments)
  const near = progress >= 0.8

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
        <span style={{ color: 'var(--text-dim)' }}>{banner.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {banner.guaranteed && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--gold-soft)', color: 'var(--gold)' }}>次回確定</span>}
          <span className="mono" style={{ color: near ? 'var(--gold)' : 'var(--text-dim)' }}>
            {banner.pityCurrent || 0} / {banner.pityMax}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', gap: 2 }}>
        {Array.from({ length: segments }).map((_, i) => {
          const isFilled = i < filled
          return (
            <div
              key={i}
              style={{
                flex: 1, height: 10, borderRadius: 2,
                background: isFilled ? 'var(--gold)' : 'var(--line)',
                boxShadow: isFilled && near ? '0 0 6px rgba(212,166,87,0.7)' : 'none',
                transition: 'background 0.3s, box-shadow 0.3s'
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
