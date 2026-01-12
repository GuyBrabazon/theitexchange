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

const barCard = (title: string, label: string, values: number[], color: string, maxCap?: number, maxLabel?: string) => {
  const max = Math.max(maxCap ?? 0, ...values, 1)
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--panel)',
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        display: 'grid',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 900 }}>{title}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12 }}>{label}</div>
        </div>
        <div style={{ padding: '4px 8px', borderRadius: 8, background: 'var(--surface-2)', fontSize: 12, color }}>Snapshot</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, paddingTop: 6 }}>
        {values.map((v, idx) => (
          <div key={idx} style={{ flex: 1, minWidth: 10 }}>
            <div
              style={{
                height: `${(v / max) * 120 + 6}px`,
                borderRadius: 8,
                background: `linear-gradient(180deg, ${color}, rgba(30,58,95,0.08))`,
                boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
              }}
              title={v.toLocaleString()}
            />
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
        <span>{maxLabel ? (maxLabel.startsWith('$') ? '$0' : '0') : '0'}</span>
        <span>{maxLabel ?? max.toLocaleString()}</span>
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
              <div style={{ fontWeight: 900 }}>Live ops snapshot</div>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Mock data to show the experience</div>
            </div>
            <div style={{ padding: '6px 10px', borderRadius: 10, background: 'var(--surface-2)', fontSize: 12 }}>Auto-award on</div>
          </div>
          <div style={{ height: 180, borderRadius: 12, background: 'linear-gradient(180deg, rgba(30,58,95,0.18), rgba(47,127,122,0.05))', position: 'relative' }}>
            {[18, 36, 54, 72].map((h) => (
              <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: `${h}%`, borderTop: '1px dashed var(--border)' }} />
            ))}
            <div
              style={{
                position: 'absolute',
                left: 10,
                right: 10,
                bottom: 18,
                height: 80,
                background: 'linear-gradient(135deg, rgba(47,127,122,0.35), rgba(30,58,95,0.55))',
                borderRadius: 12,
                boxShadow: '0 15px 35px rgba(0,0,0,0.15)',
              }}
            />
            <div style={{ position: 'absolute', bottom: 22, left: 18, color: '#fff', fontWeight: 800 }}>Awarded lot #482</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Invites sent</div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>38</div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>Offers collected</div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>124</div>
            </div>
            <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 10, background: 'var(--surface-2)' }}>
              <div style={{ color: 'var(--muted)', fontSize: 12 }}>POs uploaded</div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>19</div>
            </div>
          </div>
        </div>
      </section>

      <section
        style={{
          maxWidth: 1180,
          margin: '32px auto 0',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
          padding: '0 8px 24px',
        }}
      >
        {barCard(
          'Revenue over time',
          'Monthly auction + quote conversions',
          [42, 48, 52, 61, 78, 105, 118, 123, 110, 96, 82, 75],
          '#1E3A5F',
          1_000_000,
          '$1,000,000'
        )}
        {barCard('Profit over time', 'Blended margin after costs', [12, 14, 16, 18, 24, 32, 34, 36, 30, 26, 22, 20], '#2F7F7A', 1_000_000, '$1,000,000')}
        {barCard(
          'Lines sold',
          'Line-item awards (parts + systems)',
          [180, 190, 215, 240, 280, 330, 350, 360, 340, 320, 295, 285],
          '#B23A3A',
          100_000,
          '100,000'
        )}
      </section>
    </main>
  )
}
