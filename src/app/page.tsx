import Link from 'next/link'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background:
          'radial-gradient(circle at 20% 20%, rgba(30,58,95,0.18), transparent 32%), radial-gradient(circle at 80% 10%, rgba(47,127,122,0.18), transparent 30%), var(--bg)',
        color: 'var(--text)',
        padding: '48px 16px',
        fontFamily: 'var(--font-geist-sans, system-ui, sans-serif)',
      }}
    >
      <div
        style={{
          maxWidth: 820,
          width: '100%',
          background: 'var(--panel)',
          border: '1px solid var(--border)',
          borderRadius: 18,
          padding: 28,
          boxShadow: 'var(--shadow)',
        }}
      >
        <div style={{ fontSize: 13, letterSpacing: 1.8, textTransform: 'uppercase', color: 'var(--muted)' }}>The IT Exchange</div>
        <h1 style={{ marginTop: 10, fontSize: 34, fontWeight: 900, letterSpacing: -0.6 }}>
          Enterprise IT marketplace for brokers, sellers, and buyers.
        </h1>
        <p style={{ marginTop: 10, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 720 }}>
          Create lots, auto-detect OEMs, invite buyers, collect take-all or line-level offers, award deals, upload POs, and track fulfilment—all in one streamlined workspace.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
          <Link
            href="/login"
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              background: 'var(--accent)',
              color: '#fff',
              fontWeight: 900,
              textDecoration: 'none',
              boxShadow: '0 10px 30px rgba(99,102,241,0.35)',
            }}
          >
            Sign up / Log in
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
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
