'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'

type LotLite = {
  id: string
  tenant_id: string
  title: string | null
  status: string | null
  currency: string | null
}

type PurchaseOrderRow = {
  id: string
  tenant_id: string
  lot_id: string
  buyer_id: string | null
  invite_id: string | null
  token: string | null
  file_name: string | null
  file_path: string | null
  content_type: string | null
  notes: string | null
  created_at: string | null
  signed_url: string | null
  po_number?: string | null
  pdf_path?: string | null
}

function fmtDate(ts: string | null | undefined) {
  if (!ts) return 'n/a'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return d.toLocaleString()
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

export default function LotPOsPage() {
  const params = useParams()
  const lotId = params.id as string

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const [lot, setLot] = useState<LotLite | null>(null)
  const [pos, setPos] = useState<PurchaseOrderRow[]>([])
  const [generatingId, setGeneratingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/lots/${lotId}/pos`, { method: 'GET' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error ?? 'Failed to load POs')
      setLot((json?.lot ?? null) as LotLite | null)
      setPos(((json?.purchase_orders ?? []) as PurchaseOrderRow[]) ?? [])
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to load PO list'
      setError(msg)
      setLot(null)
      setPos([])
    } finally {
      setLoading(false)
    }
  }, [lotId])

  useEffect(() => {
    load()
  }, [load])

  const header = useMemo(() => {
    const t = lot?.title ?? `Lot ${lotId.slice(0, 8)}`
    return `${t} | Status: ${statusLabel(lot?.status)}`
  }, [lotId, lot?.title, lot?.status])

  const setStatus = async (status: 'order_processing' | 'sold') => {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      const ok = confirm(status === 'order_processing' ? 'Mark this lot as Order Processing?' : 'Mark this lot as Sold?')
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

  const generatePdf = async (poId: string) => {
    if (generatingId) return
    setGeneratingId(poId)
    setError('')
    try {
      const res = await fetch(`/api/po/${poId}/pdf`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message || 'Failed to generate PDF')
      if (json.url) window.open(json.url, '_blank', 'noreferrer')
      await load()
    } catch (e: unknown) {
      console.error(e)
      const msg = e instanceof Error ? e.message : 'Failed to generate PDF'
      setError(msg)
    } finally {
      setGeneratingId(null)
    }
  }

  return (
    <main style={{ padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Purchase Orders</h1>
          <div style={{ color: 'var(--muted)' }}>{header}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Link href={`/dashboard/lots/${lotId}`} style={{ textDecoration: 'none', fontWeight: 900 }}>
            Back to Lot
          </Link>

          <Link
            href={lotId ? `/dashboard/fulfilment?lotId=${lotId}` : '/dashboard/fulfilment'}
            style={{
              textDecoration: 'none',
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
            }}
          >
            Go to Order Fulfilment
          </Link>

          <button
            onClick={load}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--r-md)',
              border: '1px solid var(--border)',
              background: 'var(--panel)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => setStatus('order_processing')}
          disabled={saving}
          style={{
            padding: '10px 12px',
            borderRadius: 'var(--r-md)',
            border: '1px solid var(--border)',
            background: 'var(--accent-soft)',
            fontWeight: 950,
            cursor: 'pointer',
          }}
        >
          {saving ? 'Working...' : 'Mark order processing'}
        </button>

        <button
          onClick={() => setStatus('sold')}
          disabled={saving}
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
          {saving ? 'Working...' : 'Mark sold'}
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <Card title="POs received" subtitle="Downloads use signed URLs (private storage safe).">
          {loading ? <div style={{ color: 'var(--muted)' }}>Loading...</div> : null}
          {error ? <div style={{ color: 'crimson' }}>{error}</div> : null}

          {!loading && !error ? (
            pos.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {pos.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--r-md)',
                      padding: 12,
                      background: 'rgba(15,23,42,0.02)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 950 }}>
                        {p.po_number ? `${p.po_number} - ` : ''}
                        {p.file_name ?? '(PO file)'}
                      </div>
                      <div style={{ color: 'var(--muted)', fontSize: 12 }}>{fmtDate(p.created_at)}</div>
                    </div>

                    <div style={{ marginTop: 6, color: 'var(--muted)', fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      <span>
                        Buyer: <b style={{ color: 'var(--text)' }}>{p.buyer_id ? p.buyer_id.slice(0, 8) : 'n/a'}</b>
                      </span>
                      <span>
                        Type: <b style={{ color: 'var(--text)' }}>{p.content_type ?? 'n/a'}</b>
                      </span>
                      {p.pdf_path ? (
                        <span>
                          PDF stored: <b style={{ color: 'var(--text)' }}>{p.pdf_path}</b>
                        </span>
                      ) : null}
                    </div>

                    {p.notes ? (
                      <div style={{ marginTop: 8, color: 'var(--muted)', fontSize: 12 }}>
                        Notes: {p.notes}
                      </div>
                    ) : null}

                    <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                      <button
                        onClick={() => {
                          if (!p.signed_url) {
                            alert('No download URL available for this PO (missing file_path or signing failed).')
                            return
                          }
                          window.open(p.signed_url, '_blank', 'noreferrer')
                        }}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'var(--panel)',
                          fontWeight: 900,
                          cursor: 'pointer',
                        }}
                      >
                        Download
                      </button>

                      <button
                        onClick={() => generatePdf(p.id)}
                        disabled={!!generatingId}
                        style={{
                          padding: '8px 10px',
                          borderRadius: 10,
                          border: '1px solid var(--border)',
                          background: 'rgba(245,174,109,0.12)',
                          fontWeight: 900,
                          cursor: generatingId ? 'wait' : 'pointer',
                        }}
                      >
                        {generatingId === p.id ? 'Generating...' : 'Download PO PDF'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: 'var(--muted)' }}>No POs found for this lot yet.</div>
            )
          ) : null}
        </Card>
      </div>
    </main>
  )
}
