'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

type LotLite = {
  id: string
  tenant_id: string
  title: string | null
  status: string | null
  currency: string | null
}

function statusLabel(s: string | null | undefined) {
  const v = String(s ?? '').toLowerCase().trim()
  if (!v) return 'Unknown'
  if (v === 'sale_in_progress') return 'Sale in progress'
  if (v === 'order_processing') return 'Order processing'
  if (v === 'sold') return 'Sold'
  if (v === 'awarded') return 'Awarded'
  if (v === 'open') return 'Open'
  if (v === 'draft') return 'Draft'
  if (v === 'closed') return 'Closed'
  return s ?? 'Unknown'
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--r-lg)',
        background: 'var(--panel)',
        boxShadow: 'var(--shadow)',
        padding: 14,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 950, letterSpacing: -0.2 }}>{title}</div>
        {subtitle ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>{subtitle}</div> : null}
      </div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  )
}

export default function FulfilmentPage() {
  const sp = useSearchParams()
  const lotId = sp.get('lotId') ?? ''

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lot, setLot] = useState<LotLite | null>(null)

  const title = useMemo(() => {
    return lotId ? `Order Fulfilment • ${lot?.title ?? lotId.slice(0, 8) + '…'}` : 'Order Fulfilment'
  }, [lotId, lot?.title])

  const load = useCallback(async () => {
    if (!lotId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/lots/${lotId}/pos`, { method: 'GET' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load lot')
      setLot((json?.lot ?? null) as LotLite | null)
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load lot'
      setError(msg)
      setLot(null)
    } finally {
      setLoading(false)
    }
  }, [lotId])

  useEffect(() => {
    load()
  }, [load])

  const setStatus = async (status: 'order_processing' | 'sold') => {
    if (!lotId) return
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const ok = confirm(
        status === 'order_processing'
          ? 'Mark this lot as Order Processing?'
          : 'Mark this lot as Sold?'
      )
      if (!ok) return

      const res = await fetch(`/api/lots/${lotId}/status`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Failed to update status')
      await load()
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to update status'
      setError(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>{title}</h1>
          <div style={{ color: 'var(--muted)' }}>
            {lotId ? (
              <>
                Status: <b style={{ color: 'var(--text)' }}>{statusLabel(lot?.status)}</b>
              </>
            ) : (
              'Pick a lot from Lots → “Go to Order Fulfilment”.'
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {lotId ? (
            <>
              <Link href={`/dashboard/lots/${lotId}`} style={{ textDecoration: 'none', fontWeight: 900 }}>
                ← Back to Lot
              </Link>
              <Link
                href={`/dashboard/lots/${lotId}/pos`}
                style={{
                  textDecoration: 'none',
                  padding: '10px 12px',
                  borderRadius: 'var(--r-md)',
                  border: '1px solid var(--border)',
                  background: 'var(--panel)',
                  fontWeight: 900,
                }}
              >
                View PO/s →
              </Link>
            </>
          ) : (
            <Link href="/dashboard/lots" style={{ textDecoration: 'none', fontWeight: 900 }}>
              ← Lots
            </Link>
          )}
        </div>
      </div>

      {error ? <div style={{ marginTop: 12, color: 'crimson' }}>{error}</div> : null}
      {loading ? <div style={{ marginTop: 12, color: 'var(--muted)' }}>Loading…</div> : null}

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, alignItems: 'start' }}>
        <Card title="Workflow actions" subtitle="These update lot.status">
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={() => setStatus('order_processing')}
              disabled={!lotId || saving}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'var(--accent-soft)',
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              {saving ? 'Working…' : 'Mark order processing'}
            </button>

            <button
              onClick={() => setStatus('sold')}
              disabled={!lotId || saving}
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--r-md)',
                border: '1px solid var(--border)',
                background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)',
                color: '#fff',
                fontWeight: 950,
                cursor: 'pointer',
              }}
            >
              {saving ? 'Working…' : 'Mark sold'}
            </button>
          </div>

          <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12, lineHeight: 1.6 }}>
            Suggested lifecycle:
            <div>
              <b style={{ color: 'var(--text)' }}>sale_in_progress</b> →{' '}
              <b style={{ color: 'var(--text)' }}>order_processing</b> →{' '}
              <b style={{ color: 'var(--text)' }}>sold</b>
            </div>
          </div>
        </Card>

        <Card title="Execution checklist" subtitle="Simple, broker-friendly">
          <div style={{ color: 'var(--muted)', fontSize: 13, lineHeight: 1.7 }}>
            <div>• Confirm PO validity & contents</div>
            <div>• Confirm payment terms & invoicing</div>
            <div>• Coordinate logistics (collection / delivery)</div>
            <div>• Generate Sales Order / confirmation doc (later)</div>
            <div>• Close out the lot (sold)</div>
          </div>
        </Card>
      </div>
    </main>
  )
}
