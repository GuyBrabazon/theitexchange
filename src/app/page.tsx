import Link from 'next/link'

const metricCard = (label: string, value: string, detail: string, accent: string) => (
  <div
    style={{
      padding: 14,
      borderRadius: 12,
      border: '1px solid var(--border)',
      background: 'var(--panel)',
      boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
      display: 'grid',
      gap: 6,
    }}
  >
    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div>
    <div style={{ fontSize: 24, fontWeight: 900, color: accent }}>{value}</div>
    <div style={{ color: 'var(--muted)', fontSize: 12 }}>{detail}</div>
  </div>
)

const barCard = (
  title: string,
  label: string,
  values: number[],
  color: string,
  maxCap?: number,
  maxLabel?: string,
  xLabels?: string[],
  yPrefix?: string
) => {
  const max = Math.max(maxCap ?? 0, ...values, 1)
  const months =
    xLabels && xLabels.length === values.length
      ? xLabels
      : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].slice(0, values.length)
  const topLabel = maxLabel ?? `${yPrefix ?? ''}${max.toLocaleString()}`
  const bottomLabel = `${yPrefix ?? ''}0`
  return (
    <div
      style={{
        padding: 12,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        display: 'grid',
        gap: 10,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div>
        </div>
        <div style={{ padding: '4px 8px', borderRadius: 8, background: 'var(--surface-2)', fontSize: 12, color }}>Snapshot</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr', gap: 6, alignItems: 'end', minHeight: 140 }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: 120, fontSize: 11, color: 'var(--muted)' }}>
          <span>{topLabel}</span>
          <span>{bottomLabel}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 140 }}>
          {values.map((v, idx) => (
            <div key={idx} style={{ flex: 1, minWidth: 10 }}>
              <div
                style={{
                  height: `${(v / max) * 100 + 6}px`,
                  borderRadius: 8,
                  background: `linear-gradient(180deg, ${color}, rgba(30,58,95,0.08))`,
                  boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
                  opacity: 0,
                  animation: 'fadeGrow 0.8s ease forwards',
                  animationDelay: `${idx * 0.08}s`,
                }}
                title={`${months[idx] ?? ''}: ${(yPrefix ?? '')}${v.toLocaleString()}`}
              />
              <div style={{ textAlign: 'center', marginTop: 6, fontSize: 11, color: 'var(--muted)' }}>{months[idx] ?? ''}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 20% 20%, rgba(30,58,95,0.18), transparent 32%), radial-gradient(circle at 80% 10%, rgba(47,127,122,0.18), transparent 30%), var(--bg)',
        color: 'var(--text)',
        padding: '32px 16px 48px',
        fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
      }}
    >
      <style>{`
        @keyframes fadeGrow {
          0% { opacity: 0; transform: translateY(12px) scaleY(0.7); }
          60% { opacity: 0.8; transform: translateY(2px) scaleY(1.05); }
          100% { opacity: 1; transform: translateY(0) scaleY(1); }
        }
      `}</style>
      <header
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 8px',
        }}
      >
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 900, fontSize: 18 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #1E3A5F, #2F7F7A)',
              display: 'grid',
              placeItems: 'center',
              color: '#fff',
              fontWeight: 900,
            }}
          >
            ITE
          </div>
          <span>The IT Exchange</span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link
            href="/login"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: '1px solid var(--border)',
              textDecoration: 'none',
              color: 'var(--text)',
              background: 'var(--panel)',
              fontWeight: 800,
            }}
          >
            Sign in
          </Link>
          <Link
            href="/login"
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              textDecoration: 'none',
              color: '#fff',
              background: 'linear-gradient(135deg, #1E3A5F, #2F7F7A)',
              fontWeight: 900,
              boxShadow: '0 12px 30px rgba(30,58,95,0.35)',
            }}
          >
            Sign up
          </Link>
        </div>
      </header>

      <section
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 20,
          alignItems: 'center',
          padding: '12px 8px',
        }}
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 13, letterSpacing: 1.4, textTransform: 'uppercase', color: 'var(--muted)' }}>IT liquidation & sourcing OS</div>
          <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900, letterSpacing: -0.6 }}>
            Run auctions, line-item quotes, POs, and fulfilment in one workspace.
          </h1>
          <p style={{ margin: 0, color: 'var(--muted)', lineHeight: 1.6 }}>
            Upload stock, auto-detect OEMs, invite buyers, collect take-all or component offers, auto-award with inventory checks, and ship with
            audit-grade PDFs.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link
              href="/login"
              style={{
                padding: '12px 18px',
                borderRadius: 12,
                background: 'linear-gradient(135deg, #1E3A5F, #2F7F7A)',
                color: '#fff',
                fontWeight: 900,
                textDecoration: 'none',
                boxShadow: '0 12px 30px rgba(30,58,95,0.35)',
              }}
            >
              Start free trial
            </Link>
            <Link
              href="/dashboard"
              style={{
                padding: '12px 18px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontWeight: 900,
                textDecoration: 'none',
                background: 'var(--panel)',
              }}
            >
              View dashboard demo
            </Link>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
              gap: 10,
            }}
          >
            {metricCard('Auction win rate', '62%', 'Across component + take-all awards', '#1E3A5F')}
            {metricCard('POs auto-generated', '1,204', 'Stored in private bucket for audit', '#2F7F7A')}
            {metricCard('Avg. cycle time', '3.2 days', 'Invite -> Award -> PO upload -> Fulfil', '#B23A3A')}
          </div>
        </div>

        <div
          style={{
            border: '1px solid var(--border)',
            borderRadius: 16,
            background: 'var(--panel)',
            padding: 18,
            boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
            display: 'grid',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 900 }}>Live RFQs</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Recent cross-tenant requests with quick context</div>
            </div>
            <div style={{ padding: '6px 10px', borderRadius: 10, background: 'var(--surface-2)', fontSize: 12 }}>3 waiting</div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {[
              { customer: 'Delta Compute', part: 'Cisco N9K-C93180YC', qty: 12, status: 'Awaiting quote', age: '14m' },
              { customer: 'NorthGrid', part: 'Dell R740xd (2x 6248R, 256GB)', qty: 6, status: 'Quoted $7,950', age: '32m' },
              { customer: 'Skyline IT', part: 'Samsung PM9A3 3.84TB U.2', qty: 40, status: 'Awaiting quote', age: '55m' },
            ].map((r, idx) => (
              <div
                key={idx}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: 10,
                  background: 'var(--surface-2)',
                  display: 'grid',
                  gap: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <div style={{ fontWeight: 800 }}>{r.customer}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.age} ago</div>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>{r.part}</div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Qty requested: <strong>{r.qty}</strong></span>
                  <span style={{ color: '#1E3A5F', fontWeight: 700 }}>{r.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1180,
          margin: '32px auto 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 14,
          padding: '0 8px 24px',
        }}
      >
        {barCard(
          'Revenue over time',
          'Monthly auction + quote conversions',
          [180_000, 240_000, 320_000, 410_000, 560_000, 720_000, 840_000, 910_000, 860_000, 780_000, 640_000, 520_000],
          '#1E3A5F',
          1_000_000,
          '$1,000,000',
          undefined,
          '$'
        )}
        {barCard(
          'Profit over time',
          'Blended margin after costs',
          [55_000, 70_000, 92_000, 118_000, 150_000, 190_000, 215_000, 240_000, 210_000, 180_000, 140_000, 110_000],
          '#2F7F7A',
          1_000_000,
          '$1,000,000',
          undefined,
          '$'
        )}
        {barCard(
          'Lines sold',
          'Line-item awards (parts + systems)',
          [18_500, 20_200, 22_400, 25_800, 32_500, 40_800, 44_300, 48_600, 45_200, 39_400, 31_800, 26_700],
          '#B23A3A',
          100_000,
          '100,000',
          undefined,
          ''
        )}
      </section>
    </main>
  )
}
