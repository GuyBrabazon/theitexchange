import Link from 'next/link'

export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #111827 40%, #0b1324 100%)',
        color: '#e5e7eb',
        padding: '48px 16px',
      }}
    >
      <div
        style={{
          maxWidth: 760,
          width: '100%',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 18,
          padding: 28,
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ fontSize: 14, letterSpacing: 2, textTransform: 'uppercase', color: '#a5b4fc' }}>The IT Exchange</div>
        <h1 style={{ marginTop: 10, fontSize: 32, fontWeight: 800, letterSpacing: -0.5 }}>
          Enterprise IT equipment marketplace for brokers, sellers, and buyers.
        </h1>
        <p style={{ marginTop: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
          Create lots, invite buyers, collect offers line-by-line or take-all, award deals, upload POs, and track fulfilment with
          Supabase-backed workflows.
        </p>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 20 }}>
          <Link
            href="/login"
            style={{
              padding: '12px 18px',
              borderRadius: 12,
              background: '#6366f1',
              color: '#fff',
              fontWeight: 800,
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
              border: '1px solid rgba(255,255,255,0.15)',
              color: '#e5e7eb',
              fontWeight: 800,
              textDecoration: 'none',
              background: 'rgba(255,255,255,0.05)',
            }}
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
