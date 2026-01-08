'use client'

export default function QuotingPage() {
  return (
    <main style={{ padding: 24, display: 'grid', gap: 12 }}>
      <h1 style={{ marginBottom: 4 }}>Quoting</h1>
      <p style={{ color: 'var(--muted)', maxWidth: 720 }}>
        This area will centralize quotes you’ve issued (from inventory or direct flip deals), track quote status, and convert accepted quotes
        into lots/orders. Coming soon: quote creation, customer selections, PDF/email send, and acceptance tracking.
      </p>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          background: 'var(--panel)',
          color: 'var(--muted)',
        }}
      >
        No quotes yet. Once quoting is enabled, drafts and sent quotes will appear here.
      </div>
    </main>
  )
}
